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

> **AIエージェントのための意味記憶（セマンティックメモリ）** — 大事なことを覚え、忘れるべきことを知っている。
> 1コマンドでインストール。*あらゆる*プロジェクト、*あらゆる*AIで動作する。100%ローカル。

## なぜ？

あなたのAIはセッション間で何もかも忘れてしまいます。`CLAUDE.md` は静的ファイルであり、学習することはできません。
ベクターデータベースは重く、しばしばクラウドホストです。ほとんどの「メモリ」ツールは受動的なストレージにすぎません。
投げ込まれたものを保存するだけで、優先順位付けもせず、矛盾の調整も行いません。

**memsem は違います。** それは引き出しではなく、記憶*システム*です：

- 🧠 **自分で書き込む** — セッション中に、あなたのAIは永続的な事実（好み、決定、制約）を自動的に記録します。「保存するのを忘れないで」はもう不要。
- ⚖️ **優先順位を付ける** — すべての事実は動的な優先度を持ちます（`重要度 × 信頼度 × 新しさ × 頻度`）。コンテキストが窮屈なとき、最も関連性の高い記憶が常に最初に浮かび上がります。
- 🔄 **矛盾を処理する** — 「何年も牛乳を飲んできた…待って、私は乳糖不耐症だ。」古い事実は上書きされません。徐々に*薄れ*、アーカイブされますが、履歴は完全に保持されます。重要度0.9以上の重要事実は保護されます。
- 🔗 **概念を橋渡しする** — オプションのローカル意味索引（お使いのマシン上のOllama）により、`fromage` が共通の単語を一つも持たなくても `lactose` を見つけられます。
- 🕰️ **エピソード記憶を持つ** — 意味的事実の上にセッション要約を重ねます。脳の二つの長期記憶システムのように。
- 🔧 **自己メンテナンスする** — バックグラウンドエージェントが小さな事実をパターンに統合し（「海馬」）、ペアワイズ比較で優先度を再調整します。ただし、検索が*より良く*なる場合に限ります。

## 動作の様子

一度インストールして、動かすだけ。これは使い捨てデータベースでの実際のセッションです — 実際のメモリには一切触れません（`node scripts/demo.mjs`）：

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

## プライバシー — あなたのメモリはあなたのもの

- **100%ローカル** — *あなたの*マシン上の `~/.memory-mcp/memory.db` に保存されます。クラウドなし、テレメトリなし、何もあなたのコンピュータから出て行きません。
- **コミットされない** — データベースはあらゆるリポジトリの外に存在します。公開リポジトリをクローンしても、コードをプッシュしても、スクリーンショットを共有しても、あなたのメモリはあなたのもの。各ユーザーはそれぞれ自分のメモリを持ちます。
- **メモリは*あなた*に付き従います** — プロジェクトには付き従いません。同じデータベースがすべてのリポジトリで共有されます。新しいフォルダを作っても、新しいリポジトリを作っても、メモリはそこにあります。

## インストール

### opencode — 1行

`opencode.json`（プロジェクト、または `~/.config/opencode/opencode.json`）に追加：

```json
{ "plugin": ["memsem"] }
```

これだけです。プラグインはMCPサーバーを登録し、メモリプロトコルとメモリインデックスをすべてのセッションに注入し、必要な権限を付与し、バックグラウンドエージェントを実行します。opencodeを再起動してください。

### Claude Code — 1コマンド

```bash
npx -y memsem setup
```

これでMCPサーバーが登録され（`claude mcp add memory -- npx -y memsem`）、完全なプロトコルを指す「memsem memory」ブロックが `~/.claude/CLAUDE.md` に追加されます。

**またはAIと一緒にインストール**: 次をClaudeに貼り付けるだけ：

> Install the memsem persistent memory: run `npx -y memsem setup`, read `~/.memsem/memory-protocol.md`, and apply the protocol.

### 任意のMCPクライアント

```bash
npx -y memsem
```

サーバーはstdio上でMCPを話します。MCP対応のホストならどれでもそれを指して、AIを自律的にするために `memory-protocol.md` をホストの指示（例: `AGENTS.md`）に注入してください。

### ユニバーサルインストーラー

```bash
npx -y memsem setup        # detects and configures your hosts (opencode, Claude)
npx -y memsem setup --help # see options
```

冪等、安全、元に戻せます（`--uninstall`）。

## 仕組み

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**メモリのライフサイクル** — すべての事実は同じ道筋をたどります：

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

- **原子的な事実** — すべてのメモリは、重要度、信頼度、頻度、タグ、テーマ、出典を持つ `subject → predicate → object` トリプルです。
- **テーマとフォーカス** — 階層的なテーマ（`food/drinks`）がルーティングマップです。テーマによる検索はすべてのプロジェクトを横断します。`focus` リストはセッションのアクティブなテーマをフル優先度に保ちます。
- **動的優先度** — `0.45 × importance + 0.25 × confidence + 0.2 × recency + 0.1 × frequency`。重要事実は繰り返しのパターンに勝ります。
- **ソフトな置き換え** — 矛盾は古い事実を薄め（信頼度が減衰）、閾値を下回るとアーカイブされます。履歴は常に保持されます。
- **意味索引（オプション）** — 各事実はローカルで埋め込み化されます（Ollama経由の `mxbai-embed-large`）。`relax: true` 検索はコサイン類似度（閾値0.5）を加えます。Ollamaがなくても、すべては同じように動作します — 厳密な語彙検索です。

## 比較

| | memsem | `CLAUDE.md` / ノート | mem0 | Zep / Graphiti | 公式memory MCP | メモリとしてのObsidian |
|---|---|---|---|---|---|---|
| セッション中の自動書き込み | ✅ | ❌ | ⚠️ アプリコード経由 | ⚠️ | ❌ | ❌ |
| コンテキスト予算のための優先度 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 矛盾（ソフトな置き換え） | ✅ | ❌ （上書き） | ❌ （上書き） | ❌ | ❌ | ❌ |
| 意味検索、ローカル＆プライベート | ✅ （Ollama） | ❌ | ⚠️ （ベクターDBが必要） | ⚠️ （グラフDBが必要） | ❌ | ⚠️ （プラグイン） |
| エピソード記憶＋自己メンテナンス | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| すべてのリポジトリにまたがる単一メモリ | ✅ | ❌ （プロジェクトごと） | ⚠️ | ⚠️ | ❌ | ⚠️ （ボールト） |
| ゼロ依存、`npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| 人間が読める／編集可能 | ❌ | ✅ | ❌ | ❌ | ✅ （JSON） | ✅ |

## ドキュメント

- [`memory-protocol.md`](memory-protocol.md) — あなたのAIに注入されるプロトコル：メモリを自動的に書き、検索し、維持する方法。
- [`DESIGN.md`](DESIGN.md) — 完全な設計：ビジョン、原則、ラクトースのケーススタディ、ロードマップ。
- [`scripts/demo.mjs`](scripts/demo.mjs) — 上記のデモを使い捨てデータベースで再現。

## ロードマップ

- [x] 意味索引（ローカルOllama埋め込み）
- [x] エピソード記憶＋セッション抽出
- [x] 海馬の統合＋ペアワイズ採点ジャッジ
- [x] ユニバーサルopencodeプラグイン＋`memsem setup`
- [ ] Obsidianブリッジ：メモリを読みやすいマークダウンノートとしてエクスポート／インポート
- [ ] マルチホップグラフ伝播

## ライセンス

MIT — 何にでも自由に使用できます。あなたのメモリはあなたのものです。
