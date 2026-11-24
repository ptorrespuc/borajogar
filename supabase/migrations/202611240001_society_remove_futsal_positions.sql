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

-- Cria as posicoes que as formacoes taticas ja usavam (o seed procurava codigos inexistentes)
-- e liga as vagas sem posicao pelo rotulo (LE, LD, VOL, PE, PD, CA).
insert into public.modality_positions (modality_id, name, code, sort_order)
select m.id, pos.name, pos.code, pos.sort_order
from public.sport_modalities m
cross join (values
  ('Lateral esquerda', 'lateral-esquerda', 3),
  ('Lateral direita',  'lateral-direita',  4),
  ('Volante',          'volante',          5),
  ('Ponta esquerda',   'ponta-esquerda',   9),
  ('Ponta direita',    'ponta-direita',   10),
  ('Centroavante',     'centroavante',    11)
) as pos(name, code, sort_order)
where m.slug = 'futebol-society'
on conflict (modality_id, code) do update
set name = excluded.name, sort_order = excluded.sort_order, updated_at = timezone('utc', now());

update public.modality_positions mp
set sort_order = case mp.code
      when 'goleiro' then 1 when 'zagueiro' then 2 when 'lateral-esquerda' then 3 when 'lateral-direita' then 4
      when 'volante' then 5 when 'meia-esquerda' then 6 when 'meia-central' then 7 when 'meia-direita' then 8
      when 'ponta-esquerda' then 9 when 'ponta-direita' then 10 when 'centroavante' then 11 when 'atacante' then 12
      else mp.sort_order end,
    updated_at = timezone('utc', now())
from public.sport_modalities m
where m.id = mp.modality_id and m.slug = 'futebol-society';

update public.tactical_formation_slots s
set modality_position_id = p.id
from public.modality_positions p
join public.sport_modalities m on m.id = p.modality_id and m.slug = 'futebol-society'
where s.modality_position_id is null
  and p.code = case s.slot_label
      when 'LE' then 'lateral-esquerda' when 'LD' then 'lateral-direita' when 'VOL' then 'volante'
      when 'PE' then 'ponta-esquerda' when 'PD' then 'ponta-direita' when 'CA' then 'centroavante' end;
