export const HALF_LIFE_HOURS = 24 * 7;

export interface PriorityInput {
  importance: number;
  confidence: number;
  frequency: number;
  ageHours: number;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function computePriority({
  importance,
  confidence,
  frequency,
  ageHours,
}: PriorityInput): number {
  const recency = Math.exp(-ageHours / HALF_LIFE_HOURS);
  const freqFactor = 1 - 1 / (1 + Math.log(1 + frequency));
  return clamp01(
    0.45 * importance + 0.25 * confidence + 0.2 * recency + 0.1 * freqFactor,
  );
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/)
    .filter((t) => t.length > 1);
}

export function overlapRatio(queryTokens: string[], memoryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const set = new Set(memoryTokens);
  const hits = queryTokens.filter((t) => set.has(t)).length;
  return hits / queryTokens.length;
}

export const MIN_LEXICAL = 0.5;

export function lexicalScore(
  query: string,
  memory: { subject: string; predicate: string; object: string; tags: string[] },
): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const mTokens = tokenize(
    [memory.subject, memory.predicate, memory.object, ...memory.tags].join(" "),
  );
  let lexical = overlapRatio(qTokens, mTokens);
  const haystack = mTokens.join(" ");
  const needle = query.toLowerCase().trim();
  if (needle && haystack.includes(needle)) lexical = Math.max(lexical, 1);
  return lexical;
}

export function searchScore(
  query: string,
  memory: { subject: string; predicate: string; object: string; tags: string[]; priority: number },
): number {
  const lexical = lexicalScore(query, memory);
  if (lexical === 0) return 0;
  return lexical * 0.7 + memory.priority * 0.3;
}
