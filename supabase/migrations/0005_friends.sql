-- 0005_friends.sql —— 好友关系 + 公开头像（V1.34）
--
-- 设计取舍（三处刻意的选择，改之前先读）：
--
-- 1) 好友关系用**一张表**存双向状态：`friendships(requester, addressee, status)`，
--    status ∈ 'pending' | 'accepted'。「互为好友」= 存在一行 accepted（方向不敏感，查询时两向都查）。
--    这样不必维护「两行互为镜像」，也就不会出现两行状态不一致的脏数据。
--
-- 2) **不给 anon / authenticated 任何权限，也不加入 Realtime 发布**。
--    好友列表含隐私（谁跟谁是好友），不像 scores 那样是公开数据。前端只能过 `/api/friends`
--    （服务端 service key），实时性用 8 秒轮询兜底 —— 故意不为了「实时」而开放匿名可读。
--
-- 3) 头像单独存 `users.avatar`（只放渲染头像需要的几个字段）。
--    因为 `users.meta` 是整个存档（金币 / 解锁 / 装备 / 设置），绝不能为了「看好友头像」就把 meta 暴露出去；
--    所以前端在保存存档时顺带把 `meta.avatar` 的副本写进这一列，供好友列表读取。

-- 1) 公开头像列
alter table public.users add column if not exists avatar jsonb;

-- 2) 好友关系
create table if not exists public.friendships (
  requester  text not null,
  addressee  text not null,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester, addressee),
  constraint friendships_not_self check (requester <> addressee)
);

create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- 3) 收紧权限：RLS 开启 + 零策略 = 对 anon / authenticated 全拒绝，只有 service 密钥能访问
alter table public.friendships enable row level security;
revoke all on table public.friendships from anon, authenticated;
