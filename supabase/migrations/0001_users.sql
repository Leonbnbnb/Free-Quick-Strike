-- 福瑞快打 · 账号存档表
--
-- 前端不直连数据库，只经 Vercel Serverless Function（api/users.js）用
-- secret / service_role key 访问。所以这里开启 RLS 但不建任何策略，
-- 并收回 anon / authenticated 的表权限，避免存档被直连读取或篡改。

create table if not exists public.users (
  username text primary key,
  password text not null,
  meta     jsonb not null default '{}'::jsonb
);

alter table public.users enable row level security;

revoke all on table public.users from anon, authenticated;
