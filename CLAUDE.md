# PFSA Benevolence Application

## What This Is
Online benevolence assistance application for PFSA (501(c)(3), EIN 20-3856434).
Public-facing form where individuals in financial hardship apply for emergency assistance.

## URLs
- **Live:** apply.thepfsa.org
- **Vercel:** pfsa-benevolence-form.vercel.app
- **GitHub:** agentiksolutions/pfsa-benevolence-form

## Stack
- Static HTML/CSS/JS (form UI)
- Vercel serverless function (api/submit-application)
- Supabase (hzuwudjbptrnmfkugqsr) — benevolence_applications table + benevolence-files storage bucket
- Resend API for email notifications (thepfsa.org domain verified — DKIM, SPF, MX green)

## Key Files
- index.html — the application form (4 sections, file uploads, client-side validation). On submit it (1) POSTs file metadata to `/api/create-upload-url`, (2) uploads each document **directly to Supabase Storage** via `uploadToSignedUrl` (pinned `supabase-js@2.95.3` UMD + SRI), then (3) POSTs the small JSON record to `/api/submit-application`.
- api/create-upload-url.ts — serverless handler that mints per-file **signed upload URLs** (service role) after validating field/type/size/count. Returns `{ uploadId, bucket, uploads[] }`.
- api/submit-application.ts — serverless handler. Accepts **JSON** (form fields + uploaded-file metadata), validates `uploadId` (UUID) + rejects storage paths outside `applications/<id>/`, runs auto-scoring Categories 1-4, DB insert, Resend email.
- vercel.json — API rewrites

## Upload architecture (why two endpoints — added 2026-06-24)
Documents are NOT POSTed through the function. Vercel caps serverless **request bodies at ~4.5 MB**; three phone photos exceed that, so the old multipart submit returned **HTTP 413 before the function ran** (applicants saw an "error code"/"Network error"). Files now go browser → Supabase Storage directly via short-lived signed upload URLs minted server-side; the function only ever sees small JSON. Signed-upload tokens (and the service-role key) bypass Storage RLS, so the `benevolence-files` bucket stays locked to authenticated-read-only (see pfsa-donor-tracker migration 019).

## Auto-Scoring Engine
Calculates Categories 1-4 of board-approved Scoring Rubric (25/35 pts) server-side on submission:
- Cat 1: Completeness & Documentation (0-5)
- Cat 2: Financial Need vs Income/Expenses (0-10)
- Cat 3: Crisis Severity & Urgency (0-5)
- Cat 4: Alternatives Explored (0-5)

Categories 5-6 (Past Assistance + Verification Confidence) scored by human reviewer in app.thepfsa.org.

## Environment Variables (Vercel)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY

## Related Projects
- app.thepfsa.org (PFSA Board Portal + benevolence reviewer module) — reads from same Supabase tables
- www.thepfsa.org (public website — links to this form)

## Rules
See @.claude/rules/core-rules.md

## SESSION RULES (Two-Tier)

**Light Session** (< 30 min, single project, no architectural changes):
1. Update PIPELINE.json if tasks changed
2. Git commit and push affected repos

**Heavy Session** (multi-project, architectural changes, new workflows/agents):
1. Update PIPELINE.json
2. Write handoff file to `Maverick/Log/handoffs/YYYY-MM-DD-HHMM-{slug}.md`
3. Update SESSION-HANDOFF.md
4. Update this CLAUDE.md if architecture changed
5. Update Running Doc (E:/Cortex/philip-brain/PFSA/PFSA - Running Doc.md) if project state changed
6. Append to daily roll-up `_Sessions/YYYY-MM-DD.md`
7. Git commit and push all affected repos

**Rule:** Claude Code self-determines which tier applies. Default to Light unless the session touches multiple projects or changes system architecture.

*Last updated: 2026-03-22 (restructured — rules extracted to .claude/rules/)*
