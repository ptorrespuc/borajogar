alter table public.account_players
  add column if not exists birth_date date;

comment on column public.account_players.birth_date is 'Data de nascimento do jogador.';
