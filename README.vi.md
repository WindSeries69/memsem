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

> **Bộ nhớ ngữ nghĩa cho các tác nhân AI** — ghi nhớ những gì quan trọng, biết cách quên.
> Một lệnh để cài đặt. Hoạt động trong *mọi* dự án, cho *mọi* AI. 100% cục bộ.

## Tại sao?

AI của bạn quên mọi thứ giữa các phiên làm việc. `CLAUDE.md` là một tệp tĩnh — nó không thể học hỏi.
Các cơ sở dữ liệu vector thì nặng nề và thường chạy trên đám mây. Hầu hết các công cụ "bộ nhớ" chỉ là nơi lưu trữ thụ động:
chúng giữ những gì bạn ném vào, không bao giờ ưu tiên, không bao giờ dung hòa các mâu thuẫn.

**memsem thì khác.** Đây là một *hệ thống* bộ nhớ, không phải một ngăn kéo:

- 🧠 **Tự ghi** — trong một phiên, AI của bạn tự động ghi lại các sự kiện bền vững (sở thích, quyết định, ràng buộc). Không còn kiểu "nhớ lưu cái này nhé".
- ⚖️ **Ưu tiên hóa** — mỗi sự kiện có một mức ưu tiên động (`importance × confidence × recency × frequency`). Khi ngữ cảnh chật hẹp, những ký ức liên quan nhất luôn hiện lên đầu tiên.
- 🔄 **Xử lý mâu thuẫn** — "Tôi đã uống sữa nhiều năm… khoan, tôi bất dung nạp lactose." Sự kiện cũ không bị ghi đè: nó *mờ dần* một cách tiến dần rồi được lưu trữ, với toàn bộ lịch sử được giữ nguyên. Các sự kiện quan trọng (importance ≥ 0.9) được bảo vệ.
- 🔗 **Kết nối các khái niệm** — một chỉ mục ngữ nghĩa cục bộ tùy chọn (Ollama, trên máy của bạn) giúp `fromage` tìm thấy `lactose` mà không cần một từ chung nào.
- 🕰️ **Có ký ức tình tiết (episodic)** — tóm tắt phiên nằm trên các sự kiện ngữ nghĩa, giống như hai hệ thống trí nhớ dài hạn của não bộ.
- 🔧 **Tự bảo trì** — các tác nhân nền gộp các sự kiện nhỏ thành các khuôn mẫu ("hippocampus") và hiệu chỉnh lại mức ưu tiên bằng cách so sánh từng cặp, chỉ khi điều đó làm cho bộ nhớ *dễ tìm kiếm hơn*.

## Xem cách hoạt động

Cài đặt một lần, để nó tự chạy. Đây là một phiên thực trên cơ sở dữ liệu dùng một lần — bộ nhớ thật của bạn không bao giờ bị động đến (`node scripts/demo.mjs`):

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

## Quyền riêng tư — bộ nhớ là của bạn

- **100% cục bộ** — được lưu trong `~/.memory-mcp/memory.db` trên *chính* máy của bạn. Không có đám mây, không có telemetry, không có gì rời khỏi máy tính của bạn.
- **Không bao giờ được commit** — cơ sở dữ liệu nằm bên ngoài mọi kho lưu trữ. Clone một repo công khai, push mã, chia sẻ ảnh chụp màn hình: bộ nhớ vẫn ở với bạn. Mỗi người dùng có bộ nhớ riêng của mình.
- **Bộ nhớ đi theo *bạn***, không phải theo dự án — cùng một cơ sở được chia sẻ trên mọi repo của bạn. Tạo một thư mục mới, một repo mới: bộ nhớ vẫn còn đó.

## Cài đặt

### opencode — một dòng

Thêm vào `opencode.json` (dự án hoặc `~/.config/opencode/opencode.json`):

```json
{ "plugin": ["memsem"] }
```

Xong. Plugin đăng ký máy chủ MCP, tiêm giao thức bộ nhớ và chỉ mục bộ nhớ vào mọi phiên, cấp các quyền cần thiết và chạy các tác nhân nền. Khởi động lại opencode.

### Claude Code — một lệnh

```bash
npx -y memsem setup
```

Lệnh này đăng ký máy chủ MCP (`claude mcp add memory -- npx -y memsem`) và thêm một khối "memsem memory" vào `~/.claude/CLAUDE.md` trỏ tới giao thức đầy đủ.

**Hoặc cài đặt bằng AI**: chỉ cần dán đoạn sau vào Claude:

> Cài đặt bộ nhớ bền vững memsem: chạy `npx -y memsem setup`, đọc `~/.memsem/memory-protocol.md` và áp dụng giao thức.

