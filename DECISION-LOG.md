# Decision Log — PFSA Benevolence Form

> Architecture Decision Records (MADR format). Never edit old entries — supersede with new ones.

---

## ADR-0001: Migrated to Cortex Architecture
**Date:** 2026-02-25
**Status:** Accepted
**Context:** Projects were scattered across E:\ with inconsistent naming, no shared context, no auto-commit hooks, and no standardized documentation.
**Decision:** Migrated to E:\Cortex\ with lowercase-dash naming, `main` branch standard, global CLAUDE.md, per-project DECISION-LOG.md, and Stop hook auto-commit.
**Consequences:** All path references updated. Docker, n8n, Nerve Center, vault, and git auto-push all point to new locations. GitHub serves as portability + backup layer.
