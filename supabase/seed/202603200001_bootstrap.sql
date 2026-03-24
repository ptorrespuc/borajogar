insert into public.sport_modalities (name, slug, players_per_team)
values
  ('Futebol de campo', 'futebol-campo', 11),
  ('Futebol society', 'futebol-society', 7),
  ('Futebol de salao', 'futebol-salao', 5),
  ('Basquete', 'basquete', 5),
  ('Volei', 'volei', 6)
on conflict (slug) do update
set
  name = excluded.name,
  players_per_team = excluded.players_per_team,
  updated_at = timezone('utc', now());

insert into public.modality_positions (modality_id, name, code, sort_order)
select modality.id, position.name, position.code, position.sort_order
from public.sport_modalities as modality
cross join (
  values
    ('Goleiro', 'goleiro', 1),
    ('Fixo', 'fixo', 2),
    ('Ala direita', 'ala-direita', 3),
    ('Ala esquerda', 'ala-esquerda', 4),
    ('Pivo', 'pivo', 5),
    ('Atacante', 'atacante', 6),
    ('Zagueiro', 'zagueiro', 7),
    ('Meia', 'meia', 8)
) as position(name, code, sort_order)
where modality.slug in ('futebol-campo', 'futebol-society', 'futebol-salao')
on conflict (modality_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

insert into public.modality_positions (modality_id, name, code, sort_order)
select modality.id, position.name, position.code, position.sort_order
from public.sport_modalities as modality
cross join (
  values
    ('Armador', 'armador', 1),
    ('Ala', 'ala', 2),
    ('Ala-pivo', 'ala-pivo', 3),
    ('Pivo', 'pivo', 4)
) as position(name, code, sort_order)
where modality.slug = 'basquete'
on conflict (modality_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

insert into public.modality_positions (modality_id, name, code, sort_order)
select modality.id, position.name, position.code, position.sort_order
from public.sport_modalities as modality
cross join (
  values
    ('Levantador', 'levantador', 1),
    ('Ponteiro', 'ponteiro', 2),
    ('Oposto', 'oposto', 3),
    ('Central', 'central', 4),
    ('Libero', 'libero', 5)
) as position(name, code, sort_order)
where modality.slug = 'volei'
on conflict (modality_id, code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

insert into public.sports_accounts (
  name,
  slug,
  modality_id,
  timezone,
  max_players_per_event,
  confirmation_open_hours_before,
  confirmation_close_minutes_before,
  auto_notify_confirmation_open,
  auto_notify_waitlist_changes,
  auto_notify_event_updates
)
select
  'BoraJogar',
  'borajogar',
  modality.id,
  'America/Sao_Paulo',
  20,
  48,
  120,
  true,
  true,
  true
from public.sport_modalities as modality
where modality.slug = 'futebol-society'
on conflict (slug) do update
set
  name = excluded.name,
  modality_id = excluded.modality_id,
  timezone = excluded.timezone,
  max_players_per_event = excluded.max_players_per_event,
  confirmation_open_hours_before = excluded.confirmation_open_hours_before,
  confirmation_close_minutes_before = excluded.confirmation_close_minutes_before,
  auto_notify_confirmation_open = excluded.auto_notify_confirmation_open,
  auto_notify_waitlist_changes = excluded.auto_notify_waitlist_changes,
  auto_notify_event_updates = excluded.auto_notify_event_updates,
  updated_at = timezone('utc', now());

insert into public.account_schedules (account_id, weekday, starts_at, ends_at, is_active)
select account.id, 3, '20:30:00', '22:00:00', true
from public.sports_accounts as account
where account.slug = 'borajogar'
on conflict (account_id, weekday, starts_at) do update
set
  ends_at = excluded.ends_at,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

insert into public.account_priority_groups (account_id, name, priority_rank, color_hex)
select account.id, grp.name, grp.priority_rank, grp.color_hex
from public.sports_accounts as account
cross join (
  values
    ('Prioridade 1', 1, '#1d7f46'),
    ('Prioridade 2', 2, '#5a9b3c'),
    ('Lista geral', 3, '#88938c')
) as grp(name, priority_rank, color_hex)
where account.slug = 'borajogar'
on conflict (account_id, priority_rank) do update
set
  name = excluded.name,
  color_hex = excluded.color_hex,
  updated_at = timezone('utc', now());

insert into public.poll_templates (account_id, title, description, selection_mode, is_active, sort_order)
select account.id, poll.title, poll.description, poll.selection_mode::public.poll_selection_mode, true, poll.sort_order
from public.sports_accounts as account
cross join (
  values
    ('Melhor jogador', 'Escolha livre entre os participantes ativos do evento.', 'event_participant', 1),
    ('Gol mais bonito', 'Opcoes fechadas com descricao do lance e jogador associado.', 'predefined_options', 2)
) as poll(title, description, selection_mode, sort_order)
where account.slug = 'borajogar'
and not exists (
  select 1
  from public.poll_templates existing
  where existing.account_id = account.id
    and existing.title = poll.title
);

insert into public.stat_definitions (account_id, name, code, unit, sort_order, is_active)
select account.id, stat.name, stat.code, 'count', stat.sort_order, true
from public.sports_accounts as account
cross join (
  values
    ('Gols', 'gols', 1),
    ('Assistencias', 'assistencias', 2),
    ('Cartoes amarelos', 'cartoes-amarelos', 3),
    ('Cartoes vermelhos', 'cartoes-vermelhos', 4)
) as stat(name, code, sort_order)
where account.slug = 'borajogar'
on conflict (account_id, code) do update
set
  name = excluded.name,
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());
