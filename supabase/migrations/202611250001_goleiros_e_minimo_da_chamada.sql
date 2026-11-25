-- Goleiros na chamada e minimo da chamada aberta acompanhando a conta.
-- Aplicada manualmente no banco do servidor em 25/11/2026.

-- 1) Maximo de goleiros por chamada (null = sem limite). Goleiro = jogador cuja 1a posicao e "goleiro";
--    goleiros ficam numa secao propria do quorum, nao contam para o minimo e nao pagam.
alter table public.sports_accounts
  add column if not exists max_goalkeepers_per_event integer default 2
  check (max_goalkeepers_per_event is null or max_goalkeepers_per_event >= 0);

-- 2) Mudou o minimo de jogadores da conta? A chamada aberta (em montagem ou lista fechada) acompanha.
create or replace function public.sync_open_events_max_players()
returns trigger
language plpgsql
as $$
begin
  if new.max_players_per_event is distinct from old.max_players_per_event then
    update public.events
    set max_players = new.max_players_per_event,
        updated_at = timezone('utc', now())
    where account_id = new.id
      and status in ('draft', 'published');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_open_events_max_players on public.sports_accounts;
create trigger trg_sync_open_events_max_players
  after update of max_players_per_event on public.sports_accounts
  for each row execute function public.sync_open_events_max_players();

-- Acerta as chamadas abertas que ja estavam diferentes da conta.
update public.events e
set max_players = a.max_players_per_event,
    updated_at = timezone('utc', now())
from public.sports_accounts a
where a.id = e.account_id
  and e.status in ('draft', 'published')
  and e.max_players <> a.max_players_per_event;

-- Goleiro nao paga: zera o pago de goleiros em chamadas abertas.
update public.event_participants ep
set is_paid = false, paid_at = null, updated_at = timezone('utc', now())
from public.events e
where e.id = ep.event_id
  and e.status in ('draft', 'published')
  and ep.is_paid
  and (
    select mp.code
    from public.account_player_position_preferences p
    join public.modality_positions mp on mp.id = p.modality_position_id
    where p.account_player_id = ep.account_player_id
    order by p.preference_order
    limit 1
  ) = 'goleiro';
