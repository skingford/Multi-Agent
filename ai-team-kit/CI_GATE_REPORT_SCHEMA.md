# CI_GATE_REPORT Schema Contract

This document describes the stable machine contract for `CI_GATE_REPORT.json`.

## Current Version

- `schema_version`: `1.2.0`
- `report_type`: `ci_gate_report`
- `report_variant`: `full` or `compact`
- `schema_ref`:
  - full: `ai-team-kit/schemas/CI_GATE_REPORT.full.schema.json`
  - compact: `ai-team-kit/schemas/CI_GATE_REPORT.compact.schema.json`
- `schema_sha256`: SHA-256 digest of the schema file content referenced by `schema_ref`

## Shared Fields (full + compact)

- `schema_version`: schema version string
- `schema_ref`: schema file path for this variant
- `schema_sha256`: immutable checksum for integrity and cache-safe parser contracts
- `report_variant`: `full` or `compact`
- `report_type`: fixed value `ci_gate_report`
- `generated_by`: tool id (`auto-argue-orchestrator` or `generate-team-artifacts`)
- `compatibility.contract`: fixed value `ci_gate_report`
- `compatibility.backward_compatible_with`: older versions that can still parse this report

## Full Variant Required Blocks

- `gates`: gate config snapshot
- `decision`: selected proposal and key decision fields
- `outcome`: final CI result (`passed`, `exit_code`, `reason`, `message`)
- `gate_trace`: per-gate pass/fail details
- `artifacts`: generated artifact paths

## Compact Variant Required Blocks

- `passed`
- `exit_code`
- `reason`
- `gate_trace`
- `selected_proposal_id`
- `winner_confidence`
- `selected_security_vote`

## Exit Code Semantics

- `0`: passed
- `1`: argument/input validation failure
- `2`: reject gate failed
- `3`: confidence gate failed
- `4`: security-approve gate failed

When multiple gates fail, precedence is `2 -> 3 -> 4`.
