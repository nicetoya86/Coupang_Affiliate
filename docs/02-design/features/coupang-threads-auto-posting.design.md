---
template: design
version: 1.2
description: PDCA Design phase document (n8n workflow — adapted from the app-oriented template)
variables:
  - feature: coupang-threads-auto-posting
  - date: 2026-09-16
  - author: nicetoya@fastlane.kr
  - project: Coupang Affiliate — Threads Auto-Posting
  - version: 0.1
---

# coupang-threads-auto-posting Design Document

> **Summary**: Single n8n workflow (`NgC6DlDTrW3tnygc`, 80 nodes, active) that sources Coupang Partners products from two intake paths, generates a Threads post via NVIDIA LLM, publishes post + affiliate-link reply, tracks daily view counts, and auto-refreshes Threads tokens across multiple accounts — with a uniform retry→alert→escalate pattern wrapping every external call.
>
> **Project**: Coupang Affiliate — Threads Auto-Posting
> **Version**: 0.1
> **Author**: nicetoya@fastlane.kr
> **Date**: 2026-09-16
> **Status**: Draft — **retroactive**, written from the live canvas (Plan §8 item 7 had been blocked on this for 2 months; per the 2026-09-16 gap analysis, waiting further only widened the doc/implementation gap, so this documents current live state directly)
> **Planning Doc**: [coupang-threads-auto-posting.plan.md](../../01-plan/features/coupang-threads-auto-posting.plan.md) (v0.3 — stale relative to this doc; see §12)
> **Analysis Doc**: [coupang-threads-auto-posting.analysis.md](../../03-analysis/coupang-threads-auto-posting.analysis.md) (2026-09-16, Match Rate 89% vs Plan)

### Pipeline References

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1 | Schema Definition | N/A — no app-level entities, see §3 for the actual data carried (staticData + Sheet rows) |
| Phase 2 | Coding Conventions | ✅ See §10 — now includes the standardized retry pattern, previously undocumented |
| Phase 3 | Mockup | N/A — backend automation, no UI |
| Phase 4 | API Spec | ✅ See §4 — external APIs actually called |

---

## 1. Overview

### 1.1 Design Goals

- One workflow graph, five branches, each independently triggerable (manual / webhook / 3 schedule triggers), sharing the same content-generation and publish sub-chain.
- Every external HTTP/Sheets call gets the same shape of resilience: count → bounded retry with wait → success-alert-and-continue → exhausted-alert-and-stop. This emerged organically across five call sites; this doc is what formalizes it as a convention (see §10.4).
- No AI call inside the failure path itself (Plan §6.2 decision) — alerts are static pattern-matched Telegram messages, never a second LLM round-trip.

### 1.2 Design Principles

- Compliance-critical steps (disclosure text) are done in Code nodes, never left to LLM output.
- Token/credential material lives in n8n's Credential store or workflow `staticData`, never in node parameters or the checked-in JSON export.
- Product sourcing has two independent intake paths (webhook + Sheets poll) that converge on the same downstream chain at `현재 토큰 불러오기`, so the generation/publish logic is written once.

---

## 2. Architecture

### 2.1 Branch Diagram

