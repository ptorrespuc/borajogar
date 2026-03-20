# Incremento 2

Objetivo: ativar RLS no Supabase sem quebrar o fluxo atual de autenticacao, perfil e bootstrap de memberships.

## Entregas desta etapa

- policies iniciais de RLS para as tabelas do dominio;
- helpers SQL para decidir acesso por super-admin, conta e papel;
- leitura autenticada do proprio perfil e das contas vinculadas;
- bloqueio de leitura anonima das tabelas principais.

## Ordem de teste

1. Rodar a migracao `supabase/migrations/202603200002_initial_rls.sql`.
2. Confirmar que uma chamada anonima para `sports_accounts` deixa de retornar dados.
3. Criar ou reutilizar um usuario autenticado.
4. Confirmar que esse usuario consegue ler `public.profiles` apenas do proprio `auth.uid()`.
5. Confirmar que, sem membership, `sports_accounts` retorna vazio para esse usuario.
6. Inserir uma membership ativa para a conta `futebol-de-quarta`.
7. Confirmar que o bootstrap volta a enxergar `sports_accounts`, `account_memberships` e `account_priority_groups`.

## Resultado esperado

- dados do app deixam de ficar abertos para requests anonimos;
- o login continua funcionando;
- o usuario autenticado enxerga apenas o que pertence a ele ou a conta em que participa;
- o projeto fica pronto para o proximo corte: CRUD de memberships e conta esportiva.
