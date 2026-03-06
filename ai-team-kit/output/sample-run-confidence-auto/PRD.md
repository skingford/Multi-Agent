# PRD - Oxmon 智能告警仲裁中心

- 日期: 2026-03-06
- 背景: 当前告警噪声高、人工分派慢，SRE 值班压力大，需要统一入口做告警聚合、抑制与自动路由。
- 目标: 将 P1 告警平均确认时间从 12 分钟降低到 3 分钟，并在 3 个月内把误报率降低 35%。

## 1. 目标用户
- SRE 值班工程师
- 安全运营团队
- 项目经理

## 2. 功能列表
| ID | 功能 | 优先级 | 描述 |
|---|---|---|---|
| F1 | 告警规则中心 | P0 | 支持阈值、组合条件、静默窗口与模板化规则。 |
| F2 | 告警自动路由 | P0 | 按服务、租户、严重级别自动分派到值班组。 |
| F3 | 值班升级 | P1 | 超时未确认自动升级到二线与管理者。 |

## 3. 用户故事与验收标准
### US-1: 告警规则中心
As a SRE, I want 告警规则中心 so that 将 P1 告警平均确认时间从 12 分钟降低到 3 分钟，并在 3 个月内把误报率降低 35%。.

**Acceptance Criteria**
- Given valid auth token, when request is submitted, then API returns success payload.
- Given invalid input, when validation fails, then system returns structured error code.
- Given tenant mismatch, when access is requested, then system returns 403 and logs audit event.

**Edge Cases**
- duplicate request retry
- missing tenant mapping
- upstream timeout and retry policy

### US-2: 告警自动路由
As a 安全分析师, I want 告警自动路由 so that 将 P1 告警平均确认时间从 12 分钟降低到 3 分钟，并在 3 个月内把误报率降低 35%。.

**Acceptance Criteria**
- Given valid auth token, when request is submitted, then API returns success payload.
- Given invalid input, when validation fails, then system returns structured error code.
- Given tenant mismatch, when access is requested, then system returns 403 and logs audit event.

**Edge Cases**
- duplicate request retry
- missing tenant mapping
- upstream timeout and retry policy

### US-3: 值班升级
As a SRE, I want 值班升级 so that 将 P1 告警平均确认时间从 12 分钟降低到 3 分钟，并在 3 个月内把误报率降低 35%。.

**Acceptance Criteria**
- Given valid auth token, when request is submitted, then API returns success payload.
- Given invalid input, when validation fails, then system returns structured error code.
- Given tenant mismatch, when access is requested, then system returns 403 and logs audit event.

**Edge Cases**
- duplicate request retry
- missing tenant mapping
- upstream timeout and retry policy


## 4. 数据流向

authorized-client -> api-gateway -> app-service -> postgres/redis -> audit-log -> dashboard

## 5. 非功能需求
- SLA: 99.9%
- Regions: ap-east-1, us-west-2
- 合规: ISO 27001, GDPR

## 6. 范围边界
### In Scope
- 告警聚合与去重
- 告警分级与自动路由
- 值班通知与升级策略
- 审计日志与报表导出

### Out of Scope
- 移动端 App
- 跨云成本优化
- 历史数据回灌超过 2 年
