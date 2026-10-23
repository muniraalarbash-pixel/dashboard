-- =========================================================
-- Dashboard | داش بورد  —  Supabase schema
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Projects ----------
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title           text not null default 'مشروع جديد',
  topic           text not null default '',
  description     text not null default '',
  period          text not null default '',
  template        text not null default 'tiles',
  brand           jsonb not null default '{}'::jsonb,
  config          jsonb not null default '{}'::jsonb,
  share_slug      text not null unique default encode(extensions.gen_random_bytes(8), 'hex'),
  is_published    boolean not null default false,
  share_pass_hash text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- Data versions (every upload is kept) ----------
create table if not exists public.versions (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  owner            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label            text not null default '',
  period           text not null default '',
  file_name        text not null default '',
  target_file_name text,
  data             jsonb not null,       -- {columns:[{name,type}], rows:[[...]]}
  targets          jsonb,                -- same shape, optional
  totals           jsonb not null default '{}'::jsonb,
  row_count        int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists versions_project_idx on public.versions(project_id, created_at desc);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
for each row execute function public.touch_updated_at();

create or replace function public.touch_project_on_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin update public.projects set updated_at = now() where id = new.project_id; return new; end $$;

drop trigger if exists versions_touch on public.versions;
create trigger versions_touch after insert on public.versions
for each row execute function public.touch_project_on_version();

-- ---------- Row level security: each user sees only their own ----------
alter table public.projects enable row level security;
alter table public.versions enable row level security;

drop policy if exists "projects owner all" on public.projects;
create policy "projects owner all" on public.projects
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "versions owner read" on public.versions;
create policy "versions owner read" on public.versions
  for select to authenticated using (owner = auth.uid());

drop policy if exists "versions owner insert" on public.versions;
create policy "versions owner insert" on public.versions
  for insert to authenticated
  with check (owner = auth.uid()
    and exists (select 1 from public.projects p where p.id = project_id and p.owner = auth.uid()));

drop policy if exists "versions owner delete" on public.versions;
create policy "versions owner delete" on public.versions
  for delete to authenticated using (owner = auth.uid());

-- ---------- Share password (stored hashed) ----------
create or replace function public.set_share_password(p_id uuid, p_pass text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.projects
     set share_pass_hash = case when coalesce(p_pass, '') = '' then null
                                else extensions.crypt(p_pass, extensions.gen_salt('bf')) end
   where id = p_id and owner = auth.uid();
end $$;
revoke all on function public.set_share_password(uuid, text) from public, anon;
grant execute on function public.set_share_password(uuid, text) to authenticated;

-- ---------- Public read-only access by share link ----------
create or replace function public.get_shared(p_slug text, p_pass text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  pr public.projects;
  v  public.versions;
  pv public.versions;
  n  int;
begin
  select * into pr from public.projects where share_slug = p_slug and is_published;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  if pr.share_pass_hash is not null
     and (p_pass is null or extensions.crypt(p_pass, pr.share_pass_hash) <> pr.share_pass_hash) then
    return jsonb_build_object('error', case when p_pass is null then 'password' else 'wrong_password' end,
                              'title', pr.title, 'brand', pr.brand);
  end if;

  select * into v  from public.versions where project_id = pr.id order by created_at desc limit 1;
  select * into pv from public.versions where project_id = pr.id order by created_at desc offset 1 limit 1;
  select count(*) into n from public.versions where project_id = pr.id;

  return jsonb_build_object(
    'project', jsonb_build_object('title', pr.title, 'topic', pr.topic, 'description', pr.description,
                                  'period', pr.period, 'template', pr.template, 'brand', pr.brand,
                                  'config', pr.config, 'updated_at', pr.updated_at),
    'version', case when v.id is null then null else jsonb_build_object(
                  'period', v.period, 'label', v.label, 'file_name', v.file_name, 'data', v.data,
                  'targets', v.targets, 'totals', v.totals, 'row_count', v.row_count, 'created_at', v.created_at) end,
    'previous', case when pv.id is null then null else jsonb_build_object(
                  'period', pv.period, 'totals', pv.totals, 'created_at', pv.created_at) end,
    'versions_count', n);
end $$;
revoke all on function public.get_shared(text, text) from public;
grant execute on function public.get_shared(text, text) to anon, authenticated;

-- ---------- Logo storage ----------
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "logos owner insert" on storage.objects;
create policy "logos owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "logos owner update" on storage.objects;
create policy "logos owner update" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "logos owner delete" on storage.objects;
create policy "logos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
