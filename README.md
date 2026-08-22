# Inferno

Give AI a wallet. Agents hire agents on **Monad Testnet**. Every hire is a live transaction.

## Pitch (say these out loud)

| Item | Value |
| --- | --- |
| Live URL | **TBD** — from `web/`: `npx vercel login && npx vercel --yes` (Root Directory: `web`) |
| Network | Monad Testnet (`10143`) |
| AgentRegistry | [`0x7B7bB125E68B164CfE032e34B6F5b894C9CeaB70`](https://testnet.monadvision.com/address/0x7B7bB125E68B164CfE032e34B6F5b894C9CeaB70) |
| PaymentRouter | [`0x3F155de5e17431cFA9bF03d33a8936224259f9c7`](https://testnet.monadvision.com/address/0x3F155de5e17431cFA9bF03d33a8936224259f9c7) |
| DevilEscrow | [`0x9993B85F9B906DB4836a7824032aE076187B0018`](https://testnet.monadvision.com/address/0x9993B85F9B906DB4836a7824032aE076187B0018) |
| Explorer | https://testnet.monadvision.com |

## Run locally (stranger-ready)

You need: Node 18+, a browser wallet, testnet MON from https://faucet.monad.xyz

```bash
git clone <this-repo>
cd monad
cp web/.env.example web/.env.local
# paste OpenRouter key (optional) and the three contract addresses
cd web
npm install
npm run dev
```

Open http://localhost:3000 → **Create agent** → connect wallet (Monad Testnet) → run:

> Research the best Monad DeFi opportunity for 5 MON.

Expect wallet popups. Each hire must show a tx hash in the live feed. Click it. If there is no explorer link, the product failed.

Manual path if the LLM is down: click **Hire (live tx)** on any marketplace card.

## Deployed addresses (testnet)

- AgentRegistry: [`0x7b7bb125e68b164cfe032e34b6f5b894c9ceab70`](https://testnet.monadvision.com/address/0x7b7bb125e68b164cfe032e34b6f5b894c9ceab70)
- PaymentRouter: [`0x3f155de5e17431cfa9bf03d33a8936224259f9c7`](https://testnet.monadvision.com/address/0x3f155de5e17431cfa9bf03d33a8936224259f9c7)
- DevilEscrow: [`0x9993B85F9B906DB4836a7824032aE076187B0018`](https://testnet.monadvision.com/address/0x9993B85F9B906DB4836a7824032aE076187B0018)
- AgentCredits: [`0xadBB509F151d30F7843A7F20F2F195AC6231cB0E`](https://testnet.monadvision.com/address/0xadBB509F151d30F7843A7F20F2F195AC6231cB0E)
- Pay-to / sink: `0x6872AC87874F806Dd1110aa376aceEc2c855c4D8`

## How a hire gets paid

A task hires several agents, so a wallet popup per hire is unusable — but paying
from a platform key means the platform funds strangers' work and any open
endpoint drains it. Inferno does neither:

1. You top up **AgentCredits** once from Settings. The balance stays yours and is
   withdrawable at any time.
2. You sign one EIP-712 `SpendVoucher` per session, capping the amount (0.5 MON)
   and the window (1 hour).
3. The operator submits that voucher per hire. It pays **gas only** — it cannot
   spend beyond the signed cap, so a compromised operator key costs gas, not
   balances. `Revoke approvals` in Settings invalidates every outstanding voucher.
4. `AgentCredits` debits your balance and forwards the exact price through
   `PaymentRouter`, which keeps the registry's job counter authoritative and pays
   the wallet the agent's owner chose.

If credits run out or aren't configured, hires fall back to a direct wallet
transaction per hire.

## Contracts

```bash
cd contracts
forge test
export PRIVATE_KEY=0x...
export PAY_TO=0xYourAddress          # marketplace sink (can be you)
export HOUSE_FUND_WEI=200000000000000000
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast
```

Copy the printed `REGISTRY`, `PAYMENT_ROUTER`, `DEVIL_ESCROW` into `web/.env.local` and this README.

`AgentCredits` deploys separately so it never orphans existing listings:

```bash
export REGISTRY=0x...        # already deployed
export PAYMENT_ROUTER=0x...  # already deployed
forge script script/DeployCredits.s.sol:DeployCredits \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast --legacy
```

Copy the printed `AGENT_CREDITS` into `NEXT_PUBLIC_AGENT_CREDITS`.

### Verify (required)

```bash
cd contracts
# after deploy, set ADDR and NAME
export ADDR=0x...
export NAME=src/AgentRegistry.sol:AgentRegistry
forge verify-contract "$ADDR" "$NAME" --chain 10143 --show-standard-json-input > /tmp/standard-input.json
cat out/AgentRegistry.sol/AgentRegistry.json | jq '.metadata' > /tmp/metadata.json
# then POST https://agents.devnads.com/v1/verify  (see monskills verify docs)
```

Sourcify fallback:

```bash
forge verify-contract "$ADDR" src/AgentRegistry.sol:AgentRegistry --chain 10143 \
  --verifier sourcify \
  --verifier-url "https://sourcify-api-monad.blockvision.org/"
```

Repeat for `PaymentRouter` (constructor arg = registry address) and `DevilEscrow`.

## What is announced (and must work)

1. Create agent + spending policy
2. Task → hire 2–3 built-in agents → **live `PaymentRouter.pay`** → result
3. Devil Mode accept/resolve → **live `DevilEscrow` txs**

Nothing else is claimed.
