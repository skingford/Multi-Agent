#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { orchestrate } from './auto-argue-orchestrator.mjs'

const STRICT_CI_DEFAULT_MIN_CONFIDENCE = 0.75
const RUN_SUMMARY_SCHEMA_VERSION = '1.1.0'
const RUN_SUMMARY_SCHEMA_REF = 'ai-team-kit/schemas/run-summary.schema.json'
const CI_REPORT_FULL_SCHEMA_VERSION = '1.2.0'
const CI_REPORT_COMPACT_SCHEMA_VERSION = '1.2.0'
const CI_REPORT_TYPE = 'ci_gate_report'
const CI_REPORT_BACKWARD_COMPATIBLE_WITH = ['1.1.0']
const CI_REPORT_FULL_SCHEMA_REF = 'ai-team-kit/schemas/CI_GATE_REPORT.full.schema.json'
const CI_REPORT_COMPACT_SCHEMA_REF = 'ai-team-kit/schemas/CI_GATE_REPORT.compact.schema.json'
const modulePath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(scriptDir, '..', '..')
const computeSchemaSha256 = schemaRef => {
  const schemaPath = path.resolve(workspaceRoot, schemaRef)
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found for ${schemaRef}: ${schemaPath}`)
  }
  return crypto.createHash('sha256').update(fs.readFileSync(schemaPath, 'utf8')).digest('hex')
}

const cliArgs = process.argv.slice(2)
const positionalArgs = cliArgs.filter(arg => !arg.startsWith('--'))
const flags = new Set(cliArgs.filter(arg => arg.startsWith('--')))
const strictProposalLimitArg = cliArgs.find(arg => arg.startsWith('--strict-proposal-limit='))
const minWinnerConfidenceArg = cliArgs.find(arg => arg.startsWith('--min-winner-confidence='))
const ciReportCompact = flags.has('--ci-report-compact')
const ciReportArg = cliArgs.find(arg => arg === '--ci-report' || arg.startsWith('--ci-report='))
const [inputPath, outputDirArg] = positionalArgs
const strictCi = flags.has('--strict-ci')
const failOnReject = flags.has('--fail-on-reject') || strictCi
const requireSecurityApprove = flags.has('--require-security-approve') || strictCi
const argueJsonOnly = flags.has('--argue-json-only')
const argueMdOnly = flags.has('--argue-md-only')
const argueIndexOnly = flags.has('--argue-index-only')
const argueOutputMode = argueIndexOnly ? 'index' : argueJsonOnly ? 'json' : argueMdOnly ? 'md' : 'both'
let strictProposalLimit = null
let minWinnerConfidence = null
let ciReportPath = null

if (strictProposalLimitArg) {
  const raw = strictProposalLimitArg.split('=')[1]
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`Invalid --strict-proposal-limit value: ${raw}`)
    process.exit(1)
  }
  strictProposalLimit = parsed
}
if (minWinnerConfidenceArg) {
  const raw = minWinnerConfidenceArg.split('=')[1]
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.error(`Invalid --min-winner-confidence value: ${raw}`)
    process.exit(1)
  }
  minWinnerConfidence = parsed
} else if (strictCi) {
  minWinnerConfidence = STRICT_CI_DEFAULT_MIN_CONFIDENCE
}
if (ciReportArg && ciReportArg.startsWith('--ci-report=')) {
  const raw = ciReportArg.split('=')[1]
  if (!raw) {
    console.error('Invalid --ci-report value: path cannot be empty')
    process.exit(1)
  }
  ciReportPath = path.resolve(process.cwd(), raw)
}

if (!inputPath) {
  console.error(
    'Usage: node generate-team-artifacts.mjs <input.json> [output-dir] [--with-argue] [--strict-ci] [--fail-on-reject] [--require-security-approve] [--argue-json-only|--argue-md-only|--argue-index-only] [--strict-proposal-limit=N] [--min-winner-confidence=0.0..1.0] [--ci-report|--ci-report=<path>] [--ci-report-compact]'
  )
  process.exit(1)
}
if (argueJsonOnly && argueMdOnly) {
  console.error('Invalid flags: --argue-json-only and --argue-md-only cannot be used together')
  process.exit(1)
}
if (argueIndexOnly && (argueJsonOnly || argueMdOnly)) {
  console.error('Invalid flags: --argue-index-only cannot be combined with --argue-json-only or --argue-md-only')
  process.exit(1)
}

const resolvedInput = path.resolve(process.cwd(), inputPath)
const resolvedOutput = path.resolve(process.cwd(), outputDirArg || 'ai-team-kit/output/sample-run')
if ((ciReportArg || ciReportCompact) && !ciReportPath) {
  ciReportPath = path.join(resolvedOutput, 'CI_GATE_REPORT.json')
}

if (!fs.existsSync(resolvedInput)) {
  console.error(`Input file not found: ${resolvedInput}`)
  process.exit(1)
}

let data = {}
try {
  const raw = fs.readFileSync(resolvedInput, 'utf8')
  data = JSON.parse(raw)
} catch (error) {
  console.error(`Failed to read input JSON: ${error.message}`)
  process.exit(1)
}

const now = new Date().toISOString().slice(0, 10)
const project = data.project || {}
const scope = data.scope || {}
const constraints = data.constraints || {}
const features = data.features || []
const personas = data.personas || []
const models = data.platform_models || {}
const enableArgue =
  flags.has('--with-argue') ||
  (Array.isArray(data.proposals) && data.proposals.length > 0) ||
  strictProposalLimit !== null ||
  minWinnerConfidence !== null ||
  requireSecurityApprove

const safeList = (items = [], fallback = 'N/A') => {
  if (!items.length) return `- ${fallback}`
  return items.map(item => `- ${item}`).join('\n')
}

const featureTable = features.length
  ? features
      .map((f, i) => `| F${i + 1} | ${f.name} | ${f.priority} | ${f.description} |`)
      .join('\n')
  : '| F0 | TBD | P1 | TBD |'

const userStories = features.length
  ? features
      .map((f, i) => {
        const persona = personas[i % Math.max(1, personas.length)]
        const role = persona?.role || 'operator'
        return [
          `### US-${i + 1}: ${f.name}`,
          `As a ${role}, I want ${f.name} so that ${project.goal || 'business target can be reached'}.`,
          '',
          '**Acceptance Criteria**',
          '- Given valid auth token, when request is submitted, then API returns success payload.',
          '- Given invalid input, when validation fails, then system returns structured error code.',
          '- Given tenant mismatch, when access is requested, then system returns 403 and logs audit event.',
          '',
          '**Edge Cases**',
          '- duplicate request retry',
          '- missing tenant mapping',
          '- upstream timeout and retry policy',
          ''
        ].join('\n')
      })
      .join('\n')
  : '### US-1: TBD\nAs a user, I want core capability so that business value is delivered.'

