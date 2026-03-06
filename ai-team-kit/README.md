# AI Team Kit (8 角色自动协作 + 自动吵架编排器)

本目录提供两类可直接复用的内容：

1. `skills/` 下 8 个角色的 `SKILL.md`
2. `scripts/generate-team-artifacts.mjs` + `examples/sample-input.json`，用于一键产出 7 份标准文档
3. `scripts/auto-argue-orchestrator.mjs` + `examples/argue-sample-input.json`，用于最小可运行的多角色“proposal / objection / vote”回合 + Security 一票否决 Gate

## 目录

- `skills/role-pjm/SKILL.md`
- `skills/role-pm/SKILL.md`
- `skills/role-architect/SKILL.md`
- `skills/role-security/SKILL.md`
- `skills/role-ui/SKILL.md`
- `skills/role-frontend/SKILL.md`
- `skills/role-backend/SKILL.md`
- `skills/role-reviewer/SKILL.md`
- `examples/sample-input.json`
- `examples/argue-sample-input.json`
- `examples/argue-all-veto-input.json`
- `examples/argue-duplicate-id-input.json`
- `schemas/CI_GATE_REPORT.full.schema.json`
- `schemas/CI_GATE_REPORT.compact.schema.json`
- `schemas/run-summary.schema.json`
- `CI_GATE_REPORT_SCHEMA.md`
- `scripts/generate-team-artifacts.mjs`
- `scripts/auto-argue-orchestrator.mjs`
- `scripts/verify-artifact-schema.mjs`
- `scripts/publish-gate-summary.mjs`
- `../.github/workflows/ai-team-kit-ci.yml`（push/PR 自动 gate + workflow_dispatch 手动触发）

## 一键生成

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/sample-input.json \
  ai-team-kit/output/sample-run
```

带自动吵架编排（显式开启）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue \
  --with-argue
```

仅输出吵架 JSON（不输出 Markdown）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue-json \
  --with-argue \
  --argue-json-only
```

仅输出吵架决策索引（最轻量，给 CI）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue-index \
  --with-argue \
  --argue-index-only
```

输出 CI 门禁报告（默认写入输出目录 `CI_GATE_REPORT.json`）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue-ci-report \
  --with-argue \
  --ci-report
```

输出紧凑版 CI 门禁报告（更适合机器消费）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-run-with-argue-ci-report-compact \
  --with-argue \
  --ci-report-compact
```

最低胜出置信度门禁（低于阈值返回 exit code 3）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-run-with-argue-confidence \
  --with-argue \
  --min-winner-confidence=0.6
```

强制 Security 必须 approve（否则返回 exit code 4）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-run-with-argue-security \
  --with-argue \
  --require-security-approve
```

一键严格 CI（组合门禁：2/3/4，默认置信度阈值 0.75）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-run-with-argue-strict-ci \
  --strict-ci
```

严格提案数量门禁（至少 2 个提案，否则失败）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/sample-input.json \
  ai-team-kit/output/sample-run-strict-limit \
  --with-argue \
  --strict-proposal-limit=2
```

带强门禁（最终未通过时返回 exit code 2）：

```bash
node ai-team-kit/scripts/generate-team-artifacts.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-run-with-argue-strict \
  --with-argue \
  --fail-on-reject
```

## 生成结果（7 份）

- `PRD.md`
- `SPRINT_BOARD.md`
- `ARCHITECTURE.md`
- `api.swagger.yaml`
- `schema.sql`
- `SECURITY_REPORT.md`
- `REVIEW_REPORT.md`

附加会输出 `run-summary.json`（执行摘要，含 `gate_trace` 与 `gate_outcome`）。

当输入中存在 `proposals` 时，会自动追加输出：

- `AUTO_ARGUE_RESULT.json`
- `AUTO_ARGUE_RESULT.md`
- `AUTO_ARGUE_DECISION_INDEX.json`（当使用 index-only 输出模式时）
- `decision_index`（JSON 内的机器可读索引，便于 CI 直接取结果）
- `winner_confidence`（0~1 的胜出置信度，便于 CI 设阈值）

## 自动吵架编排器（最小可运行版）

### 运行

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-argue-veto-run
```

全提案 veto 演示（会返回 exit code 2）：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-argue-all-veto-run \
  --fail-on-reject
```

仅输出 JSON：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-argue-json-only-run \
  --json-only
```

仅输出决策索引：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-argue-index-only-run \
  --decision-index-only
```

输出 CI 门禁报告（默认写入输出目录 `CI_GATE_REPORT.json`）：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-argue-ci-report-run \
  --ci-report
```

输出紧凑版 CI 门禁报告（更适合机器消费）：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-sample-input.json \
  ai-team-kit/output/sample-argue-ci-report-compact-run \
  --ci-report-compact
```

