-- 0006_messages.sql —— 好友私聊消息（V1.35）
--
-- 设计取舍（两处刻意的选择，改之前先读）：
--
-- 1) 消息是**一行一条**的追加流水，不做「会话表 + 消息表」两层。
--    每行自带 from_user / to_user，查询「我和某人的往来」= 两向都查再按时间排。
--    好友关系本身就是稀缺的（只有 accepted 才能聊），所以不需要会话表来省空间。
--
-- 2) **不给 anon / authenticated 任何权限，也不加入 Realtime 发布**。
--    私聊内容比好友关系更敏感，前端只能过 `/api/chat`（服务端 service key）；
--    实时性用 3 秒轮询兜底 —— 故意不为了「实时」而开放匿名可读。

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  from_user  text not null,
  to_user    text not null,
  text       text not null,
  created_at timestamptz not null default now()
);

-- 取「我与某人的往来」要按两个方向各扫一遍，两列都建索引
create index if not exists messages_from_to_idx on public.messages (from_user, to_user, created_at);
create index if not exists messages_to_from_idx on public.messages (to_user, from_user, created_at);

-- 收紧权限：RLS 开启 + 零策略 = 对 anon / authenticated 全拒绝，只有 service 密钥能访问
alter table public.messages enable row level security;
revoke all on table public.messages from anon, authenticated;
