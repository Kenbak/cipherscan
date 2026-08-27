//! CipherScan Network Cruncher
//!
//! Clean-room replacement for the unlicensed `crunchy` tool.
//! Reads crawler getmetrics JSON from stdin, enriches with:
//!   - MaxMind GeoLite2 geolocation per IP
//!   - Betweenness/closeness/degree centrality (Brandes algorithm)
//! Outputs enriched JSON to stdout.

use std::io::{self, Read};
use std::net::IpAddr;

use clap::Parser;
use maxminddb::{geoip2, Reader};
use serde::{Deserialize, Serialize};

#[derive(Parser)]
#[clap(name = "cruncher", about = "Enrich crawler metrics with geo + centrality")]
struct Args {
    #[clap(long)]
    mmdb: String,
}

#[derive(Debug, Deserialize)]
struct CrawlInput {
    node_info: Vec<NodeInput>,
    #[allow(dead_code)]
    node_addrs: Vec<String>,
    nodes_indices: Vec<Vec<usize>>,
    #[serde(default)]
    num_good_nodes: usize,
    #[serde(default)]
    num_known_nodes: usize,
    #[serde(default)]
    num_known_connections: usize,
    // Full known-network graph (reachable core + gossiped/unreachable addresses).
    // Present only from the extended crawler; defaults keep older payloads parsing.
    #[serde(default)]
    all_node_addrs: Vec<String>,
    #[serde(default)]
    all_nodes_indices: Vec<Vec<usize>>,
    #[serde(default)]
    all_node_reachable: Vec<bool>,
}

#[derive(Debug, Deserialize)]
struct NodeInput {
    addr: String,
    user_agent: Option<String>,
    protocol_version: Option<u32>,
    start_height: Option<i32>,
    services: Option<u64>,
    handshake_time_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
struct EnrichedOutput {
    nodes: Vec<EnrichedNode>,
    edges: Vec<Edge>,
    // Full known-network topology: reachable core + connected unreachable ("off") nodes.
    topo_nodes: Vec<TopoNode>,
    topo_edges: Vec<Edge>,
    num_good_nodes: usize,
    num_known_nodes: usize,
    num_known_connections: usize,
}

/// A node in the full known-network graph. `reachable=false` means the crawler
/// heard about this address via gossip but never completed a handshake ("off").
#[derive(Debug, Serialize)]
struct TopoNode {
    addr: String,
    reachable: bool,
    network_type: String,
    geo: Option<GeoInfo>,
    degree: usize,
    betweenness: f64,
    closeness: f64,
}

#[derive(Debug, Serialize)]
struct EnrichedNode {
    addr: String,
    user_agent: Option<String>,
    protocol_version: Option<u32>,
    start_height: Option<i32>,
    services: Option<u64>,
    handshake_time_ms: Option<u64>,
    geo: Option<GeoInfo>,
    betweenness: f64,
    closeness: f64,
    degree: usize,
    network_type: String,
}

#[derive(Debug, Serialize)]
struct GeoInfo {
    country: Option<String>,
    country_code: Option<String>,
    city: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    isp: Option<String>,
}

#[derive(Debug, Serialize)]
struct Edge {
    src: String,
    dst: String,
}

fn geolocate(reader: &Reader<Vec<u8>>, addr: &str) -> Option<GeoInfo> {
    let ip_str = addr.split(':').next()?;
    let ip_str = ip_str.trim_start_matches('[').trim_end_matches(']');
    let ip: IpAddr = ip_str.parse().ok()?;
    let city: geoip2::City = reader.lookup(ip).ok()?;
    let country = city.country.as_ref()
        .and_then(|c| c.names.as_ref())
        .and_then(|n| n.get("en"))
        .map(|s| s.to_string());
    let country_code = city.country.as_ref()
        .and_then(|c| c.iso_code.map(|s| s.to_string()));
    let city_name = city.city.as_ref()
        .and_then(|c| c.names.as_ref())
        .and_then(|n| n.get("en"))
        .map(|s| s.to_string());
    let (lat, lon) = city.location.as_ref()
        .map(|l| (l.latitude, l.longitude))
        .unwrap_or((None, None));
    Some(GeoInfo { country, country_code, city: city_name, lat, lon, isp: None })
}

/// Brandes algorithm for betweenness centrality on an undirected graph.
fn compute_centrality(
    num_nodes: usize,
    adjacency: &[Vec<usize>],
) -> (Vec<f64>, Vec<f64>, Vec<usize>) {
    let mut betweenness = vec![0.0f64; num_nodes];
    let mut closeness = vec![0.0f64; num_nodes];
    let degree: Vec<usize> = adjacency.iter().map(|n| n.len()).collect();

    for s in 0..num_nodes {
        let mut stack: Vec<usize> = Vec::new();
        let mut predecessors: Vec<Vec<usize>> = vec![Vec::new(); num_nodes];
        let mut sigma = vec![0.0f64; num_nodes];
        sigma[s] = 1.0;
        let mut dist: Vec<i64> = vec![-1; num_nodes];
        dist[s] = 0;

        let mut queue = std::collections::VecDeque::new();
        queue.push_back(s);

        while let Some(v) = queue.pop_front() {
            stack.push(v);
            for &w in &adjacency[v] {
                if dist[w] < 0 {
                    queue.push_back(w);
                    dist[w] = dist[v] + 1;
                }
                if dist[w] == dist[v] + 1 {
                    sigma[w] += sigma[v];
                    predecessors[w].push(v);
                }
            }
        }

        let total_dist: i64 = dist.iter().filter(|&&d| d > 0).sum();
        let reachable = dist.iter().filter(|&&d| d > 0).count();
        if reachable > 0 && total_dist > 0 {
            closeness[s] = reachable as f64 / total_dist as f64;
        }

        let mut delta = vec![0.0f64; num_nodes];
        while let Some(w) = stack.pop() {
            for &v in &predecessors[w] {
                delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w]);
            }
            if w != s {
                betweenness[w] += delta[w];
            }
        }
    }

    let n = num_nodes as f64;
    if n > 2.0 {
        let norm = 2.0 / ((n - 1.0) * (n - 2.0));
        for b in betweenness.iter_mut() {
            *b *= norm;
        }
    }

    (betweenness, closeness, degree)
}

