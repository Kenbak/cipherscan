#!/usr/bin/env python3
"""
ML-Based Batch Pattern Detector for Zcash Privacy Analysis

Uses DBSCAN clustering to automatically detect batch deshield patterns
without hard-coding "round" amounts. This finds ANY repeated amount pattern.

Example patterns detected:
- 12×500 ZEC (obvious round number)
- 8×637.5 ZEC (not round, but still suspicious)
- 15×1234.56 ZEC (weird amount repeated = very suspicious)

Usage:
    python ml-pattern-detector.py [options]

Options:
    --period=30         Time window in days (default: 30)
    --min-cluster=3     Minimum transactions per cluster (default: 3)
    --min-amount=1      Minimum ZEC per transaction (default: 1)
    --eps=0.0001        DBSCAN epsilon (amount tolerance ratio, default: 0.0001 = 0.01%)
    --dry-run           Don't save to database
    --verbose           Print detailed output

Cron example (every 10 minutes):
    */10 * * * * cd /path/to/server/api/scripts && python3 ml-pattern-detector.py >> /var/log/ml-detector.log 2>&1
"""

import os
import sys
import json
import hashlib
import argparse
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler

# ============================================================================
# CONFIGURATION
# ============================================================================

DB_CONFIG = {
    'host': os.environ.get('POSTGRES_HOST', 'localhost'),
    'port': int(os.environ.get('POSTGRES_PORT', 5432)),
    'database': os.environ.get('POSTGRES_DATABASE', 'zcash_explorer'),
    'user': os.environ.get('POSTGRES_USER', 'postgres'),
    'password': os.environ.get('POSTGRES_PASSWORD', ''),
}

# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def get_connection():
    """Create a database connection."""
    return psycopg2.connect(**DB_CONFIG)


def fetch_deshields(conn, period_days: int, min_amount_zat: int) -> List[Dict]:
    """Fetch recent deshield transactions."""
    min_time = int((datetime.now() - timedelta(days=period_days)).timestamp())

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                txid,
                block_height,
                block_time,
                amount_zat,
                pool
            FROM shielded_flows
            WHERE flow_type = 'deshield'
              AND block_time > %s
              AND amount_zat >= %s
            ORDER BY block_time DESC
        """, (min_time, min_amount_zat))

        return [dict(row) for row in cur.fetchall()]


def fetch_shields(conn, total_amount_zat: int, before_time: int, tolerance_zat: int = 1000000) -> List[Dict]:
    """Find shields that match a total amount."""
    min_time = before_time - (90 * 24 * 3600)  # Look back 90 days

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                txid,
                block_height,
                block_time,
                amount_zat,
                pool
            FROM shielded_flows
            WHERE flow_type = 'shield'
              AND amount_zat BETWEEN %s AND %s
              AND block_time < %s
              AND block_time > %s
            ORDER BY ABS(amount_zat - %s) ASC, block_time DESC
            LIMIT 5
        """, (
            total_amount_zat - tolerance_zat,
            total_amount_zat + tolerance_zat,
            before_time,
            min_time,
            total_amount_zat
        ))

        return [dict(row) for row in cur.fetchall()]


def generate_pattern_hash(txids: List[str]) -> str:
    """Generate unique hash for a pattern (for deduplication)."""
    sorted_txids = ','.join(sorted(txids))
    return hashlib.sha256(sorted_txids.encode()).hexdigest()


