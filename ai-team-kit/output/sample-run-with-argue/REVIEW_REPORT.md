# REVIEW_REPORT

## 严重问题（Blocking）
1. [P0] 缺少单元测试门禁
   - 文件: src/backend/alerts/service.ts:1
   - 问题: 尚未提供失败分支测试，PR 不可合并
   - 重构示例:
```ts
it('returns 403 when tenant mismatch', async () => {
  await expect(service.routeAlert(ctxA, alertOfTenantB)).rejects.toThrow('Forbidden')
})
```

2. [P1] 查询缺少 tenant 条件
   - 文件: src/backend/alerts/repository.ts:42
   - 问题: 可能导致跨租户读取
   - 重构示例:
```ts
const row = await db.query('select * from alerts where id = $1 and tenant_id = $2', [id, tenantId])
```

## 优化建议
- 将告警路由逻辑从 controller 下沉到 domain service，降低耦合
- 为规则表达式解析加入缓存，降低重复编译开销

## 风格纠偏
- 统一错误码枚举，避免 magic string
- 统一日志字段（trace_id, tenant_id, actor）

## 点赞亮点
- API 分层清晰，接口命名一致
- 审计日志表结构完整，便于合规追踪
