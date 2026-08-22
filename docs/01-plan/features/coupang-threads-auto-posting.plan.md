---
template: plan
version: 1.2
description: PDCA Plan phase document template with Architecture and Convention considerations
variables:
  - feature: coupang-threads-auto-posting
  - date: 2026-07-22
  - author: nicetoya@fastlane.kr
  - project: Coupang Affiliate — Threads Auto-Posting
  - version: 0.1
---

# coupang-threads-auto-posting Planning Document

> **Summary**: n8n workflow that generates a storytelling Threads post via an LLM and auto-publishes it with the Coupang Partners affiliate link placed in a reply comment, including token refresh and error alerting.
>
> **Project**: Coupang Affiliate — Threads Auto-Posting
> **Version**: 0.1
> **Author**: nicetoya@fastlane.kr
> **Date**: 2026-07-22
> **Status**: Draft (retroactive plan — workflow already built and partially tested; documenting current state and remaining work)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Manually writing and posting Coupang Partners promotional content to Threads every time is slow, inconsistent, and risks omitting the mandatory economic-interest disclosure required by Coupang Partners policy. |
| **Solution** | An n8n automation that takes product info, generates hook + storytelling copy via an LLM (NVIDIA API), force-inserts the policy disclosure text via code (not the LLM), publishes the post, then publishes the affiliate link as a reply comment — with a separate branch to auto-refresh the 60-day Threads access token and a Telegram-based error alert workflow. |
| **Function/UX Effect** | One manual trigger run (or future scheduled run) produces a compliant, on-brand post + reply within ~70-100 seconds (three 30s waits for Threads container processing), with no copy-paste steps for the operator. |
| **Core Value** | Consistent policy compliance (disclosure always present, no exaggerated/false-testimonial claims) combined with reduced operator effort per post, while keeping a human-in-the-loop trigger to avoid "low-quality mass content" policy risk. |

---

## 1. Overview

### 1.1 Purpose

Automate the repetitive parts of Coupang Partners affiliate marketing on Threads (copywriting, disclosure placement, posting, reply-linking) while keeping the parts that carry compliance or judgment risk (product selection, final trigger) under manual control.

### 1.2 Background

- Single Threads account, manual trigger for now; volume scaling across multiple accounts is deferred pending stability and Meta/Coupang policy risk review.
- Product sourcing is currently manual copy-paste into the workflow; Coupang Partners API integration (product/deep-link API) is planned but not yet built.
- Coupang Partners operating policy (p.61) requires the economic-interest disclosure to be clearly presented, ideally at the start of the post — this is a hard compliance constraint, not a style preference.
- This plan is written **retroactively**: the workflow already exists and has had one successful live post. It is being documented now to hand off cleanly between n8n (live canvas) and Claude Code (file-based iteration), and to formally track the one open bug and remaining TODOs.

### 1.3 Related Documents

- Handoff spec: `coupang_threads_project_spec.md` (authoritative source of current live state; treat as more current than the JSON files if they ever conflict)
- Main workflow export: `coupang_threads_workflow.json`
- Error alert workflow export: `coupang_threads_error_alert.json` (referenced in spec; verify present in project root)
- Diagram/guide: `coupang_threads_guide.html`

---

## 2. Scope

### 2.1 In Scope

- [x] LLM-generated hooking post body (NVIDIA API, `meta/llama-3.3-70b-instruct`)
- [x] Code-enforced Coupang Partners disclosure text on post + comment (never left to the LLM)
- [x] Post → wait → publish → wait → reply-comment (affiliate link) → wait → publish chain
- [x] Threads access token storage via workflow static data (no external DB)
- [x] Scheduled token auto-refresh branch (every 50 days, ahead of the 60-day expiry)
- [x] `.first()` consistency fix applied to all 4 reply-chain nodes on the live workflow (2026-07-23)
- [x] Telegram-based error alert workflow **built and live** (n8n workflow `j8NT6Clw2sGilnnx`) — structure complete, code validated
- [ ] Wire a real Telegram Bot credential + Chat ID, then publish the alert workflow and set it as this workflow's Error Workflow — **blocked on user-supplied Telegram Bot Token**
- [ ] End-to-end confirmation: trigger a real run and verify in the Threads app that the comment actually lands as a reply, not a new post

