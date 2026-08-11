-- ============================================================
-- GAME SCORE v59 — SUPABASE SETUP
-- Esegui tutto nel Supabase SQL Editor UNA SOLA VOLTA.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.gs_game_rooms (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  game_type text not null check (game_type in ('flip7','seasalt','sixnimmt')),
  state jsonb not null default '{}'::jsonb,
  host_secret_hash text not null,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gs_game_rooms enable row level security;

-- Nessun accesso diretto alla tabella dal browser.
revoke all on table public.gs_game_rooms from anon, authenticated;

-- Codice stanza compatto e leggibile. I caratteri ambigui sono esclusi.
create or replace function public.gs_make_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..7 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.gs_create_room(
  p_game_type text,
  p_state jsonb,
  p_host_secret text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  attempts int := 0;
begin
  if p_game_type not in ('flip7','seasalt','sixnimmt') then
    raise exception 'Tipo gioco non valido';
  end if;
  if length(coalesce(p_host_secret,'')) < 32 then
    raise exception 'Host secret non valido';
  end if;

  loop
    attempts := attempts + 1;
    code := public.gs_make_join_code();
    begin
      insert into public.gs_game_rooms(join_code,game_type,state,host_secret_hash)
      values(
        code,
        p_game_type,
        coalesce(p_state,'{}'::jsonb),
        encode(digest(p_host_secret,'sha256'),'hex')
      );
      exit;
    exception when unique_violation then
      if attempts >= 10 then raise; end if;
    end;
  end loop;
  return code;
end;
$$;

create or replace function public.gs_get_room(p_join_code text)
returns table(
  game_type text,
  state jsonb,
  closed boolean,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.game_type,r.state,r.closed,r.updated_at
  from public.gs_game_rooms r
  where r.join_code = upper(trim(p_join_code))
  limit 1;
$$;

create or replace function public.gs_update_room(
  p_join_code text,
  p_host_secret text,
  p_state jsonb,
  p_closed boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed int;
begin
  update public.gs_game_rooms
  set state=coalesce(p_state,'{}'::jsonb),
      closed=coalesce(p_closed,false),
      updated_at=now()
  where join_code=upper(trim(p_join_code))
    and host_secret_hash=encode(digest(p_host_secret,'sha256'),'hex');

  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Stanza non trovata o host secret non valido';
  end if;
  return true;
end;
$$;

-- Il browser anon può usare solo queste RPC controllate.
grant execute on function public.gs_create_room(text,jsonb,text) to anon, authenticated;
grant execute on function public.gs_get_room(text) to anon, authenticated;
grant execute on function public.gs_update_room(text,text,jsonb,boolean) to anon, authenticated;

-- Pulizia opzionale manuale:
-- delete from public.gs_game_rooms where updated_at < now() - interval '30 days';