```
Branch A — Manual/webhook/sheet-sourced posting (converge point: 현재 토큰 불러오기)
┌────────────────────────────────────────────────────────────────────────┐
│ [포스팅 실행 (테스트-수동)] ──▶ 설정값 (필수 입력) ──▶ 상품 정보 입력 ─┐ │
│ [쿠팡 상품 자동 수집 (Webhook)] ▶ 상품 분류 및 계정 매핑 ▶ 중복 상품   │ │
│   확인 ▶ 중복이면 건너뛰기 ─true→ 응답: 중복 상품 (조기 종료)         │ │
│                              └false→ 상품 정보 입력 (자동) ───────────┤ │
│ [3시간마다 시트 확인] ▶ 시트 큐에서 미게시 상품 조회 (+재시도 5회 체인)│ │
│   ▶ 제휴링크 있는 상품만 선택 ▶ 계정 순번 배정 (시트큐)               │ │
│   ▶ 상품 정보 입력 (시트) ────────────────────────────────────────────┘ │
│                              ▼                                          │
│                   현재 토큰 불러오기 ▶ NVIDIA 요청 만들기               │
│                   ▶ 스토리텔링 생성 (NVIDIA API) [재시도 5회 체인]      │
│                   ▶ 응답 파싱 및 댓글 텍스트 구성 [파싱실패→NVIDIA재시도│
│                     루프로 합류 — 2026-08-28 fix]                       │
│                   ▶ 본문 컨테이너 생성 [재시도 5회 체인]                │
│                   ▶ 대기 30초 (본문) ▶ 본문 게시                        │
│                   ▶ 대기 30초 (게시 확인) ▶ 댓글 컨테이너 생성          │
│                     ⚠️ no retry chain wired here — see §6.3 gap         │
│                   ▶ 대기 30초 (댓글) ▶ 댓글 게시 (제휴링크)             │
│                   ▶ 시트 소스 판단 ─true→ 시트에 게시완료 표시          │
│                                          [재시도 5회 체인]              │
│                                    ─false┴──────┐                       │
│                   ▶ 게시 기록 저장 (중복방지) ◀──┘                      │
│                   ▶ 웹훅 실행인가 ─true→ 응답: 게시 완료                │
└──────────────────────────────────────────────────────────────────────────┘

Branch B — Multi-account token refresh (schedule, 50d)
50일마다 자동 실행 ▶ 계정 목록 조회 (갱신용) ▶ 계정별 토큰 갱신 루프(splitInBatches)
   ↺ 현재 토큰 불러오기 (갱신용) ▶ 토큰 갱신 요청 ▶ 새 토큰 저장 ↺ (loop)
   ⚠️ no retry/alert wrapper on 토큰 갱신 요청 — see §6.3 gap

Branch C — Daily Insights + token-expiry watchdog (schedule, 1d)
매일 노출수 확인 ─┬▶ 게시완료 상품 조회 (노출수용) ▶ media_id 필터 ▶ Loop Over Items
                  │    ↺ 현재 토큰 불러오기 (조회수용) ▶ 노출수 조회 (Threads Insights)
                  │      ▶ views 값 파싱 ▶ 시트에 views 기록 [재시도 5회 체인]
                  │      ▶ 대기 (조회수 순차 갱신) ↺ (loop)
                  └▶ 토큰 만료 임박 확인 ▶ 토큰 만료 임박? ─true→ 텔레그램 알림

Error Workflow (separate n8n workflow, referenced via workflow settings.errorWorkflow)
j8NT6Clw2sGilnnx — Error Trigger → pattern-match → Telegram send (active, wired 2026-09-15/16)
```

### 2.2 Data Flow (Branch A, happy path)