/// Build the full known-network topology from the crawler's extended graph.
///
/// Keeps only connected nodes (degree >= 1) so isolated gossiped addresses don't
/// pollute the view, reindexes them into a compact space, computes centrality on
/// the resulting subgraph, and emits nodes (with reachability + geo) and edges.
fn build_topology(
    reader: &Reader<Vec<u8>>,
    all_addrs: &[String],
    all_indices: &[Vec<usize>],
    all_reachable: &[bool],
    ua_by_addr: &std::collections::HashMap<&str, Option<String>>,
) -> (Vec<TopoNode>, Vec<Edge>) {
    let n = all_addrs.len();
    if n == 0 || all_indices.len() != n {
        return (Vec::new(), Vec::new());
    }

    let keep: Vec<bool> = all_indices.iter().map(|a| !a.is_empty()).collect();

    let mut old_to_new = vec![usize::MAX; n];
    let mut kept_old: Vec<usize> = Vec::new();
    for (i, &k) in keep.iter().enumerate() {
        if k {
            old_to_new[i] = kept_old.len();
            kept_old.push(i);
        }
    }
    let m = kept_old.len();
    if m == 0 {
        return (Vec::new(), Vec::new());
    }

    // Undirected, deduped adjacency over the kept subgraph.
    let mut adjacency: Vec<Vec<usize>> = vec![Vec::new(); m];
    for (new_i, &old_i) in kept_old.iter().enumerate() {
        for &old_j in &all_indices[old_i] {
            if old_j >= n {
                continue;
            }
            let new_j = old_to_new[old_j];
            if new_j == usize::MAX || new_j == new_i {
                continue;
            }
            if !adjacency[new_i].contains(&new_j) {
                adjacency[new_i].push(new_j);
            }
            if !adjacency[new_j].contains(&new_i) {
                adjacency[new_j].push(new_i);
            }
        }
    }

    let (betweenness, closeness, degree) = compute_centrality(m, &adjacency);

    let topo_nodes: Vec<TopoNode> = (0..m)
        .map(|new_i| {
            let old_i = kept_old[new_i];
            let addr = &all_addrs[old_i];
            let reachable = all_reachable.get(old_i).copied().unwrap_or(false);
            let network_type = match ua_by_addr.get(addr.as_str()) {
                Some(ua) => classify_network_type(ua),
                None => "Unknown".to_string(),
            };
            TopoNode {
                addr: addr.clone(),
                reachable,
                network_type,
                geo: geolocate(reader, addr),
                degree: degree[new_i],
                betweenness: betweenness[new_i],
                closeness: closeness[new_i],
            }
        })
        .collect();

    let mut topo_edges = Vec::new();
    for new_i in 0..m {
        for &new_j in &adjacency[new_i] {
            if new_j > new_i {
                topo_edges.push(Edge {
                    src: all_addrs[kept_old[new_i]].clone(),
                    dst: all_addrs[kept_old[new_j]].clone(),
                });
            }
        }
    }

    (topo_nodes, topo_edges)
}

