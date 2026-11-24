-- Pagamento no quorum: marca por participante da chamada e opcao 'entra como pago' por grupo prioritario.
alter table public.account_priority_groups
  add column if not exists paid_by_default boolean not null default false;

alter table public.event_participants
  add column if not exists is_paid boolean not null default false,
  add column if not exists paid_at timestamptz;
