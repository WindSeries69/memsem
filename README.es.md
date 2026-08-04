<p align="center">
  🌍 <strong>Languages:</strong>
  <a href="README.md">🇬🇧 English</a> ·
  <a href="README.fr.md">🇫🇷 Français</a> ·
  <a href="README.de.md">🇩🇪 Deutsch</a> ·
  <a href="README.es.md">🇪🇸 Español</a> ·
  <a href="README.it.md">🇮🇹 Italiano</a> ·
  <a href="README.pt.md">🇵🇹 Português</a> ·
  <a href="README.nl.md">🇳🇱 Nederlands</a> ·
  <a href="README.ru.md">🇷🇺 Русский</a> ·
  <a href="README.ja.md">🇯🇵 日本語</a> ·
  <a href="README.zh.md">🇨🇳 中文</a> ·
  <a href="README.ko.md">🇰🇷 한국어</a> ·
  <a href="README.pl.md">🇵🇱 Polski</a> ·
  <a href="README.tr.md">🇹🇷 Türkçe</a> ·
  <a href="README.uk.md">🇺🇦 Українська</a> ·
  <a href="README.hi.md">🇮🇳 हिन्दी</a> ·
  <a href="README.vi.md">🇻🇳 Tiếng Việt</a>
</p>

<p align="center">
  <img src="assets/hero.svg" alt="memsem — semantic memory for AI agents" width="900">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memsem"><img src="https://img.shields.io/npm/v/memsem" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/memsem" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22.13-339933" alt="Node >= 22.13">
  <img src="https://img.shields.io/badge/MCP-server-1f1f1f" alt="MCP server">
  <img src="https://img.shields.io/badge/opencode-plugin-000" alt="opencode plugin">
</p>

> **Memoria semántica para agentes de IA** — recuerda lo que importa, sabe qué olvidar.
> Un solo comando para instalar. Funciona en *cualquier* proyecto, para *cualquier* IA. 100 % local.

## ¿Por qué?

Tu IA lo olvida todo entre sesiones. `CLAUDE.md` es un archivo estático — no puede aprender.
Las bases de datos vectoriales son pesadas y suelen estar alojadas en la nube. La mayoría de las herramientas de "memoria" son almacenamiento pasivo:
guardan lo que les lanzas, nunca priorizan, nunca concilian las contradicciones.

**memsem es diferente.** Es un *sistema* de memoria, no un cajón:

- 🧠 **Se escribe a sí mismo** — durante una sesión, tu IA registra hechos duraderos (preferencias, decisiones, restricciones) automáticamente. Se acabó el "recuerda guardar esto".
- ⚖️ **Prioriza** — cada hecho tiene una prioridad dinámica (`importancia × confianza × recencia × frecuencia`). Cuando el contexto es limitado, las memorias más relevantes siempre salen primero.
- 🔄 **Gestiona las contradicciones** — "He bebido leche durante años… espera, soy intolerante a la lactosa". El hecho antiguo no se sobrescribe: *se desvanece* progresivamente y se archiva, conservando todo el historial. Los hechos críticos (importancia ≥ 0.9) están protegidos.
- 🔗 **Conecta conceptos** — un índice semántico local opcional (Ollama, en tu máquina) permite que `fromage` encuentre `lactose` sin compartir ni una sola palabra.
- 🕰️ **Tiene memoria episódica** — resúmenes de sesiones además de los hechos semánticos, como los dos sistemas de memoria a largo plazo del cerebro.
- 🔧 **Se mantiene a sí mismo** — agentes en segundo plano consolidan los hechos pequeños en patrones (el "hipocampo") y recalibran las prioridades mediante comparación por pares, solo cuando hace que la memoria sea *mejor de buscar*.

## Verlo en acción

Instala una vez, déjalo funcionar. Esta es una sesión real sobre una base de datos desechable — tu memoria real nunca se toca (`node scripts/demo.mjs`):

```
=== memsem — demo on a temporary database ===
(your real memory in ~/.memory-mcp stays untouched)

1. The AI writes durable facts (memory_add_many)
   → 4 facts written

2. Strict search (lexical): memory_search { query: 'milk' }
   → user → drinks → milk

3. Semantic search (relax, local embeddings): memory_search { query: 'cheese', relax: true }
   No shared word with « lactose » — the local semantic index (Ollama) bridges it
   → lactose → is-present-in → cheese, yogurt, cream
   → user → is-intolerant-to → lactose
   → user → drinks → milk

4. Soft supersession: the AI learns you no longer drink milk
   → conflict: true, old fact faded (faded: [1])

5. Search now returns the current fact
   → user → drinks → no more milk (lactose intolerant)
   → user → drinks → milk

Stats: 5 active memories, semantic index OK (mxbai-embed-large)
```

## Privacidad — tu memoria es tuya

- **100 % local** — se almacena en `~/.memory-mcp/memory.db` en *tu* máquina. Sin nube, sin telemetría, nada sale de tu ordenador.
- **Nunca se hace commit** — la base de datos vive fuera de todos los repositorios. Clona un repositorio público, haz push de código, comparte capturas de pantalla: tu memoria se queda contigo. Cada usuario tiene su propia memoria.
- **La memoria te sigue a *ti***, no a tus proyectos — la misma base se comparte en todos tus repositorios. Crea una carpeta nueva, un repositorio nuevo: la memoria sigue ahí.