最低胜出置信度门禁（低于阈值返回 exit code 3）：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-argue-confidence-run \
  --min-winner-confidence=0.6
```

强制 Security 必须 approve（否则返回 exit code 4）：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-argue-security-run \
  --require-security-approve
```

一键严格 CI（组合门禁：2/3/4，默认置信度阈值 0.75）：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/argue-all-veto-input.json \
  ai-team-kit/output/sample-argue-strict-ci-run \
  --strict-ci
```

严格提案数量门禁（至少 2 个提案，否则失败）：

```bash
node ai-team-kit/scripts/auto-argue-orchestrator.mjs \
  ai-team-kit/examples/sample-input.json \
  ai-team-kit/output/sample-argue-strict-limit-run \
  --strict-proposal-limit=2
```

### 输出结果

- `AUTO_ARGUE_RESULT.json`（完整回合数据）
- `AUTO_ARGUE_RESULT.md`（可读摘要）
- `patch_plan`（在结果中自动给出被驳回提案的修复动作）
- `CI_GATE_REPORT.json`（可选；由 `--ci-report` 或 `--ci-report-compact` 生成）
  - 两种报告都包含 `schema_version`（当前 `1.2.0`）与 `report_variant`（`full` / `compact`）
  - 两种报告都包含 `schema_ref`、`schema_sha256`、`report_type`、`generated_by`、`compatibility`（兼容下游解析）
  - 完整报告包含 `gates`、`decision`、`outcome`、`gate_trace`
  - 紧凑报告包含 `passed`、`exit_code`、`reason`、`gate_trace`
- `run-summary.json` 含 `schema_ref` 与 `schema_sha256`（`ai-team-kit/schemas/run-summary.schema.json`）

### 产物契约校验

对输出目录做 schema + checksum 校验（并要求存在 CI 报告）：

```bash
node ai-team-kit/scripts/verify-artifact-schema.mjs \
  ai-team-kit/output/sample-run-with-argue-ci-report-compact \
  --require-ci-report
```

对单个产物文件做校验：

```bash
node ai-team-kit/scripts/verify-artifact-schema.mjs \
  ai-team-kit/output/sample-argue-ci-report-compact-run/CI_GATE_REPORT.json
```

以 JSON 结果输出（便于脚本消费）：

```bash
node ai-team-kit/scripts/verify-artifact-schema.mjs \
  ai-team-kit/output/sample-run-with-argue-ci-report-compact \
  --require-ci-report \
  --json
```

渲染门禁汇总（Markdown）：

```bash
node ai-team-kit/scripts/publish-gate-summary.mjs --markdown
```

严格汇总检查（缺文件 / JSON 非法 / passed!=true 直接失败）：

```bash
node ai-team-kit/scripts/publish-gate-summary.mjs --markdown --strict
```

### 回合机制

1. Proposal Round：收集每个提案
2. Objection Round：8 个角色逐个提出异议
3. Vote Round：8 个角色投票
4. Security Gate：若 Security 投 `block`，直接一票否决（提案自动 rejected）

### 内置优化

- 输入校验：校验提案重复 ID、非法时间线
- schema 版本：输出 `schema_version`，便于下游解析稳定演进
- 机器索引：输出 `decision_index`，可直接读取 `selected_proposal_id`、`winner_confidence` 与每个提案状态
- CI 门禁：支持 `--min-winner-confidence`，可按置信度阈值阻断流水线
- 安全门禁：支持 `--require-security-approve`，要求胜出提案的 security vote 必须为 `approve`
- 自动触发：传入 `--min-winner-confidence` 时会自动启用 argue 流程（即使未显式传 `--with-argue`）
- 严格模式：支持 `--strict-ci`，等价于开启 reject/security/confidence 三重门禁（默认阈值 `0.75`）
- 决策鲁棒性：若所有提案都被否决，`selected_proposal_id` 返回 `null`
- 可测试：提供 Node 原生测试覆盖 Security veto 与全量驳回场景

### 退出码约定（CI）

- `0`: 成功
- `1`: 参数或输入校验失败（如重复 proposal id / 非法 flag 值）
- `2`: `--fail-on-reject` 门禁失败
- `3`: `--min-winner-confidence` 门禁失败
- `4`: `--require-security-approve` 门禁失败

多个门禁同时开启时，优先级按 `2 -> 3 -> 4` 生效。

### 运行测试

```bash
node --test ai-team-kit/scripts/auto-argue-orchestrator.test.mjs
```

```bash
node --test ai-team-kit/scripts/generate-team-artifacts.test.mjs
```

也可用 npm scripts：

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
npm run team:verify:argue
npm run team:verify:all
npm run team:verify:argue:json
npm run team:verify:all:json
npm run team:summary
npm run team:summary:strict
npm run team:ci:gate
npm run team:test
```