const prd = `# PRD - ${project.name || 'Untitled Project'}

- 日期: ${now}
- 背景: ${project.background || 'N/A'}
- 目标: ${project.goal || 'N/A'}

## 1. 目标用户
${safeList((project.target_users || []).map(u => String(u)))}

## 2. 功能列表
| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
${featureTable}

## 3. 用户故事与验收标准
${userStories}

## 4. 数据流向

authorized-client -> api-gateway -> app-service -> postgres/redis -> audit-log -> dashboard

## 5. 非功能需求
- SLA: ${constraints.availability_sla || '99.9%'}
- Regions: ${(constraints.regions || []).join(', ') || 'N/A'}
- 合规: ${(constraints.compliance || []).join(', ') || 'N/A'}

## 6. 范围边界
### In Scope
${safeList(scope.in_scope)}

### Out of Scope
${safeList(scope.out_of_scope)}
`

const sprintBoard = `# SPRINT_BOARD

- 项目: ${project.name || 'N/A'}
- 周期: ${constraints.timeline_weeks || 6} 周
- 当前状态: at_risk (待架构与安全放行)

## Backlog
| Priority | Task | Owner | Estimate | Depends On |
|---|---|---|---|---|
| P0 | 冻结 PRD 与验收标准 | PM | 1d | - |
| P0 | 输出系统架构与 API 合同 | Architect | 2d | PRD 冻结 |
| P0 | 安全威胁建模与网关策略 | Security | 1d | API 草案 |
| P0 | 核心 API 实现与单测 | Backend | 4d | 架构放行 |
| P1 | 核心页面与表单校验 | Frontend | 4d | API mock |
| P1 | 无障碍与交互细节校正 | UI | 2d | 前端初版 |
| P0 | 代码评审与测试门禁 | Reviewer | 1d | FE/BE PR |

## 甘特图描述
- Week 1: PRD 冻结 + 架构草案
- Week 2: API 冻结 + 安全评审
- Week 3-5: FE/BE 并行开发 + 联调
- Week 6: 代码评审 + 性能优化
- Week 7: 安全复审 + 回归测试
- Week 8: 发布准备 + 复盘

## Checkpoints
1. Architecture Gate: API、Schema、Topology 已审
2. Security Gate: 鉴权、加密、日志、限流策略通过
3. Release Gate: 单测通过率 >= 85%，P0 缺陷清零
`

