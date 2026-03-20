# Incremento 1

Objetivo: deixar o projeto pronto para autenticar no Supabase e carregar o bootstrap basico do usuario.

## Entregas desta etapa

- schema inicial do banco;
- seed minima para modalidade, conta esportiva, horarios, grupos de prioridade, enquetes e estatisticas;
- login e cadastro por email e senha no app;
- criacao automatica de `profiles` quando um usuario entra no Auth;
- carregamento do perfil atual e das contas vinculadas.

## Ordem de teste

1. Rodar a migracao `supabase/migrations/202603200001_initial_schema.sql`.
2. Rodar o seed `supabase/seed/202603200001_bootstrap.sql`.
3. Abrir o app e criar uma conta nova na tela de login.
4. Confirmar no Supabase que o usuario foi criado em `auth.users` e em `public.profiles`.
5. Verificar no app se o login entra corretamente e mostra o estado "sem contas vinculadas" ou as contas associadas.
6. Vincular manualmente esse usuario em `account_memberships` e recarregar o app.
7. Confirmar que a home mostra a conta, o papel e o grupo prioritario.

## Resultado esperado

- autenticacao funcionando ponta a ponta;
- perfil sincronizado automaticamente;
- app pronto para a proxima etapa: CRUD de conta e memberships.
