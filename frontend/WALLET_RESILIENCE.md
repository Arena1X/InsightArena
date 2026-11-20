# Wallet Connection Resilience and Session Recovery

## Overview

This document describes the wallet connection resilience features implemented for the InsightArena frontend. These features ensure a robust, user-friendly experience when connecting and using Stellar wallets (Freighter, xBull, Albedo).

## Features Implemented

### 1. Session Recovery on Page Reload

**What it does:**
- Automatically restores wallet connection when user returns to the site
- No need to reconnect wallet after page refresh or browser restart
- Validates stored session is still valid before restoring

**Technical Details:**
- Session data stored in localStorage: `insightarena.wallet.v1`
- Stores: wallet ID, address, and network
- On mount, attempts to silently reconnect using stored credentials
- Validates network matches expected network (PUBLIC)
- Validates address hasn't changed
- Clears invalid/corrupted session data automatically

**User Experience:**
- Seamless - users stay connected across browser sessions
- Fast - no popup or user interaction required
- Secure - validates everything before restoring

### 2. Disconnect & Account Switch Detection

**What it does:**
- Monitors wallet state while connected
- Detects when user switches accounts in their wallet extension
- Detects when wallet becomes locked or disconnected
- Automatically cleans up state when changes detected

**Technical Details:**
- Polls wallet every 3 seconds while connected
- Compares current address with stored address
- Detects wallet lock/disconnect via error handling
- Immediately clears all state on mismatch
- Shows clear error message explaining what happened

**User Experience:**
- Prevents inconsistent "connected but unusable" state
- Clear messaging: "Wallet account was switched. Please reconnect."
- Automatic cleanup - no manual intervention needed

### 3. Comprehensive Error Classification

**What it does:**
- Categorizes all wallet errors into specific types
- Provides actionable, context-specific error messages
- Distinguishes between retryable and non-retryable errors

**Error Types:**

| Error Type | Description | Retryable | User Action |
|------------|-------------|-----------|-------------|
| `not_installed` | Wallet extension not installed | No | Install wallet extension |
| `locked` | Wallet is locked | Yes | Unlock wallet and retry |
| `user_rejected` | User declined connection | Yes | Try again (silent - no error shown) |
| `wrong_network` | Wallet on wrong network | Yes | Switch to PUBLIC network |
| `disconnected` | Connection lost | Yes | Retry connection |
| `account_switched` | User changed wallet account | No | Reconnect with new account |
| `unknown` | Other errors | Yes | General retry |

**Technical Details:**
- Error classification via `classifyWalletError()` function
- Regex pattern matching on error messages
- Consistent error structure with type, message, and retryable flag
- User rejections don't show error UI (expected behavior)

**User Experience:**
- Clear, specific error messages
- Actionable guidance (e.g., "Unlock your wallet extension and click retry")
- Visual indicators for error type
- No confusion about what went wrong or what to do

### 4. Enhanced Connect Modal UI

**What it does:**
- Shows detailed error states with specific guidance
- Provides retry capability without full page reload
- Different UI for different error types
- Install links for missing wallets

**Modal States:**
- **Idle**: Show available wallets, detect which are installed
- **Connecting**: Spinner with "approve in wallet" message
- **Success**: Checkmark with connected address
- **Error**: Specific error with contextual actions

**Error State UI Elements:**
- Error icon (red alert circle)
- Error title (specific to error type)
- Error description (what happened)
- Helpful hint (what to do next) 
- Action buttons (retry, cancel, or install)

**User Experience:**
- No need to reload page after error
- Clear visual feedback at each step
- Helpful guidance for recovery
- Quick retry for transient errors

### 5. Wallet Balance Reset on Account Switch

**What it does:**
- Immediately clears balance when account changes
- Prevents showing wrong balance for current account
- Automatically fetches new balance after switch

**Technical Details:**
- `useWalletBalance` hook tracks previous address
- Detects address changes via useEffect
- Clears balance state immediately on change
- Triggers new balance fetch for new address

**User Experience:**
- Never shows stale or incorrect balance
- Smooth transition between accounts
- No manual refresh needed

## Testing

### Test Coverage

Comprehensive test suites verify all resilience features:

#### WalletContext Tests (`WalletContext.test.tsx`)
- ✅ Initialization with disconnected state
- ✅ Wallet detection
- ✅ Session recovery from localStorage
- ✅ Account switch detection
- ✅ Network mismatch detection
- ✅ Corrupted session data handling
- ✅ Wallet lock detection
- ✅ Error classification (all types)
- ✅ Modal open/close
- ✅ Retry functionality
- ✅ Logout and cleanup

#### useWalletBalance Tests (`useWalletBalance.test.ts`)
- ✅ Balance fetch when authenticated
- ✅ Null balance when not authenticated
- ✅ Balance reset on account switch
- ✅ Automatic refetch on interval
- ✅ API error handling
- ✅ Timeout handling
- ✅ Toast notifications for errors
- ✅ Manual refetch
- ✅ Balance clear on disconnect

#### ConnectWalletModal Tests (`ConnectWalletModal.test.tsx`)
- ✅ Render when open/closed
- ✅ Wallet options display
- ✅ Install button for unavailable wallets
- ✅ Successful connection flow
- ✅ User rejection handling
- ✅ Specific error messages (not installed, locked, wrong network)
- ✅ Retry functionality
- ✅ Close button behavior
- ✅ FAQ expansion
- ✅ Disabled state for unavailable wallets
- ✅ Cancel during connection

