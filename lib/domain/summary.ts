import { keyExcerpt, normalize } from "./text";

const ASK_PREFIXES = [
  "need", "looking", "want", "how do i", "anyone", "where do i", "help",
  "automate", "build", "hiring", "fix", "outsource", "[hiring]",
];

/**
 * The one-line "what they need" shown on every card. Keeps the operator's
 * language but strips the noise that makes a title unscreenable in a list.
 */
export function keywordExcerpt(title: string, content: string, maxLength = 150): string {
  const cleanedTitle = title.replace(/^\[[^\]]+\]\s*/, "").trim();
  const normalized = normalize(cleanedTitle);
  const startsAsAsk = ASK_PREFIXES.some((prefix) => normalized.startsWith(prefix));

  if (startsAsAsk && cleanedTitle.length <= maxLength) return cleanedTitle;

  const firstSentence = content.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  if (firstSentence.length >= 40 && firstSentence.length <= maxLength) return firstSentence;

  return keyExcerpt(cleanedTitle || content, maxLength);
}

/**
 * True when the one-line need adds information beyond the title. Some posts
 * already open with a clear ask, so repeating it verbatim just adds noise.
 */
export function needAddsDetail(title: string, needSummary: string): boolean {
  const need = normalize(needSummary).replace(/[^a-z0-9]+/g, " ").trim();
  const heading = normalize(title).replace(/[^a-z0-9]+/g, " ").trim();
  if (!need) return false;
  return need !== heading;
}
