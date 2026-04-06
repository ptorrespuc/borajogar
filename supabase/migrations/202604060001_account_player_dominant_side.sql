alter table public.account_players
  add column if not exists dominant_side text;

alter table public.account_players
  drop constraint if exists account_players_dominant_side_check;

alter table public.account_players
  add constraint account_players_dominant_side_check
  check (dominant_side in ('right', 'left') or dominant_side is null);
