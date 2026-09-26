use soroban_sdk::{token::Client as TokenClient, Address, Env};

/// Token operation errors
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TokenError {
    InsufficientBalance,
    TransferFailed,
    #[allow(dead_code)]
    UnauthorizedTransfer,
    #[allow(dead_code)]
    InvalidTokenAddress,
}

/// XLM token helper functions for the CreatorEventManager contract
pub struct TokenHelper;

#[allow(dead_code)]
impl TokenHelper {
    /// Create a new token client for the given token address
    pub fn new_client<'a>(env: &'a Env, token_address: &'a Address) -> TokenClient<'a> {
        TokenClient::new(env, token_address)
    }

    /// Get the balance of an address for a specific token
    pub fn get_balance(env: &Env, token_address: &Address, address: &Address) -> i128 {
        let client = Self::new_client(env, token_address);
        client.balance(address)
    }

    /// Transfer tokens from one address to another
    /// This requires the 'from' address to have authorized the contract
    pub fn transfer_from(
        env: &Env,
        token_address: &Address,
        from: &Address,
        to: &Address,
        amount: i128,
    ) -> Result<(), TokenError> {
        if amount <= 0 {
            return Err(TokenError::TransferFailed);
        }

        let client = Self::new_client(env, token_address);

        // Check if the sender has sufficient balance
        let balance = client.balance(from);
        if balance < amount {
            return Err(TokenError::InsufficientBalance);
        }

        // Attempt the transfer
        // Note: This will panic if authorization is not properly set up
        // The calling contract must ensure proper authorization
        client.transfer_from(&env.current_contract_address(), from, to, &amount);

        Ok(())
    }

    /// Transfer tokens from the contract to another address
    /// This is used for withdrawals and payouts
    pub fn transfer(
        env: &Env,
        token_address: &Address,
        to: &Address,
        amount: i128,
    ) -> Result<(), TokenError> {
        if amount <= 0 {
            return Err(TokenError::TransferFailed);
        }

        let client = Self::new_client(env, token_address);
        let contract_address = env.current_contract_address();

        // Check if the contract has sufficient balance
        let balance = client.balance(&contract_address);
        if balance < amount {
            return Err(TokenError::InsufficientBalance);
        }

        // Perform the transfer
        client.transfer(&contract_address, to, &amount);

        Ok(())
    }

    /// Collect entry fee from a user to the contract
    /// This is used when users place predictions
    pub fn collect_entry_fee(
        env: &Env,
        token_address: &Address,
        from: &Address,
        amount: i128,
    ) -> Result<(), TokenError> {
        let contract_address = env.current_contract_address();
        Self::transfer_from(env, token_address, from, &contract_address, amount)
    }

    /// Distribute winnings to a user from the contract
    /// This is used for payout distribution
    pub fn distribute_winnings(
        env: &Env,
        token_address: &Address,
        to: &Address,
        amount: i128,
    ) -> Result<(), TokenError> {
        Self::transfer(env, token_address, to, amount)
    }

    /// Get the contract's token balance
    pub fn get_contract_balance(env: &Env, token_address: &Address) -> i128 {
        let contract_address = env.current_contract_address();
        Self::get_balance(env, token_address, &contract_address)
    }

    /// Check if an address has sufficient balance for a transaction
    pub fn has_sufficient_balance(
        env: &Env,
        token_address: &Address,
        address: &Address,
        required_amount: i128,
    ) -> bool {
        let balance = Self::get_balance(env, token_address, address);
        balance >= required_amount
    }

    /// Calculate total pool amount for an event
    /// This sums up all stakes for all options in an event
    pub fn calculate_total_pool(option_stakes: &soroban_sdk::Vec<i128>) -> i128 {
        let mut total = 0i128;
        for i in 0..option_stakes.len() {
            total += option_stakes.get(i).unwrap_or(0);
        }
        total
    }

