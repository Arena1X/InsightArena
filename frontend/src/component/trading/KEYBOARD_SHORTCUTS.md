# Trading View Keyboard Shortcuts

This document describes the keyboard shortcuts feature implemented for the trading view component.

## Features

- **Discoverable keyboard shortcuts** for common trading actions
- **Help overlay** that displays all available shortcuts (press `?`)
- **Input field suppression** - shortcuts are automatically disabled while typing
- **Accessibility compliant** with proper ARIA labels and semantic HTML
- **Fully tested** with comprehensive unit and integration tests

## Available Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Show/hide keyboard shortcuts help overlay |
| `f` | Focus search input field |
| `1` | Switch to Live Market tab |
| `2` | Switch to Tournament tab |
| `3` | Switch to Portfolio tab |
| `4` | Switch to Leaderboards tab |
| `t` | Trade first visible market |
| `s` | Toggle favorite on first market |
| `Escape` | Close overlays and clear search |

## Implementation

### Components

1. **KeyboardShortcutsHelp** (`KeyboardShortcutsHelp.tsx`)
   - Modal overlay displaying all available shortcuts
   - Formatted with keyboard key styling
   - Accessible with proper ARIA attributes
   - Click outside to close functionality

2. **useKeyboardShortcuts** (`hooks/useKeyboardShortcuts.ts`)
   - Custom React hook for managing keyboard shortcuts
   - Automatically suppresses shortcuts in input fields (input, textarea, select, contenteditable)
   - Supports modifier keys (Ctrl, Shift, Alt, Meta)
   - Case-insensitive key matching
   - Configurable enable/disable state

### Integration

The keyboard shortcuts are integrated into the main trading page (`app/trading/page.tsx`):

```tsx
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import KeyboardShortcutsHelp from "@/component/trading/KeyboardShortcutsHelp";

// Define shortcuts with actions
const shortcuts = [
  {
    key: "?",
    description: "Show keyboard shortcuts",
    action: () => setShowShortcutsHelp(true),
  },
  // ... more shortcuts
];

// Activate the hook
useKeyboardShortcuts({ shortcuts, enabled: true });

// Render the help overlay
<KeyboardShortcutsHelp
  isOpen={showShortcutsHelp}
  onClose={() => setShowShortcutsHelp(false)}
  shortcuts={shortcutDisplays}
/>
```

## Testing

### Test Coverage

All tests are located in their respective `.test.tsx` files:

1. **KeyboardShortcutsHelp.test.tsx** (12 tests)
   - Rendering and visibility states
   - Shortcut display and formatting
   - Modal interaction (close button, click outside)
   - Accessibility attributes
   - Modifier key formatting

2. **useKeyboardShortcuts.test.tsx** (11 tests)
   - Shortcut triggering outside inputs
   - Input field suppression (input, textarea, contenteditable)
   - Modifier key handling
   - Multiple shortcuts management
   - Enable/disable functionality
   - Event listener cleanup

3. **page.test.tsx** (12 integration tests)
   - Help overlay display
   - All shortcut actions (tab switching, trade, favorite, focus, etc.)
   - Input field suppression during typing
   - Offline mode behavior
   - Market filtering with shortcuts

### Running Tests

```bash
# Run all keyboard shortcuts tests
pnpm test -- src/component/trading/KeyboardShortcutsHelp.test.tsx src/hooks/useKeyboardShortcuts.test.tsx src/app/trading/page.test.tsx

# Run specific test file
pnpm test -- src/component/trading/KeyboardShortcutsHelp.test.tsx

# Run all tests
pnpm test
```

All 35 tests pass successfully! ✅

## Accessibility

- **Keyboard navigation**: All shortcuts work without a mouse
- **ARIA attributes**: Proper `role`, `aria-modal`, and `aria-labelledby` on help overlay
- **Screen reader friendly**: Clear button labels and semantic HTML
- **Focus management**: Search input can be focused with `f` key
- **No input interference**: Shortcuts are suppressed while typing to prevent accidental actions

## Safety Features

- **Input suppression**: Shortcuts don't fire in input, textarea, select, or contenteditable elements
- **Offline protection**: Trade and favorite shortcuts are disabled when offline
- **Filtered markets**: Trade/favorite shortcuts work on the first *visible* (filtered) market
- **Escape key**: Universal close/clear action for safety

## Browser Compatibility

The implementation uses standard Web APIs and is compatible with all modern browsers:
- Chrome/Edge (Chromium)
- Firefox
- Safari
- Opera

## Future Enhancements

Potential improvements for the future:
- Customizable shortcuts (user preferences)
- Shortcut hints on hover
- More granular actions (e.g., arrow keys for navigation)
- Vim-style command mode
- Shortcut recording/macro support
