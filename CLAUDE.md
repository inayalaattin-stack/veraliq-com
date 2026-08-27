# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes, merged with
VERALIQ-specific project rules. Source of the generic guidelines:
[jp-guiang/claude-behaviour-skills](https://github.com/jp-guiang/claude-behaviour-skills).

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## VERALIQ-specific rules (project standing instructions)

These apply on top of the generic guidelines above and take precedence where they conflict.

- **Never rewrite from scratch.** Extend/patch existing, working code. Do not replace a working
  file or module wholesale to "clean it up."
- **Never break existing data or functionality.** "Don't break the existing system" is about
  data and behavior, NOT design — the visual design/UI is free to be upgraded at any time; only
  working features and stored data must survive a change.
- **No mockups, no fake/placeholder data.** Every feature shipped must work against real data
  paths (real D1 queries, real API calls) — no hardcoded demo values presented as if they were
  live.
- **Test before claiming done.** Never report a feature as complete without having actually run
  it (unit test, `node --check`, a real Playwright smoke test, or a manual probe against the
  test harness). If something genuinely could not be tested (e.g. no PowerShell interpreter, no
  Cloudflare credentials in this sandbox), say so explicitly instead of implying it was verified.
- **Provider-agnostic architecture.** `agent-core/` (`orchestrator.js`, `providers.js`,
  `config.js`, `state-machine.js`, `emotion-engine.js`, `widget-runtime.js`) is shared across
  `index.html`/`admin.html`/`portal.html` and must stay persona-agnostic and provider-swappable —
  VERALIQ Core owns memory and state, not any single LLM/avatar/TTS vendor.
- **Zero Trust AI.** No LLM/"brain" provider ever generates SQL or executes arbitrary intent —
  every brain (faq/adminAssistant/companyAssistant) calls fixed, deterministic backend functions.
- **RBAC tiers are additive.** New roles map onto a base tier (see `COMPANY_ROLE_BASE_TIER` in
  `worker-portal/portal-api-worker.js`) so existing `company_owner`/`company_staff` behavior is
  never altered by adding a role. Elevated permissions for a new role are added explicitly
  per-route, never implicitly via the tier map.
- **Migrations.** New schema changes go in `worker-portal/migrations/NNN_description.sql`
  alongside `schema.sql` (the source of truth for fresh installs). `ALTER TABLE ADD COLUMN`
  migrations are NOT safely re-runnable (SQLite has no `ADD COLUMN IF NOT EXISTS`) — document
  that plainly in the migration file's header comment.
- **Deploy/credential boundary.** This sandbox (and the device-bridge shell) has no Cloudflare
  (`wrangler login`) or GitHub push credentials. Ship code changes via: sandbox commit →
  `git format-patch` → `SendUserFile` → `device_commit_files` to the user's checkout →
  `git am --keep-cr` via device_bash. The user runs `git push`, `wrangler d1 execute`
  (migrations), and `wrangler deploy` themselves from their own PowerShell.
- **Business positioning ("insansız satış" / unmanned sales).** Customer-facing copy (index.html,
  i18n.js, terms.html) must never imply the client company still needs a human sales team to
  qualify, negotiate, or close. The Agent runs the full sales process end-to-end; the only human
  touchpoint is authorization for specific actions the company has flagged as requiring approval
  (e.g. a discount above a threshold), via the existing `approval_requests` system. Before adding
  or editing any customer-facing text, check it doesn't reintroduce "hands off to your sales
  team" framing.
- **Honest reporting.** State plainly what was tested vs. what's a known gap or simplification
  (e.g. "`company_sales_agent` currently has the same access as `company_staff` — no row-level
  restriction yet"). Never claim a script/flow was verified end-to-end if a credential or
  interpreter boundary made that impossible in this environment.
