import React from "react";

export interface ShortcutDisplay {
  key: string;
  description: string;
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
  };
}

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutDisplay[];
}

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose,
  shortcuts,
}) => {
  if (!isOpen) return null;

  const formatShortcut = (shortcut: ShortcutDisplay): string => {
    const parts: string[] = [];
    
    if (shortcut.modifiers?.ctrl) {
      parts.push("Ctrl");
    }
    if (shortcut.modifiers?.shift) {
      parts.push("Shift");
    }
    if (shortcut.modifiers?.alt) {
      parts.push("Alt");
    }
    
    parts.push(shortcut.key.toUpperCase());
    
    return parts.join(" + ");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      data-testid="keyboard-shortcuts-overlay"
    >
      <div
        className="relative max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-gray-500 bg-[#1a1a1a] p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="shortcuts-title"
            className="text-2xl font-bold text-white"
          >
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-lg p-2"
            aria-label="Close keyboard shortcuts help"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="mb-6 text-sm text-gray-400">
          Use these keyboard shortcuts to navigate and perform actions quickly.
          Shortcuts are disabled while typing in input fields.
        </p>

        <div className="space-y-3">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-lg border border-gray-700 bg-[#252525] px-4 py-3 transition-colors hover:bg-[#2a2a2a]"
              data-testid="shortcut-item"
            >
              <span className="text-base text-gray-300">
                {shortcut.description}
              </span>
              <kbd className="min-w-[100px] rounded-md border border-gray-600 bg-[#1a1a1a] px-3 py-1.5 text-center text-sm font-mono font-semibold text-white shadow-sm">
                {formatShortcut(shortcut)}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg bg-purple-500/10 border border-purple-500/30 p-4">
          <p className="text-sm text-purple-300">
            <strong>Tip:</strong> Press <kbd className="rounded bg-purple-500/30 px-2 py-0.5 text-xs font-mono">?</kbd> anytime to view this help overlay.
          </p>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;
