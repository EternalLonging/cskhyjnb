-- =============================================================================
-- Supabase security hardening for the quiz site.
-- Run this whole file once in Supabase SQL Editor.
--
-- Access model:
--   * A sync code is a bearer credential for that code's progress/history rows.
--   * Shared question edits, course tags, and aggregate stats are public read-only.
--   * Shared question notes/comments remain collaboratively writable.
--   * Admin writes and aggregate increments go through narrowly-scoped RPCs.
-- =============================================================================

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Client timestamps are retained inside JSON for display, but row ordering always
-- uses a timestamp assigned by PostgreSQL.
create or replace function public.quiz_set_server_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.quiz_set_server_updated_at() from public, anon, authenticated;

drop trigger if exists quiz_study_progress_server_updated_at on public.study_progress;
create trigger quiz_study_progress_server_updated_at
before insert or update on public.study_progress
for each row execute function public.quiz_set_server_updated_at();

drop trigger if exists quiz_question_notes_server_updated_at on public.question_notes;
create trigger quiz_question_notes_server_updated_at
before insert or update on public.question_notes
for each row execute function public.quiz_set_server_updated_at();

-- PostgREST exposes request headers through request.headers. The browser sends
-- the UTF-8 sync code as Base64 in x-quiz-sync-key so non-ASCII codes are safe.
create or replace function public.quiz_request_sync_key()
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_encoded text;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  v_encoded := nullif(v_headers ->> 'x-quiz-sync-key', '');
  if v_encoded is null or length(v_encoded) > 4096 then
    return null;
  end if;
  return convert_from(decode(v_encoded, 'base64'), 'UTF8');
exception when others then
  return null;
end;
$$;

revoke all on function public.quiz_request_sync_key() from public;
grant execute on function public.quiz_request_sync_key() to anon, authenticated;

