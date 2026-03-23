# PFSA Benevolence Form Context Pins — Survive Compaction

## Identity
- Online benevolence assistance application for PFSA
- Public form where individuals in financial hardship apply for emergency assistance

## URLs
- Live: https://apply.thepfsa.org
- Vercel fallback: pfsa-benevolence-form.vercel.app
- GitHub: agentiksolutions/pfsa-benevolence-form

## Auto-Scoring Engine
Server-side scoring on submission (25/35 pts, Categories 1-4 of board-approved rubric):
- Cat 1: Completeness & Documentation (0-5)
- Cat 2: Financial Need vs Income/Expenses (0-10)
- Cat 3: Crisis Severity & Urgency (0-5)
- Cat 4: Alternatives Explored (0-5)
- Categories 5-6 scored by HUMAN reviewer in app.thepfsa.org

## Tech
- Static HTML/CSS/JS (form UI) + Vercel serverless function (api/submit-application.ts)
- Supabase project: hzuwudjbptrnmfkugqsr (shared with pfsa-donor-tracker)
- Tables: benevolence_applications + benevolence-files storage bucket
- Email notifications: Resend API (thepfsa.org domain)

## Key Files
- index.html — 4-section form with file uploads + client-side validation
- api/submit-application.ts — multipart parsing, file upload, auto-scoring, DB insert, email

## Related Projects
- app.thepfsa.org (Board Portal — benevolence reviewer reads same Supabase tables)
- www.thepfsa.org (public site — links to this form)
