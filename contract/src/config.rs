use soroban_sdk::{contracttype, Address, Env, Symbol, Vec};

use crate::errors::InsightArenaError;
use crate::storage_types::DataKey;
use crate::ttl;

// ── TTL constants ─────────────────────────────────────────────────────────────
// Assuming ~5 s per ledger:
//   PERSISTENT_BUMP      ≈ 30 days  (518 400 ledgers)
//   PERSISTENT_THRESHOLD ≈ 29 days  — only bump when remaining TTL falls below this
pub const PERSISTENT_BUMP: u32 = 518_400;
pub const PERSISTENT_THRESHOLD: u32 = 501_120; // PERSISTENT_BUMP − 1 day

// ── Config struct ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    /// Platform administrator; the only address allowed to call mutators.
    pub admin: Address,
    /// Platform cut in basis points (e.g. 200 = 2 %).
    pub protocol_fee_bps: u32,
    /// Hard cap on the fee a market creator may charge, in basis points.
    pub max_creator_fee_bps: u32,
    /// Minimum XLM stake required to participate in a market, in stroops.
    pub min_stake_xlm: i128,
    /// Trusted oracle contract address used for market resolution.
    pub oracle_address: Address,
    /// Address of the XLM Stellar Asset Contract used for escrow transfers.
    pub xlm_token: Address,
    /// When `true`, all non-admin entry points must revert with `Paused`.
    pub is_paused: bool,
    /// Multi-sig admin addresses. Empty vector means single-admin mode.
    pub multisig_admins: Vec<Address>,
    /// Number of signatures required to authorize admin operations. 0 means single-admin mode.
    pub multisig_threshold: u32,
}

// ── Private helpers ───────────────────────────────────────────────────────────

/// Extend the persistent TTL for the Config entry whenever it drops below
/// `PERSISTENT_THRESHOLD`. Must be called on every read *and* every write.
fn bump_config(env: &Env) {
    ttl::extend_config_ttl(env);
}

/// Load Config from persistent storage.
/// Returns `NotInitialized` if the key is absent rather than panicking.
fn load_config(env: &Env) -> Result<Config, InsightArenaError> {
    env.storage()
        .persistent()
        .get(&DataKey::Config)
        .ok_or(InsightArenaError::NotInitialized)
}

/// Validate and authorize a multi-sig operation.
///
/// # Validation checks:
/// - If `multisig_threshold <= 1`: uses single-admin mode (caller must be `config.admin`)
/// - If `multisig_threshold > 1`: validates that:
///   - `multisig_threshold` is not 0 (caught by second check)
///   - Each signer in the provided `signers` vec is a member of `multisig_admins`
///   - The number of valid signers >= `multisig_threshold`
///   - Each signer provides valid cryptographic authorization via `require_auth()`
///
/// # Arguments:
/// - `env`: Soroban environment context
/// - `config`: The current global configuration
/// - `signers`: Vector of addresses claiming to authorize the operation
///
/// # Errors:
/// - `InvalidInput`: if `multisig_threshold` is 0
/// - `Unauthorized`: if fewer valid signers than required, or if in single-admin mode
///   and the caller is not `config.admin`
/// - `InvalidSignature`: if `require_auth()` fails for any signer
fn require_multisig_auth(
    env: &Env,
    config: &Config,
    signers: Vec<Address>,
) -> Result<(), InsightArenaError> {
    // Single-admin mode: multisig_threshold <= 1 or empty multisig_admins
    if config.multisig_threshold <= 1 || config.multisig_admins.is_empty() {
        config.admin.require_auth();
        return Ok(());
    }

    // Multi-sig mode: multisig_threshold must be > 1
    // Validate threshold is not 0 (a misconfiguration)
    if config.multisig_threshold == 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    // Count valid signers: must be in multisig_admins and provide valid auth
    let mut valid_signers: u32 = 0;
    for i in 0..signers.len() {
        let signer = signers.get(i).unwrap();
        
        // Check if signer is in multisig_admins
        let is_admin = (0..config.multisig_admins.len())
            .any(|j| config.multisig_admins.get(j).unwrap() == signer);
        
        if is_admin {
            // Require cryptographic authorization from this signer
            signer.require_auth();
            valid_signers += 1;
        }
    }

    // Threshold must be met
    if valid_signers >= config.multisig_threshold {
        Ok(())
    } else {
        Err(InsightArenaError::Unauthorized)
    }
}

// ── Entry-point logic (called from contractimpl in lib.rs) ────────────────────

