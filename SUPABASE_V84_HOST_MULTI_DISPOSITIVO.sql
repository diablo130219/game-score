
-- ============================================================
-- GAME SCORE V84 — HOST MULTI-DISPOSITIVO
-- ESEGUI QUESTO BLOCCO UNA SOLA VOLTA NEL SUPABASE SQL EDITOR.
-- È compatibile con le stanze create con le versioni precedenti.
-- ============================================================

create extension if not exists pgcrypto;

alter table public.gs_game_rooms
  add column if not exists host_resume_hash text;

-- Crea una nuova stanza già associata al Codice Host personale.
create or replace function public.gs_create_room(
  p_game_type text,
  p_state jsonb,
  p_host_secret text,
  p_host_resume_code text
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
  if length(regexp_replace(upper(coalesce(p_host_resume_code,'')),'[^A-Z0-9]','','g')) < 8 then
    raise exception 'Codice Host non valido';
  end if;

  loop
    attempts := attempts + 1;
    code := public.gs_make_join_code();
    begin
      insert into public.gs_game_rooms(
        join_code, game_type, state, host_secret_hash, host_resume_hash
      )
      values(
        code,
        p_game_type,
        coalesce(p_state,'{}'::jsonb),
        encode(digest(p_host_secret,'sha256'),'hex'),
        encode(digest(regexp_replace(upper(p_host_resume_code),'[^A-Z0-9]','','g'),'sha256'),'hex')
      );
      exit;
    exception when unique_violation then
      if attempts >= 10 then raise; end if;
    end;
  end loop;
  return code;
end;
$$;

-- Associa una stanza pre-V84 al Codice Host, usando il secret già posseduto
-- dal dispositivo che l'ha creata.
create or replace function public.gs_bind_host_resume(
  p_join_code text,
  p_host_secret text,
  p_host_resume_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare changed int;
begin
  if length(regexp_replace(upper(coalesce(p_host_resume_code,'')),'[^A-Z0-9]','','g')) < 8 then
    raise exception 'Codice Host non valido';
  end if;

  update public.gs_game_rooms
  set host_resume_hash =
        encode(digest(regexp_replace(upper(p_host_resume_code),'[^A-Z0-9]','','g'),'sha256'),'hex'),
      updated_at = now()
  where join_code = upper(trim(p_join_code))
    and host_secret_hash = encode(digest(p_host_secret,'sha256'),'hex');

  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Stanza non trovata o host secret non valido';
  end if;
  return true;
end;
$$;

-- Trova le stanze appartenenti allo stesso Host personale.
create or replace function public.gs_find_host_rooms(
  p_host_resume_code text
)
returns table(
  join_code text,
  game_type text,
  state jsonb,
  closed boolean,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.join_code,r.game_type,r.state,r.closed,r.updated_at
  from public.gs_game_rooms r
  where r.host_resume_hash =
    encode(digest(regexp_replace(upper(p_host_resume_code),'[^A-Z0-9]','','g'),'sha256'),'hex')
  order by r.updated_at desc
  limit 20;
$$;

-- Trasferisce il controllo HOST a un nuovo dispositivo.
-- Il nuovo dispositivo genera un nuovo secret: il vecchio browser smette di
-- poter scrivere finché non reclama nuovamente la stanza con lo stesso Codice Host.
create or replace function public.gs_claim_host_room(
  p_join_code text,
  p_host_resume_code text,
  p_new_host_secret text
)
returns table(
  join_code text,
  game_type text,
  state jsonb,
  closed boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(coalesce(p_new_host_secret,'')) < 32 then
    raise exception 'Nuovo host secret non valido';
  end if;

  update public.gs_game_rooms r
  set host_secret_hash = encode(digest(p_new_host_secret,'sha256'),'hex'),
      updated_at = now()
  where r.join_code = upper(trim(p_join_code))
    and r.host_resume_hash =
      encode(digest(regexp_replace(upper(p_host_resume_code),'[^A-Z0-9]','','g'),'sha256'),'hex');

  if not found then
    raise exception 'Codice Host non valido o stanza non trovata';
  end if;

  return query
  select r.join_code,r.game_type,r.state,r.closed,r.updated_at
  from public.gs_game_rooms r
  where r.join_code = upper(trim(p_join_code))
  limit 1;
end;
$$;

grant execute on function public.gs_create_room(text,jsonb,text,text) to anon, authenticated;
grant execute on function public.gs_bind_host_resume(text,text,text) to anon, authenticated;
grant execute on function public.gs_find_host_rooms(text) to anon, authenticated;
grant execute on function public.gs_claim_host_room(text,text,text) to anon, authenticated;
