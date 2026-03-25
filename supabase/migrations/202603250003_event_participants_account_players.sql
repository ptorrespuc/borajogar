alter table public.event_participants
  add column if not exists account_player_id uuid references public.account_players(id) on delete cascade;

update public.event_participants as participants
set account_player_id = memberships.account_player_id
from public.account_memberships as memberships
where participants.membership_id = memberships.id
  and participants.account_player_id is null
  and memberships.account_player_id is not null;

alter table public.event_participants
  alter column membership_id drop not null;

create unique index if not exists idx_event_participants_event_player
  on public.event_participants(event_id, account_player_id);

create index if not exists idx_event_participants_event_selection
  on public.event_participants(event_id, selection_status, priority_rank_snapshot, roster_order);

create index if not exists idx_event_participants_account_player
  on public.event_participants(account_player_id);
