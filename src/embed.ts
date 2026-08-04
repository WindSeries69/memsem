import { getConfig } from "./config.js";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const EMBED_MODEL = (): string => getConfig().embedModel;

let cached: { available: boolean; at: number } | null = null;
const TTL_OK = 5 * 60_000;
const TTL_FAIL = 60_000;

export async function ollamaAvailable(): Promise<boolean> {
  if (cached && Date.now() - cached.at < (cached.available ? TTL_OK : TTL_FAIL)) {
    return cached.available;
  }
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    cached = { available: res.ok, at: Date.now() };
  } catch {
    cached = { available: false, at: Date.now() };
  }
  return cached.available;
}

export async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL(), input: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings?: number[][] };
    return data.embeddings?.[0] ?? null;
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
