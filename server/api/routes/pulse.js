/**
 * Pulse Routes — anomaly feed
 *
 * GET /api/pulse         — latest anomalies (paginated)
 * GET /api/pulse/summary — counts by severity for homepage widget
 */

const express = require('express');
const router = express.Router();

let pool, redisClient;

router.use((req, res, next) => {
  pool = req.app.locals.pool;
  redisClient = req.app.locals.redisClient;
  next();
});

async function cached(key, ttlSeconds, fn) {
  try {
    if (redisClient?.isOpen) {
      const hit = await redisClient.get(key);
      if (hit) return JSON.parse(hit);
    }
  } catch {}
  const data = await fn();
  try {
    if (redisClient?.isOpen) {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
    }
  } catch {}
  return data;
}

function classifySeverity(absZ) {
  if (absZ >= 4.0) return 'critical';
  if (absZ >= 3.0) return 'high';
  return 'notable';
}

// ─── Paginated feed ───────────────────────────────────────────────────────────

router.get('/api/pulse', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const metric = req.query.metric || null;

    const cacheKey = `zcash:pulse:feed:${days}:${limit}:${offset}:${metric || 'all'}`;

    const data = await cached(cacheKey, 300, async () => {
      let query = `
        SELECT date, metric, value, zscore, direction, description, detail, created_at
        FROM metric_anomalies
        WHERE date >= CURRENT_DATE - $1::int
      `;
      const params = [days];

      if (metric) {
        query += ` AND metric = $${params.length + 1}`;
        params.push(metric);
      }

      query += ` ORDER BY date DESC, ABS(zscore) DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);

      const countQuery = `
        SELECT COUNT(*) AS total
        FROM metric_anomalies
        WHERE date >= CURRENT_DATE - $1::int
        ${metric ? 'AND metric = $2' : ''}
      `;
      const countParams = metric ? [days, metric] : [days];
      const { rows: countRows } = await pool.query(countQuery, countParams);

      return {
        events: rows.map(r => ({
          date: r.date,
          metric: r.metric,
          value: Number(r.value),
          zscore: Number(r.zscore),
          direction: r.direction,
          description: r.description,
          detail: r.detail,
          severity: classifySeverity(Math.abs(Number(r.zscore))),
          createdAt: r.created_at,
        })),
        total: Number(countRows[0].total),
        limit,
        offset,
      };
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('pulse error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Summary for homepage widget ──────────────────────────────────────────────

router.get('/api/pulse/summary', async (req, res) => {
  try {
    const data = await cached('zcash:pulse:summary', 300, async () => {
      const { rows } = await pool.query(`
        SELECT metric, zscore, direction, description, date
        FROM metric_anomalies
        WHERE date >= CURRENT_DATE - 7
        ORDER BY date DESC, ABS(zscore) DESC
      `);

      const bySeverity = { critical: 0, high: 0, notable: 0 };
      const recent = [];

      for (const r of rows) {
        const sev = classifySeverity(Math.abs(Number(r.zscore)));
        bySeverity[sev]++;
        if (recent.length < 5) {
          recent.push({
            date: r.date,
            metric: r.metric,
            zscore: Number(r.zscore),
            direction: r.direction,
            description: r.description,
            severity: sev,
          });
        }
      }

      return { totalLast7d: rows.length, bySeverity, recent };
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('pulse/summary error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
