// Tests du juge sécurisé : dry-run, journal d'audit, garde-fous (pinned/0.9,
// plafond ±0.15 par appel et par passe), memsem doctor.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryDb } from "../db.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memsem-score-"));
let failures = 0;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("ECHEC:", message);
    failures++;
  } else {
    console.log("OK:", message);
  }
}

const dbPath = path.join(tmpDir, "score.db");
const db = new MemoryDb(dbPath);
const mk = (o: string, importance: number, pin = false) =>
  db.add({ subject: "utilisateur", predicate: "score", object: o, importance, project: "g", pin }).id;

// 1. Ajustement normal : appliqué, audité.
const idA = mk("fait normal", 0.5);
const r1 = db.setImportance(idA, 0.7, { reason: "paire: A bat B", passId: "pass-1" });
assert(r1?.applied === true && r1.importance === 0.65, "ajustement +0.15 appliqué (plafonné, pas 0.7)");
const audit1 = db.mostModified(10);
assert(audit1.length === 1 && audit1[0].entityId === idA && near(audit1[0].totalDelta, 0.15), "audit consigné (Δ 0.15)");

// 2. Plafond par appel : une cible très éloignée ne bouge que de ±0.15.
const r2 = db.setImportance(idA, 0.05, { reason: "baisse", passId: "pass-2" });
assert(r2?.importance === 0.5, "baisse plafonnée à −0.15 (0.65 → 0.5)");
assert(r2?.clampedDelta === true, "clampedDelta signalé");

// 3. Plafond cumulatif par passe : deux appels même passId ≤ 0.15 au total.
const r3 = db.setImportance(idA, 0.65, { reason: "haut", passId: "pass-3" }); // +0.15
const r4 = db.setImportance(idA, 0.8, { reason: "encore", passId: "pass-3" }); // devrait être bloqué (0 déjà utilisé)
assert(r4?.applied === false && r4.importance === 0.65, "passe cumulée: 2e ajustement bloqué (plafond 0.15 atteint)");
const r5 = db.setImportance(idA, 0.7, { reason: "autre passe", passId: "pass-4" }); // autre passe: +0.15 autorisé
assert(r5?.applied === true && near(r5.importance, 0.7), "autre passe: +0.15 autorisé (0.65 → 0.7)");

// 4. Faits protégés : pinned et importance ≥ 0.9 intouchables.
const idPin = mk("fait epingle", 0.5, true);
const r6 = db.setImportance(idPin, 0.9, { reason: "test", passId: "pass-5" });
assert(r6?.refused === "pinned" && r6.applied === false, "fait épinglé refusé");
const idCrit = mk("fait critique", 0.9);
const r7 = db.setImportance(idCrit, 0.5, { reason: "test", passId: "pass-6" });
assert(r7?.refused === "critical-0.9" && r7.applied === false, "importance ≥ 0.9 refusée");

// 5. Bornes : jamais au-dessus de 0.85 ni sous 0.4.
const idB = mk("fait borne", 0.3);
const r8 = db.setImportance(idB, 0.99, { reason: "test", passId: "pass-7" });
assert(near(r8?.importance ?? -1, 0.45), "plancher 0.4 + plafond appel ±0.15 (0.3 + 0.15 = 0.45)");
const r9 = db.setImportance(idB, 0.99, { reason: "test", passId: "pass-8" });
assert(near(r9?.importance ?? -1, 0.6) && (r9?.importance ?? 1) <= 0.85, "progression bornée, jamais > 0.85 sur une passe");

// 6. dryRun : rien n'est appliqué, mais l'audit le garde.
const before = db.setImportance(idB, 0.6, { passId: "pass-9" });
void before;
const idC = mk("fait dryrun", 0.4);
const r10 = db.setImportance(idC, 0.9, { dryRun: true, reason: "simulation", passId: "pass-10" });
assert(r10?.applied === false, "dry-run: non appliqué");
const after = db.list(null, null, 50).find((m) => m.id === idC);
assert(after?.importance === 0.4, "dry-run: importance inchangée (0.4)");
const modified = db.mostModified(10);
const dry = modified.find((m) => m.entityId === idC);
assert(dry !== undefined && dry.dryRuns === 1 && dry.changes === 1, "dry-run consigné dans le journal");

// 7. doctor : tri par Δ total, raisons présentes.
const doctor = db.mostModified(5);
assert(doctor.length >= 2 && doctor.every((m) => m.lastReason !== null), "doctor: raisons d'audit présentes");
assert(doctor[0].totalDelta >= doctor[doctor.length - 1].totalDelta, "doctor: tri par Δ décroissant");

// 8. Mémoire introuvable → null (pas de crash).
const r11 = db.setImportance(999999, 0.5);
assert(r11 === null, "id inconnu → null");

db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(failures === 0 ? "\nJuge : tous les tests passent." : `\nJuge : ${failures} ECHECS.`);
process.exitCode = failures === 0 ? 0 : 1;
