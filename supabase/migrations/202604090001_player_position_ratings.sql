-- Adiciona nota por posição na tabela de preferências de posição do jogador
alter table if exists public.account_player_position_preferences
  add column if not exists rating numeric(4,2) check (rating >= 0 and rating <= 10);

-- Popula a nota por posição com a nota geral atual do jogador
-- (preserva os dados existentes, sem perda de informação)
update public.account_player_position_preferences pref
  set rating = p.rating
  from public.account_players p
  where pref.account_player_id = p.id
    and p.rating is not null;