### 2.2 Out of Scope (for this cycle)

- Coupang Partners product/deep-link API integration (still manual product info entry)
- Multi-account / volume scaling
- Switching Branch A from manual trigger to schedule trigger
- Any UI/dashboard — this is a backend-only n8n automation with no frontend

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Generate post body via LLM from product title/description, following hooking + storytelling rules and banning exaggerated/false-testimonial phrasing | High | Done |
| FR-02 | Force-insert the exact Coupang disclosure sentence as the first line of both the post and the comment via code (not LLM output) | High | Done |
| FR-03 | Publish post, wait for Threads container processing, then publish | High | Done |
| FR-04 | Publish affiliate link as a **reply** to the just-published post (not a new feed post) | High | Fixed 2026-07-23 — `.first()` applied consistently across all 4 nodes + propagation-delay wait node kept; **awaiting a real end-to-end run to confirm the comment lands as an actual reply on Threads** |
| FR-05 | Persist and reuse Threads access token across runs via workflow static data | High | Done |
| FR-06 | Auto-refresh Threads access token before 60-day expiry (every 50 days) | High | Done — token-loader Code node mode corrected back to `runOnceForAllItems` 2026-07-23; still pending 1 full real-world refresh cycle confirmation (Branch B has never actually fired — `active: false`) |
| FR-07 | Send a Telegram alert on scheduled/automated execution failure, without depending on any AI call (avoid double point of failure) | Medium | Built 2026-07-23 (workflow `j8NT6Clw2sGilnnx`, structure + logic complete) — **cannot be published or wired as Error Workflow until a real Telegram Bot credential + Chat ID are supplied** |
| FR-08 | Replace manual product-info Set node with Coupang Partners API call | Low | Not started |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|--------------------|
| Compliance | Disclosure text present verbatim, first line, in 100% of posts and comments | Manual spot-check of `응답 파싱 및 댓글 텍스트 구성` node output per run |
| Reliability | Token refresh succeeds without manual intervention across at least one full 50-day cycle | n8n Executions log for `50일마다 자동 실행` branch |
| Failure visibility | Any automated (non-manual) execution failure produces a Telegram alert within the same run | n8n Executions + Telegram message received |
| Content safety | No banned superlative claims ("최고", "최저가", "1등", "무조건") or first-person false-testimonial phrasing in generated copy | Manual review of generated `post_text` before/at publish |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] `reply_to_id` fix confirmed working on live n8n canvas (comment posts as a true reply) — fix applied 2026-07-23, real-world confirmation still pending
- [x] Post successfully published to Threads at least once end-to-end (7 successful executions logged as of 2026-07-23, 5 of them consecutive)
- [ ] Telegram Bot credential + Chat ID wired, error-alert workflow published and set as Error Workflow
- [ ] Token refresh branch confirmed to fire and succeed at least once on schedule
- [ ] `docs/` PDCA trail (this plan → design → analysis → report) kept in sync with live n8n canvas changes

### 4.2 Quality Criteria

