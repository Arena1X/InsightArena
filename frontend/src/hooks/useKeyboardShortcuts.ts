import { useEffect, useCallback, useRef } from "react";

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
  /**
   * Scope the shortcuts belong to. Scoped shortcuts fire only while the scope is
   * active (its hook is enabled). Scopes pushed later are topmost and win on conflict.
   * Omit for global shortcuts, which are active whenever the hook is enabled.
   */
  scope?: string;
}

interface Registration {
  scope?: string;
  shortcutsRef: { current: KeyboardShortcut[] };
}

// Enabled hook instances, and the scoped ones in push order (last = topmost).
const registrations = new Set<Registration>();
const scopeStack: Registration[] = [];
// Guards against several hook instances firing for the same keydown event.
let handledEvent: KeyboardEvent | null = null;

function matchesEvent(s: KeyboardShortcut, event: KeyboardEvent): boolean {
  const keyMatches = s.key.toLowerCase() === event.key.toLowerCase();
  const ctrlMatches = s.modifiers?.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
  const shiftMatches = s.modifiers?.shift ? event.shiftKey : !event.shiftKey;
  const altMatches = s.modifiers?.alt ? event.altKey : !event.altKey;
  const metaMatches = s.modifiers?.meta ? event.metaKey : true; // Meta is optional unless explicitly required

  return keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches;
}

// Picks the winning shortcut across all enabled hooks: topmost active scope first, then global.
function findWinner(event: KeyboardEvent) {
  let winner: { registration: Registration; shortcut: KeyboardShortcut } | undefined;
  let winnerRank = -2;

  for (const registration of Array.from(registrations)) {
    const rank = scopeStack.indexOf(registration);
    if (registration.scope !== undefined && rank < 0) continue; // scope not active

    const shortcut = registration.shortcutsRef.current.find((s) => matchesEvent(s, event));
    if (shortcut && rank > winnerRank) {
      winner = { registration, shortcut };
      winnerRank = rank;
    }
  }

  return winner;
}

/**
 * Hook for managing keyboard shortcuts with input field suppression.
 * Shortcuts will not fire when user is typing in input, textarea, or contenteditable elements.
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  scope,
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);

  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const isInputElement = useCallback((element: EventTarget | null): boolean => {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    const isContentEditable = element.contentEditable === "true";

    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      isContentEditable
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const registration: Registration = { scope, shortcutsRef };
    registrations.add(registration);
    if (scope !== undefined) scopeStack.push(registration);

    const handleKeyDown = (event: KeyboardEvent) => {
      // Suppress shortcuts when typing in input fields
      if (handledEvent === event || isInputElement(event.target)) {
        return;
      }

      const winner = findWinner(event);
      if (!winner || winner.registration !== registration) return;

      handledEvent = event;
      event.preventDefault();
      winner.shortcut.action();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      registrations.delete(registration);
      const index = scopeStack.indexOf(registration);
      if (index !== -1) scopeStack.splice(index, 1);
    };
  }, [enabled, scope, isInputElement]);

  return { shortcuts: shortcutsRef.current };
}