## Instalación

### opencode — una línea

Añádelo a `opencode.json` (del proyecto o `~/.config/opencode/opencode.json`):

```json
{ "plugin": ["memsem"] }
```

Eso es todo. El plugin registra el servidor MCP, inyecta el protocolo de memoria y el índice de memoria en cada sesión, concede los permisos necesarios y ejecuta los agentes en segundo plano. Reinicia opencode.

### Claude Code — un comando

```bash
npx -y memsem setup
```

Esto registra el servidor MCP (`claude mcp add memory -- npx -y memsem`) y añade un bloque "memsem memory" a `~/.claude/CLAUDE.md` que apunta al protocolo completo.

**O instálalo con IA**: simplemente pega en Claude:

> Instala la memoria persistente de memsem: ejecuta `npx -y memsem setup`, lee `~/.memsem/memory-protocol.md` y aplica el protocolo.

### Cualquier cliente MCP

```bash
npx -y memsem
```

El servidor habla MCP sobre stdio. Apunta cualquier host compatible con MCP hacia él e inyecta `memory-protocol.md` en las instrucciones del host (p. ej. como `AGENTS.md`) para que la IA sea autónoma.

### Instalador universal

```bash
npx -y memsem setup        # detecta y configura tus hosts (opencode, Claude)
npx -y memsem setup --help # consulta las opciones
```

Idempotente, seguro y reversible (`--uninstall`).

## Cómo funciona

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**El ciclo de vida de la memoria** — cada hecho sigue el mismo camino:

```mermaid
flowchart LR
    W["memory_add — subject → predicate → object"] --> R["repeated → confidence ↑ frequency ↑"]
    W --> P["priority = f(importance, confidence, recency, frequency)"]
    R --> S{"contradiction?"}
    S -- yes --> F["old fact fades progressively"]
    F --> A["archived — history always kept"]
    S -- no --> K["kept, reinforced"]
    A --> J["pinned & critical (≥ 0.9) are protected"]
```

- **Hechos atómicos** — cada memoria es un triple `subject → predicate → object` con importancia, confianza, frecuencia, etiquetas, tema y procedencia.
- **Temas y focus** — los temas jerárquicos (`food/drinks`) son el mapa de enrutamiento; una búsqueda por tema cruza todos los proyectos. La lista `focus` mantiene los temas activos de la sesión a plena prioridad.
- **Prioridad dinámica** — `0.45 × importancia + 0.25 × confianza + 0.2 × recencia + 0.1 × frecuencia`. Un hecho crítico vence a un patrón recurrente.
- **Sustitución suave** — las contradicciones desvanecen el hecho antiguo (la confianza decae) hasta que se archiva por debajo de un umbral. El historial siempre se conserva.
- **Índice semántico (opcional)** — cada hecho se incrusta localmente (`mxbai-embed-large` vía Ollama); las búsquedas con `relax: true` añaden similitud coseno (umbral 0.5). Sin Ollama, todo funciona de manera idéntica — búsqueda léxica estricta.

## Comparación

| | memsem | `CLAUDE.md` / notas | mem0 | Zep / Graphiti | MCP de memoria oficial | Obsidian como memoria |
|---|---|---|---|---|---|---|
| Autoescritura durante las sesiones | ✅ | ❌ | ⚠️ mediante código de app | ⚠️ | ❌ | ❌ |
| Prioridad para el presupuesto de contexto | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Contradicciones (sustitución suave) | ✅ | ❌ (sobrescribe) | ❌ (sobrescribe) | ❌ | ❌ | ❌ |
| Búsqueda semántica, local y privada | ✅ (Ollama) | ❌ | ⚠️ (necesita base vectorial) | ⚠️ (necesita base de grafos) | ❌ | ⚠️ (plugins) |
| Memoria episódica + automantenimiento | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Una memoria en todos tus repositorios | ✅ | ❌ (por proyecto) | ⚠️ | ⚠️ | ❌ | ⚠️ (vault) |
| Cero dependencias, `npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Legible / editable por humanos | ❌ | ✅ | ❌ | ❌ | ✅ (JSON) | ✅ |

## Documentación

- [`memory-protocol.md`](memory-protocol.md) — el protocolo inyectado en tu IA: cómo escribe, busca y mantiene la memoria automáticamente.
- [`DESIGN.md`](DESIGN.md) — diseño completo: visión, principios, el caso de estudio de la lactosa, hoja de ruta.
- [`scripts/demo.mjs`](scripts/demo.mjs) — reproduce la demo anterior en una base de datos desechable.

## Hoja de ruta

- [x] Índice semántico (embeddings locales de Ollama)
- [x] Memoria episódica + extracción de sesiones
- [x] Consolidación del hipocampo + juez de puntuación por pares
- [x] Plugin universal de opencode + `memsem setup`
- [ ] Puente con Obsidian: exportar/importar la memoria como notas markdown legibles
- [ ] Propagación de grafos multi-salto

## Licencia

MIT — libre para cualquier uso. Tu memoria sigue siendo tuya.
