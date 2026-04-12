# Self-Improvement Rule

After any correction, mistake, or unexpected behavior in this session, add the lesson directly to the relevant file in `.claude/rules/` (which auto-loads every session). The lesson should cover:

1. **What happened** — describe the error or correction
2. **Why it was wrong** — explain the impact or risk
3. **The fix applied** — what was done to resolve it
4. **The rule to follow** — the principle to prevent recurrence

## Entry Format
- One lesson per entry — don't bundle multiple corrections
- Keep entries concise and actionable
- Include the date: `### YYYY-MM-DD — {slug}`
- If the file gets long (>100 lines), split into a new topic-specific rules file

## Where to put the lesson
- Find an existing `rules/{topic}.md` that matches the subject
- If no matching file exists, create a new `rules/{topic}.md`
- File name can include the word "lessons" or "learnings" if that's clearer — the content just has to live inside `rules/` to auto-load

**Do NOT create files in `.claude/learnings/`** — that directory was retired in the 3/22 restructure because `learnings/` folders are write-only and nothing auto-reads them. Historical entries live in `.claude/_archive/learnings/` for reference only.

## Cross-Agent Sharing
Post significant learnings to the Discord `#learnings` channel so other agents can incorporate them.
