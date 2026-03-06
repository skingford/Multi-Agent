-- schema.sql generated on 2026-03-06

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
