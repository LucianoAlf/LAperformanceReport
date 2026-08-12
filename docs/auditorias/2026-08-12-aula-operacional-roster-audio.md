# Auditoria — aula operacional, roster e recuperação de áudio

Data: 12/08/2026
Projeto Supabase: `ouqwbbermlzqqvtqwlul` (produção)

## Resultado

O espelho bruto do Emusys foi preservado. Agenda, pendências, Fábio e entrada
da fila passaram a resolver uma única aula operacional quando eventos do mesmo
professor, unidade, curso e intervalo concorrem. A prioridade é: maior roster,
turma no empate e ID local mais recente no empate final.

Migrations aplicadas no histórico remoto:

- `20260812210110_aula_operacional_prioriza_roster`
- `20260812210328_recuperar_fila_aula_operacional_transitoria`

## Casos reais medidos

- Leonardo, Guitarra 14h: `217855` era a turma antiga vazia;
  `fn_aula_operacional_id(217855)=1373100`, a turma com roster.
- Matheus, 17/08 às 18h: `300858` era a turma vazia;
  `fn_aula_operacional_id(300858)=18092436`, a individual reagendada com
  Arthur.

O índice `idx_aulas_emusys_slot_operacional` cobre as colunas do resolvedor. O
helper não é executável por `anon` nem `authenticated`, apenas por
`service_role`; os contratos públicos existentes continuam sendo os pontos de
entrada.

## Recuperação do áudio

A fila `58ffbe90-620e-41bd-b0f1-711f7815197e` foi religada de `217855` para
`1373100`. A mudança deixou trilha em `audit_log` com ação
`relink_aula_roster`. Depois do disparo pelo caminho canônico, o item terminou
`normalizado`, sem erro, e criou raiz + fatia em
`fabio_registros_aula`, ambas aguardando confirmação humana.

## Sincronizador e indisponibilidade

`sync-presenca-emusys` v92 corrigiu a escrita de
`conflito_cancelamento_humano` em `automacao_log`: `aluno_nome` agora recebe os
nomes do roster ou um fallback explícito. `verify_jwt=false` foi preservado.

Uma segunda incompatibilidade de contrato apareceu nos logs durante a
validação: `sync-matriculas-emusys` já emitia
`data_nascimento_divergente`, mas o `CHECK` de
`alunos_emusys_atributos_divergencias` ainda recusava esse valor. A migration
`20260812211712_alunos_atributos_data_nascimento_divergente` ampliou a lista
fechada e validou o constraint sem transformar o campo em texto irrestrito.

Entre aproximadamente 20:40 e 21:01 UTC houve respostas 522/502 em múltiplas
rotas do projeto e timeout inclusive em `select 1`; isso foi tratado como
indisponibilidade transversal, não como falha do app. Depois da recuperação,
execuções reais da v92 responderam HTTP 200.

## Provas e dados de simulação

- suíte do LA Report: 41 testes verdes;
- fixture isolada PostgreSQL 17 prova resolução, ACL e relink auditado;
- LA Teacher: 46 testes unitários e build verdes;
- LA Report: build verde;
- UI real do Matheus em 17/08 mostra 5 chamadas e Arthur às 18h; a tela de
  chamada contém o aluno e respeita a abertura 15 minutos antes.

Não foi criado aluno, aula ou presença artificial em produção. Logo não há
dado de simulação a apagar.
