#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$(cd "$ROOT/../web" && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/.env" ]; then
  echo "Missing contracts/.env with PRIVATE_KEY=0x..."
  exit 1
fi
# shellcheck disable=SC1091
set -a
source "$ROOT/.env"
set +a

: "${PRIVATE_KEY:?PRIVATE_KEY required}"
PAY_TO="${PAY_TO:-}"
HOUSE_FUND_WEI="${HOUSE_FUND_WEI:-200000000000000000}"

ADDR="$(cast wallet address --private-key "$PRIVATE_KEY")"
BAL="$(cast balance "$ADDR" --rpc-url https://testnet-rpc.monad.xyz)"
echo "Deployer $ADDR  balance $BAL wei"
if [ "$BAL" = "0" ]; then
  echo "Fund this address on https://faucet.monad.xyz then re-run."
  exit 1
fi

if [ -z "$PAY_TO" ]; then
  PAY_TO="$ADDR"
fi

PAY_TO="$PAY_TO" HOUSE_FUND_WEI="$HOUSE_FUND_WEI" PRIVATE_KEY="$PRIVATE_KEY" \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url https://testnet-rpc.monad.xyz \
    --broadcast \
    --legacy

LATEST="$ROOT/broadcast/Deploy.s.sol/10143/run-latest.json"
if [ ! -f "$LATEST" ]; then
  echo "broadcast file missing"
  exit 1
fi

# create + 3 contracts in order: Registry, Router, Escrow (escrow is last created)
REGISTRY="$(jq -r '.transactions[] | select(.contractName=="AgentRegistry" and .transactionType=="CREATE") | .contractAddress' "$LATEST" | head -1)"
ROUTER="$(jq -r '.transactions[] | select(.contractName=="PaymentRouter" and .transactionType=="CREATE") | .contractAddress' "$LATEST" | head -1)"
ESCROW="$(jq -r '.transactions[] | select(.contractName=="DevilEscrow" and .transactionType=="CREATE") | .contractAddress' "$LATEST" | head -1)"

echo "REGISTRY=$REGISTRY"
echo "PAYMENT_ROUTER=$ROUTER"
echo "DEVIL_ESCROW=$ESCROW"
echo "PAY_TO=$PAY_TO"

cat > "$WEB/.env.local" <<EOF
OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
OPENROUTER_MODEL=${OPENROUTER_MODEL:-openai/gpt-4o-mini}
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_EXPLORER=https://testnet.monadvision.com
NEXT_PUBLIC_REGISTRY=$REGISTRY
NEXT_PUBLIC_PAYMENT_ROUTER=$ROUTER
NEXT_PUBLIC_DEVIL_ESCROW=$ESCROW
NEXT_PUBLIC_PAY_TO=$PAY_TO
EOF

python3 - <<PY
from pathlib import Path
p = Path("$REPO/README.md")
t = p.read_text()
repls = {
    "NEXT_PUBLIC_REGISTRY": "$REGISTRY",
    "NEXT_PUBLIC_PAYMENT_ROUTER": "$ROUTER",
    "NEXT_PUBLIC_DEVIL_ESCROW": "$ESCROW",
}
# keep table usable: write a contracts block
marker = "## Deployed addresses (testnet)"
block = f"""## Deployed addresses (testnet)

- AgentRegistry: [\`{repls['NEXT_PUBLIC_REGISTRY']}\`](https://testnet.monadvision.com/address/{repls['NEXT_PUBLIC_REGISTRY']})
- PaymentRouter: [\`{repls['NEXT_PUBLIC_PAYMENT_ROUTER']}\`](https://testnet.monadvision.com/address/{repls['NEXT_PUBLIC_PAYMENT_ROUTER']})
- DevilEscrow: [\`{repls['NEXT_PUBLIC_DEVIL_ESCROW']}\`](https://testnet.monadvision.com/address/{repls['NEXT_PUBLIC_DEVIL_ESCROW']})
- Pay-to / sink: \`{ "$PAY_TO" }\`
"""
if marker in t:
    pre, rest = t.split(marker, 1)
    # drop old block until next ##
    nxt = rest.find("\n## ", 1)
    t = pre + block + (rest[nxt:] if nxt != -1 else "")
else:
    t = t.replace("## Contracts", block + "\n## Contracts")
p.write_text(t)
print("README updated")
PY

echo "Wrote web/.env.local"
echo "Next: ./script/verify.sh"
