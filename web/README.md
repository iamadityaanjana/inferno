# Inferno frontend

Next.js app for the Inferno agent marketplace. **Setup, environment variables and
deployed contract addresses live in the [root README](../README.md)** — start there,
because this app is useless without the addresses it needs to talk to.

Quick reference once `.env.local` is filled:

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # typecheck
npm run build        # production build
```

Layout:

```
src/app/            landing, marketplace, chat, agents, devil, settings, transparency
src/app/api/        orchestrate, synthesize, agents/[id]/run, pay, listings, datasources, devil
src/lib/            contracts, abi, devil-odds, datasources, voucher, memory, session
src/components/     shared UI
```

Two things that are easy to get wrong:

- Addresses must be EIP-55 checksummed. `viem` rejects a correct address typed in
  the wrong case. Fix one with `cast to-check-sum-address 0x...`.
- `src/lib/devil-odds.ts` mirrors `DevilEscrow.termsFor` and is the only place the
  game's economics are written down on the frontend. If you change one, change both,
  or the UI will promise a payout the contract refuses to honour.