const architecture = `# ARCHITECTURE

## 技术栈
- Frontend: Next.js 16 + React 19
- Backend: Node.js + TypeScript
- DB: PostgreSQL
- Middleware: Redis (cache/ratelimit), Queue (async jobs)

## 系统拓扑

\`\`\`mermaid
flowchart LR
  U[Web Client] --> G[API Gateway]
  G --> S[App Service]
  S --> P[(PostgreSQL)]
  S --> R[(Redis)]
  S --> Q[Job Queue]
  Q --> W[Worker]
  S --> A[Audit Log]
\`\`\`

## 扩展性策略
- 应用层无状态，支持水平扩展
- 热点查询走 Redis 缓存，TTL 30-120s
- 异步任务解耦非关键链路

## API 版本策略
- 统一前缀: /v1
- breaking change 走 /v2
- 写接口默认要求 Idempotency-Key
`

const swagger = `openapi: 3.1.0
info:
  title: ${project.name || 'Alert Center'} API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /v1/alerts:
    get:
      summary: List alerts
      security:
        - bearerAuth: []
      responses:
        '200':
          description: OK
    post:
      summary: Create alert rule
      security:
        - bearerAuth: []
      parameters:
        - in: header
          name: Idempotency-Key
          schema:
            type: string
      responses:
        '201':
          description: Created
  /v1/alerts/{id}/route:
    post:
      summary: Route alert to on-call group
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Routed
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
`

const schemaSql = `-- schema.sql generated on ${now}

create table if not exists tenants (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists alert_rules (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  name text not null,
  severity text not null,
  expression text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  rule_id uuid references alert_rules(id),
  status text not null,
  assignee_group text,
  triggered_at timestamptz not null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  tenant_id uuid not null,
  actor text not null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_tenant_triggered on alerts (tenant_id, triggered_at desc);
create index if not exists idx_audit_logs_tenant_created on audit_logs (tenant_id, created_at desc);
`

const securityReport = `# SECURITY_REPORT

## 结论
- 当前结论: conditional-pass
- 前置条件: 完成 tenant 级鉴权中间件与 KMS 密钥轮换策略

## 关键风险
1. **越权访问风险（High）**
   - 场景: 仅凭 alert_id 查询，未校验 tenant_id
   - 建议: 服务层强制 tenant 过滤；审计记录 actor + tenant
2. **注入与脏数据风险（Medium）**
   - 场景: 规则表达式未严格校验
   - 建议: schema validation + AST whitelist
3. **重放攻击风险（Medium）**
   - 场景: 写接口未要求幂等键
   - 建议: Idempotency-Key + 10 分钟去重窗口

## 加密与合规建议
- 传输: TLS 1.2+
- 存储: 敏感字段 AES-256-GCM
- 密钥: KMS 托管，90 天轮换
- 合规映射: ${(constraints.compliance || []).join(', ') || 'N/A'}

## AI 输入输出过滤规则
- 拒绝包含密钥、token、私钥片段的输入
- 对输出执行 PII 检测与脱敏
- 阻断提示词注入关键词（ignore previous instructions 等）
`

const reviewReport = `# REVIEW_REPORT

## 严重问题（Blocking）
1. [P0] 缺少单元测试门禁
   - 文件: src/backend/alerts/service.ts:1
   - 问题: 尚未提供失败分支测试，PR 不可合并
   - 重构示例:
\`\`\`ts
it('returns 403 when tenant mismatch', async () => {
  await expect(service.routeAlert(ctxA, alertOfTenantB)).rejects.toThrow('Forbidden')
})
\`\`\`

2. [P1] 查询缺少 tenant 条件
   - 文件: src/backend/alerts/repository.ts:42
   - 问题: 可能导致跨租户读取
   - 重构示例:
\`\`\`ts
const row = await db.query('select * from alerts where id = $1 and tenant_id = $2', [id, tenantId])
\`\`\`

## 优化建议
- 将告警路由逻辑从 controller 下沉到 domain service，降低耦合
- 为规则表达式解析加入缓存，降低重复编译开销

## 风格纠偏
- 统一错误码枚举，避免 magic string
- 统一日志字段（trace_id, tenant_id, actor）

## 点赞亮点
- API 分层清晰，接口命名一致
- 审计日志表结构完整，便于合规追踪
`

const files = new Map([
  ['PRD.md', prd],
  ['SPRINT_BOARD.md', sprintBoard],
  ['ARCHITECTURE.md', architecture],
  ['api.swagger.yaml', swagger],
  ['schema.sql', schemaSql],
  ['SECURITY_REPORT.md', securityReport],
  ['REVIEW_REPORT.md', reviewReport]
])

