# Live Poll Pro — Production-Grade Soroban dApp

A two-contract Soroban dApp built for **Level 3 – Orange Belt**. Voting on a poll
triggers a real inter-contract call that awards the voter an on-chain reputation
point — with full test coverage, CI/CD, mobile-responsive UI, and production-style
architecture.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design rationale, especially
*how* the rewards contract authenticates that only the registered poll contract can
award points (this is the interesting part).

## What's new since Level 2

- **Two contracts, one calling the other**: `poll_contract` invokes
  `rewards_contract.award_point` on every vote (real cross-contract communication,
  not just two contracts that happen to coexist)
- **16 passing contract tests** across both contracts, including two integration
  tests that register both contracts in the same test environment and assert the
  reputation score actually increments as a result of voting
- **19 passing frontend tests** (Vitest + React Testing Library), including a test
  suite that mocks the Soroban RPC layer to verify the UI reacts correctly to a
  successful vote
- **CI/CD pipeline** (GitHub Actions) running contract tests, frontend tests, and a
  production build on every push
- **Mobile-responsive UI**, environment-based configuration, loading skeletons, and
  a retry affordance for network failures

## Features

- **Multi-wallet support** via StellarWalletsKit — Freighter, xBull, Albedo
- **3+ handled error types**: wallet not installed, request rejected, insufficient
  balance, plus contract-level errors (already voted, invalid option, rewards
  misconfiguration)
- **Live poll results** with an on-chain reputation display proving the
  cross-contract call worked
- **Real-time sync**: interval-based result polling + a Soroban event feed
- **Full transaction lifecycle tracking**: building → signing → submitting →
  success (hash + explorer link) / error, with a distinct message when a vote
  succeeds but a secondary reputation refresh fails

## Tech stack

