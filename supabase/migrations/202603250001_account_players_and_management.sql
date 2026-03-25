create table if not exists public.account_players (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sports_accounts(id) on delete cascade,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  photo_url text,
  priority_group_id uuid references public.account_priority_groups(id) on delete set null,
  is_default_for_weekly_list boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.account_player_position_preferences (
  id uuid primary key default gen_random_uuid(),
  account_player_id uuid not null references public.account_players(id) on delete cascade,
  modality_position_id uuid not null references public.modality_positions(id) on delete cascade,
  preference_order integer not null check (preference_order > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (account_player_id, modality_position_id),
  unique (account_player_id, preference_order)
);

alter table public.account_memberships
  add column if not exists account_player_id uuid references public.account_players(id) on delete set null;

create index if not exists idx_account_players_account on public.account_players(account_id, is_active);
create index if not exists idx_account_players_priority_group on public.account_players(priority_group_id);
create index if not exists idx_account_players_weekly_default on public.account_players(account_id, is_default_for_weekly_list);
create index if not exists idx_account_player_position_preferences_player on public.account_player_position_preferences(account_player_id);
create unique index if not exists idx_account_players_account_profile_unique
  on public.account_players(account_id, linked_profile_id)
  where linked_profile_id is not null;
create unique index if not exists idx_account_memberships_account_player_unique
  on public.account_memberships(account_player_id)
  where account_player_id is not null;

drop trigger if exists set_account_players_updated_at on public.account_players;
create trigger set_account_players_updated_at
before update on public.account_players
for each row execute function public.set_updated_at();

insert into public.account_players (
  account_id,
  linked_profile_id,
  full_name,
  email,
  photo_url,
  priority_group_id,
  is_default_for_weekly_list,
  is_active,
  created_by,
  created_at,
  updated_at
)
select
  membership.account_id,
  membership.profile_id,
  profile.full_name,
  profile.email,
  profile.photo_url,
  membership.priority_group_id,
  true,
  membership.is_active,
  membership.profile_id,
  membership.created_at,
  membership.updated_at
from public.account_memberships as membership
inner join public.profiles as profile on profile.id = membership.profile_id
left join public.account_players as player
  on player.account_id = membership.account_id
 and player.linked_profile_id = membership.profile_id
where membership.role = 'player'
  and player.id is null;

update public.account_memberships as membership
set
  account_player_id = player.id,
  updated_at = timezone('utc', now())
from public.account_players as player
where membership.role = 'player'
  and membership.account_id = player.account_id
  and membership.profile_id = player.linked_profile_id
  and membership.account_player_id is distinct from player.id;