let argueResult = null
if (enableArgue) {
  try {
    const { result, markdown } = orchestrate(data, { strictProposalLimit })
    if (argueOutputMode === 'index') {
      files.set('AUTO_ARGUE_DECISION_INDEX.json', JSON.stringify(result.decision_index, null, 2))
    } else if (argueOutputMode !== 'md') {
      files.set('AUTO_ARGUE_RESULT.json', JSON.stringify(result, null, 2))
    }
    if (argueOutputMode === 'both' || argueOutputMode === 'md') {
      files.set('AUTO_ARGUE_RESULT.md', markdown.trim())
    }
    argueResult = result
  } catch (error) {
    console.error(`Argue orchestration failed: ${error.message}`)
    process.exit(1)
  }
}

fs.mkdirSync(resolvedOutput, { recursive: true })

for (const [name, content] of files) {
  fs.writeFileSync(path.join(resolvedOutput, name), `${content.trim()}\n`, 'utf8')
}

const selectedId = argueResult?.decision_index?.selected_proposal_id || null
const selected = selectedId ? argueResult?.decision_index?.items?.[selectedId] : null
const rejectGateFailed =
  Boolean(failOnReject && enableArgue && argueResult?.final_decision?.status !== 'approved')
const confidenceGateFailed = Boolean(
  minWinnerConfidence !== null &&
    enableArgue &&
    argueResult?.decision_index &&
    argueResult.decision_index.winner_confidence < minWinnerConfidence
)
const securityGateFailed = Boolean(
  requireSecurityApprove && enableArgue && !(selected && selected.security_vote === 'approve')
)

const gateTrace = [
  {
    id: 'reject_gate',
    enabled: failOnReject && enableArgue,
    passed: !rejectGateFailed,
    code: 2
  },
  {
    id: 'confidence_gate',
    enabled: minWinnerConfidence !== null && enableArgue,
    passed: !confidenceGateFailed,
    code: 3
  },
  {
    id: 'security_approve_gate',
    enabled: requireSecurityApprove && enableArgue,
    passed: !securityGateFailed,
    code: 4
  }
]

let gateFailure = null
if (rejectGateFailed) {
  gateFailure = {
    code: 2,
    reason: 'reject_gate_failed',
    message: `Rejected by gate policy: ${argueResult?.final_decision?.reason} (${argueResult?.final_decision?.security_gate})`
  }
} else if (confidenceGateFailed) {
  gateFailure = {
    code: 3,
    reason: 'confidence_gate_failed',
    message: `Winner confidence ${argueResult.decision_index.winner_confidence} is below required ${minWinnerConfidence}`
  }
} else if (securityGateFailed) {
  gateFailure = {
    code: 4,
    reason: 'security_approve_gate_failed',
    message: `Security approval required but not met (selected=${selectedId || 'none'}, security_vote=${selected?.security_vote || 'none'})`
  }
}

const gateOutcome = gateFailure
  ? {
      passed: false,
      exit_code: gateFailure.code,
      reason: gateFailure.reason,
      message: gateFailure.message
    }
  : {
      passed: true,
      exit_code: 0,
      reason: 'ok',
      message: enableArgue ? 'all enabled gates passed' : 'argue disabled; no gates evaluated'
    }

let runSummarySchemaSha256
let ciFullSchemaSha256 = null
let ciCompactSchemaSha256 = null
try {
  runSummarySchemaSha256 = computeSchemaSha256(RUN_SUMMARY_SCHEMA_REF)
  if (ciReportPath) {
    ciFullSchemaSha256 = computeSchemaSha256(CI_REPORT_FULL_SCHEMA_REF)
    ciCompactSchemaSha256 = computeSchemaSha256(CI_REPORT_COMPACT_SCHEMA_REF)
  }
} catch (error) {
  console.error(`Schema resolution failed: ${error.message}`)
  process.exit(1)
}

