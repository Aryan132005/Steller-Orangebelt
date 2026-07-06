# Architecture

## Overview

Live Poll Pro is split into two independently deployed Soroban contracts plus a
frontend that talks to both:

```
┌─────────────┐   vote(voter, option)   ┌──────────────┐   award_point(caller, voter)   ┌──────────────────┐
│  Frontend   │ ──────────────────────▶ │ poll_contract│ ──────────────────────────────▶ │ rewards_contract │
│ (React/TS)  │                         │              │                                  │                  │
│             │ ◀────────────────────── │              │ ◀──────────────────────────────  │                  │
└─────────────┘  get_results, etc.      └──────────────┘   get_score (read-only)          └──────────────────┘
```

## Why two contracts instead of one

A single contract could track both votes and reputation internally with far
less code. We deliberately split them to demonstrate a real pattern used in
production Soroban systems: **composing independently deployed, independently
upgradeable contracts** rather than one monolith. In a real system,
`rewards_contract` might be shared across several different apps (polls,
quizzes, referrals) that all award the same reputation currency — it shouldn't
need to know anything about polls specifically, and it doesn't.

## The authorization problem, and how it's solved

The tricky part of any inter-contract design is: **how does `rewards_contract`
know a request to award points is genuinely coming from `poll_contract`, and
not from anyone who simply calls `award_point` directly and claims to be the
poll contract?**

A naive approach — just checking that a `caller: Address` parameter passed in
by the caller happens to match the stored poll contract's address — is
**not** secure on its own, since any account or contract could pass in that
same address value as a plain argument without actually being invoked from
it.

`rewards_contract` closes this gap with Soroban's **invoker authorization**
behavior: when contract A calls contract B during the same transaction, and B
calls `some_address.require_auth()` where `some_address` is exactly A's
contract address, that authorization succeeds automatically — but *only* if A
is genuinely the contract that directly invoked B in that call. There's no
signature to fake here: the runtime itself tracks the live call stack.

So `award_point(caller: Address, voter: Address)`:
1. Checks `caller == authorized_caller` (the address stored at `initialize`)
2. Calls `caller.require_auth()` — which only passes if `caller` really is the
   contract that just invoked this function

Both checks are needed: (1) alone can be spoofed as described above; (2) alone
would authorize *any* contract to award points, not just the registered one.
Together, only the specific, registered `poll_contract` deployment can award
points.

## Data flow of a single vote, end to end

1. User clicks an option in the frontend. The frontend builds an unsigned
   `vote(voter, option_index)` transaction against `poll_contract` and asks
   the connected wallet (via StellarWalletsKit) to sign it.
2. The signed transaction is submitted to Soroban RPC.
3. Inside `poll_contract.vote`:
   - `voter.require_auth()` checks the transaction was actually signed by that
     account.
   - The vote is validated (option exists, address hasn't voted before) and
     recorded in contract storage.
   - A `vote` event is emitted.
   - If a rewards contract has been wired up (`set_rewards_contract` was
     called), `poll_contract` makes a synchronous cross-contract call into
     `rewards_contract.award_point`, passing its own contract address as
     `caller` and the voter's address.
   - Inside `rewards_contract.award_point`, the authorization check above
     runs, the voter's score increments, and a `scored` event is emitted.
   - Control returns to `poll_contract`, which emits its own `reputation_awarded`
     event.
4. The frontend polls `get_results` and `get_voter_reputation` (a read-only
   proxy call that itself cross-contract-calls into `rewards_contract`) to
   reflect the new state without a page refresh.

## Failure isolation

A vote should not fail just because reputation bookkeeping has an issue. The
contract only attempts the cross-contract call if a rewards contract has
actually been registered (`set_rewards_contract`), so a poll can be deployed
and voted on before rewards are wired up at all. If the rewards contract *is*
registered but its call fails for some other reason (e.g. it was
misconfigured with the wrong authorized caller), that failure currently
propagates and reverts the whole transaction — which is intentional here,
since a reward that's silently dropped would be confusing. The frontend
surfaces this distinction: a plain vote failure vs. a vote that succeeded but
whose reputation refresh failed to load client-side afterward (a much more
common and lower-stakes case, handled by keeping the "success" state and
just noting the refresh hiccup rather than flipping to an error).

## Frontend architecture

- `lib/contractConfig.ts` — environment-driven config (contract IDs, RPC URLs)
- `lib/soroban.ts` — all Horizon/Soroban RPC interaction: building, simulating,
  signing-adjacent prep, and submitting transactions; read-only calls for both
  contracts
- `hooks/useWallet.ts` — StellarWalletsKit connection state and error
  classification into the three required error categories
- `hooks/usePollContract.ts` — poll reads, interval-based live sync, and the
  vote transaction lifecycle (building → signing → submitting → success/error)
- `hooks/usePollEvents.ts` — polls Soroban's event stream for a live activity
  feed, independent of the results polling above
- `components/` — presentational components, each independently unit-tested
