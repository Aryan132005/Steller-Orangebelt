#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, Map, Symbol};

const AUTH_CALLER: Symbol = symbol_short!("AUTH_CLR");
const SCORES: Symbol = symbol_short!("SCORES");
const INIT: Symbol = symbol_short!("INIT");

#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
}

#[contract]
pub struct RewardsContract;

#[contractimpl]
impl RewardsContract {
    /// One-time setup: register which contract address is allowed to award
    /// points. In this app that's the deployed poll_contract's address.
    pub fn initialize(env: Env, authorized_caller: Address) -> Result<(), Error> {
        if env.storage().instance().has(&INIT) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&AUTH_CALLER, &authorized_caller);
        env.storage()
            .instance()
            .set(&SCORES, &Map::<Address, u32>::new(&env));
        env.storage().instance().set(&INIT, &true);
        env.storage().instance().extend_ttl(200_000, 200_000);
        Ok(())
    }

    /// Award one reputation point to `voter`. `caller` must be the exact
    /// contract address registered in `initialize`, AND that same address
    /// must be the direct invoker of this call in the current transaction —
    /// `require_auth` on a contract address succeeds automatically only when
    /// that contract is genuinely the one that invoked us (Soroban's
    /// "invoker" authorization), so a third party can't just pass in the
    /// poll contract's address to fake this call.
    pub fn award_point(env: Env, caller: Address, voter: Address) -> Result<u32, Error> {
        if !env.storage().instance().has(&INIT) {
            return Err(Error::NotInitialized);
        }

        let authorized: Address = env.storage().instance().get(&AUTH_CALLER).unwrap();
        if caller != authorized {
            return Err(Error::Unauthorized);
        }
        caller.require_auth();

        let mut scores: Map<Address, u32> = env.storage().instance().get(&SCORES).unwrap();
        let new_score = scores.get(voter.clone()).unwrap_or(0) + 1;
        scores.set(voter.clone(), new_score);
        env.storage().instance().set(&SCORES, &scores);
        env.storage().instance().extend_ttl(200_000, 200_000);

        env.events()
            .publish((symbol_short!("scored"), voter), new_score);

        Ok(new_score)
    }

    /// Read-only: current reputation score for an address (0 if never awarded).
    pub fn get_score(env: Env, voter: Address) -> u32 {
        if !env.storage().instance().has(&INIT) {
            return 0;
        }
        let scores: Map<Address, u32> = env
            .storage()
            .instance()
            .get(&SCORES)
            .unwrap_or_else(|| Map::new(&env));
        scores.get(voter).unwrap_or(0)
    }
}

mod test;
