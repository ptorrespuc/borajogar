-- Esquemas táticos por conta esportiva
--
-- tactical_formations: cada conta pode ter N formações (ex: 2-3-2, 3-3-1)
-- tactical_formation_slots: cada slot define uma posição no campo com coordenadas x/y (0-100%)
-- event_match_teams.formation_id: cada time numa partida pode ter uma tática diferente

-- ─── Tabela de formações ──────────────────────────────────────────────────────

create table if not exists public.tactical_formations (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references public.sports_accounts(id) on delete cascade,
  name        text        not null,        -- ex: "2-3-2"
  description text,                        -- ex: "Equilibrada — meio-campo forte"
  is_default  boolean     not null default false,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  unique (account_id, name)
);

-- ─── Slots de cada formação ───────────────────────────────────────────────────
-- position_x / position_y: percentual (0–100) do campo, onde:
--   x=0 → esquerda, x=100 → direita
--   y=0 → linha do goleiro, y=100 → linha do ataque

create table if not exists public.tactical_formation_slots (
  id                   uuid         primary key default gen_random_uuid(),
  formation_id         uuid         not null references public.tactical_formations(id) on delete cascade,
  modality_position_id uuid         references public.modality_positions(id) on delete set null,
  slot_label           text         not null,   -- abreviação exibida no campo: "GOL", "ZAG", "MC"
  position_x           numeric(5,2) not null check (position_x between 0 and 100),
  position_y           numeric(5,2) not null check (position_y between 0 and 100),
  sort_order           int          not null default 0,
  created_at           timestamptz  not null default timezone('utc', now())
);

-- ─── Vínculo de tática por time na partida ────────────────────────────────────

alter table public.event_match_teams
  add column if not exists formation_id uuid references public.tactical_formations(id) on delete set null;

-- ─── Índices ──────────────────────────────────────────────────────────────────

create index if not exists idx_tactical_formations_account
  on public.tactical_formations(account_id, sort_order);

create index if not exists idx_tactical_formation_slots_formation
  on public.tactical_formation_slots(formation_id, sort_order);

create index if not exists idx_event_match_teams_formation
  on public.event_match_teams(formation_id);

-- ─── Trigger updated_at ───────────────────────────────────────────────────────

drop trigger if exists set_tactical_formations_updated_at on public.tactical_formations;
create trigger set_tactical_formations_updated_at
before update on public.tactical_formations
for each row execute function public.set_updated_at();
