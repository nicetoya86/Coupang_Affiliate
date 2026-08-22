---
template: analysis
version: 1.2
description: PDCA Check phase document template with Clean Architecture and Convention compliance checks
variables:
  - feature: coupang-threads-auto-posting
  - date: 2026-07-23
  - author: nicetoya@fastlane.kr
  - project: Coupang Affiliate — Threads Auto-Posting
  - version: 0.1
---

# coupang-threads-auto-posting Analysis Report

> **Analysis Type**: Gap Analysis (Plan/Spec Documentation vs. Actual Implemented State)
>
> **Project**: Coupang Affiliate — Threads Auto-Posting
> **Version**: 0.1
> **Analyst**: nicetoya@fastlane.kr
> **Date**: 2026-07-23
> **Plan Doc**: [coupang-threads-auto-posting.plan.md](../01-plan/features/coupang-threads-auto-posting.plan.md)

### Pipeline References (for verification)

| Source | Document/System | Verification Target |
|--------|------------------|----------------------|
| Plan | `docs/01-plan/features/coupang-threads-auto-posting.plan.md` | Documented requirements & architecture decisions |
| Handoff spec | `coupang_threads_project_spec.md` | Author's own account of "current" live state |
| Local export | `coupang_threads_workflow.json` | Structural snapshot checked into the project folder |
| **Live n8n instance** (via `n8n-mcp`, workflow ID `NgC6DlDTrW3tnygc`) | Actual running workflow + 18 logged executions | **Ground truth** |

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Determine how accurately the Plan document (and the spec doc it was built from) reflects what is **actually implemented and running**, by comparing them directly against the live n8n workflow reached through the project's own `n8n-mcp` connection — not just the local JSON export, which the spec doc itself already warns can be stale.

### 1.2 Analysis Scope

- **Plan Document**: `docs/01-plan/features/coupang-threads-auto-posting.plan.md`
- **Local Implementation Snapshot**: `coupang_threads_workflow.json`, `coupang_threads_project_spec.md`
- **Live Implementation**: n8n workflow `쿠팡 파트너스 - Threads 자동 포스팅` (id `NgC6DlDTrW3tnygc`), last updated 2026-07-21T16:32Z, plus its 18 most recent executions
- **Analysis Date**: 2026-07-23

**Headline finding**: the live workflow has moved on substantially from what both the Plan document and the spec doc describe. Several "planned/claimed" items turn out to be either not built at all, or built differently than documented.

---

## 2. Gap Analysis (Plan vs. Live Implementation)

### 2.1 Functional Requirements Status (ground truth vs. Plan's FR table)

| ID | Requirement | Plan's Status | **Actual (live n8n)** | Verdict |
|----|-------------|----------------|------------------------|---------|
| FR-01 | LLM generates hooking/storytelling post body | Done | Implemented, but **prompt and model fully rewritten** (see 2.2) | ⚠️ Match with undocumented drift |
| FR-02 | Disclosure text force-inserted via code, never by LLM | Done | Confirmed — logic unchanged, still code-enforced | ✅ Match |
| FR-03 | Post → wait → publish chain | Done | Present, but **wait durations doubled (15s→30s) and a 3rd wait node added** | ⚠️ Match with undocumented drift |
| FR-04 | Reply comment lands as an actual reply, not a new feed post | "Blocked — bug in progress", fix believed applied to JSON file | **Documented `.item`→`.first()` fix was never applied live.** All 4 affected expressions still read `.item.json`/`$input.item.json`. A **different, undocumented mitigation** (extra 30s "게시 확인" wait node with an inline note attributing the bug to Threads backend propagation delay, not pairedItem breakage) was added instead | ❌ Not implemented as documented; real fix status still unverified |
| FR-05 | Token persistence via workflow static data | Done | Confirmed, **plus an undocumented improvement**: a `seed_token_used` guard was added so a changed `SEED_TOKEN` is picked up correctly | ✅ Match (exceeds doc) |
| FR-06 | Auto-refresh token every 50 days | Done (pending 1 cycle confirmation) | Structurally present, but the token-loader Code node's mode was changed to `runOnceForEachItem`, **violating the project's own established convention** (see §2.4) | ⚠️ Match with a convention regression |
| FR-07 | Telegram error alert workflow, no AI call | "Done (import/Chat ID unverified)" | **Does not exist.** `search_workflows` against the live n8n instance returns exactly **one** workflow total — the main one. No `coupang_threads_error_alert.json` file exists in the project folder either | ❌ **Not implemented at all** — spec doc describes a design, not a built artifact |
| FR-08 | Coupang Partners API product sourcing | Not started | Not started | ✅ Match (both agree) |

