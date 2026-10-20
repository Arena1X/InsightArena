/**
 * Basic automated moderation for user-submitted comments: a profanity
 * word-list check and a link-spam heuristic (too many URLs for a short
 * comment). Matches are soft-hidden (`is_flagged`) rather than rejected, so
 * the author still sees their own comment while other users don't.
 */

const PROFANITY_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'faggot',
  'nigger',
  'whore',
];

const URL_PATTERN = /https?:\/\/\S+|www\.\S+/gi;

/** Comments with more than this many links are treated as link spam. */
const MAX_LINKS_ALLOWED = 2;

export interface ModerationResult {
  flagged: boolean;
  reason: string | null;
}

function containsProfanity(content: string): boolean {
  const normalized = content.toLowerCase();
  return PROFANITY_WORDS.some((word) =>
    new RegExp(`\\b${word}\\b`, 'i').test(normalized),
  );
}

function isLinkSpam(content: string): boolean {
  const matches = content.match(URL_PATTERN);
  return (matches?.length ?? 0) > MAX_LINKS_ALLOWED;
}

/** Screen a comment's content, returning whether it should be soft-hidden. */
export function moderateCommentContent(content: string): ModerationResult {
  if (containsProfanity(content)) {
    return { flagged: true, reason: 'profanity' };
  }
  if (isLinkSpam(content)) {
    return { flagged: true, reason: 'link_spam' };
  }
  return { flagged: false, reason: null };
}
