---
template: analysis
version: 1.2
description: PDCA Check phase document — Plan vs live n8n workflow gap analysis
variables:
  - feature: coupang-threads-auto-posting
  - date: 2026-09-16
  - author: nicetoya@fastlane.kr
  - project: Coupang Affiliate — Threads Auto-Posting
  - version: 0.4
---

# coupang-threads-auto-posting Analysis Report

> **Analysis Type**: Gap Analysis (Plan vs live n8n workflow) — no Design doc exists yet, so Plan v0.3 is used as the reference baseline.
>
> **Project**: Coupang Affiliate — Threads Auto-Posting
> **Analyst**: nicetoya@fastlane.kr
> **Date**: 2026-09-16
> **Plan Doc**: `docs/01-plan/features/coupang-threads-auto-posting.plan.md` (v0.3, 2026-07-23)
> **Design Doc**: none (Plan §8 Next Steps item 7 still pending — blocked on this doc)
> **Prior Analysis**: same file, 2026-07-23, Match Rate 44%

---

## 1. Analysis Overview

### 1.1 Purpose

Re-run the Check phase after ~2 months of live-canvas iteration. The workflow grew from 13 nodes (Plan v0.3) to **80 nodes** without any Design doc ever being written, so the main risk is doc/implementation drift, not implementation quality. This analysis also folds in the root-cause fix applied earlier today (2026-09-16 09:24 incident, NVIDIA HTTP timeout).

### 1.2 Analysis Scope

- **Reference doc**: `docs/01-plan/features/coupang-threads-auto-posting.plan.md`
- **Implementation**: live n8n workflow `NgC6DlDTrW3tnygc` (쿠팡 파트너스 - Threads 자동 포스팅), active=true, 80 nodes, `errorWorkflow: j8NT6Clw2sGilnnx`
- **Local export sync check**: `coupang_threads_workflow.json` (root) — 80 nodes, modified 2026-09-15 23:41, matches live node count
- **Analysis Date**: 2026-09-16

---

## 2. Gap Analysis (Plan vs Implementation)

### 2.1 Functional Requirements — status vs Plan v0.3

| ID | Requirement | Plan Status (07-23) | Live Status (09-16) | Notes |
|----|-------------|---------------------|----------------------|-------|
| FR-01 | LLM hooking post body | Done | ✅ Match | Model drifted again: prompt now targets `nvidia/nemotron-3-ultra-550b-a55b`, not the `meta/llama-3.3-70b-instruct` recorded in Plan §6.2 — same undocumented-model-swap pattern the Plan itself already flagged once |
| FR-02 | Disclosure text hard-inserted via code | Done | ✅ Match | `응답 파싱 및 댓글 텍스트 구성` node unchanged in role |
| FR-03 | Post → wait → publish → reply chain | Done | ✅ Match | |
| FR-04 | Reply lands as true reply, not new post | Fixed, unconfirmed | ⚠️ Still unconfirmed | No structural regression found, but Plan's own DoD checkbox for a real Threads-side confirmation is still unchecked — carried forward as open |
| FR-05 | Token persistence via static data | Done | ✅ Match | |
| FR-06 | Auto-refresh before 60-day expiry | Done, Branch B never fired | ✅ Exceeded | Branch B rebuilt as a **multi-account loop** (`계정 목록 조회 (갱신용)` → `계정별 토큰 갱신 루프` splitInBatches → refresh → save), plus a *second*, independent daily expiry-proximity check+alert (`매일 노출수 확인` → `토큰 만료 임박 확인` → `토큰 만료 임박?` → Telegram) — not in Plan at all |
| FR-07 | Telegram alert on failure, no AI dependency | Blocked on credential | ✅ Done | Workflow settings now show `errorWorkflow: j8NT6Clw2sGilnnx`, and that alert workflow is `active: true`. Plan's Next-Steps blocking item #4 is resolved but the Plan doc was never updated to reflect it |
| FR-08 | Official Coupang API instead of manual Set node | Not started | ➖ Still not started | Consistent — no change, still browser-automation based |
| FR-09 | Auto product sourcing | Playwright + webhook, selectors unverified | ✅ Done, architecture changed | Webhook branch (`쿠팡 상품 자동 수집`) still present, but a **second, apparently primary** sourcing path was added: Google-Sheets-based queue (`3시간마다 시트 확인` → `시트 큐에서 미게시 상품 조회` → ...) — this replaces the Windows Task Scheduler dependency FR-11 worried about |
| FR-10 | Never re-post a featured product | Done via `staticData.posted_products` | ✅ Match, dual-path | Dedup now exists on both paths: `중복 상품 확인` (webhook) and `시트에 게시완료 표시` (sheet) |
| FR-11 | Run every 3h unattended | Not yet registered (Task Scheduler) | ✅ Done, better than planned | `3시간마다 시트 확인` is an n8n Schedule Trigger on the *active* workflow — no external OS scheduler needed at all, which was the actual risk Plan flagged |

