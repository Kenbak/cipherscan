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
    num_good_nodes: usize,
    num_known_nodes: usize,
    num_known_connections: usize,
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

    let output = EnrichedOutput {
        nodes,
        edges,
        num_good_nodes: crawl.num_good_nodes,
        num_known_nodes: crawl.num_known_nodes,
        num_known_connections: crawl.num_known_connections,
    };

    serde_json::to_writer(io::stdout(), &output).expect("Failed to write output JSON");
}
