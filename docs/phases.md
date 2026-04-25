# AccessAudit - Build Phases

Each phase gets its own: brainstorm → spec → plan → build cycle.

| Phase | Subsystem | Status | Why This Order |
|-------|-----------|--------|----------------|
| 1 | Project scaffolding + Auth + DB schema | Spec Done | Foundation — everything depends on this |
| 2 | Scanner service (Puppeteer + axe-core + BullMQ) | Complete | Core product value — can't demo without it |
| 3 | AI fix suggestions (Claude Haiku) | Complete | The differentiator — makes scanner output 10x more useful |
| 4 | Agency dashboard (site mgmt, scan triggers, violations) | Complete | Where users live day-to-day |
| 5 | Billing (Dodo Payments — checkout, webhooks, plan enforcement) | Complete | Gate revenue — needed before launch but not before dev |
| 6 | Client deliverables (PDF reports, badges, shared views, VPAT) | Complete | Agency selling tool — needed for launch |
| 7 | White-label subdomain routing | Complete | Agency tier feature |
| 8 | Landing page + launch prep | Not Started | Last — ship when product works |

## Phase Dependencies
```
Phase 1 (foundation) ──→ Phase 2 (scanner) ──→ Phase 3 (AI layer)
                    ──→ Phase 4 (dashboard) ──→ Phase 5 (billing)
                                            ──→ Phase 6 (deliverables)
                                            ──→ Phase 7 (white-label)
                                                        ──→ Phase 8 (launch)
```

Phase 4-7 can partially parallelize once Phase 2-3 are done.
