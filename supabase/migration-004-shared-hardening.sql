-- =========================================================
-- Dashboard | داش بورد — Migration 004: share-link hardening
--  * private links no longer receive owner notes, recommendations or saved views
--    (they are written from the full data and can name other branches' numbers)
--  * a private link gets no targets at all when the targets file lacks the filter column
--  * wrong share passwords are rate-limited (10 failures per link per 15 minutes)
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run   (after migration-003)
-- Safe to run more than once.
-- =========================================================

create table if not exists public.share_pass_fails (
  project_id uuid not null references public.projects(id) on delete cascade,
  at         timestamptz not null default now()
);
create index if not exists share_pass_fails_idx on public.share_pass_fails(project_id, at);
alter table public.share_pass_fails enable row level security;  -- no policies: only the function below touches it

drop function if exists public.get_shared(text, text, text);
create or replace function public.get_shared(p_slug text, p_pass text default null, p_key text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  pr public.projects;
  v  public.versions;
  pv public.versions;
  sk public.share_keys;
  n  int;
  fails int;
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
    if pr.share_pass_hash is not null then
      if p_pass is null then
        return jsonb_build_object('error', 'password', 'title', pr.title, 'brand', pr.brand);
      end if;
      delete from public.share_pass_fails where at < now() - interval '1 day';
      select count(*) into fails from public.share_pass_fails where project_id = pr.id and at > now() - interval '15 minutes';
      if fails >= 10 then
        return jsonb_build_object('error', 'too_many', 'title', pr.title, 'brand', pr.brand);
      end if;
      if extensions.crypt(p_pass, pr.share_pass_hash) <> pr.share_pass_hash then
        insert into public.share_pass_fails (project_id) values (pr.id);
        return jsonb_build_object('error', 'wrong_password', 'title', pr.title, 'brand', pr.brand);
      end if;
    end if;
  end if;

  select * into v  from public.versions where project_id = pr.id order by created_at desc limit 1;
  select * into pv from public.versions where project_id = pr.id order by created_at desc offset 1 limit 1;
  select count(*) into n from public.versions where project_id = pr.id;

  vdata := v.data; vtargets := v.targets; cfg := pr.config;
  if sk.id is not null then
    vdata := public.filter_rows(v.data, sk.col, sk.vals);
    -- fail closed: targets without the filter column could hold every branch's numbers
    if v.targets is not null and exists (select 1 from jsonb_array_elements(v.targets -> 'columns') c where c ->> 'name' = sk.col) then
      vtargets := public.filter_rows(v.targets, sk.col, sk.vals);
    else
      vtargets := null;
    end if;
    -- live sheet link would expose every row; notes, recommendations and saved views are written from the full data
    cfg := pr.config - 'source' - 'keys_only' - 'recs' - 'notes' - 'bookmarks';
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