fn classify_network_type(user_agent: &Option<String>) -> String {
    match user_agent.as_deref() {
        Some(ua) if ua.contains("Zebra:") => "Zebra".to_string(),
        Some(ua) if ua.contains("Zakura:") => "Zakura".to_string(),
        Some(ua) if ua.contains("MagicBean:") => "zcashd".to_string(),
        _ => "Unknown".to_string(),
    }
}

fn main() {
    let args = Args::parse();

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).expect("Failed to read stdin");

    let crawl: CrawlInput = serde_json::from_str(&input).expect("Failed to parse input JSON");

    let reader = Reader::<Vec<u8>>::open_readfile(&args.mmdb)
        .expect("Failed to open MaxMind database");

    let num_nodes = crawl.node_info.len();
    let adjacency = if crawl.nodes_indices.len() == num_nodes {
        crawl.nodes_indices.clone()
    } else {
        vec![Vec::new(); num_nodes]
    };

    let (betweenness, closeness, degree) = compute_centrality(num_nodes, &adjacency);
    let addr_list: Vec<&str> = crawl.node_info.iter().map(|n| n.addr.as_str()).collect();

    let nodes: Vec<EnrichedNode> = crawl.node_info.iter().enumerate().map(|(i, node)| {
        let geo = geolocate(&reader, &node.addr);
        EnrichedNode {
            addr: node.addr.clone(),
            user_agent: node.user_agent.clone(),
            protocol_version: node.protocol_version,
            start_height: node.start_height,
            services: node.services,
            handshake_time_ms: node.handshake_time_ms,
            geo,
            betweenness: betweenness[i],
            closeness: closeness[i],
            degree: degree[i],
            network_type: classify_network_type(&node.user_agent),
        }
    }).collect();

    let mut edges = Vec::new();
    for (src_idx, neighbors) in adjacency.iter().enumerate() {
        if src_idx >= addr_list.len() { break; }
        let src_ip = addr_list[src_idx].split(':').next().unwrap_or("");
        for &dst_idx in neighbors {
            if dst_idx >= addr_list.len() || dst_idx <= src_idx { continue; }
            let dst_ip = addr_list[dst_idx].split(':').next().unwrap_or("");
            edges.push(Edge { src: src_ip.to_string(), dst: dst_ip.to_string() });
        }
    }

    // --- Full known-network topology (reachable core + connected "off" nodes) ---
    // Map each reachable node's addr to its user agent so we can classify grey
    // (unreachable) nodes as Unknown while still labeling reachable ones.
    let ua_by_addr: std::collections::HashMap<&str, Option<String>> =
        crawl.node_info.iter().map(|n| (n.addr.as_str(), n.user_agent.clone())).collect();

    let (topo_nodes, topo_edges) = build_topology(
        &reader,
        &crawl.all_node_addrs,
        &crawl.all_nodes_indices,
        &crawl.all_node_reachable,
        &ua_by_addr,
    );

    let output = EnrichedOutput {
        nodes,
        edges,
        topo_nodes,
        topo_edges,
        num_good_nodes: crawl.num_good_nodes,
        num_known_nodes: crawl.num_known_nodes,
        num_known_connections: crawl.num_known_connections,
    };

    serde_json::to_writer(io::stdout(), &output).expect("Failed to write output JSON");
}