- **Contracts**: Rust + [`soroban-sdk`](https://crates.io/crates/soroban-sdk) 20.x
- **Frontend**: React 18 + TypeScript + Vite
- [`@creit.tech/stellar-wallets-kit`](https://www.npmjs.com/package/@creit.tech/stellar-wallets-kit) —
  multi-wallet connect/sign
- [`@stellar/stellar-sdk`](https://www.npmjs.com/package/@stellar/stellar-sdk) —
  Soroban RPC interaction
- **Vitest + React Testing Library** — frontend tests
- **GitHub Actions** — CI/CD

## Project structure

```
contracts/
  poll_contract/
    Cargo.toml
    src/lib.rs      initialize, vote, get_question, get_results, has_voted,
                     set_rewards_contract, get_voter_reputation
    src/test.rs     10 tests: unit tests + 2 cross-contract integration tests
  rewards_contract/
    Cargo.toml
    src/lib.rs      initialize, award_point (authorized-caller checked), get_score
    src/test.rs     6 tests: initialize, authorized/unauthorized caller, accumulation
scripts/
  deploy.sh         Builds + deploys both contracts in the correct order and wires them
frontend/
  .env.example
  src/components/   WalletConnect, PollCard, VoteButton, TransactionStatus, ActivityFeed
  src/hooks/        useWallet, usePollContract, usePollEvents
  src/lib/          contractConfig.ts (env-driven), soroban.ts
  src/**/*.test.tsx Vitest test suites
.github/workflows/
  ci.yml            Contract tests + frontend tests/build on every push
  deploy.yml        Optional Vercel deploy (disabled by default, see comments inside)
ARCHITECTURE.md
```

---

## Part 1 — Contracts: build, test, deploy

### Prerequisites

- Rust (`rustup`): https://www.rust-lang.org/tools/install
- A wasm target: `rustup target add wasm32v1-none` (or `wasm32-unknown-unknown` on
  older toolchains — the Stellar CLI will tell you which one it expects)
- Stellar CLI: `cargo install --locked stellar-cli --features opt`

> **Windows users**: native `cargo test` for Soroban contracts is known to crash
> with `STATUS_STACK_BUFFER_OVERRUN` on some setups due to small default thread
> stacks. If you hit this, run:
> ```powershell
> $env:RUST_MIN_STACK=536870912; cargo test -- --test-threads=1
> ```
> If a specific `#[should_panic]` test still aborts the whole process, it's a
> Windows-native panic-unwinding quirk with this dependency stack, not a logic bug —
> the same tests pass cleanly on Linux/macOS/WSL. `stellar contract build` (the step
> that actually matters for deployment) is unaffected either way.

### 1. Run the tests

```bash
cd contracts/rewards_contract && cargo test
cd ../poll_contract && cargo test
```

Expected: **6 passed** for `rewards_contract`, **10 passed** for `poll_contract`
(16 total). The poll_contract suite includes
`test_vote_awards_reputation_via_cross_contract_call` and
`test_reputation_accumulates_across_multiple_voters` — these register both
contracts in one test environment and prove the cross-contract call really works,
not just that each contract works in isolation.

### 2. Deploy both contracts

From the repo root:

```bash
bash scripts/deploy.sh
```

This builds both contracts, deploys `rewards_contract` first (it must exist before
`poll_contract` can be wired to it), deploys `poll_contract`, then runs the
`initialize` / `set_rewards_contract` calls to connect them. It prints both contract
IDs at the end — copy them for the next step.

If you'd rather run each step by hand, open `scripts/deploy.sh` — every command is
commented and can be copy-pasted individually.

---

## Part 2 — Frontend: configure, run, test

### 1. Configure environment variables

```bash
cd frontend
cp .env.example .env
```

Edit `.env` and paste in the two contract IDs from the deploy step:

```
VITE_POLL_CONTRACT_ID=C...
VITE_REWARDS_CONTRACT_ID=C...
```

### 2. Install, test, run

```bash
npm install
npm run test   # 19 tests across 4 suites
npm run dev
```

Open the printed local URL. Have at least one of Freighter, xBull, or Albedo
installed and set to **Testnet**.

### 3. Vote and watch reputation update

1. Connect a wallet.
2. Vote on an option — approve the signature request.
3. Watch the status move through building → signing → submitting → confirmed.
4. Your reputation score (awarded via the cross-contract call) appears below the
   poll results.

### Build for production

```bash
npm run build
npm run preview
```

### Deploying the frontend live

Any static host works since this is a Vite SPA. The simplest path:

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com/new) or
   [Netlify](https://app.netlify.com/start), setting the project root to `frontend/`.
3. Add the same environment variables from `.env` in the host's dashboard
   (`VITE_POLL_CONTRACT_ID`, `VITE_REWARDS_CONTRACT_ID`, etc.).
4. Deploy — most hosts auto-deploy on every push to `main` after this.

(`.github/workflows/deploy.yml` in this repo shows an alternative CI-driven deploy to
Vercel, disabled by default — see the comments in that file for how to enable it.)

---

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request:

- **contracts** job: runs `cargo test` for both `rewards_contract` and
  `poll_contract` (16 tests total, including the cross-contract integration tests)
- **frontend** job: installs dependencies, runs `npm run test` (19 tests), then
  `npm run build`

Both jobs must pass for a green check. See the **Actions** tab on GitHub for the
live run.

---

## Error handling summary

| Error type | Where | User-facing message |
|---|---|---|
| Wallet not installed | Picking an unavailable wallet in the connect modal | "That wallet extension isn't installed. Install it and try again." |
| Signature/connection rejected | User closes the wallet's prompt | "The request was rejected in the wallet." |
| Insufficient balance | Not enough XLM to cover the fee | "This account doesn't have enough XLM to cover the transaction fee." |
| Already voted / invalid option | Poll contract rejects the vote itself | Plain-language message decoded from the panic reason |
| Rewards misconfigured | `award_point` rejects an unauthorized caller | Surfaced distinctly from a plain vote failure |
| Network/RPC failure | Horizon/Soroban RPC unreachable | Dedicated error state with a **Retry** button |

---

## Submission details

> Fill these in before submitting.

- **poll_contract deployed address**: `C...`
- **rewards_contract deployed address**: `C...`
- **Transaction hash of a vote (with reputation award)**: `...` — verify at
  `https://stellar.expert/explorer/testnet/tx/<hash>`
- **Live demo link**: _add your Vercel/Netlify URL here_
- **Demo video (1–2 min)**: _add your Loom/YouTube link here — show: connect wallet →
  vote → reputation score updates → transaction on Stellar Expert_

### Screenshots

> Save these in a `screenshots/` folder and update the paths.

#### Mobile responsive UI
![Mobile UI](./screenshots/mobile-ui.png)

#### CI/CD pipeline running (green)
![CI pipeline](./screenshots/ci-pipeline.png)

#### Test output (3+ passing tests)
![Test output](./screenshots/test-output.png)

## Suggested commit structure (10+ meaningful commits)

```bash
git init
git add contracts/rewards_contract/
git commit -m "Add rewards contract with authorized-caller checks"

git add contracts/poll_contract/Cargo.toml
git commit -m "Add rewards_contract as a dev-dependency for integration testing"

git add contracts/poll_contract/src/
git commit -m "Wire poll contract to call rewards contract on vote"

git add contracts/poll_contract/src/test.rs
git commit -m "Add integration tests proving the cross-contract reputation flow"

git add scripts/deploy.sh
git commit -m "Add deployment script for both contracts in correct order"

git add frontend/.env.example frontend/src/lib/contractConfig.ts
git commit -m "Move contract config to environment variables"

git add frontend/src/lib/soroban.ts frontend/src/hooks/usePollContract.ts
git commit -m "Add reputation reads and retry-friendly error handling"

git add frontend/src/components/ frontend/src/index.css
git commit -m "Add reputation display, loading skeletons, and mobile responsive styles"

git add frontend/package.json frontend/vite.config.ts frontend/src/test/
git commit -m "Add Vitest + React Testing Library setup"

git add frontend/src/**/*.test.tsx frontend/src/hooks/usePollContract.test.ts
git commit -m "Add frontend test suite covering wallet, voting, and error states"

git add .github/workflows/
git commit -m "Add CI/CD pipeline for contracts and frontend"

git add README.md ARCHITECTURE.md
git commit -m "Add architecture docs and submission documentation"

git remote add origin https://github.com/<your-username>/live-poll-pro.git
git push -u origin main
```
