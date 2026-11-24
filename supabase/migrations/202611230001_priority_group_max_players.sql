-- Maximo opcional de vagas por grupo prioritario (ex.: Mensalistas ate 10 por chamada).
alter table public.account_priority_groups
  add column if not exists max_players integer check (max_players is null or max_players > 0);