- [ ] Zero occurrences of missing/duplicated disclosure text across test runs
- [ ] Zero occurrences of the comment landing as an independent feed post
- [ ] n8n workflow JSON export kept as the structural source of truth; live-canvas-only values (User ID, tokens, credentials, product info) explicitly called out as not synced, per spec doc warning

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Comment posts as new feed instead of reply (`reply_to_id` resolves empty silently — Threads API doesn't error) | High (breaks the core affiliate-link delivery mechanism) | Was confirmed occurring; fix applied 2026-07-23 | Applied `.first()` consistently on the **live workflow** (not just the local file) across all 4 affected nodes, kept the propagation-delay wait node as a second independent mitigation. Real Threads-side confirmation (not just "execution succeeded") is still the one remaining open item |
| Threads 60-day token expires before refresh branch runs correctly | High (all posting breaks) | Medium (untested over a full cycle — workflow is still `active: false`, so Branch B has never fired) | Branch B scheduled at 50-day interval (10-day buffer); token-loader Code node mode bug fixed 2026-07-23 (was `runOnceForEachItem`, now `runOnceForAllItems`); still needs one real firing to confirm |
| LLM (NVIDIA free tier) returns 503/congestion errors | Medium (blocks post generation) | Medium (already happened once) | Already mitigated by switching models (currently `meta/llama-3.3-70b-instruct`, changed again from `llama-3.1-8b-instruct` live without this doc being updated at the time — now reconciled) |
| Fully unattended scheduling could trigger Coupang's "low-quality mass content" policy risk | Medium (account/policy risk) | Low while manual-trigger-only | Keep manual trigger (or at minimum a review gate) before switching Branch A to schedule |
| Excluded-category products (health supplements, medical devices, gift cards, Samsung/Apple phones) get the same prompt treatment as regular products | Medium (policy violation) | Medium (product info is manually entered, no category guard yet) | No automated guard currently exists — operator must manually avoid excluded categories; consider adding a category-check step in a future iteration |
| Live n8n canvas and exported JSON drift apart over time | Low-Medium (confusion during handoff) | High (already happened once — the gap analysis on 2026-07-23 found the local file badly stale) | Local `coupang_threads_workflow.json` re-synced from the live canvas on 2026-07-23; going forward, re-export before trusting the local file for anything beyond a general reference |
| n8n MCP bearer token stored in plaintext in `.mcp.json` | Medium (credential exposure) | Confirmed present | Flagged 2026-07-23; not yet resolved — requires a decision from the project owner (rotate token via n8n UI vs. move to a gitignored/env-based config) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

This is a backend automation workflow (n8n), not a web application — the Starter/Dynamic/Enterprise levels (which describe frontend-oriented folder structures) do not directly apply. Marked for context only:

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure (`components/`, `lib/`, `types/`) | Static sites, portfolios, landing pages | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration (bkend.ai) | Web apps with backend, SaaS MVPs, fullstack apps | ☐ |
| **Enterprise** | Strict layer separation, DI, microservices | High-traffic systems, complex architectures | ☐ |
| **N/A — Automation Workflow** | n8n visual workflow, no app framework | Scheduled/triggered integrations between external APIs | ✅ |

### 6.2 Key Architectural Decisions

| Decision | Options Considered | Selected | Rationale |
|----------|--------------------|----------|-----------|
| Orchestration | n8n / custom script / Zapier | n8n | Visual workflow already built, self-hosted control, native `waitFor`/staticData support |
| LLM provider | NVIDIA API / OpenAI / Anthropic | NVIDIA (currently `meta/llama-3.3-70b-instruct`) | Free tier available; OpenAI-compatible endpoint simplifies integration; switched off the original 550B model after 503 congestion errors, then iterated again live to a 70B model — tone/prompt rules were also substantially rewritten live (반말/친구체, hearsay phrasing, 1-2 emoji required, ~200-byte cap) since this table was first written |
| Disclosure text placement | Let LLM include it in the prompt / hard-code via post-processing | Hard-coded via code node | LLM output can't be trusted to reproduce a legally-required exact phrase every time; code guarantees 100% consistency |
| Token persistence | External DB / n8n workflow static data | Workflow static data (`$getWorkflowStaticData('global')`) | Avoids standing up a database for a single token value; adequate for single-account, single-workflow scope |
| Error handling | Re-run failed step with AI-based diagnosis / static pattern-matching alert | Static pattern-matching + Telegram | Avoids a second point of failure (AI call inside the error handler itself); keeps the alerting path maximally simple and independent |
| Affiliate link delivery | Put link directly in main post / put link in reply comment | Reply comment | Keeps the main post's storytelling clean and matches common Threads promo conventions; currently the source of the one open bug |

### 6.3 Clean Architecture Approach

Not applicable in the traditional layered sense — this is a single n8n workflow graph. The structural equivalent is the two-branch design below:

```
Selected Approach: n8n two-branch single workflow + one dependent error workflow

Workflow Structure:
┌─────────────────────────────────────────────────────────────┐
│ Branch A (Manual Trigger): Product → LLM → Disclosure       │
│   insert → Post publish → 30s wait (propagation) →          │
│   Reply container → 30s wait → Reply publish                │
│   (13 nodes total, up from 12 — extra wait node added live) │
├─────────────────────────────────────────────────────────────┤
│ Branch B (Schedule Trigger, 50d): Token load → Refresh      │
│   request → Save new token to workflow static data          │
├─────────────────────────────────────────────────────────────┤
│ Error Workflow (separate n8n workflow, id j8NT6Clw2sGilnnx):│
│   Error Trigger → Pattern-match to plain-language message → │
│   Telegram send (built 2026-07-23; not yet publishable —    │
│   needs a real Telegram Bot credential)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [ ] `CLAUDE.md` has coding conventions section — not present (no project-level CLAUDE.md found; only user-global one)
- [ ] `docs/01-plan/conventions.md` exists — not present
- [ ] `CONVENTIONS.md` exists at project root — not present
- [ ] ESLint / Prettier / TypeScript config — not applicable (no application source code; n8n JSON + Markdown only)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|----------------|-----------|:--------:|
| **Node naming** | Korean, descriptive, consistent (e.g. `본문 게시`, `대기 15초`) | Keep Korean naming convention for all new nodes to match existing style | Medium |
| **Code node mode** | Established: always `runOnceForAllItems` (mixing modes caused a real bug — see spec §7 issue #1) | Enforce this for every new Code node | High |
| **Item reference style** | Established: use `.first().json`, not `.item.json`, after any node followed by a Wait/branch. Fixed live on 2026-07-23 across all 4 affected nodes (previously the rule was documented but not actually applied on the live canvas) | Enforce this for every new expression referencing another node's output | High |
| **Disclosure text handling** | Established: never let the LLM write it; always insert via code | Keep as a hard rule for any future prompt changes | High |
| **Secrets handling** | Credentials stored in n8n Credential store (NVIDIA API Key, Telegram Bot Token) | Continue using n8n Credentials, never hard-code tokens in JSON exports checked into this repo | High |

### 7.3 Environment Variables / Credentials Needed

| Variable / Credential | Purpose | Scope | To Be Created |
|------------------------|---------|-------|:--------------:|
| Threads long-lived access token (60-day, seeded once, then auto-refreshed) | Post/reply/publish calls to Threads Graph API | n8n workflow static data | ☑ (already seeded, per spec) |
| NVIDIA API Key (`nvapi-...`) | LLM storytelling generation | n8n Credential (`httpHeaderAuth`, name `NVIDIA API Key`) | ☑ (already configured) |
| Telegram Bot Token | Error alert delivery | n8n Credential (`telegramApi`, name `Telegram Bot`, referenced but not yet created) | ☐ (blocking item — needs a real Bot Token + Chat ID from the project owner) |
| `threads_user_id` | Target Threads account for posting | Set node (`설정값 (필수 입력)`), live-canvas only value | ☑ (already entered, per spec) |

### 7.4 Pipeline Integration

Not using the 9-phase Development Pipeline for this feature — it is a standalone backend automation rather than a phased app build. Skipping Phase 1/2 schema-and-convention scaffolding as not applicable.

---

## 8. Next Steps

1. [x] Run gap analysis (`/pdca analyze coupang-threads-auto-posting`) comparing this plan against the actual live n8n workflow — done 2026-07-23, Match Rate 44%
2. [x] Apply the `.first()` fix live and correct the Branch B Code node mode — done 2026-07-23
3. [x] Build the Telegram error-alert workflow — done 2026-07-23 (workflow `j8NT6Clw2sGilnnx`), structurally complete
4. [ ] **Blocking**: obtain a real Telegram Bot Token + Chat ID, wire the `telegramApi` credential, publish the alert workflow, and set it as this workflow's Error Workflow
5. [ ] **Blocking**: run (or approve running) a real end-to-end test post and confirm directly in the Threads app that the comment lands as an actual reply
6. [ ] Decide how to handle the plaintext n8n MCP bearer token in `.mcp.json`
7. [ ] Write design document (`coupang-threads-auto-posting.design.md`) once the above are resolved, so it documents a stable, verified implementation rather than a moving target

---

## 9. Amendment: Automated Product Sourcing (added 2026-07-23)

New requirement from the project owner: replace the manual "상품 정보 입력" test data with a fully automated pipeline that (1) logs into Coupang Partners, (2) sequentially works through the recommended-product thumbnail list, (3) generates an affiliate link per product, (4) skips products already posted, and (5) runs every 3 hours.

**FR-09**: Auto-generate a Coupang Partners affiliate link for the next un-posted recommended product | High | Built 2026-07-23 — local Playwright script (`scripts/generate-coupang-link.js`) + new n8n webhook branch (`쿠팡 상품 자동 수집 (Webhook)` → dedup check → `상품 정보 입력 (자동)` → joins the existing chain at `현재 토큰 불러오기`). **DOM selectors unverified against the live Coupang Partners page — first run must be watched with `HEADLESS=false`.**

**FR-10**: Never re-post an already-featured product | High | Built 2026-07-23 — dedup keyed on product ID extracted from `product_url`, stored in n8n workflow `staticData.posted_products` (Supabase was the preferred store but both configured Supabase credentials fail with "incorrect host" — deferred).

**FR-11**: Run the full pipeline every 3 hours unattended | Medium | Documented in `scripts/README.md` (Windows Task Scheduler, `Register-ScheduledTask`, 3-hour repetition) — **not yet registered**; project owner will do this only after validating the script manually first.

**Architecture decision — browser automation vs. official API**: the project owner explicitly chose literal browser automation (Playwright, replicating login → hover → click → copy) over the safer, ToS-compliant official Coupang Partners Open API (deep-link conversion), after this trade-off was surfaced. This carries real account-risk (automated login may violate Coupang's terms) that the owner has accepted knowingly.

**Known limitations carried into this increment**:
- `product_desc` is not reliably obtainable from a thumbnail hover; the script falls back to reusing `product_title`, which may reduce LLM copy quality.
- No automated guard against excluded categories (gift cards, medical devices, etc.) appearing in the recommended-product feed — this was already a flagged risk in §5 and is now more relevant since product selection is fully automated.
- Activating the main workflow (required for the webhook to receive real traffic) also activates Branch B's 50-day schedule trigger simultaneously — both go live together, not independently.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-07-22 | Initial retroactive plan documenting the already-built n8n workflow, its architecture, and the one open bug | nicetoya@fastlane.kr |
| 0.2 | 2026-07-23 | Updated after gap analysis + live fixes: `.first()` fix and Branch B mode fix applied to the live workflow; Telegram error-alert workflow built (unpublished, needs credential); model/prompt/wait-time drift reconciled; new plaintext-secret risk logged | nicetoya@fastlane.kr |
| 0.3 | 2026-07-23 | Added FR-09/FR-10/FR-11: automated Coupang Partners product sourcing via local Playwright script + new n8n webhook/dedup branch, replacing manual product entry. Selectors and Task Scheduler registration still pending real-world validation | nicetoya@fastlane.kr |
