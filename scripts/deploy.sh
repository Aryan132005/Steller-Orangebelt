#!/usr/bin/env bash
# Deploys rewards_contract and poll_contract to Stellar Testnet, in the
# correct order, and wires them together. Run this from the repo root:
#   bash scripts/deploy.sh
#
# Prerequisites:
#   - Rust + wasm32v1-none (or wasm32-unknown-unknown) target installed
#   - Stellar CLI installed: cargo install --locked stellar-cli --features opt
#   - A funded testnet identity named "alice" (this script creates one if
#     it doesn't already exist)

set -euo pipefail

NETWORK="testnet"
IDENTITY="alice"
QUESTION="What should we build next?"
OPTIONS='["A wallet", "A DEX", "An NFT minter"]'

echo "== 1/7: Ensuring identity '$IDENTITY' exists and is funded =="
if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  stellar keys generate "$IDENTITY" --network "$NETWORK"
fi
stellar keys fund "$IDENTITY" --network "$NETWORK" || true
ADMIN_ADDRESS=$(stellar keys address "$IDENTITY")
echo "Admin address: $ADMIN_ADDRESS"

echo "== 2/7: Building rewards_contract =="
(cd contracts/rewards_contract && stellar contract build)

echo "== 3/7: Building poll_contract =="
(cd contracts/poll_contract && stellar contract build)

REWARDS_WASM="contracts/rewards_contract/target/wasm32v1-none/release/rewards_contract.wasm"
POLL_WASM="contracts/poll_contract/target/wasm32v1-none/release/poll_contract.wasm"

# Fall back to the older target dir name if the toolchain used
# wasm32-unknown-unknown instead of wasm32v1-none.
if [ ! -f "$REWARDS_WASM" ]; then
  REWARDS_WASM="contracts/rewards_contract/target/wasm32-unknown-unknown/release/rewards_contract.wasm"
fi
if [ ! -f "$POLL_WASM" ]; then
  POLL_WASM="contracts/poll_contract/target/wasm32-unknown-unknown/release/poll_contract.wasm"
fi

echo "== 4/7: Deploying rewards_contract (must exist before poll_contract can be wired to it) =="
REWARDS_ID=$(stellar contract deploy \
  --wasm "$REWARDS_WASM" \
  --source "$IDENTITY" \
  --network "$NETWORK")
echo "rewards_contract deployed: $REWARDS_ID"

echo "== 5/7: Deploying poll_contract =="
POLL_ID=$(stellar contract deploy \
  --wasm "$POLL_WASM" \
  --source "$IDENTITY" \
  --network "$NETWORK")
echo "poll_contract deployed: $POLL_ID"

echo "== 6/7: Wiring the two contracts together =="
stellar contract invoke \
  --id "$REWARDS_ID" \
  --source "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --authorized_caller "$POLL_ID"

stellar contract invoke \
  --id "$POLL_ID" \
  --source "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --question "$QUESTION" \
  --options "$OPTIONS"

stellar contract invoke \
  --id "$POLL_ID" \
  --source "$IDENTITY" \
  --network "$NETWORK" \
  -- set_rewards_contract \
  --admin "$ADMIN_ADDRESS" \
  --rewards_contract "$REWARDS_ID"

echo "== 7/7: Done =="
echo ""
echo "poll_contract ID:    $POLL_ID"
echo "rewards_contract ID: $REWARDS_ID"
echo ""
echo "Next steps:"
echo "  1. Put these IDs into frontend/.env (copy from frontend/.env.example):"
echo "       VITE_POLL_CONTRACT_ID=$POLL_ID"
echo "       VITE_REWARDS_CONTRACT_ID=$REWARDS_ID"
echo "  2. cd frontend && npm install && npm run dev"
