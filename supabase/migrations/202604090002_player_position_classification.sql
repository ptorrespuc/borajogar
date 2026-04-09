-- Adiciona classificação de posição por jogador: principal, secondary ou improviso
alter table if exists public.account_player_position_preferences
  add column if not exists classification text
    check (classification in ('principal', 'secondary', 'improviso'));

-- Jogadores com posições já cadastradas recebem 'principal' como default
-- (podem ser ajustados depois pelo admin)
update public.account_player_position_preferences
  set classification = 'principal'
  where classification is null;
