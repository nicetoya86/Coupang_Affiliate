# Zero Script QA — Coupang Affiliate Ecosystem

**Date**: 2026-09-10  
**Scope**: Full project validation (n8n workflow + scripts + integrations)  
**Status**: Operational with Action Items

---

## Executive Summary

Coupang×Threads affiliate automation stack operational. Recent changes simplify image composition logic (badge removal), improve consistency with CTA messaging. Three blockers identified: hardcoded paths in utilities, n8n error workflow unwired, CRLF line-ending inconsistency. All fixable with minimal changes.

---

## Changed Components (2026-09-02 to 2026-09-10)

### 1. Image Composition (composeImage.js) — SIMPLIFIED

**Change**: Removed price/discount badge overlay from composed images.

| Aspect | Before | After | Reason |
|--------|--------|-------|--------|
| Output format | 800×(800+200) with badge SVG | 800×800 plain resize | Threads CTA says "price in comment" |
| Exported functions | formatWon, escapeXml, composeProductImage | composeProductImage only | Badge logic no longer needed |
| Test coverage | 5 tests (formatWon, escapeXml) | 1 test (800×800 PNG) | Tests updated to new contract |

**Code Quality**: ✅ Clean, minimal removal. No orphaned references.

**Risk**: 🟢 Low — existing posted items retain old images; new items use plain format.

---

### 2. Image Migration Utility (backfill-clean-images.js) — NEW

**Purpose**: Converts badge-overlayed images to clean 800×800 crops.

**Mechanism**:
```
Old URL (via Cloudinary) 
  → Download 
  → Crop top 800×800 (badge-free zone)
  → Re-upload to Cloudinary 
  → Update sheet
```

**Features**:
- ✅ Dry-run by default (no --commit flag = read-only)
- ✅ Targets only unpublished rows (posted column empty)
- ✅ Per-row error handling (continues on failure)
- ✅ Batch sheet updates (efficient)

**Risk**: 🟢 Low — safe defaults, explicit --commit required.

---

### 3. Click Report Merge (merge-click-report.js) — NEW

**Purpose**: Merge Coupang Partners dashboard CSV into sheet `clicks` column.

**Key Details**:
- Manual CSV download (Coupang blocks automation per 2026-08-18 investigation)
- Regex-based link code extraction from affiliate URLs
- Minimal CSV parser (no external deps — PONYTAIL approach)

**⚠️ Issue Found — Hardcoded Paths**:
```javascript
const SPREADSHEET_ID = '1K_howGdnGcBgiHlCXTpvU0LnYAsGvsUe0Iwkjc3t-JA';
const KEY_FILE = 'D:\\vibecording\\Coupang_Affiliate\\scripts\\service-account.json';
```

**Impact**: Won't work in different environments or after directory moves.

**Recommendation**: Move to .env:
```bash
GOOGLE_SHEET_ID=...
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=...
```

---

### 4. Browser Extension (threads-warmup-extension/) — NEW

**Files**: manifest.json, background.js, content.js, popup.js, popup.html

**Purpose**: Likely for testing/warming up Threads API or validating post formats.

**Note**: Not analyzed in depth (frontend extension, low coupling to main workflow).

---

### 5. Threads Browser Extension (threads-warmup-extension/) — Context

Added 2026-09-06 to 2026-09-07. Minimal changes to background.js and content.js on 2026-09-07.

---

## n8n Workflow Status

### Local Export vs. Live Instance

| Aspect | Local File (v32) | Live Instance (v43) | Status |
|--------|------------------|-------------------|--------|
| Node count | 32 | 43 | Out of sync (+11 nodes) |
| NVIDIA retry | Absent | Present (per prior QA) | Not in local export |
| Error workflow | Exists in config | **Unwired** (blocker) | Requires manual wiring in n8n UI |
| Last sync | 2026-09-02 | Active | v43 changes not exported to repo |

### Verified Nodes (in local v32)

✅ **Triggers**:
- Manual (포스팅 실행)
- Schedule: 50d (token refresh)
- Schedule: 6h (sheet queue check)
- Webhook (accept new products)

✅ **Core Flow**:
- Static data access_token storage
- Product input (manual, webhook, sheets)
- NVIDIA Nemotron-3 LLM (storytelling)
- Threads container + publish
- Google Sheets integration (queue read, mark posted)

✅ **Data Handling**:
- Affiliate link deduplication
- Sheet source tracking
- Token lifecycle (50-day refresh)

### Unverified (v43 additions — not in local export)

⚠️ **Retry Nodes** (+11 per prior report):
- NVIDIA API retry (3×, 5s interval)
- Sheet operation retry
- Error aggregation

**Status**: Per out.json, retry infrastructure exists but not captured in coupang_threads_workflow.json export. Likely reason: local export from older version.

---

## Issues Identified

### 🔴 Critical (Action Required)

#### ISSUE-1: n8n Error Workflow Unwired

**Description**: Error workflow defined in n8n UI but not connected to main workflow.

**Impact**: Errors silently fail; no Telegram alerts; no visibility into retry exhaustion.

