# Handoffs

## 2026-07-24 — Owner decisions to Studio

Handoff:
- From: Hami / project setup
- To: `project-orchestrator`
- What changed: strict reservation verification was removed; proximity is enough for Here Now.
- Key decisions:
  - Upcoming is self-declared.
  - Here Now is a recent 500-meter foreground check.
  - Exactly one active hotel.
  - Payment is deferred.
  - No hard identity or reservation data.
- Files: `CLAUDE.md`, `.studio/brief.md`, `.studio/decisions.md`, `.studio/agent-plan.md`, `.studio/backlog.md`
- Risks: copy must not imply hotel/reservation verification; hotel hopping and GPS spoofing are accepted MVP risks to measure.
- Recommended next agent: `mobile-architect`

## Handoff template

```text
Handoff:
- Date:
- From agent:
- To agent:
- What I did:
- Key decisions:
- Files touched:
- Verification:
- Risks / blockers:
- Recommended next agent:
```

