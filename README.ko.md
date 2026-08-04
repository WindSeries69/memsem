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

> **AI 에이전트를 위한 의미론적 메모리** — 중요한 것을 기억하고, 잊어야 할 것을 안다.
> 설치 명령 하나면 끝. *모든* 프로젝트에서, *모든* AI에서 동작한다. 100% 로컬.

## 왜 필요한가?

당신의 AI는 세션 사이에 모든 것을 잊어버린다. `CLAUDE.md`는 정적인 파일일 뿐 — 배울 수 없다.
벡터 데이터베이스는 무겁고 대부분 클라우드에 호스팅된다. 대부분의 "메모리" 도구는 수동 저장에 불과하다:
던져주는 것을 보관할 뿐, 우선순위를 매기지 않고 모순을 조정하지 않는다.

**memsem은 다르다.** 서랍이 아니라 메모리 *시스템*이다:

- 🧠 **스스로 기록한다** — 세션 중에 AI가 지속적인 사실(선호, 결정, 제약)을 자동으로 기록한다. 더 이상 "이거 저장해 둬"라고 말할 필요 없다.
- ⚖️ **우선순위를 매긴다** — 모든 사실에는 동적 우선순위(`중요도 × 신뢰도 × 최신성 × 빈도`)가 있다. 컨텍스트가 빠듯할 때 가장 관련성 높은 기억이 항상 먼저 떠오른다.
- 🔄 **모순을 처리한다** — "몇 년째 우유를 마시고 있었는데… 잠깐, 나는 유당 불내증이잖아." 이전 사실은 덮어써지지 않는다: 점진적으로 *희미해지며* 아카이브되고, 전체 이력이 보존된다. 중요 사실(중요도 ≥ 0.9)은 보호된다.
- 🔗 **개념을 연결한다** — 선택적인 로컬 의미 인덱스(내 컴퓨터의 Ollama) 덕분에 `fromage`가 공유 단어 하나 없이도 `lactose`를 찾을 수 있다.
- 🕰️ **일화 기억이 있다** — 의미론적 사실 위에 세션 요약을 쌓는다. 뇌의 두 가지 장기 기억 시스템처럼.
- 🔧 **스스로 유지보수한다** — 백그라운드 에이전트가 작은 사실들을 패턴으로 통합하고("해마"), 쌍대 비교로 우선순위를 재보정한다. 오직 메모리를 *검색하기 더 좋게* 만들 때만.

## 동작 확인

한 번 설치하고 그냥 실행해라. 아래는 일회용 데이터베이스에서 실행한 실제 세션이다 — 실제 메모리는 건드리지 않는다(`node scripts/demo.mjs`):

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

## 프라이버시 — 당신의 기억은 당신의 것

- **100% 로컬** — *당신의* 머신에 있는 `~/.memory-mcp/memory.db`에 저장된다. 클라우드 없음, 원격 측정 없음, 어떤 것도 컴퓨터 밖으로 나가지 않는다.
- **절대 커밋되지 않는다** — 데이터베이스는 모든 저장소 외부에 존재한다. 공개 저장소를 클론하고, 코드를 푸시하고, 스크린샷을 공유해도: 기억은 당신 곁에 남는다. 각 사용자는 자신만의 메모리를 가진다.
- **메모리는 프로젝트가 아니라 *당신을* 따른다** — 같은 베이스가 모든 저장소에서 공유된다. 새 폴더를 만들고, 새 저장소를 만들어도: 메모리는 그대로 있다.

## 설치

### opencode — 한 줄

`opencode.json`에 추가한다(프로젝트 또는 `~/.config/opencode/opencode.json`):

```json
{ "plugin": ["memsem"] }
```

끝이다. 플러그인이 MCP 서버를 등록하고, 메모리 프로토콜과 메모리 인덱스를 모든 세션에 주입하고, 필요한 권한을 부여하고, 백그라운드 에이전트를 실행한다. opencode를 재시작하면 된다.

### Claude Code — 명령 하나

```bash
npx -y memsem setup
```

이 명령이 MCP 서버를 등록하고(`claude mcp add memory -- npx -y memsem`) 전체 프로토콜을 가리키는 "memsem memory" 블록을 `~/.claude/CLAUDE.md`에 추가한다.