### Mọi máy khách MCP

```bash
npx -y memsem
```

Máy chủ nói giao thức MCP qua stdio. Trỏ bất kỳ máy chủ tương thích MCP nào vào nó và tiêm `memory-protocol.md` vào phần hướng dẫn của máy chủ (ví dụ dưới dạng `AGENTS.md`) để AI tự chủ.

### Trình cài đặt phổ quát

```bash
npx -y memsem setup        # detects and configures your hosts (opencode, Claude)
npx -y memsem setup --help # see options
```

Idempotent, an toàn, có thể hoàn tác (`--uninstall`).

## Cách hoạt động

<p align="center">
  <img src="assets/architecture.svg" alt="memsem architecture" width="920">
</p>

**Vòng đời của bộ nhớ** — mọi sự kiện đều đi theo cùng một con đường:

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

- **Sự kiện nguyên tử** — mọi ký ức là một bộ ba `subject → predicate → object` kèm mức độ quan trọng, độ tin cậy, tần suất, thẻ, chủ đề, nguồn gốc.
- **Chủ đề & tiêu điểm (focus)** — các chủ đề phân cấp (`food/drinks`) là bản đồ định tuyến; tìm kiếm theo chủ đề đi xuyên qua mọi dự án. Danh sách `focus` giữ các chủ đề đang hoạt động của phiên ở mức ưu tiên tối đa.
- **Ưu tiên động** — `0.45 × importance + 0.25 × confidence + 0.2 × recency + 0.1 × frequency`. Một sự kiện quan trọng đánh bại một khuôn mẫu lặp lại.
- **Thay thế mềm (soft supersession)** — các mâu thuẫn làm mờ sự kiện cũ (độ tin cậy suy giảm) cho đến khi nó được lưu trữ dưới một ngưỡng. Lịch sử luôn được giữ.
- **Chỉ mục ngữ nghĩa (tùy chọn)** — mỗi sự kiện được nhúng cục bộ (`mxbai-embed-large` qua Ollama); tìm kiếm `relax: true` thêm độ tương đồng cosine (ngưỡng 0.5). Không có Ollama, mọi thứ vẫn hoạt động y hệt — tìm kiếm từ vựng nghiêm ngặt.

## So sánh

| | memsem | `CLAUDE.md` / notes | mem0 | Zep / Graphiti | official memory MCP | Obsidian as memory |
|---|---|---|---|---|---|---|
| Tự ghi trong các phiên | ✅ | ❌ | ⚠️ qua mã ứng dụng | ⚠️ | ❌ | ❌ |
| Ưu tiên cho ngân sách ngữ cảnh | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mâu thuẫn (thay thế mềm) | ✅ | ❌ (ghi đè) | ❌ (ghi đè) | ❌ | ❌ | ❌ |
| Tìm kiếm ngữ nghĩa, cục bộ & riêng tư | ✅ (Ollama) | ❌ | ⚠️ (cần vector DB) | ⚠️ (cần graph DB) | ❌ | ⚠️ (plugin) |
| Ký ức tình tiết + tự bảo trì | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Một bộ nhớ dùng chung mọi repo | ✅ | ❌ (theo dự án) | ⚠️ | ⚠️ | ❌ | ⚠️ (vault) |
| Không phụ thuộc, `npx -y` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Dễ đọc / chỉnh sửa bằng người | ❌ | ✅ | ❌ | ❌ | ✅ (JSON) | ✅ |

## Tài liệu

- [`memory-protocol.md`](memory-protocol.md) — giao thức được tiêm vào AI của bạn: cách nó tự động ghi, tìm kiếm và duy trì bộ nhớ.
- [`DESIGN.md`](DESIGN.md) — thiết kế đầy đủ: tầm nhìn, nguyên tắc, nghiên cứu tình huống lactose, lộ trình phát triển.
- [`scripts/demo.mjs`](scripts/demo.mjs) — tái hiện bản demo ở trên trên một cơ sở dữ liệu dùng một lần.

## Lộ trình

- [x] Chỉ mục ngữ nghĩa (nhúng Ollama cục bộ)
- [x] Ký ức tình tiết + trích xuất phiên
- [x] Gộp hippocampus + bộ đánh giá chấm điểm từng cặp
- [x] Plugin opencode phổ quát + `memsem setup`
- [ ] Cầu nối Obsidian: xuất/nhập bộ nhớ dưới dạng ghi chú markdown dễ đọc
- [ ] Lan truyền đồ thị đa chặng (multi-hop)

## Giấy phép

MIT — miễn phí cho mọi mục đích. Bộ nhớ của bạn vẫn là của bạn.
