# Multi-Agent

## Included Kit

- `ai-team-kit/`: 8 角色协作模板 + 一键文档生成脚本
- `ai-team-kit/scripts/auto-argue-orchestrator.mjs`: 自动吵架编排器（proposal / objection / vote + Security 一票否决）
- `AUTO_ARGUE_RESULT.json` / `AUTO_ARGUE_DECISION_INDEX.json`：内含 `schema_version`、`decision_index` 与 `winner_confidence`，可直接供 CI 消费
- `run-summary.json`：内含 `gate_trace` 与 `gate_outcome`，可直接观察门禁通过/失败路径
- `CI_GATE_REPORT.json`：含 `schema_version(1.2.0)` + `schema_ref` + `schema_sha256` + `report_variant` + `report_type` + `compatibility`，便于下游稳定解析（schema 见 `ai-team-kit/schemas/`）
- `ai-team-kit/CI_GATE_REPORT_SCHEMA.md`：CI 报告字段契约与退出码约定
- `.github/workflows/ai-team-kit-ci.yml`：GitHub Actions 自动执行 `team:ci:gate`（支持 `workflow_dispatch` 手动选择 Node 版本与 gate 命令）
- `ai-team-kit/scripts/publish-gate-summary.mjs`：输出门禁汇总（Markdown/JSON）
- 传入 `--min-winner-confidence` 时会自动启用 argue 流程（无需额外 `--with-argue`）
- 退出码约定：`2=reject gate`, `3=confidence gate`, `4=security approve gate`（`1` 为参数/输入错误）

## Quick Run

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-argue-veto-run
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue \
  --with-argue
```

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-argue-all-veto-run \
  --fail-on-reject
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue-json \
  --with-argue \
  --argue-json-only
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue-index \
  --with-argue \
  --argue-index-only
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue-ci-report \
  --with-argue \
  --ci-report
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue-ci-report-compact \
  --with-argue \
  --ci-report-compact
```

```bash
node ai-team-kit/scripts/verify-artifact-schema.mjs \
  ai-team-kit/output/sample-run-with-argue-ci-report-compact \
  --require-ci-report
```

```bash
node ai-team-kit/scripts/verify-artifact-schema.mjs \
  ai-team-kit/output/sample-run-with-argue-ci-report-compact \
  --require-ci-report \
  --json
```

```bash
node ai-team-kit/scripts/publish-gate-summary.mjs --markdown
```

```bash
node ai-team-kit/scripts/publish-gate-summary.mjs --markdown --strict
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/sample-input.json \
  ai-team-kit/output/sample-run-strict-limit \
  --with-argue \
  --strict-proposal-limit=2
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-run-with-argue-confidence \
  --with-argue \
  --min-winner-confidence=0.6
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-run-with-argue-security \
  --with-argue \
  --require-security-approve
```

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-run-with-argue-strict-ci \
  --strict-ci
```

```bash
node --test ai-team-kit/scripts/auto-argue-orchestrator.test.mjs
```

```bash
node --test ai-team-kit/scripts/generate-team-artifacts.test.mjs
```

```bash
npm run team:argue
npm run team:argue:json
npm run team:argue:index
npm run team:argue:ci-report
npm run team:argue:ci-report:compact
npm run team:argue:confidence
npm run team:argue:security
npm run team:argue:strict-ci
npm run team:argue:strict-limit
npm run team:argue:all-veto
npm run team:all
npm run team:all:json
npm run team:all:index
npm run team:all:ci-report
npm run team:all:ci-report:compact
npm run team:all:confidence
npm run team:all:security
npm run team:all:strict-ci
npm run team:all:strict-limit
npm run team:all:strict
npm run team:verify:argue
npm run team:verify:all
npm run team:verify:argue:json
npm run team:verify:all:json
npm run team:summary
npm run team:summary:strict
npm run team:ci:gate
npm run team:test
```
