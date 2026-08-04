// Tests de configuration : défauts, surcharge fichier, effet sur le scoring.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfig, resetConfig, configPath } from "../config.js";
import { computePriority, minLexical } from "../scoring.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memsem-config-"));
let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("ECHEC:", message);
    failures++;
  } else {
    console.log("OK:", message);
  }
}

const previousPath = process.env.MEMSEM_CONFIG;
function withConfig(json: Record<string, unknown>, fn: () => void): void {
  const file = path.join(tmpDir, "config.json");
  fs.writeFileSync(file, JSON.stringify(json));
  process.env.MEMSEM_CONFIG = file;
  resetConfig();
  try {
    fn();
  } finally {
    resetConfig();
  }
}

// 1. Défauts sans fichier.
withConfig({}, () => {
  const cfg = getConfig();
  assert(cfg.priority.importance === 0.45 && cfg.priority.frequency === 0.1, "poids par défaut (0.45/0.25/0.2/0.1)");
  assert(cfg.minLexical === 0.5 && cfg.relaxCosineThreshold === 0.5, "seuils par défaut (0.5)");
  assert(cfg.halfLifeHours === 168 && cfg.embedModel === "mxbai-embed-large", "demi-vie et modèle par défaut");
  assert(minLexical() === 0.5, "minLexical() lit la config");
});

// 2. Surcharge partielle par fichier.
withConfig({ priority: { importance: 0.4, confidence: 0.3 }, minLexical: 0.4 }, () => {
  const cfg = getConfig();
  assert(cfg.priority.importance === 0.4 && cfg.priority.confidence === 0.3, "poids surchargés");
  assert(cfg.priority.recency === 0.2 && cfg.priority.frequency === 0.1, "poids non fournis conservent les défauts");
  assert(cfg.minLexical === 0.4, "seuil lexical surchargé");
});

// 3. Le scoring réagit aux constantes.
withConfig({}, () => {
  const a = computePriority({ importance: 0.9, confidence: 0.5, frequency: 1, ageHours: 24 });
  withConfig({ priority: { importance: 0.1, confidence: 0.6 } }, () => {
    const b = computePriority({ importance: 0.9, confidence: 0.5, frequency: 1, ageHours: 24 });
    assert(Math.abs(b - a) > 0.05, "computePriority varie selon la config");
  });
});

// 4. Fichier illisible → défauts, pas de crash.
withConfig({ minLexical: "pas-un-nombre" } as unknown as Record<string, unknown>, () => {
  const cfg = getConfig();
  assert(cfg.minLexical === 0.5, "config invalide → défauts");
});

if (previousPath === undefined) delete process.env.MEMSEM_CONFIG;
else process.env.MEMSEM_CONFIG = previousPath;
resetConfig();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(failures === 0 ? "\nConfig : tous les tests passent." : `\nConfig : ${failures} ECHECS.`);
process.exitCode = failures === 0 ? 0 : 1;
