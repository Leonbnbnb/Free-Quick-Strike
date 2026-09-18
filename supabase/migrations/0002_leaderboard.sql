-- 福瑞快打 · 最久波次排行榜
--
-- 写入只走服务端密钥（api/leaderboard.js 调 rpc/submit_score），前端不直连写。
-- 但 Realtime 推送要求订阅方对表有 SELECT 权限，且排行榜本身就是公开数据，
-- 所以这里对 anon / authenticated 只开放只读，写权限仍然全部收回。

create table if not exists public.scores (
  username   text primary key,
  best_wave  integer not null default 0 check (best_wave >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists scores_best_wave_idx on public.scores (best_wave desc);

alter table public.scores enable row level security;

drop policy if exists scores_public_read on public.scores;
create policy scores_public_read on public.scores for select using (true);

-- Supabase 会给 public 下的新表默认授予 anon / authenticated 一批权限（含 TRUNCATE），
-- 这里先全部收回，再单独开放只读。
revoke all on table public.scores from anon, authenticated;
grant select on table public.scores to anon, authenticated;

-- 把 scores 加入 Realtime 广播，前端订阅后可在成绩更新时秒级刷新
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;
end $$;

-- 只增不减地提交成绩：波次比库里小就完全不改动（连 updated_at 都不动），
-- 由主键冲突在一条语句内完成比较与写入，多人同时提交不会互相覆盖。
create or replace function public.submit_score(p_username text, p_wave integer)
returns public.scores
language sql
security definer
set search_path = public
as $$
  insert into public.scores (username, best_wave)
  values (p_username, greatest(coalesce(p_wave, 0), 0))
  on conflict (username) do update
    set best_wave  = greatest(public.scores.best_wave, excluded.best_wave),
        updated_at = case
          when excluded.best_wave > public.scores.best_wave then now()
          else public.scores.updated_at
        end
  returning *;
$$;

revoke all on function public.submit_score(text, integer) from anon, authenticated;
