# Inferno contracts (Monad testnet)

```bash
forge test
cp .env.example .env   # add PRIVATE_KEY, fund on https://faucet.monad.xyz
./script/deploy.sh
./script/verify.sh
```

`deploy.sh` writes addresses into `../web/.env.local` and the root README.