const summaryPath = path.join(resolvedOutput, 'run-summary.json')
const summary = {
  schema_version: RUN_SUMMARY_SCHEMA_VERSION,
  schema_ref: RUN_SUMMARY_SCHEMA_REF,
  schema_sha256: runSummarySchemaSha256,
  input: resolvedInput,
  output_dir: resolvedOutput,
  files: Array.from(files.keys()),
  argue_enabled: enableArgue,
  argue_output_mode: enableArgue ? argueOutputMode : 'disabled',
  argue_schema_version: argueResult?.schema_version || null,
  argue_decision_index: argueResult?.decision_index
    ? {
        selected_proposal_id: argueResult.decision_index.selected_proposal_id,
        total_proposals: argueResult.decision_index.total_proposals,
        winner_confidence: argueResult.decision_index.winner_confidence
      }
    : null,
  min_winner_confidence_required: minWinnerConfidence,
  min_winner_confidence_met:
    minWinnerConfidence === null
      ? null
      : Boolean(
          argueResult?.decision_index &&
            argueResult.decision_index.winner_confidence >= minWinnerConfidence
        ),
  security_approve_required: requireSecurityApprove,
  security_approve_met: requireSecurityApprove
    ? Boolean(
        argueResult?.decision_index?.selected_proposal_id &&
          argueResult.decision_index.items[argueResult.decision_index.selected_proposal_id]
            ?.security_vote === 'approve'
      )
    : null,
  strict_ci_enabled: strictCi,
  gate_trace: gateTrace,
  gate_outcome: gateOutcome,
  argue_final_decision: argueResult?.final_decision || null,
  models,
  generated_at: now
}
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8')

if (ciReportPath) {
  const artifactPaths = [...Array.from(files.keys()).map(name => path.join(resolvedOutput, name)), summaryPath]
  const report = ciReportCompact
    ? {
        schema_version: CI_REPORT_COMPACT_SCHEMA_VERSION,
        schema_ref: CI_REPORT_COMPACT_SCHEMA_REF,
        schema_sha256: ciCompactSchemaSha256,
        report_variant: 'compact',
        report_type: CI_REPORT_TYPE,
        generated_by: 'generate-team-artifacts',
        compatibility: {
          contract: CI_REPORT_TYPE,
          backward_compatible_with: CI_REPORT_BACKWARD_COMPATIBLE_WITH
        },
        tool: 'generate-team-artifacts',
        passed: !gateFailure,
        exit_code: gateFailure?.code || 0,
        reason: gateFailure?.reason || 'ok',
        gate_trace: gateTrace,
        selected_proposal_id: argueResult?.final_decision?.selected_proposal_id || null,
        winner_confidence: argueResult?.decision_index?.winner_confidence ?? null,
        selected_security_vote: selected?.security_vote || null
      }
    : {
        schema_version: CI_REPORT_FULL_SCHEMA_VERSION,
        schema_ref: CI_REPORT_FULL_SCHEMA_REF,
        schema_sha256: ciFullSchemaSha256,
        report_variant: 'full',
        report_type: CI_REPORT_TYPE,
        generated_by: 'generate-team-artifacts',
        compatibility: {
          contract: CI_REPORT_TYPE,
          backward_compatible_with: CI_REPORT_BACKWARD_COMPATIBLE_WITH
        },
        generated_at: new Date().toISOString(),
        tool: 'generate-team-artifacts',
        input: resolvedInput,
        output_dir: resolvedOutput,
        strict_ci_enabled: strictCi,
        gates: {
          fail_on_reject: failOnReject,
          require_security_approve: requireSecurityApprove,
          min_winner_confidence_required: minWinnerConfidence,
          strict_proposal_limit: strictProposalLimit
        },
        decision: {
          selected_proposal_id: argueResult?.final_decision?.selected_proposal_id || null,
          final_status: argueResult?.final_decision?.status || 'not_run',
          final_reason: argueResult?.final_decision?.reason || null,
          security_gate: argueResult?.final_decision?.security_gate || null,
          selected_security_vote: selected?.security_vote || null,
          winner_confidence: argueResult?.decision_index?.winner_confidence ?? null
        },
        outcome: gateOutcome,
        gate_trace: gateTrace,
        artifacts: [...artifactPaths, ciReportPath]
      }
  fs.mkdirSync(path.dirname(ciReportPath), { recursive: true })
  fs.writeFileSync(ciReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
}

if (gateFailure) {
  console.error(gateFailure.message)
  console.error(`Artifacts written to: ${resolvedOutput}`)
  for (const name of files.keys()) {
    console.error(`- ${path.join(resolvedOutput, name)}`)
  }
  console.error(`- ${summaryPath}`)
  if (ciReportPath) {
    console.error(`- ${ciReportPath}`)
  }
  process.exit(gateFailure.code)
}

console.log(`Generated ${files.size} artifacts into ${resolvedOutput}`)
for (const name of files.keys()) {
  console.log(`- ${path.join(resolvedOutput, name)}`)
}
console.log(`- ${summaryPath}`)
if (ciReportPath) {
  console.log(`- ${ciReportPath}`)
}