/// One-time contract setup.
///
/// Stores the initial [`Config`] and returns `AlreadyInitialized` on any
/// subsequent call, providing an idempotency guard.
///
/// # Arguments:
/// - `multisig_admins`: Vector of admin addresses for multi-sig authorization.
///   Empty vector means single-admin mode (only `admin` can authorize).
/// - `multisig_threshold`: Number of signatures required for multi-sig operations.
///   - 0 or 1: Single-admin mode (only `admin` can authorize)
///   - > 1: Multi-sig mode (all signatures must come from `multisig_admins`)
pub fn initialize(
    env: &Env,
    admin: Address,
    oracle: Address,
    fee_bps: u32,
    xlm_token: Address,
    multisig_admins: Vec<Address>,
    multisig_threshold: u32,
) -> Result<(), InsightArenaError> {
    if env.storage().persistent().has(&DataKey::Config) {
        return Err(InsightArenaError::AlreadyInitialized);
    }

    // Validate that multisig_threshold is not 0 (0 is invalid unless multisig_admins is empty)
    if multisig_threshold == 0 && !multisig_admins.is_empty() {
        return Err(InsightArenaError::InvalidInput);
    }

    let config = Config {
        admin,
        protocol_fee_bps: fee_bps,
        max_creator_fee_bps: 500,  // 5 % absolute cap for market creators
        min_stake_xlm: 10_000_000, // 1 XLM expressed in stroops
        oracle_address: oracle,
        xlm_token,
        is_paused: false,
        multisig_admins,
        multisig_threshold,
    };

    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);
    env.storage()
        .instance()
        .set(&DataKey::Categories, &default_categories(env));
    env.storage()
        .instance()
        .extend_ttl(PERSISTENT_THRESHOLD, PERSISTENT_BUMP);

    Ok(())
}

pub(crate) fn default_categories(env: &Env) -> Vec<Symbol> {
    let mut categories = Vec::new(env);
    categories.push_back(Symbol::new(env, "Sports"));
    categories.push_back(Symbol::new(env, "Crypto"));
    categories.push_back(Symbol::new(env, "Politics"));
    categories.push_back(Symbol::new(env, "Entertainment"));
    categories.push_back(Symbol::new(env, "Science"));
    categories.push_back(Symbol::new(env, "Other"));
    categories
}

/// Return the current global [`Config`] and extend its TTL.
pub fn get_config(env: &Env) -> Result<Config, InsightArenaError> {
    let config = load_config(env)?;
    bump_config(env);
    Ok(config)
}

/// Return the current global [`Config`] without mutating storage.
///
/// This helper is intended for strict view functions that must avoid any state
/// writes, including TTL extension side-effects.
pub fn get_config_readonly(env: &Env) -> Result<Config, InsightArenaError> {
    load_config(env)
}

/// Update the protocol fee rate. Caller must be the stored admin.
pub fn update_protocol_fee(env: &Env, new_fee_bps: u32) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;

    // Authorisation check — reverts the entire transaction if auth is absent.
    config.admin.require_auth();

    config.protocol_fee_bps = new_fee_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    Ok(())
}

/// Pause or resume the contract. Caller must be the stored admin or authorized
/// signers in a multi-sig configuration.
///
/// When `paused` is `true`, all non-admin entry points should call
/// [`ensure_not_paused`] and revert with [`InsightArenaError::Paused`].
///
/// # Multi-sig behavior:
/// - If `multisig_threshold <= 1` or `multisig_admins` is empty: requires `admin.require_auth()`
/// - If `multisig_threshold > 1`: requires valid signatures from `signers` meeting the threshold
pub fn set_paused(env: &Env, paused: bool, signers: Vec<Address>) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;

    require_multisig_auth(env, &config, signers)?;

    config.is_paused = paused;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    Ok(())
}

/// Atomically replace the admin address. Caller must be the current admin or
/// authorized signers in a multi-sig configuration.
///
/// After this call the old admin address loses all privileges immediately.
///
/// # Multi-sig behavior:
/// - If `multisig_threshold <= 1` or `multisig_admins` is empty: requires `admin.require_auth()`
/// - If `multisig_threshold > 1`: requires valid signatures from `signers` meeting the threshold
pub fn transfer_admin(env: &Env, new_admin: Address, signers: Vec<Address>) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;

    // Auth against the *current* admin before overwriting.
    require_multisig_auth(env, &config, signers)?;

    config.admin = new_admin;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    Ok(())
}

/// Update the trusted oracle address. Caller must be the stored admin or
/// authorized signers in a multi-sig configuration.
///
/// # Multi-sig behavior:
/// - If `multisig_threshold <= 1` or `multisig_admins` is empty: requires `admin.require_auth()`
/// - If `multisig_threshold > 1`: requires valid signatures from `signers` meeting the threshold
pub fn update_oracle(env: &Env, new_oracle: Address, signers: Vec<Address>) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;

    require_multisig_auth(env, &config, signers)?;

    config.oracle_address = new_oracle;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    Ok(())
}