```
Product info (Set node / Webhook body / Sheet row)
  → LLM prompt build (Code) → NVIDIA chat completion (HTTP)
  → JSON parse + disclosure-text prepend (Code)
  → Threads media container create (post) → wait 30s → publish
  → Threads media container create (reply) → wait 30s → publish
  → dedup/queue-state write (Sheets or staticData) → webhook response (if applicable)
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| Content generation | NVIDIA API (`nvidia/nemotron-3-ultra-550b-a55b`), `httpHeaderAuth` credential `NVIDIA API Key` | Post body + topic tag |
| Publish chain | Threads Graph API, per-account access token from `staticData` | Container create + publish, x2 (post, reply) |
| Sheet-sourced intake | Google Sheets node, OAuth credential | Unposted-product queue, dedup marking, views logging |
| Webhook intake | `쿠팡 상품 자동 수집 (Webhook)` (production URL `/webhook/coupang-product-intake`) | External trigger for Playwright-sourced products (see `scripts/` feature) |
| All alerting | Telegram Bot credential (`telegramApi`) + separate Error Workflow `j8NT6Clw2sGilnnx` | Failure/recovery visibility |

---

## 3. Data Model

No application database. Two data stores instead:

### 3.1 Workflow `staticData` (global) — per-account token record

| Field | Type | Description |
|-------|------|--------------|
| `access_token` | string | Threads long-lived token, per account |
| `account_id` / `threads_user_id` | string | Target Threads account |
| `token_saved_at` / expiry tracking fields | date/string | Read by `토큰 만료 임박 확인` and the 50-day refresh branch |
| `posted_products` | array/set | Dedup keys for webhook-sourced products (FR-10) |

### 3.2 Google Sheet — product queue row

| Column (inferred from node names) | Purpose |
|---|---|
| product info (title/desc/affiliate link) | Consumed by `상품 정보 입력 (시트)` |
| 게시완료 flag | Written by `시트에 게시완료 표시`; read by `시트 큐에서 미게시 상품 조회` to skip already-posted rows |
| `media_id` | Written after publish; read back by the Insights branch (`media_id 있는 행만 필터링`) to know which rows have a Threads post to query views for |
| `views` | Written by `시트에 views 기록` |

### 3.3 Entity Relationship (informal)

```
[Account] 1 ──── N [Sheet row / staticData.posted_products entry]
   │
   └── 1 ──── 1 [access_token, refreshed every 50d]

[Sheet row] 1 ──── 1 [Threads post (media_id)] ──── 1 [daily views sample]
```

---

## 4. API Specification (external calls actually made)

| Caller node | Method | Endpoint | Purpose |
|---|---|---|---|
| `스토리텔링 생성 (NVIDIA API)` / `(재시도)` | POST | `https://integrate.api.nvidia.com/v1/chat/completions` | LLM post-body generation |
| `본문 컨테이너 생성` / `(재시도)` | POST | Threads Graph API media endpoint | Create post container |
| `본문 게시` | POST | Threads Graph API publish endpoint | Publish post |
| `댓글 컨테이너 생성` | POST | Threads Graph API media endpoint (with `reply_to_id`) | Create reply container |
| `댓글 게시 (제휴링크)` | POST | Threads Graph API publish endpoint | Publish reply |
| `토큰 갱신 요청` | GET/POST | Threads Graph API token-refresh endpoint | 60-day token refresh |
| `노출수 조회 (Threads Insights)` | GET | Threads Graph API Insights endpoint | Per-post view count |
| `시트 큐에서 미게시 상품 조회` / `시트에 게시완료 표시` / `시트에 views 기록` (+ retries) | Sheets API (via node) | Google Sheets | Queue read/write |
| `실패 알림 (텔레그램)` / `*복구 알림 (텔레그램)` / `토큰 만료 임박 알림 (텔레그램)` | POST | Telegram Bot API `sendMessage` | Alerting |
| `쿠팡 상품 자동 수집 (Webhook)` | POST | `/webhook/coupang-product-intake` (this workflow, inbound) | External product intake from the local Playwright script |

### 4.1 NVIDIA request shape (from `NVIDIA 요청 만들기`)

```json
{
  "model": "nvidia/nemotron-3-ultra-550b-a55b",
  "messages": [
    { "role": "system", "content": "detailed thinking off. Never output reasoning... Output must start with { and be valid JSON only." },
    { "role": "user", "content": "<hooking-post-prompt with product title/desc>" }
  ],
  "max_tokens": 900,
  "temperature": 0.9,
  "chat_template_kwargs": { "enable_thinking": false }
}
```

Expected model response: `{"post_text": "...", "topic_tag": "..."}` — parsed and disclosure-prepended by `응답 파싱 및 댓글 텍스트 구성`, which now also feeds parse failures back into the NVIDIA retry loop (2026-08-28 fix), not just HTTP failures.

### 4.2 Error Responses (this workflow's own failure surface)

