# SECURITY_REPORT

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
- 合规映射: ISO 27001, GDPR

## AI 输入输出过滤规则
- 拒绝包含密钥、token、私钥片段的输入
- 对输出执行 PII 检测与脱敏
- 阻断提示词注入关键词（ignore previous instructions 等）
