# Superseded pull request cleanup — 2026-11-06

Open draft branches were compared with current `main`, the integration handoff
records and the merged PR history. Each obsolete PR was closed with a comment
identifying its replacement. No branch was merged during cleanup.

| Closed PRs | Replacement on `main` |
| --- | --- |
| #38, #40 | #44 and #45; remaining work moved to the current main-based safety branch |
| #35, #34 | #44/#45 plus the current bounded autonomy and approval work |
| #37 | #41 |
| #33 | #39 and #42 |
| #28, #29, #30, #31 | #32 and subsequent main fixes |
| #26 | #27 |
| #22, #23, #24 | #25 and #27 |
| #3-#20 (open drafts) | Consolidated by #21 and #25, with later main hardening |

After cleanup, `gh pr list --state open` returned an empty list. The new safety
work should be reviewed in one main-based PR to avoid reviving overlapping order,
approval or risk implementations.

