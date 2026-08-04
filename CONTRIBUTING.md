# Contributing to memsem

Thanks for helping! memsem is a small, focused project — every contribution counts.

## Development

```bash
git clone https://github.com/WindSeries69/memsem.git
cd memsem
npm install
npm run build     # tsc → dist/ + regenerates opencode-plugin/memsem-extract.ts
npm test          # build + integration/durability/governance suites (temp DB)
```

Requirements: Node >= 22.13. Tests run fully offline (no Ollama needed).

## Project layout

| Path | What it is |
| --- | --- |
| `src/index.ts` | MCP server entry (also dispatches `memsem setup`) |
| `src/db.ts` | SQLite layer: facts, supersession, graph, themes, episodes, evidence, temporal scope |
| `src/scoring.ts` | Priority rules (pure functions) |
| `src/embed.ts` | Optional semantic index (Ollama) |
| `src/plugin.ts` | Universal opencode plugin (MCP + instructions + background agents) |
| `src/setup.ts` | `memsem setup` / `--uninstall` |
| `src/test/client-test.ts` | Integration tests over real MCP transport |
| `src/test/governance-test.ts` | Adverse-case tests: scope, review, suppression, purge, audit, asOf |
| `scripts/demo.mjs` | Reproducible demo on a throwaway database |

## Important design rules

- **The memory is the user's data.** Never commit `~/.memory-mcp` or `~/.memsem`
  contents, never send data anywhere. Tests and demos must use a temporary
  `MEMORY_DB_PATH` (and `MEMSEMS_INDEX_PATH` — the server rewrites the index at
  startup).
- **Soft supersession, not overwrite.** Contradictions fade the old fact; history
  is always kept. Critical facts (importance ≥ 0.9) and pinned memories are protected.
- **`opencode-plugin/memsem-extract.ts` is generated** by `npm run build`
  (copied from `src/plugin.ts`). Don't edit it by hand — edit `src/plugin.ts`.
- **Protocol docs** (`memory-protocol.md`, READMEs) must stay in sync with behavior.
  The README is translated into 16 languages — add a translation if yours is
  missing, keep structure identical (only prose translated).

## Submitting changes

1. Branch, change, `npm test` green.
2. `npm run build` and commit the regenerated plugin file if it changed.
3. PR with a short description of the change and why.
4. CI (Node 22 + 24) must pass.

## Translation policy

- `README.md` (English) is the source of truth. `README.<lang>.md` files mirror it:
  keep the exact same structure, translate only prose, keep code blocks, links,
  commands, tool names and the demo output verbatim, and keep the language
  selector (flags) block at the top in sync with the list in `README.md`.

## License

MIT — by contributing, you agree your changes are licensed MIT.
