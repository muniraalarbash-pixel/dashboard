-- =========================================================
-- Dashboard | داش بورد — Migration 002: share-link view counter
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to run more than once.
-- =========================================================

-- Totals on the project
alter table public.projects add column if not exists view_count int not null default 0;
alter table public.projects add column if not exists last_viewed_at timestamptz;

-- Daily counts (for the small 14-day chart)
create table if not exists public.share_views (
  project_id uuid not null references public.projects(id) on delete cascade,
  day        date not null default current_date,
  views      int  not null default 0,
  primary key (project_id, day)
);
alter table public.share_views enable row level security;
drop policy if exists "share_views owner read" on public.share_views;
create policy "share_views owner read" on public.share_views for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner = auth.uid()));

-- A view must not change the project's "last edited" time
create or replace function public.touch_project_updated_at() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'view_count' - 'last_viewed_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'view_count' - 'last_viewed_at' - 'updated_at') then
    new.updated_at = now();
  end if;
  return new;
end $$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
for each row execute function public.touch_project_updated_at();

-- Called by the public view page (once per visitor session). The owner's own visits are not counted.
create or replace function public.log_view(p_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid; own uuid;
begin
  select id, owner into pid, own from public.projects where share_slug = p_slug and is_published;
  if pid is null then return; end if;
  if auth.uid() is not null and auth.uid() = own then return; end if;
  update public.projects set view_count = view_count + 1, last_viewed_at = now() where id = pid;
  insert into public.share_views (project_id, day, views) values (pid, current_date, 1)
  on conflict (project_id, day) do update set views = public.share_views.views + 1;
end $$;
revoke all on function public.log_view(text) from public;
grant execute on function public.log_view(text) to anon, authenticated;