- `stopAndError` nodes (`NVIDIA 재시도 소진`, `시트조회 재시도 소진`, `게시완료표시 재시도 소진`, `views기록 재시도 소진`) terminate the run and hand off to the workflow-level `errorWorkflow` (`j8NT6Clw2sGilnnx`), which pattern-matches the message and sends a plain-language Telegram alert.
- Each retry chain also sends its own immediate "복구 알림" (recovery) Telegram message on a successful retry, independent of the Error Workflow.

---

## 5. UI/UX Design

N/A — backend-only n8n automation (Plan §2.2 explicitly excludes any UI/dashboard).

---

## 6. Error Handling

### 6.1 The standardized retry pattern (formalized here for the first time)

Applied identically to 5 call sites: NVIDIA generation, post-container creation, Sheet queue read, Sheet completion-flag write, Sheet views write.

```
[External call] ──success──▶ continue
       │ error
       ▼
[X 재시도 카운트 증가]  (Code: _retryCount += 1)
       ▼
[X 재시도 가능?]  (If: _retryCount <= 5)
   │true              │false
   ▼                  ▼
[X 재시도 대기]   [X 재시도 소진 (에러)]  (stopAndError → triggers Error Workflow)
   (Wait 15s)
   ▼
[External call (재시도)] ──success──▶ [X 복구 알림 (텔레그램)] + continue
       │ error
       └──▶ back to [X 재시도 카운트 증가]  (loops until exhausted)
```

### 6.2 Error Code / Failure Reference

| Failure | Where caught | Handling |
|---|---|---|
| NVIDIA HTTP timeout / non-2xx | `스토리텔링 생성 (NVIDIA API)` onError=continueErrorOutput | Retry pattern above. **Root cause fixed 2026-09-16**: both this node and its retry twin had `options: {}` (no timeout → n8n default 5min), so a hung NVIDIA endpoint burned ~24 min before exhausting retries. Fixed to `options.timeout: 30000` on both nodes |
| NVIDIA response not valid JSON | `응답 파싱 및 댓글 텍스트 구성` | Routed into the *same* NVIDIA retry loop (2026-08-28 fix) rather than failing separately |
| Google Sheets 503 / transient | `시트 큐에서 미게시 상품 조회`, `시트에 게시완료 표시`, `시트에 views 기록` | Same retry pattern, each with its own counter/If/Wait/retry-node/alert set |
| Threads container/publish failure | `본문 컨테이너 생성` (custom chain); `댓글 컨테이너 생성` / `댓글 게시 (제휴링크)` (native `retryOnFail`, 3 tries/5s — no custom alerting, but not zero-protection as first thought) | `본문 게시` had **no retry config at all** — **fixed 2026-09-16**: added native `retryOnFail`/`maxTries:3`/`waitBetweenTries:5000` to match the comment-chain nodes |
| Token refresh failure | `토큰 갱신 요청` | Had **no retry config at all** — **fixed 2026-09-16**, same native-retry treatment |

### 6.3 Gaps found while writing this doc