### 2.2 Undocumented Content/Model Changes (found live, absent from Plan + local JSON)

| Aspect | Plan / local JSON says | **Live n8n actual** |
|--------|--------------------------|----------------------|
| LLM model | `meta/llama-3.1-8b-instruct` | `meta/llama-3.3-70b-instruct` |
| Tone | Neutral, empathetic, storytelling ("공감형 표현") | Informal 반말 friend-to-friend tone, explicit "hearsay" phrasing rules (`~하대`, `~한다던데`), 1–2 emoji **mandatory** |
| Length limit | ~350 characters | ~200 bytes (~60–65 Korean characters) — much shorter |
| Comment body | Disclosure + "자세한 정보와 구매는..." lead-in + link | Disclosure + link only (lead-in line dropped) |
| Wait durations | 15s (×2) | 30s (×2), plus a new third 30s wait inserted before the reply-comment step |

None of this is a "bug" — it looks like deliberate iteration directly on the live canvas — but it means the Plan document's Architecture Decisions table (§6.2) and Requirements (§3.1) are already out of date one day after being written.

### 2.3 Missing Artifact: Error Alert Workflow

The spec doc (`coupang_threads_project_spec.md` §2, §5, §11) describes `coupang_threads_error_alert.json` as an existing, importable file wired to the main workflow's Error Workflow setting, with only "actual Telegram Chat ID wiring" left unverified. Ground truth:

- File does not exist anywhere in `D:\vibecording\Coupang_Affiliate` (confirmed via directory search).
- Live n8n instance has exactly **one** workflow — the error-alert workflow was never created there either.
- The main workflow's `settings` object (from live `get_workflow_details`) has no Error Workflow reference configured.

This is the single largest documentation-vs-reality gap: an entire sub-system is described in implementation-level detail (node names, code, credential setup) as if built, when it is actually only a design that was never executed on.

### 2.4 Convention Compliance

The spec doc's own issue history (§7, issue #1) established a hard rule after a real bug: **all Code nodes must use `runOnceForAllItems`**, never `runOnceForEachItem`. The Plan document (§7.2) restates this as a "High priority, enforce for every new Code node" rule.

| Node | Expected mode | Actual mode (live) | Status |
|------|----------------|----------------------|--------|
| `현재 토큰 불러오기` (Branch A) | `runOnceForAllItems` | `runOnceForAllItems` | ✅ |
| `NVIDIA 요청 만들기` | `runOnceForAllItems` | `runOnceForAllItems` | ✅ |
| `응답 파싱 및 댓글 텍스트 구성` | `runOnceForAllItems` | `runOnceForAllItems` (but uses `$input.item.json` instead of `.first()`, see 2.1 FR-04) | ⚠️ |
| `현재 토큰 불러오기 (갱신용)` (Branch B) | `runOnceForAllItems` | **`runOnceForEachItem`** | ❌ Violation |
| `새 토큰 저장` | `runOnceForAllItems` | `runOnceForAllItems` | ✅ |

