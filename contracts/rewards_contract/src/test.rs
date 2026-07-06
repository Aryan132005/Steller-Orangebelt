#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;

fn setup(env: &Env) -> (RewardsContractClient<'_>, Address) {
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(env, &contract_id);
    let authorized = Address::generate(env);
    client.initialize(&authorized);
    (client, authorized)
}

#[test]
fn test_initialize_sets_zero_score_for_new_voter() {
    let env = Env::default();
    let (client, _authorized) = setup(&env);
    let voter = Address::generate(&env);
    assert_eq!(client.get_score(&voter), 0);
}

#[test]
fn test_double_initialize_panics() {
    let env = Env::default();
    let (_client, authorized) = setup(&env);
    let contract_id = env.register_contract(None, RewardsContract);
    let client2 = RewardsContractClient::new(&env, &contract_id);
    client2.initialize(&authorized);
    let result = client2.try_initialize(&authorized); // second call on the same instance returns an Err
    assert!(result.is_err() || result.unwrap().is_err());
}

#[test]
fn test_authorized_caller_awards_point() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, authorized) = setup(&env);
    let voter = Address::generate(&env);

    let score = client.award_point(&authorized, &voter);
    assert_eq!(score, 1);
    assert_eq!(client.get_score(&voter), 1);
}

#[test]
fn test_repeated_awards_accumulate() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, authorized) = setup(&env);
    let voter = Address::generate(&env);

    client.award_point(&authorized, &voter);
    client.award_point(&authorized, &voter);
    let score = client.award_point(&authorized, &voter);

    assert_eq!(score, 3);
}

#[test]
fn test_unauthorized_caller_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _authorized) = setup(&env);
    let voter = Address::generate(&env);
    let impostor = Address::generate(&env);

    let result = client.try_award_point(&impostor, &voter);
    assert!(result.is_err() || result.unwrap().is_err());
}

#[test]
fn test_scores_are_independent_per_voter() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, authorized) = setup(&env);
    let voter_a = Address::generate(&env);
    let voter_b = Address::generate(&env);

    client.award_point(&authorized, &voter_a);
    client.award_point(&authorized, &voter_a);
    client.award_point(&authorized, &voter_b);

    assert_eq!(client.get_score(&voter_a), 2);
    assert_eq!(client.get_score(&voter_b), 1);
}
