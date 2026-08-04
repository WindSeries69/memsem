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

> **面向 AI 智能体的语义记忆** —— 记住重要的，懂得该忘的。
> 一条命令即可安装。适用于*每个*项目，适配*每个* AI。100% 本地运行。

## 为什么？

你的 AI 在会话之间会遗忘一切。`CLAUDE.md` 是静态文件 —— 它无法学习。
向量数据库笨重且大多托管在云端。大多数"记忆"工具只是被动存储：
它们保存你扔进去的东西，从不排序，从不调和矛盾。

**memsem 与众不同。** 它是一个记忆*系统*，而不是一个抽屉：

- 🧠 **自动写入** —— 在会话期间，你的 AI 会自动记录持久性事实（偏好、决策、约束）。不再需要"记得保存这个"。
- ⚖️ **自动排序** —— 每个事实都有动态优先级（`importance × confidence × recency × frequency`）。当上下文紧张时，最相关的记忆总是最先浮现。
- 🔄 **处理矛盾** —— "我喝牛奶喝了好多年……等等，我乳糖不耐受。"旧事实不会被覆盖：它会逐渐*淡出*并归档，完整历史得以保留。关键事实（importance ≥ 0.9）受到保护。
- 🔗 **概念桥接** —— 可选的本地语义索引（Ollama，运行在你的机器上）能让 `fromage` 找到 `lactose`，即使两者没有一个共同词。
- 🕰️ **拥有情景记忆** —— 在语义事实之上叠加会话摘要，就像大脑的两套长期记忆系统。
- 🔧 **自我维护** —— 后台智能体将小事实整合为模式（"海马体"），并通过两两比较重新校准优先级，仅在让记忆*更好检索*时进行。

## 亲眼看看

安装一次，让它运行。这是在一个临时数据库上的真实会话 —— 你的真实记忆绝不会被触碰（`node scripts/demo.mjs`）：

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

## 隐私 —— 记忆属于你

- **100% 本地** —— 存储在你机器上的 `~/.memory-mcp/memory.db` 中。无云端、无遥测、任何数据都不会离开你的电脑。
- **永不提交** —— 数据库位于所有仓库之外。克隆公共仓库、推送代码、分享截图：记忆始终留在你身边。每个用户拥有自己的记忆。
- **记忆跟随*你***，而不是你的项目 —— 同一个数据库在你所有仓库之间共享。新建文件夹、新建仓库：记忆依然还在。

## 安装

### opencode —— 一行搞定

添加到 `opencode.json`（项目级或 `~/.config/opencode/opencode.json`）：

```json
{ "plugin": ["memsem"] }
```

就这样。插件会注册 MCP 服务器，将记忆协议和记忆索引注入每一次会话，授予所需权限，并运行后台智能体。重启 opencode。

### Claude Code —— 一条命令

```bash
npx -y memsem setup
```

这会注册 MCP 服务器（`claude mcp add memory -- npx -y memsem`），并向 `~/.claude/CLAUDE.md` 添加指向完整协议的 "memsem memory" 区块。

**或者让 AI 来安装**：直接把下面这段话粘贴给 Claude：

> 安装 memsem 持久记忆：运行 `npx -y memsem setup`，阅读 `~/.memsem/memory-protocol.md`，然后应用该协议。

### 任何 MCP 客户端

```bash
npx -y memsem
```

服务器通过 stdio 使用 MCP 协议通信。将任意支持 MCP 的主机指向它，并把 `memory-protocol.md` 注入主机的指令（例如作为 `AGENTS.md`），即可让 AI 自主工作。

### 通用安装器

```bash
npx -y memsem setup        # 自动检测并配置你的主机（opencode、Claude）
npx -y memsem setup --help # 查看选项
```

幂等、安全、可逆（`--uninstall`）。

## 工作原理

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**记忆生命周期** —— 每个事实都遵循相同的路径：

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

- **原子化事实** —— 每条记忆都是一个 `subject → predicate → object` 三元组，带有 importance、confidence、frequency、tags、theme、provenance 属性。
- **主题与焦点** —— 层级化主题（`food/drinks`）就是路由地图；按主题搜索会跨越所有项目。`focus` 列表让会话的活跃主题始终保持完整优先级。
- **动态优先级** —— `0.45 × importance + 0.25 × confidence + 0.2 × recency + 0.1 × frequency`。关键事实胜过反复出现的模式。
- **软性更替** —— 矛盾会让旧事实淡出（confidence 衰减），直到低于阈值被归档。历史永远保留。
- **语义索引（可选）** —— 每个事实在本地嵌入（通过 Ollama 使用 `mxbai-embed-large`）；`relax: true` 搜索会增加余弦相似度（阈值 0.5）。没有 Ollama 时，一切照常工作 —— 严格词汇搜索。

## 对比

| | memsem | `CLAUDE.md` / 笔记 | mem0 | Zep / Graphiti | 官方记忆 MCP | 用 Obsidian 当记忆 |
|---|---|---|---|---|---|---|
| 会话期间自动写入 | ✅ | ❌ | ⚠️ 需应用代码 | ⚠️ | ❌ | ❌ |
| 为上下文预算排序 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 矛盾处理（软性更替） | ✅ | ❌（覆盖） | ❌（覆盖） | ❌ | ❌ | ❌ |
| 语义搜索，本地且私有 | ✅（Ollama） | ❌ | ⚠️（需向量数据库） | ⚠️（需图数据库） | ❌ | ⚠️（插件） |
| 情景记忆 + 自我维护 | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| 所有仓库共用一个记忆 | ✅ | ❌（按项目） | ⚠️ | ⚠️ | ❌ | ⚠️（库 vault） |
| 零依赖，`npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| 人类可读 / 可编辑 | ❌ | ✅ | ❌ | ❌ | ✅（JSON） | ✅ |

## 文档

- [`memory-protocol.md`](memory-protocol.md) —— 注入到你的 AI 中的协议：它如何自动写入、搜索和维护记忆。
- [`DESIGN.md`](DESIGN.md) —— 完整设计：愿景、原则、乳糖案例研究、路线图。
- [`scripts/demo.mjs`](scripts/demo.mjs) —— 在临时数据库上复现上面的演示。

## 路线图

- [x] 语义索引（本地 Ollama 嵌入）
- [x] 情景记忆 + 会话提取
- [x] 海马体整合 + 两两评分裁判
- [x] 通用 opencode 插件 + `memsem setup`
- [ ] Obsidian 桥接：将记忆导出/导入为可读的 markdown 笔记
- [ ] 多跳图传播

## 许可证

MIT —— 可自由用于任何用途。你的记忆始终属于你。
