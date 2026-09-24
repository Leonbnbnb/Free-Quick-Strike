-- 0007_rooms.sql —— 合作房间（V1.36）
--
-- 本轮只做「房间系统」：建房 / 邀请好友 / 输入房间码加入 / 双方就绪。
-- **局内双人同步尚未实现**（Realtime 通道与主机权威留给下一版），
-- rooms 现在只是一张大厅状态表，所以刻意不加入 Realtime 发布、也不给 anon 任何权限。
--
-- 三处刻意的设计取舍，改之前先读：
--
-- 1) **一个账号同时只在一个房间里**。建 / 加入新房间时服务端先把自己在别处的席位清掉
--    （房主 = 解散那间房，访客 = 只腾出席位），否则会出现「我同时在两间房」的鬼状态。
--
-- 2) **房间码就是主键**（6 位、字母表已去掉易混淆的 I / O / 0 / 1），不复用自增 id ——
--    好友之间靠嘴念、靠手打都能传，也是「复制邀请」链接里唯一要带的东西。
--
-- 3) **邀请单独一张表**：一间房可以同时邀请多个人，谁先点「加入」谁成为 guest，
--    其余邀请在进房 / 解散时一并清掉。不把邀请做成「房间的一个字段」，是因为
--    候选好友可能不止一个，而且邀请要能被对方单独忽略。

create table if not exists public.rooms (
  code         text primary key,
  host         text not null,
  guest        text,
  host_ready   boolean not null default false,
  guest_ready  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint rooms_not_self check (guest is null or guest <> host)
);

-- 清理过期房间（超过 2 小时没动静）时按 updated_at 扫，建个索引
create index if not exists rooms_updated_idx on public.rooms (updated_at desc);

create table if not exists public.room_invites (
  code       text not null,
  inviter    text not null,
  invitee    text not null,
  created_at timestamptz not null default now(),
  primary key (code, invitee)
);

-- 「我收到的邀请」按 invitee 扫
create index if not exists room_invites_invitee_idx on public.room_invites (invitee);

-- 收紧权限：RLS 开启 + 零策略 = 对 anon / authenticated 全拒绝，只有 service 密钥能访问。
-- 「谁在哪个房间、邀请了谁」比好友关系更接近隐私，一律只走 /api/rooms。
alter table public.rooms enable row level security;
alter table public.room_invites enable row level security;
revoke all on table public.rooms from anon, authenticated;
revoke all on table public.room_invites from anon, authenticated;