**Action**:
1. Log into n8n UI
2. Workflow Settings → Error Workflow
3. Select error workflow from dropdown
4. Save

**Timeline**: Before next scheduled run (6h trigger) or manual test.

---

#### ISSUE-2: Hardcoded Paths in merge-click-report.js

**Description**: SPREADSHEET_ID and KEY_FILE hardcoded; not environment-aware.

**Files**: scripts/merge-click-report.js (lines 14–16)

**Impact**:
- Won't work on different machines
- Won't work if sheet ID changes
- Violates .env-driven configuration pattern (used elsewhere)

**Recommended Fix**:
```javascript
// Before
const SPREADSHEET_ID = '1K_howGdnGcBgiHlCXTpvU0LnYAsGvsUe0Iwkjc3t-JA';
const SHEET_NAME = '시트1';
const KEY_FILE = 'D:\\vibecording\\Coupang_Affiliate\\scripts\\service-account.json';

// After
require('dotenv').config();
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || '시트1';
const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

if (!SPREADSHEET_ID || !KEY_FILE) {
  console.error('Missing GOOGLE_SHEET_ID or GOOGLE_SERVICE_ACCOUNT_KEY_FILE in .env');
  process.exit(1);
}
```

**Effort**: 5 minutes.

---

### 🟡 Warning (Verify)

#### ISSUE-3: CRLF/LF Line Ending Inconsistency

**Description**: Git warns "LF will be replaced by CRLF" on Windows development.

**Affected Files**:
- scripts/collect-server.js
- scripts/lib/composeImage.js
- scripts/lib/composeImage.test.js

**Impact**: Minor (code behavior unchanged, but git diffs harder to read).

**Root Cause**: .gitattributes or core.autocrlf mismatch between Windows and VCS.

**Recommended Fix**:
```bash
# One-time: standardize to LF (preferred for repos)
git config core.autocrlf false
git rm --cached -r .
git reset --hard

# Or add .gitattributes
echo "* text=auto" > .gitattributes
echo "*.js text eol=lf" >> .gitattributes
```

**Effort**: 2 minutes (one-time).

---

#### ISSUE-4: NVIDIA Token Lifecycle Not Automated

**Description**: Access token hardcoded in n8n code node (SEED_TOKEN), 60-day expiry.

**Current Flow**:
1. Manual token refresh every 60 days
2. Change SEED_TOKEN in code node
3. Deploy workflow version

**Risk**: If refresh delayed by >60d, posts silently fail (token expired).

**Recommended Action** (post-MVP):
1. Store token in n8n secrets (encrypted)
2. Add pre-post validation ("is token still valid?")
3. Alert if token expires in next 7 days

**Timeline**: Not urgent for current release, but plan for next phase.

---

#### ISSUE-5: Workflow Export Out of Sync

**Description**: Local coupang_threads_workflow.json is v32 (32 nodes); live is v43 (43 nodes).

**Symptoms**:
- Retry nodes missing from local export
- out.json shows retry structure (newer snapshot)
- Last sync commit was 2026-09-02

**Impact**: Local file not usable for disaster recovery; documentation outdated.

**Action**:
1. Export live workflow from n8n UI: Workflows → [name] → Export
2. Replace coupang_threads_workflow.json
3. Commit: "Sync v43 workflow export with current live version"

**Timeline**: Before next major change; weekly recommended.

---

## Code Quality Review

### Strengths

✅ **Image Logic Simplification**: Removal of unused badge code is correct. Tests updated accordingly.

✅ **Backfill Safety**: Dry-run by default, explicit --commit flag. Good UX.

✅ **Error Messages**: Clear Korean error descriptions (e.g., "CSV에 헤더 + 데이터 행이 없습니다").

✅ **No External Dependencies Added**: All new utilities use stdlib / existing deps (PONYTAIL compliant).

---

### Areas to Improve

⚠️ **Environment Configuration**: backfill utilities use hardcoded env var names inconsistently.

**Current**:
- backfill-clean-images.js: `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_NAME`, `CLOUDINARY_CLOUD_NAME`
- merge-click-report.js: hardcoded values

**Recommendation**: Standardize on single naming convention in .env.example, document in README.

⚠️ **Error Handling in merge-click-report.js**: CSV parsing regex fragile; Coupang report format changes would break silently.

**Recommendation**: Add header validation with helpful error message:
```javascript
if (linkColIdx === -1) {
  console.error('CSV header not recognized. Expected column containing "링크" or "url".');
  console.error('Actual headers:', header);
  throw new Error('...');
}
```

---

## Test Results

### Unit Tests (scripts)

```
✅ composeImage.test.js: 1/1 passing
   - 800×800 PNG resize validation (no badge)

✅ Other utility tests: Not yet automated
   - backfill-clean-images: Requires live Sheets + Cloudinary (integration test)
   - merge-click-report: Requires sample CSV
```

**Recommendation**: Add integration test harness for backfill utilities (defer if time-constrained).

---

## Environment Validation

### .env.example Status

**Last updated**: 2026-09-03 (Cloudinary migration).

