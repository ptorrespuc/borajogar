-- Refatora as posições de meia do futebol society:
-- 'Meia' é renomeada para 'Meia central' (exclusivo do futebol-society)
-- Adicionadas 'Meia esquerda' e 'Meia direita' (exclusivo do futebol-society)

-- Renomeia Meia → Meia central apenas para futebol-society
update public.modality_positions
set
  name       = 'Meia central',
  code       = 'meia-central',
  updated_at = timezone('utc', now())
where code = 'meia'
  and modality_id = (
    select id from public.sport_modalities where slug = 'futebol-society'
  );

-- Insere Meia esquerda e Meia direita para futebol-society
insert into public.modality_positions (modality_id, name, code, sort_order)
select m.id, pos.name, pos.code, pos.sort_order
from public.sport_modalities m
cross join (
  values
    ('Meia esquerda', 'meia-esquerda', 9),
    ('Meia direita',  'meia-direita',  10)
) as pos(name, code, sort_order)
where m.slug = 'futebol-society'
on conflict (modality_id, code) do update
set
  name       = excluded.name,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());