### Running Tests

```bash
# Run all tests
pnpm test

# Run wallet-specific tests
pnpm test WalletContext
pnpm test useWalletBalance
pnpm test ConnectWalletModal

# Run with coverage
pnpm test --coverage

# Watch mode for development
pnpm test --watch
```

## Architecture

### WalletContext Flow

```
App Mount
  ↓
Initialize Wallet Kit
  ↓
Detect Available Wallets
  ↓
Check localStorage
  ↓
Session Found? ──No──→ Show Connect Button
  ↓ Yes
Validate Network
  ↓
Fetch Current Address
  ↓
Address Match? ──No──→ Clear Session + Show Error
  ↓ Yes
Restore Session
  ↓
Start Account Monitoring (3s interval)
```

### Account Monitoring Flow

```
Every 3 seconds (while connected)
  ↓
Fetch Current Address
  ↓
Address Changed? ──No──→ Continue Monitoring
  ↓ Yes
Clear Session
  ↓
Set "account_switched" Error
  ↓
Stop Monitoring
  ↓
Show "Please Reconnect" UI
```

### Error Handling Flow

```
Wallet Operation Error
  ↓
Classify Error
  ↓
User Rejection? ──Yes──→ Reset Modal (No Error UI)
  ↓ No
Determine Error Type
  ↓
Set walletError State
  ↓
Show Specific Error UI
  ↓
Retryable? ──Yes──→ Show Retry Button
           ──No──→ Show Install/Reconnect
```

## API Changes

### WalletContext

**New Properties:**
- `network: string | null` - Current network (PUBLIC/TESTNET)
- `walletError: WalletErrorState | null` - Structured error information

**New Methods:**
- `retry(): Promise<void>` - Retry connection (opens modal)
- `clearError(): void` - Clear current error state

**Updated Types:**
```typescript
interface WalletErrorState {
  type: WalletError;
  message: string;
  retryable: boolean;
}

type WalletError =
  | "not_installed"
  | "locked"
  | "user_rejected"
  | "wrong_network"
  | "disconnected"
  | "account_switched"
  | "unknown";
```

### ConnectWalletModal

**New Features:**
- Error type categorization
- Retry without modal close
- Specific error UI per type
- Install links for missing wallets

### useWalletBalance

**New Features:**
- Automatic balance reset on account switch
- Previous address tracking
- Improved error handling

## Usage Examples

### Accessing Wallet Errors

```tsx
const { walletError, retry, clearError } = useWallet();

if (walletError) {
  return (
    <div>
      <p>{walletError.message}</p>
      {walletError.retryable && (
        <button onClick={retry}>Retry</button>
      )}
    </div>
  );
}
```

### Handling Account Switches

```tsx
const { address } = useWallet();
const { balance } = useWalletBalance();

// balance automatically clears when address changes
// no manual handling needed!
```

### Custom Error Display

```tsx
const { walletError } = useWallet();

const errorMessages = {
  not_installed: "Please install Freighter wallet",
  locked: "Please unlock your wallet",
  wrong_network: "Please switch to Stellar Public network",
  account_switched: "Account changed - please reconnect",
};

if (walletError) {
  return (
    <Alert type="error">
      {errorMessages[walletError.type] || walletError.message}
    </Alert>
  );
}
```

## Network Detection

The wallet context now tracks the network and validates it on session restore:

```typescript
// Session must include network
interface StoredWalletSession {
  walletId: string;
  address: string;
  network: string; // "PUBLIC" or "TESTNET"
}

// Validated on restore
if (stored.network !== currentNetwork) {
  // Clear session and show error
  setWalletError({ type: "wrong_network", ... });
}
```

## Monitoring & Cleanup

### Account Monitoring
- Starts automatically when wallet connects
- Polls every 3 seconds
- Stops automatically on disconnect
- Cleaned up on component unmount

### Session Storage
- Automatically written on successful connection
- Automatically cleared on logout/errors
- Handles corrupted data gracefully
- Never stores secret keys (only public address)

## Future Enhancements

Potential improvements for future iterations:

1. **Event-Based Monitoring**: Use wallet extension events instead of polling (if supported)
2. **Multi-Wallet Support**: Allow multiple connected accounts simultaneously
3. **Network Switching**: Auto-prompt user to switch networks instead of just erroring
4. **Offline Detection**: Handle offline/online transitions gracefully
5. **Balance Caching**: Cache balance data during temporary disconnects
6. **Analytics**: Track error frequency and types for debugging
7. **Auto-Retry**: Automatically retry transient errors with exponential backoff

## Troubleshooting

### Common Issues

**Issue**: Session not restoring after reload
- Check localStorage for `insightarena.wallet.v1`
- Verify wallet extension is still installed
- Check browser console for errors

**Issue**: Account switch not detected
- Verify wallet extension allows address queries
- Check 3-second polling is running (not blocked)
- Look for errors in browser console

**Issue**: Error messages not showing
- Check `walletError` state in React DevTools
- Verify error classification is working
- Check modal is properly mounted

## References

- [Stellar Wallets Kit Documentation](https://www.npmjs.com/package/@creit-tech/stellar-wallets-kit)
- [Freighter Wallet](https://www.freighter.app/)
- [xBull Wallet](https://xbull.app/)
- [Albedo Wallet](https://albedo.link/)
