$NETWORK = "testnet"
$IDENTITY = "alice"
$QUESTION = "What should we build next?"
$OPTIONS = '["A wallet", "A DEX", "An NFT minter"]' -replace '"', '\"'

Write-Host "== 1/7: Ensuring identity '$IDENTITY' exists and is funded =="
$null = stellar keys address $IDENTITY 2>$null
if ($LASTEXITCODE -ne 0) {
    stellar keys generate $IDENTITY --network $NETWORK
}
stellar keys fund $IDENTITY --network $NETWORK
$ADMIN_ADDRESS = (stellar keys address $IDENTITY).Trim()
Write-Host "Admin address: $ADMIN_ADDRESS"

Write-Host "== 2/7: Building rewards_contract =="
Push-Location contracts/rewards_contract
stellar contract build
Pop-Location

Write-Host "== 3/7: Building poll_contract =="
Push-Location contracts/poll_contract
stellar contract build
Pop-Location

$REWARDS_WASM = "contracts/rewards_contract/target/wasm32v1-none/release/rewards_contract.wasm"
$POLL_WASM = "contracts/poll_contract/target/wasm32v1-none/release/poll_contract.wasm"

if (-not (Test-Path $REWARDS_WASM)) {
    $REWARDS_WASM = "contracts/rewards_contract/target/wasm32-unknown-unknown/release/rewards_contract.wasm"
}
if (-not (Test-Path $POLL_WASM)) {
    $POLL_WASM = "contracts/poll_contract/target/wasm32-unknown-unknown/release/poll_contract.wasm"
}

Write-Host "== 4/7: Deploying rewards_contract =="
$REWARDS_ID = (stellar contract deploy --wasm $REWARDS_WASM --source $IDENTITY --network $NETWORK).Trim()
Write-Host "rewards_contract deployed: $REWARDS_ID"

Write-Host "== 5/7: Deploying poll_contract =="
$POLL_ID = (stellar contract deploy --wasm $POLL_WASM --source $IDENTITY --network $NETWORK).Trim()
Write-Host "poll_contract deployed: $POLL_ID"

Write-Host "== 6/7: Wiring the two contracts together =="
stellar contract invoke --id $REWARDS_ID --source $IDENTITY --network $NETWORK -- initialize --authorized_caller $POLL_ID

stellar contract invoke --id $POLL_ID --source $IDENTITY --network $NETWORK -- initialize --admin $ADMIN_ADDRESS --question $QUESTION --options $OPTIONS

stellar contract invoke --id $POLL_ID --source $IDENTITY --network $NETWORK -- set_rewards_contract --admin $ADMIN_ADDRESS --rewards_contract $REWARDS_ID

Write-Host "== 7/7: Done =="
Write-Host ""
Write-Host "poll_contract ID:    $POLL_ID"
Write-Host "rewards_contract ID: $REWARDS_ID"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Put these IDs into frontend/.env (copy from frontend/.env.example):"
Write-Host "       VITE_POLL_CONTRACT_ID=$POLL_ID"
Write-Host "       VITE_REWARDS_CONTRACT_ID=$REWARDS_ID"
Write-Host "  2. cd frontend && npm install && npm run dev"
