# Modelo de Dados Inicial

Este documento traduz a especificacao funcional atual do `futeboldequarta` em um modelo relacional inicial para Supabase/Postgres.

## Decisoes de modelagem

- `profiles` reaproveita `auth.users.id` como chave primaria do usuario da aplicacao.
- `super_admin` e um papel global no perfil.
- `group_admin`, `group_moderator` e `player` sao papeis por conta esportiva, com exatamente um papel por usuario em cada conta.
- preferencias de posicao sao definidas por participacao do usuario na conta esportiva, nao globalmente.
- enquetes recorrentes foram separadas em `poll_templates` e instancias por evento em `event_polls`.
- estatisticas sao definidas por conta esportiva e registradas por participante em cada evento.
- prioridade de jogador entra como snapshot no evento, para preservar o contexto mesmo se a configuracao da conta mudar depois.

## Entidades principais

| Entidade | Papel no sistema | Observacoes |
| --- | --- | --- |
| `profiles` | dados do usuario autenticado | contem `is_super_admin` |
| `sport_modalities` | cadastro mestre de modalidades | apenas super admin cria/edita |
| `modality_positions` | posicoes possiveis por modalidade | apenas super admin cria/edita |
| `sports_accounts` | grupo esportivo principal | define modalidade, capacidade, janela de confirmacao e notificacoes |
| `account_schedules` | recorrencia semanal do evento | suporta mais de um horario por conta |
| `account_priority_groups` | grupos de prioridade | ordenacao usada para montar a lista do evento |
| `account_memberships` | vinculo usuario x conta | concentra papel do usuario e grupo de prioridade |
| `membership_position_preferences` | posicoes favoritas ordenadas | ligadas ao membro da conta |
| `events` | ocorrencia concreta de jogo/evento | nasce de um schedule, mas pode ser ajustado |
| `event_participants` | lista de jogadores por evento | separa resposta do jogador e situacao na lista |
| `poll_templates` | enquete recorrente da conta | ex.: melhor jogador, gol mais bonito |
| `event_polls` | enquete concreta do evento | instanciada a partir de template ou criada ad hoc |
| `event_poll_options` | opcoes fechadas da enquete | usada em enquetes com opcoes predefinidas |
| `event_poll_votes` | voto do participante | aponta para opcao ou para participante alvo |
| `stat_definitions` | indicadores contaveis | ex.: gols, assistencias, cartoes |
| `event_participant_stats` | valor do indicador por participante | atualizado por moderador ou acima |

## Regras de autorizacao

| Regra | Escopo |
| --- | --- |
| `super_admin` | acesso total ao sistema |
| `group_admin` | administra conta, agenda, lista de participantes e configuracoes do grupo |
| `group_moderator` | administra enquetes e estatisticas do grupo |
| `player` | edita seu perfil, confirma presenca e vota |
| prioridade do jogador | leitura para o proprio jogador, escrita por `group_admin` ou `super_admin` |

## Regras de negocio refletidas no schema

### Modalidade esportiva

- uma modalidade tem numero padrao de jogadores por equipe;
- uma modalidade possui varias posicoes validas;
- posicoes sao reutilizadas nas preferencias dos jogadores.

### Conta esportiva

- uma conta esportiva aponta para uma modalidade;
- uma conta pode ter um ou mais horarios recorrentes por semana;
- a conta define capacidade padrao de participantes por evento;
- a conta define notificacoes automaticas;
- a conta define a politica padrao de abertura e fechamento da confirmacao.

### Jogadores e prioridade

- um usuario pode participar de varias contas esportivas;
- cada participacao tem exatamente um papel por conta;
- cada participacao pode pertencer a um grupo de prioridade;
- preferencias de posicao sao ordenadas por `preference_order`.

### Evento

- um evento guarda `starts_at`, `ends_at` e janela de confirmacao;
- um evento pode herdar um schedule semanal, mas a ocorrencia continua independente;
- a lista de participantes guarda dois estados:
  - `response_status`: se o jogador respondeu `pending`, `confirmed` ou `declined`;
  - `selection_status`: se esta `active`, `waitlisted` ou `removed` da lista;
- `priority_rank_snapshot` e `priority_group_id` preservam a ordem usada no momento do evento.

### Regra da fila por prioridade

- a ordenacao principal da lista deve considerar `priority_rank_snapshot`;
- em empate, pode usar `response_at` e depois `created_at`;
- se a capacidade estourar, o ultimo participante elegivel pode ser movido para `waitlisted`;
- a notificacao automatica de troca de lista depende da configuracao da conta.

### Enquetes

- uma conta pode cadastrar templates recorrentes;
- a instancia da enquete vive em `event_polls`;
- a enquete pode ter dois modos:
  - `predefined_options`: usa `event_poll_options`, com descricao e participante opcional;
  - `event_participant`: qualquer participante ativo do evento pode ser o alvo do voto;
- cada participante vota uma vez por enquete na versao inicial.

### Estatisticas

- a conta define quais indicadores existem;
- os valores ficam por participante e por evento;
- a modelagem atual guarda o valor consolidado, nao um log de alteracoes.

## Decisoes em aberto

- confirmar se a janela de confirmacao precisa de hora fixa por dia da semana ou se o modelo relativo ao inicio do evento basta;
- decidir se havera notificacao por push, email, WhatsApp ou uma combinacao de canais;
- decidir se equipes montadas no evento vao virar entidade propria no banco.
