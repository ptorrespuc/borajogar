-- Futebol society: remove as posicoes de futsal (Fixo, Ala direita, Ala esquerda, Pivo)
-- e reordena as posicoes restantes. Aplicada manualmente no banco do servidor em 24/11/2026.
do $$
declare usados int;
begin
  select count(*) into usados from (
    select modality_position_id from public.tactical_formation_slots
    union all select modality_position_id from public.event_match_team_players
    union all select modality_position_id from public.account_player_position_preferences
    union all select modality_position_id from public.membership_position_preferences
  ) u where u.modality_position_id in (
    select mp.id from public.modality_positions mp join public.sport_modalities m on m.id = mp.modality_id
    where m.slug = 'futebol-society' and mp.code in ('fixo', 'ala-direita', 'ala-esquerda', 'pivo'));
  if usados > 0 then raise exception 'posicoes em uso (%): nada foi alterado', usados; end if;
end $$;

delete from public.modality_positions mp using public.sport_modalities m
where m.id = mp.modality_id and m.slug = 'futebol-society'
  and mp.code in ('fixo', 'ala-direita', 'ala-esquerda', 'pivo');

update public.modality_positions mp
set sort_order = case mp.code
      when 'goleiro' then 1 when 'zagueiro' then 2 when 'meia-esquerda' then 3
      when 'meia-central' then 4 when 'meia-direita' then 5 when 'atacante' then 6
      else mp.sort_order end,
    updated_at = timezone('utc', now())
from public.sport_modalities m
where m.id = mp.modality_id and m.slug = 'futebol-society';
