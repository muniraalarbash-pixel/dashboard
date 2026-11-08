-- =========================================================
-- Dashboard | داش بورد — Migration 003: private links (row-level access per viewer)
-- Each private link shows only the rows where one column matches the allowed values
-- (e.g. Branch = Jeddah). Filtering happens here in the database, so the other rows
-- never reach the viewer's browser.
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to run more than once.
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.share_keys (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label      text not null default '',
  col        text not null,
  vals       text[] not null default '{}',
  key_hash   text not null unique,      -- sha256 of the key; the key itself is shown once and never stored
  key_hint   text not null default '',  -- last 4 characters, to tell links apart
  created_at timestamptz not null default now()
);
create index if not exists share_keys_project_idx on public.share_keys(project_id);
alter table public.share_keys enable row level security;

drop policy if exists "share_keys owner read" on public.share_keys;
create policy "share_keys owner read" on public.share_keys for select to authenticated using (owner = auth.uid());
drop policy if exists "share_keys owner delete" on public.share_keys;
create policy "share_keys owner delete" on public.share_keys for delete to authenticated using (owner = auth.uid());

-- Create a private link key (returns the key once)
create or replace function public.create_share_key(p_project uuid, p_label text, p_col text, p_vals text[])
returns text language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  if not exists (select 1 from public.projects where id = p_project and owner = auth.uid()) then
    raise exception 'not_owner';
  end if;
  if coalesce(p_col, '') = '' or coalesce(array_length(p_vals, 1), 0) = 0 then raise exception 'empty'; end if;
  k := translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=', '-_');
  insert into public.share_keys (project_id, owner, label, col, vals, key_hash, key_hint)
  values (p_project, auth.uid(), left(coalesce(p_label, ''), 60), p_col, p_vals,
          encode(extensions.digest(k, 'sha256'), 'hex'), right(k, 4));
  return k;
end $$;
revoke all on function public.create_share_key(uuid, text, text, text[]) from public, anon;
grant execute on function public.create_share_key(uuid, text, text, text[]) to authenticated;

-- Filter a {columns, rows} dataset to rows whose column `p_col` is one of `p_vals`
create or replace function public.filter_rows(p_data jsonb, p_col text, p_vals text[])
returns jsonb language sql immutable as $$
  select case
    when p_data is null then null
    when idx is null then jsonb_set(p_data, '{rows}', '[]'::jsonb)
    else jsonb_set(p_data, '{rows}', coalesce((
      select jsonb_agg(r order by o) from jsonb_array_elements(p_data -> 'rows') with ordinality t(r, o)
      where (r ->> idx) = any(p_vals)), '[]'::jsonb))
  end
  from (select (select (c.o - 1)::int from jsonb_array_elements(p_data -> 'columns') with ordinality c(x, o)
                where c.x ->> 'name' = p_col limit 1) as idx) s
$$;

-- Public read-only access by share link (now with optional private key)
drop function if exists public.get_shared(text, text);
create or replace function public.get_shared(p_slug text, p_pass text default null, p_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  pr public.projects;
  v  public.versions;
  pv public.versions;
  sk public.share_keys;
  n  int;
  vdata jsonb; vtargets jsonb; cfg jsonb;
begin
  select * into pr from public.projects where share_slug = p_slug and is_published;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  if coalesce(p_key, '') <> '' then
    select * into sk from public.share_keys
     where project_id = pr.id and key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
    if not found then return jsonb_build_object('error', 'bad_key', 'title', pr.title, 'brand', pr.brand); end if;
  else
    if coalesce((pr.config ->> 'keys_only')::boolean, false) then
      return jsonb_build_object('error', 'key_required', 'title', pr.title, 'brand', pr.brand);
    end if;
    if pr.share_pass_hash is not null
       and (p_pass is null or extensions.crypt(p_pass, pr.share_pass_hash) <> pr.share_pass_hash) then
      return jsonb_build_object('error', case when p_pass is null then 'password' else 'wrong_password' end,
                                'title', pr.title, 'brand', pr.brand);
    end if;
  end if;

  select * into v  from public.versions where project_id = pr.id order by created_at desc limit 1;
  select * into pv from public.versions where project_id = pr.id order by created_at desc offset 1 limit 1;
  select count(*) into n from public.versions where project_id = pr.id;

  vdata := v.data; vtargets := v.targets; cfg := pr.config;
  if sk.id is not null then
    vdata := public.filter_rows(v.data, sk.col, sk.vals);
    if v.targets is not null and exists (select 1 from jsonb_array_elements(v.targets -> 'columns') c where c ->> 'name' = sk.col) then
      vtargets := public.filter_rows(v.targets, sk.col, sk.vals);
    end if;
    cfg := pr.config - 'source' - 'keys_only';  -- a live sheet link would expose every row
  end if;

  return jsonb_build_object(
    'project', jsonb_build_object('title', pr.title, 'topic', pr.topic, 'description', pr.description,
                                  'period', pr.period, 'template', pr.template, 'brand', pr.brand,
                                  'config', cfg, 'updated_at', pr.updated_at,
                                  'restricted', case when sk.id is null then null else
                                     jsonb_build_object('label', sk.label, 'col', sk.col, 'vals', to_jsonb(sk.vals)) end),
    'version', case when v.id is null then null else jsonb_build_object(
                  'period', v.period, 'label', v.label, 'file_name', v.file_name, 'data', vdata,
                  'targets', vtargets, 'totals', case when sk.id is null then v.totals else '{}'::jsonb end,
                  'row_count', jsonb_array_length(coalesce(vdata -> 'rows', '[]'::jsonb)), 'created_at', v.created_at) end,
    'previous', case when pv.id is null or sk.id is not null then null else jsonb_build_object(
                  'period', pv.period, 'totals', pv.totals, 'created_at', pv.created_at) end,
    'versions_count', n);
end $$;
revoke all on function public.get_shared(text, text, text) from public;
grant execute on function public.get_shared(text, text, text) to anon, authenticated;
