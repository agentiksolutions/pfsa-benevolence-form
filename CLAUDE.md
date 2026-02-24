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
- index.html — the application form (4 sections, file uploads, client-side validation)
- api/submit-application.ts — serverless handler (multipart parsing, file upload to Supabase Storage, auto-scoring engine Categories 1-4, DB insert, Resend email notification)
- vercel.json — API rewrites

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

## Do NOT
- Change the form's visual design without approval
- Remove or modify the auto-scoring logic without checking the board-approved rubric
- Touch Supabase table schema here — migrations live in the pfsa-donor-tracker repo (PFSA Board Portal)
