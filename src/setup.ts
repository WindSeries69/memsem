// memsem setup — auto-installation pour n'importe quel hôte IA.
// Usage : npx -y memsem setup [--host opencode|claude|all] [--uninstall]
// opencode : ajoute "memsem" au tableau "plugin" (le plugin configure tout seul).
// claude   : ajoute le serveur MCP `memory` et un pointeur protocole dans CLAUDE.md.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_DIR = join(homedir(), ".memsem");
const OPENCODE_CONFIG = join(homedir(), ".config", "opencode", "opencode.json");
const CLAUDE_HOME = join(homedir(), ".claude");
const CLAUDE_MD = join(CLAUDE_HOME, "CLAUDE.md");

const CLAUDE_BLOCK = `## Mémoire persistante — memsem

Tu disposes du serveur MCP \`memory\` (outils : memory_add, memory_add_many,
memory_search, memory_list, memory_themes, memory_stats, memory_forget,
memory_episode_add, memory_episode_search, memory_score). Lis le protocole
complet \`~/.memsem/memory-protocol.md\` et applique-le : écris automatiquement
les faits durables (thèmes, focus, importance), cherche uniquement quand le
sujet touche une branche de l'index (~/.memsem/memory-index.md).`;

function log(message: string): void {
  console.log(message);
}

function protocolSource(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return [join(here, "..", "memory-protocol.md"), join(here, "memory-protocol.md")].find((p) => existsSync(p)) ?? "";
}

function ensureProtocolInstalled(): void {
  const source = protocolSource();
  if (!source) return;
  mkdirSync(STATE_DIR, { recursive: true });
  const target = join(STATE_DIR, "memory-protocol.md");
  const next = readFileSync(source, "utf8");
  if (!existsSync(target) || readFileSync(target, "utf8") !== next) {
    writeFileSync(target, next);
    log(`  → protocole installé : ${target}`);
  }
}

function setupOpencode(): void {
  let cfg: { plugin?: Array<string | [string, unknown]>; [key: string]: unknown };
  let existed = existsSync(OPENCODE_CONFIG);
  try {
    cfg = existed ? JSON.parse(readFileSync(OPENCODE_CONFIG, "utf8")) : {};
  } catch {
    log("  ✗ opencode.json illisible, laissé intact");
    return;
  }
  if (typeof cfg !== "object" || cfg === null || Array.isArray(cfg)) {
    log("  ✗ opencode.json invalide, laissé intact");
    return;
  }
  cfg.plugin ??= [];
  const hasMemsem = cfg.plugin.some((p) => (Array.isArray(p) ? p[0] : p) === "memsem");
  if (!hasMemsem) {
    cfg.plugin.push("memsem");
    cfg.$schema ??= "https://opencode.ai/config.json";
    mkdirSync(dirname(OPENCODE_CONFIG), { recursive: true });
    writeFileSync(OPENCODE_CONFIG, JSON.stringify(cfg, null, 2) + "\n");
    log(`  → plugin "memsem" ajouté : ${OPENCODE_CONFIG}`);
  } else {
    log("  → plugin memsem déjà présent (rien à faire)");
  }
}

function uninstallOpencode(): void {
  if (!existsSync(OPENCODE_CONFIG)) {
    log("  → aucun opencode.json, rien à retirer");
    return;
  }
  try {
    const cfg = JSON.parse(readFileSync(OPENCODE_CONFIG, "utf8")) as { plugin?: unknown[] };
    if (!Array.isArray(cfg.plugin)) {
      log("  → pas de tableau plugin, rien à retirer");
      return;
    }
    const filtered = cfg.plugin.filter((p) => (Array.isArray(p) ? p[0] : p) !== "memsem");
    if (filtered.length === cfg.plugin.length) {
      log("  → plugin memsem absent, rien à retirer");
      return;
    }
    cfg.plugin = filtered;
    writeFileSync(OPENCODE_CONFIG, JSON.stringify(cfg, null, 2) + "\n");
    log("  → plugin memsem retiré d'opencode.json");
  } catch {
    log("  ✗ opencode.json illisible, laissé intact");
  }
}

