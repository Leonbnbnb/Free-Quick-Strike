-- 福瑞快打 · 密码改为只存哈希
--
-- 原来 users.password 是明文，且 GET /api/users 会把整表（含密码）返回给前端做本地比对。
-- 现在登录校验在服务端完成（api/users.js 的 action:'login'），密码只以
-- PBKDF2-SHA256 哈希 + 每账号随机盐落库，任何接口都不返回。
--
-- password 列保留给历史数据：老账号首次登录成功时会被原地升级为哈希并把明文列清空。

alter table public.users add column if not exists password_hash text;
alter table public.users alter column password drop not null;

comment on column public.users.password is '历史明文口令列，已废弃；登录成功升级为哈希后置空';
comment on column public.users.password_hash is 'PBKDF2-SHA256 哈希，格式 pbkdf2$sha256$<迭代>$<盐base64>$<哈希base64>';
