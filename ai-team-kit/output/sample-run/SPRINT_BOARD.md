# SPRINT_BOARD

- 项目: Oxmon 智能告警仲裁中心
- 周期: 8 周
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