Branch B currently works only because it always receives exactly one item from the schedule trigger — the same latent-failure shape as the original documented bug (§7 issue #1 in the spec), just not yet triggered.

### 2.5 Execution History (ground truth the Plan document didn't have)

18 executions logged for this workflow, all `manual` mode (workflow `active: false`, so the schedule trigger has never actually fired yet — Branch B is completely unexercised in production):

```
2026-07-16 16:51  success  (1st successful run)
2026-07-16 16:57–18:03  error ×7  (credential/token debugging, matches spec §7 history)
2026-07-19 15:39  error ×1
2026-07-19 16:19  success
2026-07-21 15:42–16:30  success ×5  (most recent, consecutive)
```

This is **more real-world validation than the Plan's Definition of Done assumed** ("published at least once" → actually 7 successful runs total, 5 of them consecutive). However, execution `status: success` cannot by itself confirm FR-04 — the Threads API accepts an empty/invalid `reply_to_id` without erroring, so a "success" execution is equally consistent with the comment landing as a reply *or* as a standalone post. Confirming FR-04 requires reading the actual Threads API response body for the comment-container node or checking the Threads account directly — neither was conclusively recoverable from the MCP execution-data query in this analysis.

### 2.6 Match Rate Summary

```
┌─────────────────────────────────────────────────────┐
│  Overall Match Rate (Plan vs. Live): 44%             │
├─────────────────────────────────────────────────────┤
│  ✅ Full match:            2 / 8 requirements (25%)  │
│  ⚠️ Match w/ undocumented drift: 3 / 8 (37.5%)       │
│  ❌ Not implemented / wrong as documented: 3 / 8 (37.5%) │
└─────────────────────────────────────────────────────┘
```

---

## 3. Code Quality Notes (n8n Code nodes)

| Node | Issue | Severity |
|------|-------|----------|
| `현재 토큰 불러오기 (갱신용)` | Mode set to `runOnceForEachItem`, contradicting the project's own documented hard rule; latent failure mode identical to a previously-fixed real bug | 🟡 Medium |
| `응답 파싱 및 댓글 텍스트 구성` | Still uses `$input.item.json` rather than `.first().json` — the exact pattern the spec doc blamed for the reply-bug elsewhere in the same node chain | 🟡 Medium |
| `본문 게시` / `댓글 컨테이너 생성` / `댓글 게시 (제휴링크)` | All three use `$('...').item.json` cross-node references, not `.first()` — same unresolved pattern | 🟡 Medium |

## 4. Security Findings

| Severity | File | Issue | Recommendation |
|----------|------|-------|-----------------|
| 🔴 High | `.mcp.json` (project root) | Live n8n Cloud MCP bearer token stored in plaintext in a project file (not gitignored — project is not currently a git repo, but the file is world-readable on disk) | Move to an env-var-based credential or a gitignored local override; rotate if this file has ever left the local machine |
| 🟡 Medium | Live workflow node `현재 토큰 불러오기` / `(갱신용)` | Threads long-lived access token hardcoded as `SEED_TOKEN` literal inside Code node source (this is the documented/accepted pattern per spec, but worth re-flagging since it is a real credential sitting in workflow JSON) | Acceptable for single-operator use as designed; do not export/share this workflow's JSON externally without stripping the token first |
| 🟢 Info | Local `coupang_threads_workflow.json` | Only contains placeholder tokens/IDs, not real secrets | No action needed |

## 5. Performance Notes

Not formally measured, but observable from execution timestamps: a full successful run currently takes **~40–70 seconds** (dominated by the two/three 30-second Wait nodes), up from ~30–45s when waits were 15s. This is a deliberate reliability trade-off (per the live-only inline note on the new wait node), not a regression to flag.

## 6. Workflow Structure Compliance

| Expected (per Plan §6.3) | Actual (live) | Status |
|---------------------------|----------------|--------|
| Branch A: 12-node manual posting chain | 13 nodes — one additional Wait node (`대기 30초 (게시 확인)`) inserted | ⚠️ Structure grew, undocumented |
| Branch B: 4-node scheduled token refresh | 4 nodes, structurally unchanged | ✅ |
| Separate Error Workflow file, wired via Settings → Error Workflow | Does not exist; not wired | ❌ |

---

## 7. Overall Score

```
┌─────────────────────────────────────────────────────┐
│  Overall Score: 52/100                               │
├─────────────────────────────────────────────────────┤
│  Plan/Spec Match:      44 points                     │
│  Code Convention:      65 points                     │
│  Security:             55 points                     │
│  Core Bug Resolution:   0 points (FR-04 unresolved,  │
│                         documented fix never applied)│
│  Execution Reliability: 85 points (7/18 runs failed, │
│                         but 5 consecutive successes) │
└─────────────────────────────────────────────────────┘
```

---

## 8. Recommended Actions

### 8.1 Immediate

| Priority | Item | Location | Notes |
|----------|------|----------|-------|
| 🔴 1 | Confirm whether the reply is actually landing as a reply on Threads itself (not just "execution succeeded") | Threads account / Threads API response inspection | This is the single open item blocking FR-04 sign-off |
| 🔴 2 | Decide on ONE fix strategy for the reply bug — either apply `.first()` everywhwere as originally planned, or keep the new propagation-delay wait node, not both half-applied | `응답 파싱 및 댓글 텍스트 구성`, `본문 게시`, `댓글 컨테이너 생성`, `댓글 게시` nodes | Currently the workflow has neither fix fully/consistently applied |
| 🔴 3 | Move the n8n MCP bearer token out of plaintext `.mcp.json` or restrict its exposure | `.mcp.json` | |

### 8.2 Short-term

| Priority | Item | Expected Impact |
|----------|------|-------------------|
| 🟡 1 | Fix `현재 토큰 불러오기 (갱신용)` Code node mode back to `runOnceForAllItems` | Removes a latent-failure pattern identical to a previously-fixed real bug |
| 🟡 2 | Either build the Telegram error-alert workflow for real, or update the Plan/spec docs to stop describing it as implemented | Removes the largest doc-vs-reality gap found in this analysis |
| 🟡 3 | Re-export the live workflow JSON and overwrite the stale local `coupang_threads_workflow.json` | Keeps local file useful as a structural reference again |

### 8.3 Long-term (backlog)

| Item | Notes |
|------|-------|
| Let the schedule trigger fire at least once for real | Branch B has 0 live executions so far — token refresh is entirely unverified in production |
| Coupang Partners product API integration | Unchanged from Plan, still not started |

---

## 9. Plan Document Updates Needed

- [ ] FR-04: change status from "Blocked — bug in progress, fix believed applied" to "Blocked — documented fix never applied live; different undocumented mitigation in place, unverified"
- [ ] FR-07: change status from "Done (unverified wiring)" to "Not started — design only, no workflow built"
- [ ] §3.1/§6.2: update model name, prompt tone/rules, and comment text to match what's actually live
- [ ] §3.2/§5: update wait durations (15s → 30s) and node count (12 → 13 in Branch A)
- [ ] §8 Next Steps: add "reconcile local JSON export with live canvas" as an explicit step before further design work, since the drift found here is now larger than the spec doc's own disclaimer anticipated

---

## 10. Next Steps

- [ ] Resolve the 🔴 Immediate items above
- [ ] Update the Plan document per §9
- [ ] Re-run this gap analysis after the reply-bug fix strategy is finalized and re-verified against a live Threads post
- [ ] Only after FR-04 and FR-07 are genuinely resolved, consider `/pdca report coupang-threads-auto-posting`

---

## 11. Resolution Log (applied 2026-07-23, same day as this analysis)

The findings above were acted on immediately after this analysis. This section records what changed and what is still blocked — the findings themselves are left unedited above for an accurate historical record.

| Finding | Action Taken | Remaining |
|---------|--------------|-----------|
| FR-04: `.item` never fixed to `.first()` live | Applied `.first()` consistently across all 4 affected nodes on the **live** n8n workflow (`응답 파싱 및 댓글 텍스트 구성`, `본문 게시`, `댓글 컨테이너 생성`, `댓글 게시 (제휴링크)`) via `n8n-mcp` `update_workflow`. Kept the existing propagation-delay wait node as a second, independent mitigation rather than picking only one theory. | A real end-to-end run still needs to be checked directly in the Threads app (not just "execution: success") to fully confirm the reply lands correctly — this was **not** run, since it would publish a real post |
| FR-07: error-alert workflow didn't exist | Built it for real: new n8n workflow `쿠팡 파트너스 - 오류 알림 (텔레그램)` (id `j8NT6Clw2sGilnnx`), 3 nodes (Error Trigger → pattern-matching Code node → Telegram sendMessage), validated and created via the n8n Workflow SDK. Local `coupang_threads_error_alert.json` re-created to match | **Blocked**: no Telegram Bot credential exists in the n8n account, so the workflow cannot be published (n8n refuses to publish a workflow with an unconfigured credential) and cannot yet be wired as this workflow's Error Workflow setting. Needs a real Telegram Bot Token + Chat ID from the project owner |
| Convention violation: Branch B Code node mode | Fixed live — `현재 토큰 불러오기 (갱신용)` mode corrected from `runOnceForEachItem` back to `runOnceForAllItems` | None — confirmed via `get_workflow_details` after the fix |
| Undocumented model/prompt/wait-time drift | Reconciled: local `coupang_threads_workflow.json` re-exported to match the live workflow's actual current structure (model `meta/llama-3.3-70b-instruct`, current prompt rules, 30s waits, extra wait node), while keeping the project's established convention of placeholder-only secrets (`threads_user_id`, `SEED_TOKEN`) in the checked-in file | None |
| Missing error-alert workflow file locally | `coupang_threads_error_alert.json` created, mirroring the new live workflow | None |
| Security: `.mcp.json` plaintext bearer token | **Not changed** — this is the project owner's live n8n auth token; rotating or relocating it needs their decision (and possibly action in the n8n UI), not a unilateral edit | Awaiting project owner's decision |
| Plan document drift | Plan doc (`coupang-threads-auto-posting.plan.md`) updated per §9 above: FR-04/FR-07 statuses, architecture table, risks, conventions, next steps, version history | None |

**Updated Match Rate estimate after fixes**: the two ❌ items (FR-04, FR-07) are now ⚠️ (structurally fixed/built, pending external confirmation/credentials) rather than ❌. Re-run this analysis after the Telegram credential is wired and a real end-to-end Threads check is done to get a final, confirmed Match Rate.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-07-23 | Initial gap analysis, cross-checked against live n8n instance via n8n-mcp (not just local files) | nicetoya@fastlane.kr |
| 0.2 | 2026-07-23 | Added Resolution Log — fixes applied live for FR-04 (reply bug) and FR-07 (error-alert workflow built), Branch B convention violation fixed, local files re-synced. Two items remain blocked on user input (Telegram credential, `.mcp.json` secret handling) | nicetoya@fastlane.kr |