def store_pattern(conn, pattern: Dict, dry_run: bool = False) -> bool:
    """Store a detected pattern in the database."""
    if dry_run:
        return True

    pattern_hash = generate_pattern_hash(pattern['txids'])

    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO detected_patterns (
                    pattern_type,
                    pattern_hash,
                    score,
                    warning_level,
                    shield_txids,
                    deshield_txids,
                    total_amount_zat,
                    per_tx_amount_zat,
                    batch_count,
                    first_tx_time,
                    last_tx_time,
                    time_span_hours,
                    metadata,
                    expires_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW() + INTERVAL '90 days')
                ON CONFLICT (pattern_hash) DO UPDATE SET
                    score = EXCLUDED.score,
                    warning_level = EXCLUDED.warning_level,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW(),
                    expires_at = NOW() + INTERVAL '90 days'
            """, (
                pattern['pattern_type'],
                pattern_hash,
                pattern['score'],
                pattern['warning_level'],
                pattern.get('shield_txids', []),
                pattern['txids'],
                pattern['total_amount_zat'],
                pattern['per_tx_amount_zat'],
                pattern['batch_count'],
                pattern['first_time'],
                pattern['last_time'],
                pattern['time_span_hours'],
                json.dumps(pattern),
            ))
            conn.commit()
            return True
    except Exception as e:
        print(f"❌ Failed to store pattern: {e}")
        conn.rollback()
        return False


# ============================================================================
# ML CLUSTERING
# ============================================================================

def cluster_by_amount(deshields: List[Dict], eps: float = 0.0001, min_samples: int = 3) -> Dict[int, List[Dict]]:
    """
    Cluster deshield transactions by amount using DBSCAN.

    Args:
        deshields: List of deshield transactions
        eps: Maximum relative difference between amounts in same cluster (0.0001 = 0.01%)
        min_samples: Minimum transactions to form a cluster

    Returns:
        Dictionary mapping cluster label to list of transactions
    """
    if len(deshields) < min_samples:
        return {}

    # Extract amounts
    amounts = np.array([tx['amount_zat'] for tx in deshields]).reshape(-1, 1)

    # Normalize amounts for DBSCAN (use log scale for better clustering)
    # This handles the wide range of amounts (0.01 ZEC to 10000 ZEC)
    log_amounts = np.log10(amounts + 1)

    # DBSCAN clustering
    # eps in log scale: 0.0001 in linear ≈ very tight clustering
    clustering = DBSCAN(eps=eps, min_samples=min_samples, metric='euclidean').fit(log_amounts)

    # Group transactions by cluster
    clusters = {}
    for i, label in enumerate(clustering.labels_):
        if label == -1:  # Noise point
            continue
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(deshields[i])

    return clusters


def score_cluster(cluster: List[Dict], matching_shield: Optional[Dict] = None) -> Dict:
    """
    Score a cluster of identical deshields.

    Scoring factors:
    - Cluster size (more = more suspicious)
    - Amount uniformity (identical amounts = suspicious)
    - Round number (psychological fingerprint)
    - Time clustering (all close together = suspicious)
    - Matching shield (sum matches = very suspicious)
    """
    amounts = [tx['amount_zat'] for tx in cluster]
    times = [tx['block_time'] for tx in cluster]

    avg_amount = np.mean(amounts)
    amount_std = np.std(amounts)
    amount_zec = avg_amount / 1e8

    first_time = min(times)
    last_time = max(times)
    time_span_hours = (last_time - first_time) / 3600

    score = 0
    breakdown = {}

    # Factor 1: Cluster size (3=10, 5=15, 8=22, 12+=30)
    size = len(cluster)
    if size >= 12:
        size_score = 30
    elif size >= 8:
        size_score = 22
    elif size >= 5:
        size_score = 15
    else:
        size_score = 10
    score += size_score
    breakdown['cluster_size'] = {'count': size, 'points': size_score}

    # Factor 2: Amount uniformity (identical = suspicious)
    # coefficient of variation < 0.01% = perfect match
    cv = (amount_std / avg_amount) if avg_amount > 0 else 0
    if cv < 0.0001:  # Essentially identical
        uniformity_score = 15
    elif cv < 0.001:
        uniformity_score = 10
    elif cv < 0.01:
        uniformity_score = 5
    else:
        uniformity_score = 0
    score += uniformity_score
    breakdown['uniformity'] = {'cv': float(cv), 'points': uniformity_score}

    # Factor 3: Round number detection
    # Check if amount is a "nice" number humans would pick
    round_score = 0
    if amount_zec >= 1000 and amount_zec % 1000 < 0.01:
        round_score = 20
    elif amount_zec >= 500 and amount_zec % 500 < 0.01:
        round_score = 18
    elif amount_zec >= 100 and amount_zec % 100 < 0.01:
        round_score = 15
    elif amount_zec >= 50 and amount_zec % 50 < 0.01:
        round_score = 12
    elif amount_zec >= 10 and amount_zec % 10 < 0.01:
        round_score = 10
    elif amount_zec >= 1 and amount_zec % 1 < 0.001:
        round_score = 5
    # Bonus: if NOT round but still clustered = even MORE suspicious!
    elif uniformity_score >= 10:
        round_score = 8  # "Weird identical amount" bonus
    score += round_score
    breakdown['round_number'] = {'amount_zec': float(amount_zec), 'is_round': round_score >= 10, 'points': round_score}

    # Factor 4: Time clustering
    if time_span_hours < 6:
        time_score = 12
    elif time_span_hours < 24:
        time_score = 10
    elif time_span_hours < 72:
        time_score = 6
    elif time_span_hours < 168:
        time_score = 3
    else:
        time_score = 0
    score += time_score
    breakdown['time_clustering'] = {'hours': float(time_span_hours), 'points': time_score}

    # Factor 5: Matching shield
    match_score = 0
    if matching_shield:
        total_deshielded = sum(amounts)
        shield_amount = matching_shield['amount_zat']
        diff_pct = abs(total_deshielded - shield_amount) / shield_amount * 100 if shield_amount > 0 else 100

        if diff_pct < 0.01:  # Perfect match
            match_score = 25
        elif diff_pct < 0.1:
            match_score = 22
        elif diff_pct < 1:
            match_score = 18
        elif diff_pct < 5:
            match_score = 12
        else:
            match_score = 5
        score += match_score
    breakdown['matching_shield'] = {
        'found': matching_shield is not None,
        'txid': matching_shield['txid'] if matching_shield else None,
        'points': match_score
    }

    # Cap score at 100
    score = min(score, 100)

    # Determine warning level
    if score >= 70:
        warning_level = 'HIGH'
    elif score >= 50:
        warning_level = 'MEDIUM'
    else:
        warning_level = 'LOW'

    return {
        'score': score,
        'warning_level': warning_level,
        'breakdown': breakdown,
        'stats': {
            'avg_amount_zec': float(amount_zec),
            'amount_std_zec': float(amount_std / 1e8),
            'time_span_hours': float(time_span_hours),
        }
    }


def build_pattern(cluster: List[Dict], score_result: Dict, matching_shield: Optional[Dict] = None) -> Dict:
    """Build a pattern object for storage."""
    amounts = [tx['amount_zat'] for tx in cluster]
    times = [tx['block_time'] for tx in cluster]

    total_zat = sum(amounts)
    avg_zat = int(np.mean(amounts))

    pattern = {
        'pattern_type': 'BATCH_DESHIELD_ML',
        'detection_method': 'DBSCAN_CLUSTERING',
        'batch_count': len(cluster),
        'per_tx_amount_zat': avg_zat,
        'per_tx_amount_zec': avg_zat / 1e8,
        'total_amount_zat': total_zat,
        'total_amount_zec': total_zat / 1e8,
        'txids': [tx['txid'] for tx in cluster],
        'heights': [tx['block_height'] for tx in cluster],
        'times': times,
        'first_time': min(times),
        'last_time': max(times),
        'time_span_hours': (max(times) - min(times)) / 3600,
        'score': score_result['score'],
        'warning_level': score_result['warning_level'],
        'breakdown': score_result['breakdown'],
        'stats': score_result['stats'],
    }

    if matching_shield:
        pattern['shield_txids'] = [matching_shield['txid']]
        pattern['matching_shield'] = {
            'txid': matching_shield['txid'],
            'amount_zec': matching_shield['amount_zat'] / 1e8,
            'block_height': matching_shield['block_height'],
            'block_time': matching_shield['block_time'],
        }

    # Generate explanation
    amount_zec = pattern['per_tx_amount_zec']
    total_zec = pattern['total_amount_zec']
    is_round = score_result['breakdown']['round_number']['is_round']

    if is_round:
        pattern['explanation'] = (
            f"ML detected {len(cluster)} identical deshields of {amount_zec:.4f} ZEC "
            f"(total: {total_zec:.2f} ZEC). Round amount = psychological fingerprint."
        )
    else:
        pattern['explanation'] = (
            f"ML detected {len(cluster)} identical deshields of {amount_zec:.4f} ZEC "
            f"(total: {total_zec:.2f} ZEC). Unusual identical amount = highly suspicious!"
        )

    if matching_shield:
        shield_zec = matching_shield['amount_zat'] / 1e8
        pattern['explanation'] += f" Matches shield of {shield_zec:.2f} ZEC."

    return pattern


# ============================================================================
# MAIN DETECTOR
# ============================================================================

def detect_patterns(
    period_days: int = 30,
    min_cluster_size: int = 3,
    min_amount_zec: float = 1.0,
    eps: float = 0.0001,
    dry_run: bool = False,
    verbose: bool = False
) -> List[Dict]:
    """
    Main detection function using ML clustering.

    Returns list of detected patterns.
    """
    conn = get_connection()

    try:
        # Fetch deshields
        min_amount_zat = int(min_amount_zec * 1e8)
        deshields = fetch_deshields(conn, period_days, min_amount_zat)

        if verbose:
            print(f"📊 Fetched {len(deshields)} deshields from last {period_days} days")

        if len(deshields) < min_cluster_size:
            print("⚠️ Not enough deshields for clustering")
            return []

        # Cluster by amount
        clusters = cluster_by_amount(deshields, eps=eps, min_samples=min_cluster_size)

        if verbose:
            print(f"🔍 Found {len(clusters)} potential clusters")

        patterns = []

        for label, cluster in clusters.items():
            if len(cluster) < min_cluster_size:
                continue

            # Calculate total and find matching shield
            total_zat = sum(tx['amount_zat'] for tx in cluster)
            first_time = min(tx['block_time'] for tx in cluster)

            # Look for matching shield
            matching_shields = fetch_shields(conn, total_zat, first_time)
            matching_shield = matching_shields[0] if matching_shields else None

            # Score the cluster
            score_result = score_cluster(cluster, matching_shield)

            # Skip low-quality patterns
            if score_result['score'] < 35:
                continue

            # Build pattern
            pattern = build_pattern(cluster, score_result, matching_shield)
            patterns.append(pattern)

            # Store in database
            if not dry_run:
                store_pattern(conn, pattern, dry_run=False)

        # Sort by score
        patterns.sort(key=lambda p: p['score'], reverse=True)

        return patterns

    finally:
        conn.close()


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description='ML-based batch pattern detector')
    parser.add_argument('--period', type=int, default=30, help='Time window in days')
    parser.add_argument('--min-cluster', type=int, default=3, help='Minimum cluster size')
    parser.add_argument('--min-amount', type=float, default=1.0, help='Minimum ZEC per tx')
    parser.add_argument('--eps', type=float, default=0.0001, help='DBSCAN epsilon')
    parser.add_argument('--dry-run', action='store_true', help="Don't save to database")
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')

    args = parser.parse_args()

    print('═' * 60)
    print('🤖 ML BATCH PATTERN DETECTOR (DBSCAN Clustering)')
    print(f'   Period: {args.period} days')
    print(f'   Min cluster size: {args.min_cluster}')
    print(f'   Min amount: {args.min_amount} ZEC')
    print(f'   DBSCAN eps: {args.eps}')
    print(f'   Dry run: {args.dry_run}')
    print('═' * 60)

    start_time = datetime.now()

    try:
        patterns = detect_patterns(
            period_days=args.period,
            min_cluster_size=args.min_cluster,
            min_amount_zec=args.min_amount,
            eps=args.eps,
            dry_run=args.dry_run,
            verbose=args.verbose
        )

        print(f'\n✅ Detected {len(patterns)} patterns\n')

        # Stats
        high = sum(1 for p in patterns if p['warning_level'] == 'HIGH')
        medium = sum(1 for p in patterns if p['warning_level'] == 'MEDIUM')
        low = sum(1 for p in patterns if p['warning_level'] == 'LOW')
        total_zec = sum(p['total_amount_zec'] for p in patterns)

        # Print patterns
        for p in patterns[:20]:  # Top 20
            icon = '🔴' if p['warning_level'] == 'HIGH' else '🟡' if p['warning_level'] == 'MEDIUM' else '🟢'
            print(f"{icon} [{p['score']:3d}] {p['batch_count']}× {p['per_tx_amount_zec']:.4f} ZEC = {p['total_amount_zec']:.2f} ZEC")

            if p.get('matching_shield'):
                print(f"   └─ Matches shield: {p['matching_shield']['txid'][:12]}... ({p['matching_shield']['amount_zec']:.2f} ZEC)")

            # Show if it's a non-round amount (extra suspicious!)
            if not p['breakdown']['round_number']['is_round'] and p['breakdown']['uniformity']['points'] >= 10:
                print(f"   └─ ⚠️ NON-ROUND identical amount detected!")

            if args.verbose:
                print(f"   └─ {p['explanation']}")
            print()

        if len(patterns) > 20:
            print(f"   ... and {len(patterns) - 20} more patterns\n")

        # Summary
        elapsed = (datetime.now() - start_time).total_seconds()
        print('═' * 60)
        print('📈 SUMMARY')
        print(f'   Total patterns: {len(patterns)}')
        print(f'   🔴 HIGH: {high}')
        print(f'   🟡 MEDIUM: {medium}')
        print(f'   🟢 LOW: {low}')
        print(f'   Total ZEC flagged: {total_zec:,.2f}')
        print(f'   Time: {elapsed:.1f}s')
        print('═' * 60)

    except psycopg2.OperationalError as e:
        print(f'❌ Database connection failed: {e}')
        print('   Make sure PostgreSQL is running and credentials are correct.')
        sys.exit(1)
    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
