-- 福瑞快打 · 排行榜提交加服务端合理性校验
--
-- 原来 submit_score 只做「取较大值」，任何人带服务密钥 POST 一个 9999 就能登顶。
-- 现在要求同时提交该局的对局时长，由数据库校验数字自洽：
--   1. 波次上限 5000、单局时长上限 12 小时；
--   2. 一局最多每 2 秒推进一步（另给 30 波容错），即 wave <= duration / 2 + 30。
--
-- 纯前端游戏没法证明这一局真的打过，这道校验挡的是「随手编一个数字」，
-- 不是完整防作弊；需要更强保证时得让服务端复盘对局。

drop function if exists public.submit_score(text, integer);

create or replace function public.submit_score(p_username text, p_wave integer, p_duration integer)
returns public.scores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wave integer := greatest(coalesce(p_wave, 0), 0);
  v_dur  integer := greatest(coalesce(p_duration, 0), 0);
  v_row  public.scores;
begin
  if v_wave > 5000 then
    raise exception 'wave_out_of_range' using errcode = 'P0001';
  end if;
  if v_dur > 43200 then
    raise exception 'duration_out_of_range' using errcode = 'P0001';
  end if;
  if v_wave > (v_dur / 2) + 30 then
    raise exception 'wave_too_fast' using errcode = 'P0001';
  end if;

  insert into public.scores (username, best_wave)
  values (p_username, v_wave)
  on conflict (username) do update
    set best_wave  = greatest(public.scores.best_wave, excluded.best_wave),
        updated_at = case
          when excluded.best_wave > public.scores.best_wave then now()
          else public.scores.updated_at
        end
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.submit_score(text, integer, integer) from anon, authenticated;
