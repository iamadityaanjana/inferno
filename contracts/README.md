# Inferno contracts (Monad Testnet)

Four contracts. Deployed addresses and full setup are in the
[root README](../README.md).

```bash
forge test                              # 54 tests
forge test --match-contract DevilEdge -vv   # prints the measured house edge
cp .env.example .env                    # add PRIVATE_KEY, fund at https://faucet.monad.xyz
```

| Contract | What it owns |
| --- | --- |
| `AgentRegistry` | Listings: price, payout wallet, active flag, job count. Permissionless to join by paying `listingFee`; only a listing's owner can change it |
| `PaymentRouter` | Forwards a hire fee to the agent's payout wallet and increments its job count |
| `AgentCredits` | Prepaid user balances, spendable only against an EIP-712 voucher the user signed. The operator submits vouchers and pays gas; it cannot exceed the signed cap |
| `DevilEscrow` | Game stakes. Settles against a future block hash, refuses bets it cannot cover, tracks open payouts as `liability` |

## Deploying

Each contract deploys separately on purpose. Redeploying the registry would orphan
existing listings, and a fresh escrow starts empty and strands the previous float.

```bash
set -a && . ./.env && set +a

forge script script/Deploy.s.sol:Deploy --rpc-url https://testnet-rpc.monad.xyz --broadcast
REGISTRY=0x... PAYMENT_ROUTER=0x... \
  forge script script/DeployCredits.s.sol:DeployCredits --rpc-url https://testnet-rpc.monad.xyz --broadcast
HOUSE_WEI=1500000000000000000 \
  forge script script/DeployDevil.s.sol:DeployDevil --rpc-url https://testnet-rpc.monad.xyz --broadcast
```

`./script/deploy.sh` wraps the marketplace deploy and writes addresses into
`../web/.env.local`. `./script/verify.sh` submits sources to the explorer.

`HOUSE_WEI` caps the game: a LONGSHOT owes 9x and the escrow will not accept a bet
it cannot pay in full, so `maxStakeFor(LONGSHOT) == HOUSE_WEI / 9`. Set
`REUSE_DEVIL_ESCROW` to keep an existing house rather than deploying an empty one.

## Devil Mode economics

`DevilEscrow.termsFor` is the single source of truth, mirrored on the frontend by
`web/src/lib/devil-odds.ts`. Every deal returns less than the stake on average.

| Deal | Odds | Pays | Expected return |
| --- | --- | --- | --- |
| SAFE | 85% | 1.1x | 0.935x |
| GAMBLE | 45% | 2x | 0.90x |
| LONGSHOT | 1-in-10 (player picks the digit) | 9x | 0.90x |
| PACT | 50% refund, always leaks the next three rounds | 1x | 0.50x |

Randomness comes from `blockhash` of a block mined after the bet, with the player's
pick committed at accept time. This is deliberately not manipulable by either
player or house, but a validator willing to withhold a block could influence it —
acceptable for capped testnet stakes, not for production. Use a VRF there.
