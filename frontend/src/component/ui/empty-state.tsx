import React from "react";
import Link from "next/link";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  /** When set, renders as a Link instead of a button. */
  href?: string;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: EmptyStateAction;
  /** A lower-emphasis action alongside the primary one, e.g. "Clear filters". */
  secondaryAction?: EmptyStateAction;
  variant?: "empty" | "error";
  className?: string;
}

const PRIMARY_ACTION_CLASSES =
  "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50";

const SECONDARY_ACTION_CLASSES =
  "inline-flex items-center justify-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

function EmptyStateActionButton({
  action,
  className,
}: {
  action: EmptyStateAction;
  className: string;
}) {
  if (action.href) {
    return (
      <Link href={action.href} onClick={action.onClick} className={className}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "empty",
  className,
}: EmptyStateProps) {
  const isError = variant === "error";

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4${className ? ` ${className}` : ""}`}
    >
      {icon && (
        <div
          className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
            isError
              ? "bg-red-500/10 text-red-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {icon}
        </div>
      )}

      <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mb-6 max-w-sm text-center text-sm text-muted-foreground">
        {description}
      </p>

      {(action || secondaryAction) && (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          {action && (
            <EmptyStateActionButton action={action} className={PRIMARY_ACTION_CLASSES} />
          )}
          {secondaryAction && (
            <EmptyStateActionButton action={secondaryAction} className={SECONDARY_ACTION_CLASSES} />
          )}
        </div>
      )}
    </div>
  );
}
