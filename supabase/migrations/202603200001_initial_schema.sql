create extension if not exists pgcrypto;

do $$
begin
  create type public.account_role as enum ('group_admin', 'group_moderator', 'player');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.event_status as enum ('draft', 'published', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.participant_response_status as enum ('pending', 'confirmed', 'declined');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.participant_selection_status as enum ('active', 'waitlisted', 'removed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.poll_selection_mode as enum ('predefined_options', 'event_participant');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.poll_status as enum ('draft', 'open', 'closed', 'archived');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    photo_url
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set
      full_name = excluded.full_name,
      email = excluded.email,
      photo_url = coalesce(excluded.photo_url, public.profiles.photo_url),
      updated_at = timezone('utc', now());

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  photo_url text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sport_modalities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  players_per_team integer not null check (players_per_team > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (name),
  unique (slug)
);

create table if not exists public.modality_positions (
  id uuid primary key default gen_random_uuid(),
  modality_id uuid not null references public.sport_modalities(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (modality_id, name),
  unique (modality_id, code)
);

create table if not exists public.sports_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  modality_id uuid not null references public.sport_modalities(id),
  timezone text not null default 'America/Sao_Paulo',
  max_players_per_event integer not null check (max_players_per_event > 0),
  confirmation_open_hours_before integer not null default 48 check (confirmation_open_hours_before >= 0),
  confirmation_close_minutes_before integer not null default 0 check (confirmation_close_minutes_before >= 0),
  auto_notify_confirmation_open boolean not null default false,
  auto_notify_waitlist_changes boolean not null default false,
  auto_notify_event_updates boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (slug)
);

create table if not exists public.account_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sports_accounts(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at),
  unique (account_id, weekday, starts_at)
);

create table if not exists public.account_priority_groups (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sports_accounts(id) on delete cascade,
  name text not null,
  priority_rank integer not null check (priority_rank > 0),
  color_hex text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, name),
  unique (account_id, priority_rank)
);

create table if not exists public.account_memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sports_accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.account_role not null default 'player',
  priority_group_id uuid references public.account_priority_groups(id),
  is_active boolean not null default true,
  joined_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, profile_id)
);

create table if not exists public.membership_position_preferences (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.account_memberships(id) on delete cascade,
  modality_position_id uuid not null references public.modality_positions(id),
  preference_order integer not null check (preference_order > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (membership_id, modality_position_id),
  unique (membership_id, preference_order)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sports_accounts(id) on delete cascade,
  schedule_id uuid references public.account_schedules(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  confirmation_opens_at timestamptz not null,
  confirmation_closes_at timestamptz,
  max_players integer not null check (max_players > 0),
  status public.event_status not null default 'draft',
  notes text,
  created_by uuid references public.profiles(id),
  published_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at),
  check (confirmation_closes_at is null or confirmation_closes_at <= starts_at)
);

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  membership_id uuid not null references public.account_memberships(id) on delete cascade,
  priority_group_id uuid references public.account_priority_groups(id),
  priority_rank_snapshot integer not null default 999,
  roster_order integer not null default 0,
  response_status public.participant_response_status not null default 'pending',
  selection_status public.participant_selection_status not null default 'active',
  response_at timestamptz,
  selection_changed_at timestamptz not null default timezone('utc', now()),
  added_by uuid references public.profiles(id),
  removed_reason text,
  waitlist_notified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, membership_id)
);

create table if not exists public.poll_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sports_accounts(id) on delete cascade,
  title text not null,
  description text,
  selection_mode public.poll_selection_mode not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.event_polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  template_id uuid references public.poll_templates(id) on delete set null,
  title text not null,
  description text,
  selection_mode public.poll_selection_mode not null,
  status public.poll_status not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.event_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.event_polls(id) on delete cascade,
  target_participant_id uuid references public.event_participants(id) on delete set null,
  label text not null,
  description text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (poll_id, sort_order)
);

create table if not exists public.event_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.event_polls(id) on delete cascade,
  voter_participant_id uuid not null references public.event_participants(id) on delete cascade,
  option_id uuid references public.event_poll_options(id) on delete cascade,
  target_participant_id uuid references public.event_participants(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (option_id is not null and target_participant_id is null)
    or (option_id is null and target_participant_id is not null)
  ),
  unique (poll_id, voter_participant_id)
);

