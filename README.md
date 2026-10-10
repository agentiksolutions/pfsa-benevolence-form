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
docs/             internal working documents (empty so far, see its README)
scripts/          command-line tools (empty so far, see its README)
config/           non-secret configuration (empty so far, see its README)
.claude/          Claude Code settings and project rules
```

## Folder contracts

This project has no build step, so Vercel serves the repository root as the website.
`.vercelignore` keeps every `.md` file and the `docs/`, `scripts/`, `config/`, `.claude/` and
`_archive/` folders off apply.thepfsa.org. `docs/`, `scripts/` and `config/` each have their own
README. The contracts for `api/` and `.claude/` are below.

### api/

- **What goes in:** one TypeScript file per Vercel function. `create-upload-url.ts` mints
  signed upload URLs for each document. `submit-application.ts` validates the record, scores
  it, writes it to Supabase and sends the email.
- **What comes out:** Vercel deploys each file as an endpoint under `/api/`. `index.html`
  calls both.
- **What stays out:** keys and secrets, which are Vercel environment variables. Front-end code
  stays in the HTML pages.

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
- `.git.corrupt-backup-2026-06-10/`: a local copy of the git folder from the June 2026
  repository corruption. It is gitignored and exists only on this machine. Deleting it is
  Phil's call.

## Open work

Tracked in `philip-brain/PIPELINE.json`.