**또는 AI로 설치한다**: Claude에 그냥 붙여넣기만 하면 된다:

> Install the memsem persistent memory: run `npx -y memsem setup`, read `~/.memsem/memory-protocol.md`, and apply the protocol.

### 모든 MCP 클라이언트

```bash
npx -y memsem
```

서버는 stdio를 통해 MCP를 구사한다. MCP를 지원하는 어떤 호스트든 여기에 연결하고, `memory-protocol.md`를 호스트의 지시문(예: `AGENTS.md`)에 주입하면 AI가 자율적으로 동작한다.

### 범용 설치 프로그램

```bash
npx -y memsem setup        # detects and configures your hosts (opencode, Claude)
npx -y memsem setup --help # see options
```

멱등적이고, 안전하며, 되돌릴 수 있다(`--uninstall`).

## 동작 원리

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**메모리 수명주기** — 모든 사실은 같은 경로를 따른다:

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

- **원자적 사실** — 모든 기억은 중요도, 신뢰도, 빈도, 태그, 테마, 출처를 가진 `주체 → 술어 → 객체` 트리플이다.
- **테마 & 포커스** — 계층적 테마(`food/drinks`)가 라우팅 맵이다; 테마로 검색하면 모든 프로젝트를 가로지른다. `focus` 목록은 세션의 활성 테마를 최고 우선순위로 유지한다.
- **동적 우선순위** — `0.45 × importance + 0.25 × confidence + 0.2 × recency + 0.1 × frequency`. 중요 사실이 반복 패턴을 이긴다.
- **소프트 대체** — 모순이 생기면 이전 사실이 (신뢰도가 감소하면서) 희미해져 임계값 아래로 내려가면 아카이브된다. 이력은 항상 보존된다.
- **의미 인덱스(선택)** — 각 사실이 로컬에 임베딩된다(`mxbai-embed-large`, Ollama 경유); `relax: true` 검색은 코사인 유사도(임계값 0.5)를 더한다. Ollama가 없어도 모든 것이 동일하게 동작한다 — 엄격한 어휘 검색.

## 비교

| | memsem | `CLAUDE.md` / notes | mem0 | Zep / Graphiti | official memory MCP | Obsidian as memory |
|---|---|---|---|---|---|---|
| 세션 중 자동 기록 | ✅ | ❌ | ⚠️ 앱 코드 필요 | ⚠️ | ❌ | ❌ |
| 컨텍스트 예산을 위한 우선순위 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 모순 처리(소프트 대체) | ✅ | ❌ (덮어씀) | ❌ (덮어씀) | ❌ | ❌ | ❌ |
| 의미 검색, 로컬 & 프라이빗 | ✅ (Ollama) | ❌ | ⚠️ (벡터 DB 필요) | ⚠️ (그래프 DB 필요) | ❌ | ⚠️ (플러그인) |
| 일화 기억 + 자체 유지보수 | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| 모든 저장소에 걸친 단일 메모리 | ✅ | ❌ (프로젝트별) | ⚠️ | ⚠️ | ❌ | ⚠️ (볼트) |
| 의존성 제로, `npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| 사람이 읽고 편집 가능 | ❌ | ✅ | ❌ | ❌ | ✅ (JSON) | ✅ |

## 문서

- [`memory-protocol.md`](memory-protocol.md) — 당신의 AI에 주입되는 프로토콜: 기록, 검색, 자동 유지보수 방법.
- [`DESIGN.md`](DESIGN.md) — 전체 설계: 비전, 원칙, 유당 불내증 사례 연구, 로드맵.
- [`scripts/demo.mjs`](scripts/demo.mjs) — 위 데모를 일회용 데이터베이스에서 재현한다.

## 로드맵

- [x] 의미 인덱스(로컬 Ollama 임베딩)
- [x] 일화 기억 + 세션 추출
- [x] 해마 통합 + 쌍대 비교 점수 판정기
- [x] 범용 opencode 플러그인 + `memsem setup`
- [ ] Obsidian 브리지: 메모리를 읽을 수 있는 마크다운 노트로 내보내기/가져오기
- [ ] 다중 홉 그래프 전파

## 라이선스

MIT — 어떤 용도로든 자유롭게. 당신의 기억은 당신의 것이다.