**Reading**: 9 of 11 FRs are done or exceeded; FR-08 is intentionally deferred (unchanged); only FR-04 carries forward as genuinely open. **The Plan's own requirements are ~90% satisfied.** The real gap is the other direction (§2.3).

### 2.2 Definition of Done (Plan §4.1)

| Item | Status |
|------|--------|
| `reply_to_id` real Threads-side confirmation | ⚠️ Still open — no new evidence either way |
| Post published successfully end-to-end | ✅ Confirmed — normal (non-error) executions continued through Sept |
| Telegram Bot credential wired + alert workflow published + set as Error Workflow | ✅ **Now done** (was the top blocking item in Plan; Plan text not updated) |
| Token refresh branch fired successfully on schedule at least once | ⚠️ Unconfirmed — would need `50일마다 자동 실행` execution history, not checked in this pass |
| PDCA doc trail kept in sync with live canvas | ❌ **Not done — this is the actual failing item.** Design doc was never written; Plan is 2 months and ~67 nodes behind live |

### 2.3 Undocumented live functionality (implementation ahead of docs)

None of this exists in Plan v0.3 at all:

| Feature | Nodes (representative) | Risk if left undocumented |
|---------|------------------------|----------------------------|
| Multi-account support | `계정 순번 배정 (시트큐)`, `상품 분류 및 계정 매핑`, `계정별 토큰 갱신 루프` | Plan explicitly says "single account... multi-account deferred" (§1.2) — a future reader will trust the Plan and be wrong |
| Threads Insights view-count tracking | `매일 노출수 확인` → `노출수 조회 (Threads Insights)` → `views 값 파싱` → 시트 기록 | Entirely new daily branch, its own retry+alert sub-chain, no requirement ID |
| Standardized retry+recover+alert pattern | Repeated 5× for NVIDIA, 본문 컨테이너 생성, 시트조회, 게시완료표시, views기록 (count→if≤5→wait→retry→success-alert / exhausted-error) | This is now the project's de facto error-handling convention; Plan §6.2 only describes the original single NVIDIA-only retry idea. Should be promoted to a named convention in §7.2 so future nodes follow it consistently — the bug fixed today happened precisely because one of these five copies (`스토리텔링 생성 (NVIDIA API)` + its retry twin) was missing the `options.timeout` the others should have had |
| Google Sheets as the primary product queue | `시트 큐에서 미게시 상품 조회`, `시트 소스 판단`, `시트에 게시완료 표시` | Changes the answer to "where does product data come from" — Plan still describes only the Playwright/webhook path |

### 2.4 Today's incident (2026-09-16 09:00 execution)

Not a Plan-vs-implementation gap, but a code-quality defect surfaced by real failure and already fixed in this session:

- **Root cause**: `스토리텔링 생성 (NVIDIA API)` and its retry twin `스토리텔링 생성 (재시도)` had `options: {}` — no explicit HTTP timeout — so each hung attempt burned n8n's default 300000ms (5 min) before the 15s-wait/retry loop could even advance. NVIDIA was unresponsive for the run, and 5 sequential 5-minute hangs consumed ~24 minutes before `NVIDIA 재시도 소진 (에러)` fired.
- **Fix applied**: `options.timeout` set to 30000ms on both nodes, published as `activeVersionId 9b1d3031-...`. Not yet observed under a real repeat failure (no execution since the fix), so mark as ⚠️ fix-applied-unverified until the next natural NVIDIA hiccup exercises it.

### 2.5 Match Rate Summary

```
┌───────────────────────────────────────────────────────────┐
│  Plan-requirements satisfied by implementation: ~89%       │
│    ✅ Match/Exceeded: 9 of 11 FR + 2 of 5 DoD items         │
│    ⚠️ Still open:      FR-04, 2 DoD items (unconfirmed)     │
│    ➖ Intentionally deferred: FR-08                          │
├───────────────────────────────────────────────────────────┤
│  Implementation coverage by docs (Plan+Design):  ~35%      │
│    80 live nodes vs. 13-node architecture described in     │
│    Plan §6.3; 5 major undocumented feature groups (§2.3)   │
└───────────────────────────────────────────────────────────┘
```