| Gap | Status |
|---|---|
| `본문 게시` had zero retry config (not even native) | ✅ Fixed 2026-09-16 — added `retryOnFail`, `maxTries: 3`, `waitBetweenTries: 5000` (matches `댓글 컨테이너 생성`/`댓글 게시`) |
| `토큰 갱신 요청` (Branch B) had zero retry config | ✅ Fixed 2026-09-16 — same native-retry addition. Deliberately did **not** build the full 6-node custom chain here: both calls already get a Telegram alert on final failure via the workflow-level `errorWorkflow` setting (`j8NT6Clw2sGilnnx`), and both are low-frequency/high-reliability calls (a publish-confirm call, and a call that fires once per account per 50 days) — 3 native retries closes the real gap (zero attempts) without adding 12 more nodes for marginal benefit |
| `댓글 컨테이너 생성` / `댓글 게시 (제휴링크)` "no retry" — **correction**: they already had native `retryOnFail` (3 tries/5s) all along. Original analysis pass missed this because it only grepped for the custom count/if/wait chain, not the node's own `retryOnFail` field | No action needed — already adequately protected, just without the custom Telegram recovery ping the other 5 sites get. Not worth the extra nodes for consistency alone |
| No automated excluded-category guard (Plan §5 risk, still open) | Still open. Both intake paths (webhook, Sheet) can push a gift-card/medical-device/phone product into the pipeline | Add a category-check Code/If node right after each intake path's product-info Set node |
| **account_B posting silently failing, disguised as execution `success`** | ✅ Root cause found + monitoring gap fixed 2026-09-16. `본문 컨테이너 생성` exhaustion path (`실패시 시트소스 판단` → `시트에 실패 표시` → `실패 알림 (텔레그램)`) had no `stopAndError`, unlike the NVIDIA chain — so a fully-failed post run still ended with n8n execution status `success`. Confirmed both 2026-09-16 scheduled runs for account_B (executions 10775, 10779) failed all 4 container-creation attempts with Threads API `code 100 / error_subcode 33` ("Object with ID '27802565872778237' does not exist... or missing permissions") — i.e. account_B's stored token/permission is invalid — yet both show as `success` in the executions list. A manual reseed attempt on 2026-09-14 (execution 10711) also failed with "Invalid OAuth 2.0 Access Token". **Fix applied**: added `본문생성 실패 (에러)` stopAndError node after `실패 알림 (텔레그램)`, so future exhaustion shows as `error` and is searchable. **Not fixed by this change**: account_B's actual token is still invalid — needs real re-authentication (fresh long-lived token from Threads/Meta) before account_B can post again |

---

## 7. Security Considerations

- [x] Credentials via n8n Credential store (NVIDIA `httpHeaderAuth`, Telegram `telegramApi`, Sheets OAuth) — never inline in node parameters
- [x] `.mcp.json` (n8n MCP bearer token) confirmed `git check-ignore`d — can't leak via commit, though the file itself is still plaintext on disk (Plan §5 risk, downgraded from "confirmed present" to "mitigated, not eliminated")
- [ ] No excluded-category guard (see §6.3)
- [ ] No rate limiting needed — trigger cadence is fixed by schedule/manual, not user-facing
- N/A — no HTTPS enforcement item; all outbound calls are to n8n-cloud-hosted HTTPS endpoints by default

---

## 8. Test Plan

No unit/integration/E2E test suite — this is a visual n8n workflow, verified operationally instead:

### 8.1 Verification Method by Area

| Area | Method |
|---|---|
| Disclosure text present | Manual spot-check of `응답 파싱 및 댓글 텍스트 구성` output per run (Plan §3.2) |
| Reply lands as true reply, not new post | Manual check in the Threads app after a live run — **still the one open item carried from Plan §4.1** |
| Failure visibility | n8n Executions log + Telegram alert arrival |
| Token refresh correctness | n8n Executions log for `50일마다 자동 실행` / `계정별 토큰 갱신 루프` |

### 8.2 Key Scenarios (manual)

- [ ] Happy path: manual trigger → post + reply both visible on Threads
- [ ] NVIDIA hangs/times out → confirm 30s-timeout fix actually shortens recovery (§6.2, unverified since the fix)
- [ ] Sheet-sourced run vs webhook-sourced run both converge correctly and mark completion in the right place (`시트 소스 판단` branch)
- [ ] Token-refresh loop completes for all accounts in `계정별 토큰 갱신 루프` without silently skipping one

---

## 9. Workflow Layering (Clean-Architecture analogue)

