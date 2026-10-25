-- Training log schema. Paste into Supabase → SQL Editor → Run. Safe to re-run.

create table if not exists public.sessions (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  week        text not null,                         -- rotation letter of the plan (A, B, C…) or '-'
  loc         text not null check (loc in ('gym','home')),
  plan        jsonb not null default '[]'::jsonb,   -- exercises for this session (after swaps)
  template_id uuid,                                  -- plan it started from; null for early sessions
  title       text not null default '',
  started_at  timestamptz not null,
  ended_at    timestamptz,
  notes       text not null default '',
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.sets (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  exercise_id  text not null,
  set_no       int  not null,
  weight       numeric,          -- lb, or assist level for VPL01, null for bodyweight
  reps         int  not null,    -- reps, or seconds for timed exercises
  rpe          numeric,
  done_at      timestamptz not null,
  deleted      boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- Plans you edit in the app. The six shipped plans have fixed ids; they appear here once edited.
create table if not exists public.templates (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  loc         text not null check (loc in ('gym','home')),
  items       jsonb not null default '[]'::jsonb,
  position    int  not null default 0,               -- order in the rotation
  rotation    boolean not null default true,         -- takes part in the weekly rotation
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- Exercises you add in the app; data holds names, muscle group, equipment, load type.
create table if not exists public.exercises (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- Upgrades a database created from the first version of this file.
alter table public.sessions drop constraint if exists sessions_week_check;
alter table public.sessions add column if not exists template_id uuid;
alter table public.sessions add column if not exists title text not null default '';

create index if not exists templates_user_updated on public.templates (user_id, updated_at);
create index if not exists exercises_user_updated on public.exercises (user_id, updated_at);
create index if not exists sessions_user_updated on public.sessions (user_id, updated_at);
create index if not exists sets_user_updated     on public.sets (user_id, updated_at);
create index if not exists sets_exercise         on public.sets (user_id, exercise_id, done_at);

-- Server clock decides updated_at, so incremental pulls never miss a row.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists sessions_touch on public.sessions;
create trigger sessions_touch before insert or update on public.sessions
  for each row execute function public.touch_updated_at();
drop trigger if exists sets_touch on public.sets;
create trigger sets_touch before insert or update on public.sets
  for each row execute function public.touch_updated_at();
drop trigger if exists templates_touch on public.templates;
create trigger templates_touch before insert or update on public.templates
  for each row execute function public.touch_updated_at();
drop trigger if exists exercises_touch on public.exercises;
create trigger exercises_touch before insert or update on public.exercises
  for each row execute function public.touch_updated_at();

-- Row Level Security: each signed-in user can only see and change their own rows.
alter table public.sessions enable row level security;
alter table public.sets     enable row level security;
alter table public.templates enable row level security;
alter table public.exercises enable row level security;

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own sets" on public.sets;
create policy "own sets" on public.sets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own templates" on public.templates;
create policy "own templates" on public.templates
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own exercises" on public.exercises;
create policy "own exercises" on public.exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Make the API see the changes right away.
notify pgrst, 'reload schema';
