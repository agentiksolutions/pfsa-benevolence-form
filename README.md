# pfsa-benevolence-form

The online benevolence application for PFSA (The Public Foundation for Stewardship
Advancement, a 501(c)(3) nonprofit). People in financial hardship apply for emergency
assistance through it. It is live at apply.thepfsa.org and hosted on Vercel.

The form is static HTML. Two Vercel serverless functions handle uploads and submission, the
records and documents go to Supabase, and Resend sends the notification email. Reviewers score
applications in the PFSA Board Portal (app.thepfsa.org). `CLAUDE.md` holds the project context
Claude Code loads, including the upload design and the scoring rules.

## Layout

```
index.html        the application form
thank-you.html    the page shown after a successful submission (linked from index.html)
api/              Vercel serverless functions
docs/             internal working documents (empty so far)
scripts/          command-line tools (empty so far)
config/           non-secret configuration (empty so far)
.claude/          Claude Code settings and project rules
```

## Folder contracts

This project has no build step, so Vercel serves the repository root as the website. A README
inside a folder could be served publicly, so each folder's contract lives here instead.

### api/

- **What goes in:** one TypeScript file per Vercel function. `create-upload-url.ts` mints
  signed upload URLs for each document. `submit-application.ts` validates the record, scores
  it, writes it to Supabase and sends the email.
- **What comes out:** Vercel deploys each file as an endpoint under `/api/`. `index.html`
  calls both.
- **What stays out:** keys and secrets, which are Vercel environment variables. Front-end code
  stays in the HTML pages.

### docs/

- **What goes in:** specs, designs and notes about the form. Empty so far.
- **What comes out:** read by people and Claude sessions. Vercel serves this folder too, so
  nothing private belongs here.
- **What stays out:** applicant data of any kind, which is personal information.

### scripts/

- **What goes in:** command-line tools that support the form. Empty so far.
- **What comes out:** run by hand. No scheduled task or deploy reads it.
- **What stays out:** serverless functions (`api/`) and secrets.

### config/

- **What goes in:** configuration that is safe to commit. Empty so far.
- **What comes out:** nothing reads it yet.
- **What stays out:** secrets, which are Vercel environment variables, and `vercel.json`,
  which Vercel reads from the root.

### .claude/

Holds `settings.json` and project rules in `rules/` (`benevolence-form-constraints.md`), plus
empty `agents/`, `hooks/` and `skills/` folders. Every `.md` in `rules/` loads into every
session and every `.md` in `agents/` is parsed as an agent, so neither gets a README.

## What stays at the root and why

- `index.html` and `thank-you.html`: Vercel serves them as the site. `index.html` links to
  `thank-you.html`, so neither can move.
- `package.json`, `package-lock.json` and `tsconfig.json`: dependencies and TypeScript settings
  for the functions in `api/`.
- `vercel.json`: Vercel reads the rewrites and security headers from it.
- `CONTEXT_PINS.md`: the post-compact hook (`~/.claude/hooks/post-compact-restore.js`) reads
  it from the project root to restore context after a compaction. It must not move.
- `DECISION-LOG.md`: the old decision record. New decisions would go in `decisions/`. It
  stays at the root until Phil decides whether to convert it.
- `.cursorrules`: settings for the Cursor editor. Whether to retire it is Phil's call.
- `.git.corrupt-backup-2026-06-10/`: a local copy of the git folder from the June 2026
  repository corruption. It is gitignored and exists only on this machine. Deleting it is
  Phil's call.

## Open work

Tracked in `philip-brain/PIPELINE.json`.
