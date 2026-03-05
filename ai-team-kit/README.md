# AI Team Kit (8 角色自动协作)

本目录提供两类可直接复用的内容：

1. `skills/` 下 8 个角色的 `SKILL.md`
2. `scripts/generate-team-artifacts.mjs` + `examples/sample-input.json`，用于一键产出 7 份标准文档

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
- `scripts/generate-team-artifacts.mjs`

## 一键生成

```bash
node docs/ai-team-kit/scripts/generate-team-artifacts.mjs \
  docs/ai-team-kit/examples/sample-input.json \
  docs/ai-team-kit/output/sample-run
```

## 生成结果（7 份）

- `PRD.md`
- `SPRINT_BOARD.md`
- `ARCHITECTURE.md`
- `api.swagger.yaml`
- `schema.sql`
- `SECURITY_REPORT.md`
- `REVIEW_REPORT.md`

附加会输出 `run-summary.json`（执行摘要）。