| Layer | Responsibility | Nodes (representative) |
|---|---|---|
| **Trigger** | Entry points | `포스팅 실행 (테스트-수동)`, `쿠팡 상품 자동 수집 (Webhook)`, `3시간마다 시트 확인`, `50일마다 자동 실행`, `매일 노출수 확인` |
| **Sourcing** | Get one product + resolve which account posts it | `상품 분류 및 계정 매핑`, `중복 상품 확인`, `시트 큐에서 미게시 상품 조회`, `계정 순번 배정 (시트큐)` |
| **Generation** | Turn product info into compliant post text | `NVIDIA 요청 만들기`, `스토리텔링 생성 (NVIDIA API)`, `응답 파싱 및 댓글 텍스트 구성` |
| **Publish** | Talk to Threads Graph API | `본문 컨테이너 생성`, `본문 게시`, `댓글 컨테이너 생성`, `댓글 게시 (제휴링크)` |
| **Persistence & Alert** | Record state, notify on failure/recovery | dedup/Sheet-write nodes, all `*재시도*` and `*알림 (텔레그램)*` nodes, Error Workflow `j8NT6Clw2sGilnnx` |

Dependency direction matches the diagram in §2.1: Trigger → Sourcing → Generation → Publish → Persistence, with every stage able to fall sideways into its own Persistence-&-Alert sub-chain on failure.

---

## 10. Coding Convention Reference

> Supersedes/extends Plan §7.2 with what's actually been enforced through 80 nodes of live iteration.

### 10.1 Naming Conventions

| Target | Rule | Example |
|---|---|---|
| Nodes | Korean, descriptive | `본문 게시`, `대기 30초 (본문)` |
| Retry-chain node family | `{작업명} 재시도 카운트 증가` / `... 가능?` / `... 대기` / `... (재시도)` / `... 복구 알림 (텔레그램)` / `... 재시도 소진 (에러)` | `NVIDIA 재시도 카운트 증가`, `NVIDIA 재시도 가능?`, ... |

### 10.2 Code Node Rules

- Always `runOnceForAllItems` (Plan §7.2 — a mixed-mode bug was a real incident on 2026-07-23)
- Item reference: `.first().json`, not `.item.json`, after any node followed by a Wait/branch (Plan §7.2, fixed live 2026-07-23)

### 10.3 Credential/Secret Rules

- n8n Credential store only, never hard-coded in JSON exports checked into this repo (Plan §7.2)

### 10.4 The Retry Pattern (new — see §6.1)

Any new external call added to this workflow should get the same 6-node shape (count → if≤5 → wait 15s → retry-call → success alert / loop-back-on-error, plus a `stopAndError` on exhaustion) **unless** it's genuinely one-shot and low-stakes. §6.3 already lists 2 places this was skipped and shouldn't have been.

---

## 11. Implementation Guide

Already implemented (retroactive doc). Reference inventory:

- 80 nodes total, node-type breakdown: `httpRequest` (11), `code` (17), `if` (10), `wait` (7), `telegram` (6), `stopAndError` (4), `googleSheets` (5), `set` (3), `scheduleTrigger` (3), `splitInBatches` (2), `webhook` / `respondToWebhook` (1 each), `manualTrigger` (1)
- Live export kept in sync: `coupang_threads_workflow.json` (root), confirmed 80 nodes, modified 2026-09-15 — re-export before trusting it for anything beyond a general reference, per Plan §6.3

---

## 12. Known Doc/Implementation Drift (why this doc exists now)

Per the 2026-09-16 gap analysis: Plan v0.3 describes a 13-node, single-account, Playwright-webhook-only workflow. Live reality (this doc) is an 80-node, multi-account workflow with a second Sheets-based intake path and a whole daily Insights-tracking branch that Plan never mentions. Plan should be bumped to v0.4 to reflect FR-07/09/11 as Done and to document multi-account support + Insights tracking as new scope — tracked as a Next Step, not done as part of this Design doc (Design describes current implementation; updating Plan's historical FR table is a separate, smaller edit).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-16 | Initial Design doc, written retroactively from the live 80-node n8n workflow (nodes + connections read directly via n8n-mcp) rather than forward from Plan, per the 2026-09-16 gap analysis recommendation | nicetoya@fastlane.kr |
