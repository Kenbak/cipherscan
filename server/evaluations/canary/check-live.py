#!/usr/bin/env python3
"""Inspect the local trial with the upstream CLI; keep exact outputs as evidence."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import urllib.request

cli, origin, output_dir = sys.argv[1:]
if origin not in ('http://127.0.0.1:3187', 'http://localhost:3187'):
    raise SystemExit('This evaluation accepts only the documented local loopback origin.')
out = Path(output_dir)
out.mkdir(mode=0o700, parents=True, exist_ok=True)
keys = out / 'keys.json'

def run(name, args, expected_ok):
    result = subprocess.run([cli, *args, '--json'], capture_output=True, text=True, timeout=60)
    (out / f'{name}.json').write_text(result.stdout)
    (out / f'{name}.stderr').write_text(result.stderr)
    value = json.loads(result.stdout)
    if (result.returncode == 0) != expected_ok or value['ok'] != expected_ok:
        raise RuntimeError(f'{name}: unexpected outcome: {value}')
    return value

def fetch(path):
    with urllib.request.urlopen(origin + path, timeout=10) as response:
        return json.load(response)

if not keys.exists():
    run('pin-keys', ['save-canary-keys', '--canary-url', origin,
        '--skip-canary-attestation', '--allow-http', '--output', str(keys)], True)
base = ['verify', '--canary-url', origin, '--skip-canary-attestation', '--allow-http', '--trusted-keys', str(keys)]
verified = run('verified', base + ['--target', 'zecrocks-mainnet', '--target', 'zecrocks-testnet'], True)
assert verified['result']['trust'] == 'TOFU', 'Local signer is not enclave-attested'
for deployment in verified['result']['deployments']:
    assert deployment['status'] == 'VERIFIED' and deployment['pcrs'] and deployment['tls'], deployment
    registry = json.loads((Path(__file__).resolve().parents[2] / 'data/attestation-endpoints.json').read_text())
    baseline = next(entry['baseline'] for entry in registry if entry['id'] == deployment['id'])
    assert baseline['authority'] == 'reproduced'
    expected = {str(i): baseline['pcrs'][f'PCR{i}'] for i in range(3)}
    assert deployment['pcrs']['observed'] == expected == deployment['pcrs']['expected']
    assert all(deployment['pcrs']['matches'].values())
    assert deployment['tls']['attested_certfp'] == deployment['tls']['observed_certfp']
negative = run('negative-pcr', base + ['--target', 'negative-wrong-pcr'], False)
assert negative['result']['deployments'][0]['status'] == 'FAILED', negative
assert 'PCR' in negative['result']['deployments'][0]['reason'], negative

statement = fetch('/targets/zecrocks-mainnet/statement')
(out / 'statement.json').write_text(json.dumps(statement, indent=2))
(out / 'evidence.json').write_text(json.dumps(fetch('/targets/zecrocks-mainnet/evidence'), indent=2))
(out / 'status.json').write_text(json.dumps(fetch('/status.json'), indent=2))
partial = ['verify-statement', '--trusted-keys', str(keys)]
run('partial-statement', partial + ['--statement', str(out / 'statement.json')], True)
for i in (0, 1):
    missing = copy.deepcopy(statement)
    del missing['signers'][0]['signatures'][i]
    path = out / f'missing-signature-{i}.json'
    path.write_text(json.dumps(missing))
    run(f'rejected-missing-signature-{i}', partial + ['--statement', str(path)], False)
    corrupt = copy.deepcopy(statement)
    signature = corrupt['signers'][0]['signatures'][i]['sig']
    corrupt['signers'][0]['signatures'][i]['sig'] = ('A' if signature[0] != 'A' else 'B') + signature[1:]
    path = out / f'corrupt-signature-{i}.json'
    path.write_text(json.dumps(corrupt))
    run(f'rejected-corrupt-signature-{i}', partial + ['--statement', str(path)], False)
wrong_keys = json.loads(keys.read_text())
public_key = wrong_keys['keys'][0]['public_key']
wrong_keys['keys'][0]['public_key'] = ('A' if public_key[0] != 'A' else 'B') + public_key[1:]
wrong_path = out / 'wrong-keys.json'
wrong_path.write_text(json.dumps(wrong_keys))
run('rejected-wrong-keys', ['verify-statement', '--statement', str(out / 'statement.json'), '--trusted-keys', str(wrong_path)], False)
print('Both targets pass; wrong PCR fails; missing/corrupt signatures and wrong keys rejected.')