create table if not exists public.stat_definitions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sports_accounts(id) on delete cascade,
  name text not null,
  code text not null,
  unit text not null default 'count',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (account_id, code)
);

create table if not exists public.event_participant_stats (
  id uuid primary key default gen_random_uuid(),
  event_participant_id uuid not null references public.event_participants(id) on delete cascade,
  stat_definition_id uuid not null references public.stat_definitions(id) on delete cascade,
  value numeric(10, 2) not null default 0,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_participant_id, stat_definition_id)
);

create index if not exists idx_modality_positions_modality on public.modality_positions(modality_id);
create index if not exists idx_sports_accounts_modality on public.sports_accounts(modality_id);
create index if not exists idx_account_schedules_account on public.account_schedules(account_id, weekday);
create index if not exists idx_account_priority_groups_account on public.account_priority_groups(account_id, priority_rank);
create index if not exists idx_account_memberships_account on public.account_memberships(account_id, role);
create index if not exists idx_account_memberships_profile on public.account_memberships(profile_id);
create index if not exists idx_membership_position_preferences_membership on public.membership_position_preferences(membership_id);
create index if not exists idx_events_account_start on public.events(account_id, starts_at desc);
create index if not exists idx_event_participants_event_order on public.event_participants(event_id, selection_status, priority_rank_snapshot, roster_order);
create index if not exists idx_poll_templates_account on public.poll_templates(account_id, sort_order);
create index if not exists idx_event_polls_event on public.event_polls(event_id, sort_order);
create index if not exists idx_event_poll_options_poll on public.event_poll_options(poll_id, sort_order);
create index if not exists idx_event_poll_votes_poll on public.event_poll_votes(poll_id);
create index if not exists idx_stat_definitions_account on public.stat_definitions(account_id, sort_order);
create index if not exists idx_event_participant_stats_participant on public.event_participant_stats(event_participant_id);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_sport_modalities_updated_at on public.sport_modalities;
create trigger set_sport_modalities_updated_at
before update on public.sport_modalities
for each row execute function public.set_updated_at();

drop trigger if exists set_modality_positions_updated_at on public.modality_positions;
create trigger set_modality_positions_updated_at
before update on public.modality_positions
for each row execute function public.set_updated_at();

drop trigger if exists set_sports_accounts_updated_at on public.sports_accounts;
create trigger set_sports_accounts_updated_at
before update on public.sports_accounts
for each row execute function public.set_updated_at();

drop trigger if exists set_account_schedules_updated_at on public.account_schedules;
create trigger set_account_schedules_updated_at
before update on public.account_schedules
for each row execute function public.set_updated_at();

drop trigger if exists set_account_priority_groups_updated_at on public.account_priority_groups;
create trigger set_account_priority_groups_updated_at
before update on public.account_priority_groups
for each row execute function public.set_updated_at();

drop trigger if exists set_account_memberships_updated_at on public.account_memberships;
create trigger set_account_memberships_updated_at
before update on public.account_memberships
for each row execute function public.set_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists set_event_participants_updated_at on public.event_participants;
create trigger set_event_participants_updated_at
before update on public.event_participants
for each row execute function public.set_updated_at();

drop trigger if exists set_poll_templates_updated_at on public.poll_templates;
create trigger set_poll_templates_updated_at
before update on public.poll_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_event_polls_updated_at on public.event_polls;
create trigger set_event_polls_updated_at
before update on public.event_polls
for each row execute function public.set_updated_at();

drop trigger if exists set_event_poll_options_updated_at on public.event_poll_options;
create trigger set_event_poll_options_updated_at
before update on public.event_poll_options
for each row execute function public.set_updated_at();

drop trigger if exists set_stat_definitions_updated_at on public.stat_definitions;
create trigger set_stat_definitions_updated_at
before update on public.stat_definitions
for each row execute function public.set_updated_at();

drop trigger if exists set_event_participant_stats_updated_at on public.event_participant_stats;
create trigger set_event_participant_stats_updated_at
before update on public.event_participant_stats
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
