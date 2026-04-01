alter table if exists public.event_match_team_players
  add column if not exists modality_position_id uuid references public.modality_positions(id) on delete set null;

create index if not exists idx_event_match_team_players_position
  on public.event_match_team_players(modality_position_id);