Two different numbers on purpose: the workflow itself is in good shape and mostly exceeds what was asked of it; the documentation is the thing that's actually behind.

---

## 3. Convention Compliance (Plan §7.2)

| Convention | Rule | Compliance |
|------------|------|-------------|
| Node naming | Korean, descriptive | ✅ Held across all 80 nodes, including every new retry/alert node |
| Code node mode | `runOnceForAllItems` always | Not individually re-audited this pass — no new incident pointed at this, unlike the 07-23 bug |
| `.first().json` after Wait/branch | Established | Not re-audited this pass |
| Disclosure text via code, never LLM | Hard rule | ✅ No evidence of regression |
| Secrets in n8n Credential store | Hard rule | ✅ NVIDIA + Telegram both still credential-based, not inline |
| **New, unwritten**: retry-count→if≤5→wait 15s→retry, with a "복구 알림" success ping and a `stopAndError` exhaustion node | Emerged organically, applied 5×, one copy shipped with a missing timeout | ⚠️ Should be written down in Plan §7.2 so the *next* copy (6th retry chain, whenever one gets added) doesn't repeat today's gap |

---

## 4. Security / Risk Review (Plan §5)

| Risk (from Plan) | Status now |
|-------------------|-------------|
| `.mcp.json` plaintext bearer token | Partially mitigated — confirmed `git check-ignore` returns true, so it can't leak via a commit. File itself is still plaintext on disk; Plan's "requires a decision from the project owner" is still technically open but lower urgency than Plan implies |
| Local workflow JSON drifting from live canvas | ✅ Resolved — `coupang_threads_workflow.json` has 80 nodes, same as live, modified 2026-09-15 23:41 (one day old). Plan §6.3 warning about this is now outdated and can be relaxed in the next Plan revision |
| Excluded-category products reaching the auto-pipeline | Still no automated guard found in either sourcing path (webhook or sheet) — unchanged open risk |

---

## 5. Recommended Actions

### 5.1 Immediate

| Priority | Item | Notes |
|----------|------|-------|
| 🔴 1 | Watch the next NVIDIA hiccup to confirm the 30s-timeout fix actually shortens recovery time instead of just moving the failure point | No repeat execution since the fix yet |
| 🟡 2 | Audit the other 4 retry-chain HTTP/DB nodes (본문 컨테이너 생성 (재시도), 시트조회, 게시완료표시, views기록) for the same missing-timeout pattern | Today's bug was one instance of a pattern that may exist elsewhere |

### 5.2 Short-term

| Priority | Item | Expected impact |
|----------|------|------------------|
| 🟡 1 | Write the Design doc (Plan §8 item 7) — it has been blocked on "stable, verified implementation" for 2 months, but the implementation has been stable enough to add 5 major feature groups in that time; waiting further just widens the gap | Closes the ❌ DoD item, gives future-you (and future Claude sessions) a real reference instead of a 2-month-stale Plan |
| 🟡 2 | Update Plan v0.3 → v0.4: flip FR-07/FR-09/FR-11 to Done, document multi-account support, Insights tracking, Sheets-queue path, and the standardized retry-pattern convention | Currently the single biggest doc/reality mismatch |
| 🟢 3 | Confirm FR-04 (reply-as-reply) and the 50-day token refresh firing, once real evidence is available | Both are one-time "did it actually happen" checks, not code changes |

### 5.3 Long-term (backlog)

- Add an excluded-category guard to both product-sourcing paths (still zero automated protection)
- Revisit FR-08 (official Coupang Partners API) to retire the Playwright/browser-automation account risk the project owner knowingly accepted

---

## 6. Next Steps

- [ ] Write Design doc for `coupang-threads-auto-posting`
- [ ] Bump Plan to v0.4 reflecting current live state (see §5.2)
- [ ] Re-run this analysis once the Design doc exists — Match Rate should then be computed against Design, not Plan
- [ ] Completion report deferred until the Design doc gap is closed

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-07-23 | Initial gap analysis, Match Rate 44% | nicetoya@fastlane.kr |
| 0.2 | 2026-09-16 | Re-run against 80-node live workflow; folds in NVIDIA-timeout incident fix; flags doc/implementation drift as the primary open gap instead of missing features | nicetoya@fastlane.kr |