/// Guard used at the top of every user-facing entry point.
///
/// Visibility is `pub(crate)` — this function is intentionally **not** part of
/// the public contract ABI; it is an internal safety check only.
///
/// Behaviour:
/// - Returns `Err(NotInitialized)` if the contract has not been set up yet.
/// - Returns `Err(Paused)` while `config.is_paused == true`.
/// - Returns `Ok(())` otherwise, extending the Config TTL as a side-effect.
pub(crate) fn ensure_not_paused(env: &Env) -> Result<(), InsightArenaError> {
    let config = load_config(env)?;
    bump_config(env);
    if config.is_paused {
        return Err(InsightArenaError::Paused);
    }
    Ok(())
}

#[cfg(test)]
mod config_tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{symbol_short, Address, Env, Vec};

    use crate::storage_types::DataKey;
    use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

    fn deploy_with_single_admin(env: &Env) -> (InsightArenaContractClient<'_>, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = Address::generate(env);

        // Deploy in single-admin mode (no multisig)
        client.initialize(
            &admin,
            &oracle,
            &200_u32,
            &xlm_token,
            &Vec::new(env),           // empty multisig_admins
            &0_u32,                   // multisig_threshold = 0
        );

        (client, admin)
    }

    fn deploy_with_multisig(
        env: &Env,
        threshold: u32,
    ) -> (InsightArenaContractClient<'_>, Vec<Address>, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = Address::generate(env);

        let mut multisig_admins = Vec::new(env);
        for _ in 0..3 {
            multisig_admins.push_back(Address::generate(env));
        }

        client.initialize(
            &admin,
            &oracle,
            &200_u32,
            &xlm_token,
            &multisig_admins,
            &threshold,
        );

        (client, multisig_admins, admin)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SINGLE-ADMIN TESTS (backward compatibility)
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_single_admin_set_paused() {
        let env = Env::default();
        let (client, admin) = deploy_with_single_admin(&env);

        // Admin can pause with single-admin mode
        let signers = Vec::new(&env);
        assert!(client
            .try_invoke_contract_check_auth(&admin, &symbol_short!("set_paused"), (true, &signers))
            .is_ok());
    }

    #[test]
    fn test_single_admin_transfer_admin() {
        let env = Env::default();
        let (client, admin) = deploy_with_single_admin(&env);

        let new_admin = Address::generate(&env);
        let signers = Vec::new(&env);

        // Admin can transfer
        assert!(client
            .try_invoke_contract_check_auth(&admin, &symbol_short!("transfer_admin"), (&new_admin, &signers))
            .is_ok());
    }

    #[test]
    fn test_single_admin_update_oracle() {
        let env = Env::default();
        let (client, admin) = deploy_with_single_admin(&env);

        let new_oracle = Address::generate(&env);
        let signers = Vec::new(&env);

        // Admin can update oracle
        assert!(client
            .try_invoke_contract_check_auth(&admin, &symbol_short!("update_oracle"), (&new_oracle, &signers))
            .is_ok());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MULTI-SIG TESTS (2-of-3)
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_multisig_set_paused_threshold_met() {
        // Arrange: Deploy with 2-of-3 multisig
        let env = Env::default();
        let (client, multisig_admins, _) = deploy_with_multisig(&env, 2);

        // Take first 2 signers
        let mut signers = Vec::new(&env);
        signers.push_back(multisig_admins.get(0).unwrap());
        signers.push_back(multisig_admins.get(1).unwrap());

        // Act & Assert: Should succeed with threshold met
        let result = client.try_invoke_contract_check_auth(
            &multisig_admins.get(0).unwrap(),
            &symbol_short!("set_paused"),
            (true, &signers),
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_multisig_set_paused_threshold_not_met() {
        // Arrange: Deploy with 2-of-3 multisig
        let env = Env::default();
        let (client, multisig_admins, _) = deploy_with_multisig(&env, 2);

        // Only 1 signer - threshold not met
        let mut signers = Vec::new(&env);
        signers.push_back(multisig_admins.get(0).unwrap());

        // Act & Assert: Should fail with Unauthorized
        let result = client.try_invoke_contract_check_auth(
            &multisig_admins.get(0).unwrap(),
            &symbol_short!("set_paused"),
            (true, &signers),
        );

        // Should error out (insufficient signers)
        assert!(result.is_err());
    }

    #[test]
    fn test_multisig_transfer_admin_threshold_met() {
        // Arrange: Deploy with 2-of-3 multisig
        let env = Env::default();
        let (client, multisig_admins, _) = deploy_with_multisig(&env, 2);

        let new_admin = Address::generate(&env);
        let mut signers = Vec::new(&env);
        signers.push_back(multisig_admins.get(0).unwrap());
        signers.push_back(multisig_admins.get(1).unwrap());

        // Act & Assert: Should succeed with threshold met
        let result = client.try_invoke_contract_check_auth(
            &multisig_admins.get(0).unwrap(),
            &symbol_short!("transfer_admin"),
            (&new_admin, &signers),
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_multisig_transfer_admin_threshold_not_met() {
        // Arrange: Deploy with 2-of-3 multisig
        let env = Env::default();
        let (client, multisig_admins, _) = deploy_with_multisig(&env, 2);

        let new_admin = Address::generate(&env);
        let mut signers = Vec::new(&env);
        signers.push_back(multisig_admins.get(0).unwrap());

        // Act & Assert: Should fail with Unauthorized
        let result = client.try_invoke_contract_check_auth(
            &multisig_admins.get(0).unwrap(),
            &symbol_short!("transfer_admin"),
            (&new_admin, &signers),
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_multisig_update_oracle_threshold_met() {
        // Arrange: Deploy with 2-of-3 multisig
        let env = Env::default();
        let (client, multisig_admins, _) = deploy_with_multisig(&env, 2);

        let new_oracle = Address::generate(&env);
        let mut signers = Vec::new(&env);
        signers.push_back(multisig_admins.get(0).unwrap());
        signers.push_back(multisig_admins.get(1).unwrap());

        // Act & Assert: Should succeed with threshold met
        let result = client.try_invoke_contract_check_auth(
            &multisig_admins.get(0).unwrap(),
            &symbol_short!("update_oracle"),
            (&new_oracle, &signers),
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_multisig_update_oracle_threshold_not_met() {
        // Arrange: Deploy with 2-of-3 multisig
        let env = Env::default();
        let (client, multisig_admins, _) = deploy_with_multisig(&env, 2);

        let new_oracle = Address::generate(&env);
        let mut signers = Vec::new(&env);
        signers.push_back(multisig_admins.get(0).unwrap());

        // Act & Assert: Should fail with Unauthorized
        let result = client.try_invoke_contract_check_auth(
            &multisig_admins.get(0).unwrap(),
            &symbol_short!("update_oracle"),
            (&new_oracle, &signers),
        );

        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MULTISIG VALIDATION TESTS
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_multisig_invalid_threshold_zero_with_admins() {
        let env = Env::default();
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let xlm_token = Address::generate(&env);

        let mut multisig_admins = Vec::new(&env);
        multisig_admins.push_back(Address::generate(&env));

        // Attempt to initialize with threshold=0 but non-empty multisig_admins
        let result = client.try_initialize(
            &admin,
            &oracle,
            &200_u32,
            &xlm_token,
            &multisig_admins,
            &0_u32, // Invalid: 0 threshold with assigned admins
        );

        // Should fail with InvalidInput
        assert!(result.is_err());
    }

    #[test]
    fn test_multisig_all_three_signers_success() {
        // Arrange: Deploy with 3-of-3 multisig (unanimous)
        let env = Env::default();
        let (client, multisig_admins, _) = deploy_with_multisig(&env, 3);

        // All 3 signers
        let signers = multisig_admins.clone();

        // Act & Assert: Should succeed with all signatures
        let result = client.try_invoke_contract_check_auth(
            &multisig_admins.get(0).unwrap(),
            &symbol_short!("set_paused"),
            (true, &signers),
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_multisig_threshold_one_uses_single_admin_mode() {
        // Arrange: Deploy with threshold=1 (should behave like single-admin)
        let env = Env::default();
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let xlm_token = Address::generate(&env);

        let mut multisig_admins = Vec::new(&env);
        multisig_admins.push_back(Address::generate(&env));

        client.initialize(
            &admin,
            &oracle,
            &200_u32,
            &xlm_token,
            &multisig_admins,
            &1_u32, // threshold=1 should still use single-admin mode
        );

        // Single admin must authorize
        let signers = Vec::new(&env);
        let result = client.try_invoke_contract_check_auth(
            &admin,
            &symbol_short!("set_paused"),
            (true, &signers),
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_initialize_with_empty_multisig_and_threshold_zero() {
        // Arrange & Act
        let env = Env::default();
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let xlm_token = Address::generate(&env);

        let result = client.try_initialize(
            &admin,
            &oracle,
            &200_u32,
            &xlm_token,
            &Vec::new(&env), // empty multisig_admins
            &0_u32,          // threshold=0
        );

        // Should succeed (single-admin mode)
        assert!(result.is_ok());
    }
}