-- Internal password verifier. The plaintext field is kept for compatibility with
-- already-deployed invite-management RPCs, but RLS prevents clients from reading it.
create or replace function public.quiz_admin_password_matches(p_password text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_hash text;
  v_plain text;
begin
  if p_password is null or length(p_password) > 512 then
    return false;
  end if;

  select state
    into v_state
    from public.study_progress
   where sync_key = '__site_admin_settings_v1__'
     and deck_key = '__admin_password_v1__'
   limit 1;

  v_hash := nullif(v_state ->> 'passwordHash', '');
  v_plain := nullif(v_state ->> 'password', '');

  if v_hash is not null then
    begin
      return extensions.crypt(p_password, v_hash) = v_hash;
    exception when others then
      return false;
    end;
  end if;

  return p_password = coalesce(v_plain, 'fengxingadmin');
end;
$$;

revoke all on function public.quiz_admin_password_matches(text) from public, anon, authenticated;

-- Migrate the existing password row to bcrypt without changing the current password.
do $$
declare
  v_state jsonb;
  v_password text;
  v_hash text;
  v_now timestamptz := clock_timestamp();
  v_updated_at bigint;
begin
  select state
    into v_state
    from public.study_progress
   where sync_key = '__site_admin_settings_v1__'
     and deck_key = '__admin_password_v1__'
   limit 1;

  v_state := coalesce(v_state, '{}'::jsonb);
  v_password := nullif(v_state ->> 'password', '');
  v_hash := nullif(v_state ->> 'passwordHash', '');
  v_updated_at := floor(extract(epoch from v_now) * 1000)::bigint;

  if v_hash is null then
    v_password := coalesce(v_password, 'fengxingadmin');
    v_hash := extensions.crypt(v_password, extensions.gen_salt('bf', 12));
    v_state := v_state || jsonb_build_object(
      'password', v_password,
      'passwordHash', v_hash,
      'updatedAt', v_updated_at
    );

    insert into public.study_progress (sync_key, deck_key, state, updated_at)
    values (
      '__site_admin_settings_v1__',
      '__admin_password_v1__',
      v_state,
      v_now
    )
    on conflict (sync_key, deck_key) do update
      set state = excluded.state,
          updated_at = excluded.updated_at;
  end if;
end;
$$;

create or replace function public.verify_quiz_admin_password(p_password text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.quiz_admin_password_matches(p_password);
$$;

create or replace function public.change_quiz_admin_password(
  p_old_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated_at bigint := floor(extract(epoch from v_now) * 1000)::bigint;
  v_state jsonb;
begin
  if not public.quiz_admin_password_matches(p_old_password) then
    return jsonb_build_object('success', false, 'error', 'incorrect_password');
  end if;
  if p_new_password is null or length(btrim(p_new_password)) < 8 or length(p_new_password) > 512 then
    return jsonb_build_object('success', false, 'error', 'invalid_new_password');
  end if;

  v_state := jsonb_build_object(
    -- Retained only for compatibility with the existing invite-management RPCs.
    'password', btrim(p_new_password),
    'passwordHash', extensions.crypt(btrim(p_new_password), extensions.gen_salt('bf', 12)),
    'updatedAt', v_updated_at
  );

  insert into public.study_progress (sync_key, deck_key, state, updated_at)
  values ('__site_admin_settings_v1__', '__admin_password_v1__', v_state, v_now)
  on conflict (sync_key, deck_key) do update
    set state = excluded.state,
        updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'updatedAt', v_updated_at);
end;
$$;

create or replace function public.admin_save_question_edits(
  p_admin_password text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated_at bigint := floor(extract(epoch from v_now) * 1000)::bigint;
  v_state jsonb;
begin
  if not public.quiz_admin_password_matches(p_admin_password) then
    return jsonb_build_object('success', false, 'error', 'incorrect_password');
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    return jsonb_build_object('success', false, 'error', 'invalid_state');
  end if;

  v_state := p_state || jsonb_build_object('updatedAt', v_updated_at);
  insert into public.study_progress (sync_key, deck_key, state, updated_at)
  values ('__shared_question_bank_edits_v1__', '__question_edits_v1__', v_state, v_now)
  on conflict (sync_key, deck_key) do update
    set state = excluded.state,
        updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'updatedAt', v_updated_at);
end;
$$;

create or replace function public.admin_save_course_tags(
  p_admin_password text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated_at bigint := floor(extract(epoch from v_now) * 1000)::bigint;
  v_state jsonb;
begin
  if not public.quiz_admin_password_matches(p_admin_password) then
    return jsonb_build_object('success', false, 'error', 'incorrect_password');
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    return jsonb_build_object('success', false, 'error', 'invalid_state');
  end if;

  v_state := p_state || jsonb_build_object('updatedAt', v_updated_at);
  insert into public.study_progress (sync_key, deck_key, state, updated_at)
  values ('__shared_course_tags_v1__', '__course_tags_v1__', v_state, v_now)
  on conflict (sync_key, deck_key) do update
    set state = excluded.state,
        updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'updatedAt', v_updated_at);
end;
$$;

-- One INSERT ... ON CONFLICT statement makes the aggregate increment atomic.
create or replace function public.record_question_attempt(
  p_question_id text,
  p_is_correct boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question_id text := btrim(coalesce(p_question_id, ''));
  v_now timestamptz := clock_timestamp();
  v_updated_at bigint := floor(extract(epoch from v_now) * 1000)::bigint;
  v_state jsonb;
begin
  if v_question_id = '' or length(v_question_id) > 512 then
    raise exception 'invalid question id' using errcode = '22023';
  end if;

  insert into public.study_progress (sync_key, deck_key, state, updated_at)
  values (
    '__shared_question_stats_v2__',
    'qstats:' || v_question_id,
    jsonb_build_object(
      'total', 1,
      'correct', case when coalesce(p_is_correct, false) then 1 else 0 end,
      'updatedAt', v_updated_at
    ),
    v_now
  )
  on conflict (sync_key, deck_key) do update
    set state = jsonb_build_object(
      'total',
        case
          when public.study_progress.state ->> 'total' ~ '^[0-9]+$'
            then (public.study_progress.state ->> 'total')::bigint
          else 0
        end + 1,
      'correct',
        least(
          case
            when public.study_progress.state ->> 'total' ~ '^[0-9]+$'
              then (public.study_progress.state ->> 'total')::bigint
            else 0
          end + 1,
          case
            when public.study_progress.state ->> 'correct' ~ '^[0-9]+$'
              then (public.study_progress.state ->> 'correct')::bigint
            else 0
          end + case when coalesce(p_is_correct, false) then 1 else 0 end
        ),
      'updatedAt', v_updated_at
    ),
    updated_at = v_now
  returning state into v_state;

  return v_state;
end;
$$;

-- Remove all older policies, including permissive probe_* policies and any
-- history-delete policy that did not verify the row's sync code.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname, tablename
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename in ('study_progress', 'question_notes')
  loop
    execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_policy.tablename);
  end loop;
end;
$$;

alter table public.study_progress enable row level security;
alter table public.question_notes enable row level security;

revoke all on table public.study_progress from anon, authenticated;
grant select, insert, update, delete on table public.study_progress to anon, authenticated;

revoke all on table public.question_notes from anon, authenticated;
grant select, insert, update on table public.question_notes to anon, authenticated;

create policy quiz_progress_select
on public.study_progress
for select
to anon, authenticated
using (
  (
    sync_key = (select public.quiz_request_sync_key())
    and left(sync_key, 2) <> '__'
    and (
      deck_key in ('__meta_v1__', '__ai_ban_v1__')
      or deck_key like 'progress:%'
      or deck_key like 'history:%'
    )
  )
  or (sync_key = '__shared_question_bank_edits_v1__' and deck_key = '__question_edits_v1__')
  or (sync_key = '__shared_course_tags_v1__' and deck_key = '__course_tags_v1__')
  or (sync_key = '__shared_question_stats_v2__' and deck_key like 'qstats:%')
);

create policy quiz_progress_insert
on public.study_progress
for insert
to anon, authenticated
with check (
  sync_key = (select public.quiz_request_sync_key())
  and left(sync_key, 2) <> '__'
  and (
    deck_key in ('__meta_v1__', '__ai_ban_v1__')
    or deck_key like 'progress:%'
    or deck_key like 'history:%'
  )
);

create policy quiz_progress_update
on public.study_progress
for update
to anon, authenticated
using (
  sync_key = (select public.quiz_request_sync_key())
  and left(sync_key, 2) <> '__'
  and (
    deck_key in ('__meta_v1__', '__ai_ban_v1__')
    or deck_key like 'progress:%'
    or deck_key like 'history:%'
  )
)
with check (
  sync_key = (select public.quiz_request_sync_key())
  and left(sync_key, 2) <> '__'
  and (
    deck_key in ('__meta_v1__', '__ai_ban_v1__')
    or deck_key like 'progress:%'
    or deck_key like 'history:%'
  )
);

create policy quiz_history_delete
on public.study_progress
for delete
to anon, authenticated
using (
  sync_key = (select public.quiz_request_sync_key())
  and left(sync_key, 2) <> '__'
  and deck_key like 'history:%'
);

create policy quiz_notes_select
on public.question_notes
for select
to anon, authenticated
using (sync_key = '__shared_question_notes_v2__');

create policy quiz_notes_insert
on public.question_notes
for insert
to anon, authenticated
with check (
  sync_key = '__shared_question_notes_v2__'
  and nullif(btrim(question_id), '') is not null
);

create policy quiz_notes_update
on public.question_notes
for update
to anon, authenticated
using (sync_key = '__shared_question_notes_v2__')
with check (
  sync_key = '__shared_question_notes_v2__'
  and nullif(btrim(question_id), '') is not null
);

-- SECURITY DEFINER functions are not public by default after these revokes.
revoke all on function public.verify_quiz_admin_password(text) from public, anon, authenticated;
revoke all on function public.change_quiz_admin_password(text, text) from public, anon, authenticated;
revoke all on function public.admin_save_question_edits(text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_save_course_tags(text, jsonb) from public, anon, authenticated;
revoke all on function public.record_question_attempt(text, boolean) from public, anon, authenticated;

grant execute on function public.verify_quiz_admin_password(text) to anon, authenticated;
grant execute on function public.change_quiz_admin_password(text, text) to anon, authenticated;
grant execute on function public.admin_save_question_edits(text, jsonb) to anon, authenticated;
grant execute on function public.admin_save_course_tags(text, jsonb) to anon, authenticated;
grant execute on function public.record_question_attempt(text, boolean) to anon, authenticated;

commit;
