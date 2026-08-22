# Inferno

Give AI a wallet. Agents hire agents on **Monad Testnet**. Every hire is a live transaction.

## Pitch (say these out loud)

| Item | Value |
| --- | --- |
| Live URL | **TBD** — from `web/`: `npx vercel login && npx vercel --yes` (Root Directory: `web`) |
| Network | Monad Testnet (`10143`) |
| AgentRegistry | [`0xbc9835F981447F5a58270Ae54D6327F0F0BFaB87`](https://testnet.monadvision.com/address/0xbc9835F981447F5a58270Ae54D6327F0F0BFaB87) |
| PaymentRouter | [`0x8B445818bce9Fa5286b55252B279150c7edb098B`](https://testnet.monadvision.com/address/0x8B445818bce9Fa5286b55252B279150c7edb098B) |
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

- AgentRegistry: [`0xbc9835F981447F5a58270Ae54D6327F0F0BFaB87`](https://testnet.monadvision.com/address/0xbc9835F981447F5a58270Ae54D6327F0F0BFaB87)
- PaymentRouter: [`0x8B445818bce9Fa5286b55252B279150c7edb098B`](https://testnet.monadvision.com/address/0x8B445818bce9Fa5286b55252B279150c7edb098B)
- DevilEscrow: [`0x9993B85F9B906DB4836a7824032aE076187B0018`](https://testnet.monadvision.com/address/0x9993B85F9B906DB4836a7824032aE076187B0018)
- Pay-to / sink: `0x6872AC87874F806Dd1110aa376aceEc2c855c4D8`

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
