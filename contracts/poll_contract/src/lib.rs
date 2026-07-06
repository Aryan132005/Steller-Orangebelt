#![no_std]
use soroban_sdk::{
    contract, contractimpl, symbol_short, vec, Address, Env, IntoVal, Map, String,
    Symbol, Val, Vec,
};

// ---------- Storage keys ----------

const QUESTION: Symbol = symbol_short!("QUESTION");
const OPTIONS: Symbol = symbol_short!("OPTIONS");
const VOTES: Symbol = symbol_short!("VOTES");
const VOTERS: Symbol = symbol_short!("VOTERS");
const INIT: Symbol = symbol_short!("INIT");
const ADMIN: Symbol = symbol_short!("ADMIN");
const REWARDS: Symbol = symbol_short!("REWARDS");

#[soroban_sdk::contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PollError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidOption = 3,
    AlreadyVoted = 4,
    RewardsAlreadySet = 5,
    NotAdmin = 6,
}

#[contract]
pub struct PollContract;

#[contractimpl]
impl PollContract {
    /// Set up the poll once. `admin` is the address allowed to later call
    /// `set_rewards_contract`.
    pub fn initialize(env: Env, admin: Address, question: String, options: Vec<String>) -> Result<(), PollError> {
        if env.storage().instance().has(&INIT) {
            return Err(PollError::AlreadyInitialized);
        }

        let mut votes: Map<u32, u64> = Map::new(&env);
        for i in 0..options.len() {
            votes.set(i, 0u64);
        }

        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&QUESTION, &question);
        env.storage().instance().set(&OPTIONS, &options);
        env.storage().instance().set(&VOTES, &votes);
        env.storage()
            .instance()
            .set(&VOTERS, &Vec::<Address>::new(&env));
        env.storage().instance().set(&INIT, &true);
        env.storage().instance().extend_ttl(200_000, 200_000);
        Ok(())
    }

    /// One-time wiring: register the deployed rewards_contract's address.
    /// Only the poll's admin can call this, and only once.
    pub fn set_rewards_contract(env: Env, admin: Address, rewards_contract: Address) -> Result<(), PollError> {
        admin.require_auth();

        let stored_admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if admin != stored_admin {
            return Err(PollError::NotAdmin);
        }
        if env.storage().instance().has(&REWARDS) {
            return Err(PollError::RewardsAlreadySet);
        }

        env.storage().instance().set(&REWARDS, &rewards_contract);
        Ok(())
    }

    /// Cast a vote for `option_index`. Requires the voter's signature and
    /// rejects a second vote from the same address. After recording the
    /// vote, this makes a cross-contract call into the rewards contract
    /// (if one has been registered) to award the voter one reputation point.
    pub fn vote(env: Env, voter: Address, option_index: u32) -> Result<(), PollError> {
        voter.require_auth();

        if !env.storage().instance().has(&INIT) {
            return Err(PollError::NotInitialized);
        }

        let options: Vec<String> = env.storage().instance().get(&OPTIONS).unwrap();
        if option_index >= options.len() {
            return Err(PollError::InvalidOption);
        }

        let mut voters: Vec<Address> = env.storage().instance().get(&VOTERS).unwrap();
        if voters.iter().any(|v| v == voter) {
            return Err(PollError::AlreadyVoted);
        }

        let mut votes: Map<u32, u64> = env.storage().instance().get(&VOTES).unwrap();
        let current = votes.get(option_index).unwrap_or(0);
        let new_count = current + 1;
        votes.set(option_index, new_count);

        voters.push_back(voter.clone());

        env.storage().instance().set(&VOTES, &votes);
        env.storage().instance().set(&VOTERS, &voters);
        env.storage().instance().extend_ttl(200_000, 200_000);

        env.events()
            .publish((symbol_short!("vote"), voter.clone()), (option_index, new_count));

        // --- Inter-contract call: award a reputation point, if wired up. ---
        // A missing rewards contract is tolerated (the vote itself must still
        // succeed even if reputation isn't configured yet); a *failing* call
        // to an already-registered rewards contract is allowed to propagate,
        // since at that point something is genuinely wrong and the caller
        // should know their reputation wasn't recorded.
        if env.storage().instance().has(&REWARDS) {
            let rewards_id: Address = env.storage().instance().get(&REWARDS).unwrap();
            let args: Vec<Val> = vec![
                &env,
                env.current_contract_address().into_val(&env),
                voter.clone().into_val(&env),
            ];
            let new_score: u32 =
                env.invoke_contract(&rewards_id, &Symbol::new(&env, "award_point"), args);

            env.events()
                .publish((symbol_short!("scored"), voter), new_score);
        }
        Ok(())
    }

    /// Read-only: the poll question.
    pub fn get_question(env: Env) -> String {
        env.storage()
            .instance()
            .get(&QUESTION)
            .unwrap_or_else(|| String::from_str(&env, ""))
    }

    /// Read-only: each option paired with its current vote count, in order.
    pub fn get_results(env: Env) -> Vec<(String, u64)> {
        let options: Vec<String> = env
            .storage()
            .instance()
            .get(&OPTIONS)
            .unwrap_or_else(|| Vec::new(&env));
        let votes: Map<u32, u64> = env
            .storage()
            .instance()
            .get(&VOTES)
            .unwrap_or_else(|| Map::new(&env));

        let mut results: Vec<(String, u64)> = Vec::new(&env);
        for i in 0..options.len() {
            let label = options.get(i).unwrap();
            let count = votes.get(i).unwrap_or(0);
            results.push_back((label, count));
        }
        results
    }

    /// Read-only: has this address already voted?
    pub fn has_voted(env: Env, voter: Address) -> bool {
        let voters: Vec<Address> = env
            .storage()
            .instance()
            .get(&VOTERS)
            .unwrap_or_else(|| Vec::new(&env));
        voters.iter().any(|v| v == voter)
    }

    /// Read-only cross-contract call: fetch a voter's reputation score
    /// directly from the rewards contract. Returns 0 if no rewards contract
    /// has been wired up yet.
    pub fn get_voter_reputation(env: Env, voter: Address) -> u32 {
        if !env.storage().instance().has(&REWARDS) {
            return 0;
        }
        let rewards_id: Address = env.storage().instance().get(&REWARDS).unwrap();
        let args: Vec<Val> = vec![&env, voter.into_val(&env)];
        env.invoke_contract(&rewards_id, &Symbol::new(&env, "get_score"), args)
    }
}

mod test;
