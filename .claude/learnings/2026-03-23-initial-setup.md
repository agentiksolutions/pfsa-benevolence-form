# PFSA Benevolence Form — Initial Learnings (2026-03-23)

## Architecture Decisions Made Tonight

### CLAUDE.md Restructuring
- CLAUDE.md is the entry point: identity, stack, run, doc pointers
- Heavy docs go in `.claude/docs/` — not every session needs full context
- Lean CLAUDE.md = fewer tokens burned on startup

### Rules Extraction
- `.claude/rules/` for auto-loaded rules
- Separate files: form validation rules, data privacy rules, submission handling

### Hooks & Quality
- Pre-commit hooks enforce code quality
- Fast hooks only — fix rather than bypass

### Session Protocol
- Two-tier: Light vs Heavy — self-determine
- PIPELINE.json always updated on close

### Benevolence Form-Specific Patterns
- Application form for PFSA benevolence requests
- Handles sensitive personal/financial information — strict PII protections
- Form submissions must be encrypted in transit and at rest
- Validation must be thorough but compassionate — people in need are filling this out
- Mobile-first design — many applicants will use phones
- Clear, simple language — avoid jargon or complex instructions
- Supabase backend with RLS for data access control
