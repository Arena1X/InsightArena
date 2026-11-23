"use client";

import { X } from "lucide-react";

export const CATEGORY_PARAM_SEPARATOR = ",";

/**
 * Parses the `category` URL param into a list of selected categories.
 * Accepts a comma-separated list (`Crypto,Sports`) as well as a legacy
 * single value (`Crypto`). Unknown categories and duplicates are dropped and
 * the result follows the order of `categories` so URLs stay stable.
 */
export function parseCategoriesParam(
  value: string | null,
  categories: readonly string[],
): string[] {
  if (!value) return [];
  const requested = new Set(
    value
      .split(CATEGORY_PARAM_SEPARATOR)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
  return categories.filter((category) =>
    requested.has(category.toLowerCase()),
  );
}

/** Serializes selected categories for the `category` URL param. */
export function serializeCategories(selected: readonly string[]): string {
  return selected.join(CATEGORY_PARAM_SEPARATOR);
}

/**
 * Keeps items whose category matches any of the selected categories.
 * An empty selection means "no category filter".
 */
export function filterByCategories<T extends { category: string }>(
  items: T[],
  selected: readonly string[],
): T[] {
  if (selected.length === 0) return items;
  const wanted = new Set(selected.map((category) => category.toLowerCase()));
  return items.filter((item) => wanted.has(item.category.toLowerCase()));
}

interface CategoryFilterChipsProps {
  categories: readonly string[];
  selected: readonly string[];
  onToggle: (category: string) => void;
  onClear: () => void;
  counts?: Record<string, number>;
}

export default function CategoryFilterChips({
  categories,
  selected,
  onToggle,
  onClear,
  counts,
}: CategoryFilterChipsProps) {
  const selectedSet = new Set(selected);

  return (
    <div
      role="group"
      aria-label="Filter by category"
      className="mb-6 overflow-x-auto pb-2"
    >
      <div className="flex items-center gap-2">
        {categories.map((category) => {
          const isSelected = selectedSet.has(category);
          return (
            <button
              key={category}
              type="button"
              onClick={() => onToggle(category)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                isSelected
                  ? "bg-orange-500 text-white"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
              aria-pressed={isSelected}
            >
              {category}
              {counts ? ` (${counts[category] || 0})` : null}
            </button>
          );
        })}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-gray-400 transition hover:text-white"
            aria-label="Clear category filters"
          >
            <X size={14} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