function setupClaude(): void {
  ensureProtocolInstalled();
  const claudeBin = spawnSync("which", ["claude"], { encoding: "utf8" }).status === 0;
  if (!claudeBin) {
    log("  → claude CLI introuvable : installe `claude mcp add memory -- npx -y memsem` manuellement");
    return;
  }
  const added = spawnSync("claude", ["mcp", "add", "memory", "--", "npx", "-y", "memsem"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (added.status === 0) log("  → serveur MCP `memory` enregistré (claude)");
  else log(`  → MCP déjà présent ou non ajouté (code ${added.status}) : ${(added.stderr ?? "").trim().slice(0, 200)}`);

  mkdirSync(CLAUDE_HOME, { recursive: true });
  if (!existsSync(CLAUDE_MD)) {
    writeFileSync(CLAUDE_MD, `# Instructions Claude\n\n${CLAUDE_BLOCK}\n`);
    log(`  → CLAUDE.md créé avec le protocole mémoire`);
    return;
  }
  if (readFileSync(CLAUDE_MD, "utf8").includes("Mémoire persistante — memsem")) {
    log("  → CLAUDE.md contient déjà le protocole mémoire (rien à faire)");
    return;
  }
  appendFileSync(CLAUDE_MD, `\n\n${CLAUDE_BLOCK}\n`);
  log("  → protocole mémoire ajouté à ~/.claude/CLAUDE.md");
}

function uninstallClaude(): void {
  const claudeBin = spawnSync("which", ["claude"], { encoding: "utf8" }).status === 0;
  if (claudeBin) {
    const removed = spawnSync("claude", ["mcp", "remove", "memory"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (removed.status === 0) log("  → serveur MCP `memory` retiré (claude)");
    else log("  → MCP memory absent ou non retiré");
  }
  if (existsSync(CLAUDE_MD)) {
    const content = readFileSync(CLAUDE_MD, "utf8");
    const marker = "## Mémoire persistante — memsem";
    const at = content.indexOf(marker);
    if (at !== -1) {
      const after = content.indexOf("\n## ", at + marker.length);
      const end = after === -1 ? content.length : after;
      const cleaned = (content.slice(0, at) + content.slice(end)).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
      writeFileSync(CLAUDE_MD, cleaned);
      log("  → bloc memsem retiré de CLAUDE.md");
    }
  }
}

const HELP = `memsem setup — installe la mémoire persistante pour votre hôte IA.

Usage :
  npx -y memsem setup [options]

Options :
  --host <opencode|claude|all>   hôte à configurer (défaut: all — configure ce qui est détecté)
  --uninstall                    retire l'installation
  -h, --help                     affiche cette aide

Ce que ça fait :
  opencode → ajoute le plugin "memsem" à ~/.config/opencode/opencode.json
             (le plugin enregistre le serveur MCP, injecte le protocole et
             l'index, autorise ~/.memsem/** et pilote l'extraction de fond)
  claude   → claude mcp add memory -- npx -y memsem
             + protocole mémoire ajouté à ~/.claude/CLAUDE.md
`;

export async function runSetup(args: string[]): Promise<void> {
  const help = args.includes("-h") || args.includes("--help");
  if (help) {
    log(HELP);
    return;
  }
  const uninstall = args.includes("--uninstall");
  const hostArg = args.find((a) => a.startsWith("--host="))?.slice("--host=".length)
    ?? (args.includes("--host") ? args[args.indexOf("--host") + 1] : undefined)
    ?? "all";
  const hosts = hostArg === "all" ? ["opencode", "claude"] : [hostArg];

  if (uninstall) {
    log("Désinstallation memsem…");
    for (const host of hosts) {
      if (host === "opencode") uninstallOpencode();
      if (host === "claude") uninstallClaude();
    }
    log("Fait. Redémarrez vos hôtes IA pour que la configuration soit rechargée.");
    return;
  }

  log("Installation memsem…");
  ensureProtocolInstalled();
  for (const host of hosts) {
    log(`[${host}]`);
    if (host === "opencode") setupOpencode();
    if (host === "claude") setupClaude();
  }
  log("Fait.");
  log("→ opencode : redémarrez-le. Claude Code : relancez la session.");
  if (hosts.includes("opencode")) {
    log("→ Astuce : le plugin memsem configure tout (MCP, protocole, index, permissions).");
  }
}
