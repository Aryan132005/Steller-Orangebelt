#![cfg(test)]

use super::*;
use rewards_contract::{RewardsContract, RewardsContractClient};
use soroban_sdk::{testutils::Address as _, vec, Env};

fn setup(env: &Env) -> (PollContractClient<'_>, Address, Vec<String>) {
    let contract_id = env.register_contract(None, PollContract);
    let client = PollContractClient::new(env, &contract_id);
    let admin = Address::generate(env);

    let options = vec![
        env,
        String::from_str(env, "Rust"),
        String::from_str(env, "TypeScript"),
        String::from_str(env, "Both"),
    ];
    let question = String::from_str(env, "Favorite language for Soroban dev?");

    client.initialize(&admin, &question, &options);
    (client, admin, options)
}

// ---------- Unit tests (poll behavior on its own) ----------

#[test]
fn test_initialize_sets_question_and_zeroed_results() {
    let env = Env::default();
    let (client, _admin, options) = setup(&env);

    assert_eq!(
        client.get_question(),
        String::from_str(&env, "Favorite language for Soroban dev?")
    );

    let results = client.get_results();
    assert_eq!(results.len(), options.len());
    for i in 0..results.len() {
        let (_, count) = results.get(i).unwrap();
        assert_eq!(count, 0);
    }
}

#[test]
fn test_double_initialize_panics() {
    let env = Env::default();
    let (client, admin, options) = setup(&env);
    let result = client.try_initialize(&admin, &client.get_question(), &options);
    assert!(result.is_err() || result.unwrap().is_err());
}

#[test]
fn test_successful_vote_increments_count_and_marks_voter() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _options) = setup(&env);

    let voter = Address::generate(&env);
    client.vote(&voter, &1u32);

    let results = client.get_results();
    let (_, count) = results.get(1).unwrap();
    assert_eq!(count, 1);
    assert!(client.has_voted(&voter));
}

#[test]
fn test_double_vote_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _options) = setup(&env);

    let voter = Address::generate(&env);
    client.vote(&voter, &0u32);
    let result = client.try_vote(&voter, &2u32);
    assert!(result.is_err() || result.unwrap().is_err());
}

#[test]
fn test_invalid_option_index_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _options) = setup(&env);

    let voter = Address::generate(&env);
    let result = client.try_vote(&voter, &99u32);
    assert!(result.is_err() || result.unwrap().is_err());
}

#[test]
fn test_multiple_voters_tally_independently() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _options) = setup(&env);

    let voter_a = Address::generate(&env);
    let voter_b = Address::generate(&env);
    let voter_c = Address::generate(&env);

    client.vote(&voter_a, &0u32);
    client.vote(&voter_b, &0u32);
    client.vote(&voter_c, &2u32);

    let results = client.get_results();
    let (_, count_0) = results.get(0).unwrap();
    let (_, count_2) = results.get(2).unwrap();
    assert_eq!(count_0, 2);
    assert_eq!(count_2, 1);
}

#[test]
fn test_voting_without_rewards_wired_up_still_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _options) = setup(&env);

    let voter = Address::generate(&env);
    client.vote(&voter, &0u32);

    assert!(client.has_voted(&voter));
    assert_eq!(client.get_voter_reputation(&voter), 0);
}

#[test]
fn test_only_admin_can_set_rewards_contract() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _options) = setup(&env);

    let not_admin = Address::generate(&env);
    let fake_rewards = Address::generate(&env);
    let result = client.try_set_rewards_contract(&not_admin, &fake_rewards);
    assert!(result.is_err() || result.unwrap().is_err());
}

// ---------- Integration test: poll_contract <-> rewards_contract ----------

#[test]
fn test_vote_awards_reputation_via_cross_contract_call() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy the poll contract.
    let poll_id = env.register_contract(None, PollContract);
    let poll_client = PollContractClient::new(&env, &poll_id);
    let admin = Address::generate(&env);
    let options = vec![
        &env,
        String::from_str(&env, "Yes"),
        String::from_str(&env, "No"),
    ];
    poll_client.initialize(&admin, &String::from_str(&env, "Ship it?"), &options);

    // Deploy the rewards contract, authorizing the poll contract to call it.
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards_client = RewardsContractClient::new(&env, &rewards_id);
    rewards_client.initialize(&poll_id);

    // Wire the poll contract to the rewards contract.
    poll_client.set_rewards_contract(&admin, &rewards_id);

    // Cast a vote — this should trigger poll_contract to call
    // rewards_contract.award_point internally.
    let voter = Address::generate(&env);
    poll_client.vote(&voter, &0u32);

    // Assert the vote landed...
    assert!(poll_client.has_voted(&voter));
    let results = poll_client.get_results();
    let (_, count) = results.get(0).unwrap();
    assert_eq!(count, 1);

    // ...AND that the cross-contract call actually awarded reputation,
    // verifiable both directly against the rewards contract and via the
    // poll contract's own read-only proxy call.
    assert_eq!(rewards_client.get_score(&voter), 1);
    assert_eq!(poll_client.get_voter_reputation(&voter), 1);
}

#[test]
fn test_reputation_accumulates_across_multiple_voters() {
    let env = Env::default();
    env.mock_all_auths();

    let poll_id = env.register_contract(None, PollContract);
    let poll_client = PollContractClient::new(&env, &poll_id);
    let admin = Address::generate(&env);
    let options = vec![&env, String::from_str(&env, "A"), String::from_str(&env, "B")];
    poll_client.initialize(&admin, &String::from_str(&env, "A or B?"), &options);

    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards_client = RewardsContractClient::new(&env, &rewards_id);
    rewards_client.initialize(&poll_id);
    poll_client.set_rewards_contract(&admin, &rewards_id);

    let voter_1 = Address::generate(&env);
    let voter_2 = Address::generate(&env);

    poll_client.vote(&voter_1, &0u32);
    poll_client.vote(&voter_2, &1u32);

    assert_eq!(rewards_client.get_score(&voter_1), 1);
    assert_eq!(rewards_client.get_score(&voter_2), 1);
}