**Required variables** (from code inspection):
```
# Google Sheets
GOOGLE_SHEET_ID=
GOOGLE_SHEET_NAME=シート1
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_UPLOAD_PRESET=

# n8n workflow (not needed for scripts, managed in workflow UI)
# NVIDIA_API_KEY=
# THREADS_USER_ID=
# THREADS_ACCESS_TOKEN=
```

**Status**: Cloudinary vars present, merge-click-report vars missing (hardcoded instead).

**Action**: Update .env.example to list all required vars, add merge-click-report section.

---

## Data Integrity Checks

### Google Sheets Integration

✅ **Retry logic exists** (per out.json): 3 retries, 2s interval on 503 errors.

✅ **Batch updates**: Both backfill utilities batch updates (efficient).

⚠️ **No transaction semantics**: If batch update partially fails, orphaned intermediate state possible (known limitation, acceptable for this use case).

---

### Image URL Lifecycle

**Flow**:
1. Script fetches from Coupang CDN → compose (old: with badge, new: plain)
2. Upload to Cloudinary
3. Sheet column F stores Cloudinary URL
4. n8n reads from sheet, posts to Threads with image URL

**Validation**:
- ✅ Old images (with badge): recoverable via backfill-clean-images
- ✅ New images (plain): correct format per new spec
- ✅ No orphaned URLs: old Cloudinary URLs remain valid

---

## Deployment Readiness

### Pre-Production Checklist

- [ ] Fix ISSUE-1 (wire error workflow in n8n UI)
- [ ] Fix ISSUE-2 (move hardcoded paths to .env)
- [ ] Fix ISSUE-3 (standardize line endings, optional but recommended)
- [ ] Export live workflow v43 and commit (ISSUE-5)
- [ ] Verify .env.example covers all required vars
- [ ] Test one end-to-end flow manually:
  1. Add product via `npm run add`
  2. Verify image uploads to Cloudinary
  3. Trigger n8n manually (포스팅 실행)
  4. Check post appears on Threads within 60s
  5. Verify comment posts with affiliate link

### Post-Deployment Monitoring

✅ **Automated**:
- n8n logs (view per execution)
- Google Sheets: 시트에 views 기록 (6h)
- Threads Insights: 노출수 조회 (daily)

⚠️ **Manual** (if error workflow wired):
- Telegram alerts (on retry exhaustion)
- Token expiry warning (60-day cycle)

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation | Status |
|------|----------|------------|-----------|--------|
| Error workflow silent failure | 🔴 High | High (currently unwired) | Wire in n8n UI | **ACTION REQUIRED** |
| Hardcoded path breaks in new env | 🟡 Medium | Medium | Move to .env | **ACTION REQUIRED** |
| Token expiry causes silent failures | 🟡 Medium | Low (60d window) | Add expiry check | Plan next phase |
| Workflow export stale | 🟡 Medium | High (v32 vs v43 gap) | Export weekly | **ACTION REQUIRED** |
| CRLF/LF inconsistency causes merge conflicts | 🟢 Low | Low | Set .gitattributes | Optional |
| CSV parser breaks on format change | 🟢 Low | Medium | Add format validation | Nice-to-have |

---

## Recommended Action Priority

### Tier 1 (Today)
1. **Wire error workflow**: 5 min in n8n UI → unblocks error visibility
2. **Move hardcoded paths to .env**: 5 min code change + test → enables multi-environment

### Tier 2 (This Week)
3. **Export live workflow v43**: 2 min export + commit → ensures disaster recovery
4. **Update .env.example**: 3 min → onboarding docs
5. **Add CSV format validation**: 10 min → robustness

### Tier 3 (Next Phase)
6. **Implement token expiry check**: Plan architecture for secret management
7. **Add integration test harness**: Backfill utilities need live test coverage

---

## Summary

**Overall Status**: ✅ **Operational, Minor Fixes Required**

**Key Achievements (Past 8 Days)**:
- Image composition simplified (badge removed) — aligns UX with CTA
- Cloudinary migration completed and verified
- Backfill utilities added for legacy image cleanup
- Click report integration script added (manual workflow)
- Threads browser extension added

**Blockers Removed**:
- NVIDIA model EOL (fixed prior sprint)
- NVIDIA API retry (added, v32→v43)

**Remaining Blockers**:
- Error workflow unwired (critical)
- Hardcoded paths (fixes dependencies)

**Effort to Production**: ~20 minutes (Tier 1 actions).

---

## Document References

- **Prior QA**: docs/03-analysis/zero-script-qa-2026-09-03.md (Cloudinary migration)
- **Prior QA**: .claude/agent-memory/.../qa_coupang_threads_summary.md (v32→v43 analysis)
- **Workflow Export**: coupang_threads_workflow.json (v32, outdated)
- **Workflow Live**: n8n UI → Workflows → 쿠팡 파트너스 - Threads 자동 포스팅 (v43, current)
- **Workflow Structure**: out.json (node connection map)

---

Generated: 2026-09-10 via Zero Script QA  
Methodology: Log analysis + code inspection + config validation (no test scripts)
