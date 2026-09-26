# Zakura dashboard observer

Mainnet Fork Watch polls `http://159.65.183.89:8090/data/node/europe-west-0`
every 60 seconds as **Zakura europe-west-0**. This is one node's
reported tip from the operator's HTTP dashboard, not direct node RPC and not
the cluster's majority tip. No push integration or credentials are required.

The adapter requires the requested node identity, `network=mainnet`,
`rpc_chain=main`, `rpc_testnet=false`, `client_name=zakurad`, successful RPC
and an active service. Both the dashboard's last poll and node's last-seen
probe must be no older than 300 seconds and no more than 60 seconds in the
future. It validates integer height and a 64-character hexadecimal block hash.
A fresh HTTP response or generated_at timestamp does not refresh stale probes.

Requests have a five-second deadline and a one-MiB response limit. Redirects
are rejected; the destination is fixed in the server's mainnet node allowlist.
Only height, hash, implementation, version and source observation time are
exposed; operational fields from the dashboard are not copied to our API.
The public nodes response adds source=zakura-dashboard and observedAt (ISO UTC)
for this observer. lastChecked remains CipherScan's check time. Neither is a
local-node first-seen timestamp.

Comparison uses CipherScan's canonical block at the reported height. Matching
current tips agree; matching lower tips are behind; higher tips are ahead.
Mismatches at known heights are recorded in tip_reports with the existing
monitor node identifier and uniqueness rule. Unavailable/invalid/stale data
marks the observer offline without inserting evidence. Last successful tip
fields may remain visible with that offline status. Exact common ancestor and
fork depth remain unavailable because this feed does not provide arbitrary-
height RPC access. Historical dashboard reorgs are not imported.

The internal report identity remains `Zakura europe-west-0 (dashboard)` to
preserve existing evidence identifiers; the public name omits the transport.
The supplied root URL rejects JSON-RPC POST with HTTP 501. Direct RPC polling
requires a separate operator-provided RPC endpoint and any access configuration.

No migration, new route or frontend change is required. Existing gRPC/RPC
observers and the separate Crosslink monitor remain in place. Testnet does not
include this mainnet-only observer. Deployment is through main's existing
CI-gated API workflow; the redesign branch is outside this change.
