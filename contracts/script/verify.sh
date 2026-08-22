#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LATEST="$ROOT/broadcast/Deploy.s.sol/10143/run-latest.json"
REGISTRY="$(jq -r '.transactions[] | select(.contractName=="AgentRegistry" and .transactionType=="CREATE") | .contractAddress' "$LATEST" | head -1)"
ROUTER="$(jq -r '.transactions[] | select(.contractName=="PaymentRouter" and .transactionType=="CREATE") | .contractAddress' "$LATEST" | head -1)"
ESCROW="$(jq -r '.transactions[] | select(.contractName=="DevilEscrow" and .transactionType=="CREATE") | .contractAddress' "$LATEST" | head -1)"

verify_one() {
  local addr="$1"
  local name="$2"
  local extra=()
  if [ $# -ge 3 ]; then
    extra=(--constructor-args "$3")
  fi
  echo "Verifying $name at $addr"
  forge verify-contract "$addr" "$name" --chain 10143 \
    --verifier sourcify \
    --verifier-url "https://sourcify-api-monad.blockvision.org/" \
    "${extra[@]}" || true

  forge verify-contract "$addr" "$name" --chain 10143 --show-standard-json-input > /tmp/standard-input.json
  local file
  file="$(echo "$name" | cut -d: -f1 | xargs basename)"
  local cname
  cname="$(echo "$name" | cut -d: -f2)"
  jq '.metadata' "out/${file}/${cname}.json" > /tmp/metadata.json
  python3 - <<PY
import json, urllib.request
standard = json.load(open("/tmp/standard-input.json"))
meta = json.load(open("/tmp/metadata.json"))
body = {
  "chainId": 10143,
  "contractAddress": "$addr",
  "contractName": "$name",
  "compilerVersion": "v0.8.28+commit.7893614a",
  "standardJsonInput": standard,
  "foundryMetadata": meta,
}
args = """${3:-}"""
if args:
    body["constructorArgs"] = args[2:] if args.startswith("0x") else args
req = urllib.request.Request(
    "https://agents.devnads.com/v1/verify",
    data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print(r.read().decode())
except Exception as e:
    print("verify API:", e)
PY
}

CTOR=$(cast abi-encode "constructor(address)" "$REGISTRY")
verify_one "$REGISTRY" "src/AgentRegistry.sol:AgentRegistry"
verify_one "$ROUTER" "src/PaymentRouter.sol:PaymentRouter" "$CTOR"
verify_one "$ESCROW" "src/DevilEscrow.sol:DevilEscrow"
echo "Done. Check explorers for Contract tab."
