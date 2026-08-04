// Configuration centrale de memsem : toutes les constantes de comportement.
// Surcharge utilisateur : ~/.memsem/config.json (ou $MEMSEM_CONFIG), fusion partielle.
// Exemple de config.json :
//   { "priority": { "importance": 0.4, "confidence": 0.3 }, "minLexical": 0.4 }
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface MemSemConfig {
  priority: { importance: number; confidence: number; recency: number; frequency: number };
  halfLifeHours: number;
  minLexical: number;
  relaxCosineThreshold: number;
  relaxGraphHops: number;
  relaxGraphBoost: number;
  relaxSemanticWeight: number;
  focusAttenuation: number;
  fadeFactor: number;
  criticalFadeFactor: number;
  archiveThreshold: number;
  criticalImportance: number;
  reinforceConfidenceStep: number;
  initialConfidence: number;
  supersedeConfidence: number;
  searchLexicalWeight: number;
  searchPriorityWeight: number;
  embedModel: string;
}

const DEFAULTS: MemSemConfig = {
  priority: { importance: 0.45, confidence: 0.25, recency: 0.2, frequency: 0.1 },
  halfLifeHours: 24 * 7,
  minLexical: 0.5,
  relaxCosineThreshold: 0.5,
  relaxGraphHops: 2,
  relaxGraphBoost: 0.3,
  relaxSemanticWeight: 0.9,
  focusAttenuation: 0.35,
  fadeFactor: 0.6,
  criticalFadeFactor: 0.9,
  archiveThreshold: 0.25,
  criticalImportance: 0.8,
  reinforceConfidenceStep: 0.1,
  initialConfidence: 0.5,
  supersedeConfidence: 0.6,
  searchLexicalWeight: 0.7,
  searchPriorityWeight: 0.3,
  embedModel: "mxbai-embed-large",
};

export function configPath(): string {
  return process.env.MEMSEM_CONFIG ?? path.join(os.homedir(), ".memsem", "config.json");
}

let cached: MemSemConfig | null = null;

export function getConfig(): MemSemConfig {
  if (cached) return cached;
  let file: Partial<MemSemConfig> = {};
  try {
    file = JSON.parse(fs.readFileSync(configPath(), "utf8")) as Partial<MemSemConfig>;
  } catch {
    // défauts si fichier absent ou illisible
  }
  const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  const priority = {
    importance: num(file.priority?.importance, DEFAULTS.priority.importance),
    confidence: num(file.priority?.confidence, DEFAULTS.priority.confidence),
    recency: num(file.priority?.recency, DEFAULTS.priority.recency),
    frequency: num(file.priority?.frequency, DEFAULTS.priority.frequency),
  };
  cached = {
    priority,
    halfLifeHours: num(file.halfLifeHours, DEFAULTS.halfLifeHours),
    minLexical: num(file.minLexical, DEFAULTS.minLexical),
    relaxCosineThreshold: num(file.relaxCosineThreshold, DEFAULTS.relaxCosineThreshold),
    relaxGraphHops: Math.max(1, Math.floor(num(file.relaxGraphHops, DEFAULTS.relaxGraphHops))),
    relaxGraphBoost: num(file.relaxGraphBoost, DEFAULTS.relaxGraphBoost),
    relaxSemanticWeight: num(file.relaxSemanticWeight, DEFAULTS.relaxSemanticWeight),
    focusAttenuation: num(file.focusAttenuation, DEFAULTS.focusAttenuation),
    fadeFactor: num(file.fadeFactor, DEFAULTS.fadeFactor),
    criticalFadeFactor: num(file.criticalFadeFactor, DEFAULTS.criticalFadeFactor),
    archiveThreshold: num(file.archiveThreshold, DEFAULTS.archiveThreshold),
    criticalImportance: num(file.criticalImportance, DEFAULTS.criticalImportance),
    reinforceConfidenceStep: num(file.reinforceConfidenceStep, DEFAULTS.reinforceConfidenceStep),
    initialConfidence: num(file.initialConfidence, DEFAULTS.initialConfidence),
    supersedeConfidence: num(file.supersedeConfidence, DEFAULTS.supersedeConfidence),
    searchLexicalWeight: num(file.searchLexicalWeight, DEFAULTS.searchLexicalWeight),
    searchPriorityWeight: num(file.searchPriorityWeight, DEFAULTS.searchPriorityWeight),
    embedModel: typeof file.embedModel === "string" && file.embedModel.trim() ? file.embedModel : DEFAULTS.embedModel,
  };
  // L'environnement prime pour le modèle d'embedding (compat MEMSEM_EMBED_MODEL).
  if (process.env.MEMSEM_EMBED_MODEL) cached.embedModel = process.env.MEMSEM_EMBED_MODEL;
  return cached;
}

/** Réinitialise le cache (tests, bench). */
export function resetConfig(): void {
  cached = null;
}
