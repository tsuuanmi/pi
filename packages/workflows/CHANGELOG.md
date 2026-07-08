## [Unreleased]

### Changed

- **ralplan**: `ralplan_approve_plan` now refuses to approve a plan whose latest critic verdict is REJECT; set `overrideCriticVerdict: true` to force approval. A latest critic verdict of ITERATE produces a soft warning instead of blocking, and the approval result now carries `critic_verdict`, `critic_verdict_overridden`, and `approval_warning`. `ralplan_doctor` warns when a pending plan's latest critic verdict is REJECT or ITERATE. This enforces the documented workflow intent that a final plan should not be approved over a critic REJECT.