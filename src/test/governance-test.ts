import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryDb } from "../db.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memsem-governance-"));
let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("ECHEC:", message);
    failures++;
  } else {
    console.log("OK:", message);
  }
}

// 1. Evidence, trust state and bi-temporal recall survive the normal write path.
{
  const db = new MemoryDb(path.join(tmpDir, "evidence.db"));
  const old = db.add({
    subject: "user",
    predicate: "status",
    object: "old",
    project: "timeline",
    trust: "verbatim",
    evidence: "user: old",
    provenance: "session-old",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-02-01T00:00:00.000Z",
  });
  const current = db.add({
    subject: "user",
    predicate: "status",
    object: "current",
    project: "timeline",
    trust: "verified",
    evidence: "checked in test",
    provenance: "session-current",
    validFrom: "2026-02-01T00:00:00.000Z",
  });
  const hit = (await db.search("status", "timeline", null, 10)).find((row) => row.id === current.id);
  assert(hit?.trust === "verified", "recherche: le niveau de confiance est exposé");
  assert(hit?.evidence === "checked in test", "recherche: la preuve est exposée");
  assert(hit?.provenance === "session-current", "recherche: la provenance survit à l'écriture");
  assert(!(await db.search("status", "timeline", null, 10)).some((row) => row.id === old.id), "temps: un fait expiré ne remonte pas par défaut");

  const historical = await db.search("status", "timeline", null, 10, false, null, false, "2026-01-15T00:00:00.000Z");
  assert(historical.some((row) => row.id === old.id), "as_of: le fait valide dans le passé remonte");
  assert(!historical.some((row) => row.id === current.id), "as_of: le fait futur ne remonte pas");
  db.close();
}

// 2. A project scope is isolated; crossing projects is explicit.
{
  const db = new MemoryDb(path.join(tmpDir, "scope.db"));
  db.add({ subject: "user", predicate: "uses", object: "alpha", theme: "work", project: "a" });
  db.add({ subject: "user", predicate: "uses", object: "beta", theme: "work", project: "b" });
  const isolated = await db.search("uses", "a", "work", 10);
  const global = await db.search("uses", "a", "work", 10, false, null, true);
  assert(isolated.every((row) => row.project === "a"), "scope: un projet ne fuit pas vers un autre");
  assert(global.some((row) => row.project === "b"), "scope: le franchissement inter-projets est explicite");
  db.close();
}

// 3. Rejected candidates create a durable write suppression; approved candidates publish evidence.
{
  const db = new MemoryDb(path.join(tmpDir, "review.db"));
  const rejected = db.addCandidate({
    subject: "user",
    predicate: "uses",
    object: "rejected-tool",
    project: "review",
    evidence: "candidate quote",
  });
  assert(db.listCandidates("review", "pending", 10).some((candidate) => candidate.id === rejected.id), "review: le candidat pending est listable");
  const rejectedReview = db.reviewCandidate(rejected.id, "reject", "human declined");
  assert(rejectedReview.status === "rejected", "review: le rejet est enregistré");
  const blocked = db.add({ subject: "user", predicate: "uses", object: "rejected-tool", project: "review" });
  assert(blocked.rejected === true, "suppression: une valeur rejetée est bloquée à l'écriture");
  assert(db.unsuppress("user", "uses", "rejected-tool", "review") === true, "suppression: une réautorisation explicite est possible");
  assert(db.add({ subject: "user", predicate: "uses", object: "rejected-tool", project: "review" }).created === true, "suppression: la valeur réautorisée peut être réévaluée");

  const approved = db.addCandidate({
    subject: "user",
    predicate: "uses",
    object: "approved-tool",
    project: "review",
    trust: "verbatim",
    evidence: "approved quote",
  });
  const approvedReview = db.reviewCandidate(approved.id, "approve", "human accepted");
  assert(approvedReview.status === "approved" && approvedReview.memoryId !== null, "review: l'approbation publie le fait");
  const published = db.get(approvedReview.memoryId ?? 0);
  assert(published?.trust === "verbatim" && published.evidence === "approved quote", "review: l'évidence est conservée après promotion");
  const verified = db.verify(approvedReview.memoryId ?? 0, "checked by a human");
  assert(verified?.trust === "verified" && verified.evidence === "checked by a human", "verify: une preuve humaine élève le trust");
  db.close();
}

// 4. Audit is readable and purge removes the content rather than hiding it.
{
  const db = new MemoryDb(path.join(tmpDir, "audit.db"));
  const memory = db.add({ subject: "user", predicate: "has", object: "secret", project: "audit" });
  db.verify(memory.id, "sensitive proof");
  assert(db.purge(memory.id, "test-purge") === true, "purge: suppression confirmée exécutée");
  assert(db.get(memory.id) === null, "purge: le contenu est supprimé de la base");
  const audit = db.auditLog(memory.id, 20);
  assert(audit.some((entry) => entry.reason === "test-purge" && entry.field === "purged"), "audit: la purge laisse une trace sans contenu");
  assert(audit.every((entry) => entry.oldValue === "[redacted]" || entry.oldValue === null), "purge: l'ancien audit est redige");
  db.close();
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(failures === 0 ? "\nGouvernance : tous les tests passent." : `\nGouvernance : ${failures} ECHECS.`);
process.exitCode = failures === 0 ? 0 : 1;