    /// Calculate winnings for a user based on their stake and the total pool
    /// Uses a simple proportional distribution model
    ///
    /// Rounding dust: each winner's payout is floored via integer division
    /// (`(user_stake * distributable_pool) / winning_option_total`). Because
    /// every payout is rounded down, the sum of all winners' payouts is always
    /// less than or equal to `distributable_pool` (and therefore never exceeds
    /// `total_pool`). Any leftover dust remains in the contract and is not
    /// allocated to any individual winner.
    pub fn calculate_winnings(
        user_stake: i128,
        winning_option_total: i128,
        total_pool: i128,
        house_fee_percentage: u32, // e.g., 5 for 5%
    ) -> i128 {
        if winning_option_total == 0 || total_pool == 0 {
            return 0;
        }

        // Calculate house fee
        let house_fee = (total_pool * house_fee_percentage as i128) / 100;
        let distributable_pool = total_pool - house_fee;

        // Calculate proportional winnings (floored; dust stays in the contract)
        (user_stake * distributable_pool) / winning_option_total
    }

    /// Validate token address (basic validation)
    pub fn validate_token_address(_token_address: &Address) -> Result<(), TokenError> {
        // In a real implementation, you might want to check if the address
        // corresponds to a valid token contract
        // For now, we just check that it's not empty/invalid
        // This is a placeholder for more sophisticated validation
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_winnings() {
        // Test case: User staked 100, winning option had 500 total, total pool was 1000, 5% house fee
        let user_stake = 100;
        let winning_option_total = 500;
        let total_pool = 1000;
        let house_fee_percentage = 5;

        let winnings = TokenHelper::calculate_winnings(
            user_stake,
            winning_option_total,
            total_pool,
            house_fee_percentage,
        );

        // Expected: (100 * (1000 - 50)) / 500 = 190
        assert_eq!(winnings, 190);
    }

    #[test]
    fn test_calculate_winnings_zero_pool() {
        let winnings = TokenHelper::calculate_winnings(100, 0, 1000, 5);
        assert_eq!(winnings, 0);

        let winnings = TokenHelper::calculate_winnings(100, 500, 0, 5);
        assert_eq!(winnings, 0);
    }

    #[test]
    fn test_calculate_total_pool() {
        use soroban_sdk::{Env, Vec};

        let env = Env::default();
        let mut stakes = Vec::new(&env);
        stakes.push_back(100i128);
        stakes.push_back(200i128);
        stakes.push_back(300i128);
        stakes.push_back(150i128);

        let total = TokenHelper::calculate_total_pool(&stakes);
        assert_eq!(total, 750);
    }

    #[test]
    fn test_calculate_total_pool_matches_sum_of_stakes() {
        use soroban_sdk::{Env, Vec};

        let env = Env::default();
        let mut stakes = Vec::new(&env);
        stakes.push_back(7i128);
        stakes.push_back(13i128);
        stakes.push_back(29i128);

        let total = TokenHelper::calculate_total_pool(&stakes);
        assert_eq!(total, 7 + 13 + 29);
    }

    #[test]
    fn test_winnings_sum_never_exceeds_total_pool_three_winners() {
        // Pool of 100 does not divide evenly across 3 winners (100 / 3 = 33.33).
        // Each winner staked 100 on the winning option (winning_option_total = 300).
        let total_pool = 100i128;
        let winning_option_total = 300i128;
        let house_fee_percentage = 0u32;

        let w1 = TokenHelper::calculate_winnings(100, winning_option_total, total_pool, house_fee_percentage);
        let w2 = TokenHelper::calculate_winnings(100, winning_option_total, total_pool, house_fee_percentage);
        let w3 = TokenHelper::calculate_winnings(100, winning_option_total, total_pool, house_fee_percentage);

        let sum = w1 + w2 + w3;
        assert!(sum <= total_pool, "sum of winnings must not exceed total pool");
        // Dust (1 unit) is retained in the contract, not paid out.
        assert_eq!(sum, 99);
    }

    #[test]
    fn test_single_winner_receives_entire_pool() {
        // A single winner staking the whole winning option receives the full
        // distributable pool with no dust loss.
        let total_pool = 1000i128;
        let winning_option_total = 1000i128;
        let house_fee_percentage = 0u32;

        let winnings = TokenHelper::calculate_winnings(
            1000,
            winning_option_total,
            total_pool,
            house_fee_percentage,
        );

        assert_eq!(winnings, total_pool);
    }
}
