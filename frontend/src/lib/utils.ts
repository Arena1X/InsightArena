import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Minimal shape a documentation section must satisfy to be searchable/TOC-able. */
export interface DocSearchable {
  id: string;
  title: string;
  description?: string;
  content?: string;
}

/** A single anchored table-of-contents entry. */
export interface TocEntry {
  id: string;
  title: string;
}

/**
 * Derives an anchored table of contents from a list of documentation
 * sections. Each section's heading becomes one TOC entry, in source order,
 * so the TOC always stays in sync with the headings actually rendered.
 */
export function buildTableOfContents<T extends DocSearchable>(
  sections: T[]
): TocEntry[] {
  return sections.map(({ id, title }) => ({ id, title }));
}

/**
 * Case-insensitive client-side search over documentation sections. Matches
 * against the title, description, and body content of each section.
 */
export function filterDocSections<T extends DocSearchable>(
  sections: T[],
  query: string
): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return sections;

  return sections.filter((section) =>
    [section.title, section.description, section.content]
      .filter((field): field is string => Boolean(field))
      .some((field) => field.toLowerCase().includes(normalizedQuery))
  );
}
