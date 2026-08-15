# Grade ausente no Emusys - checkpoints

## Objetivo

Remover da Agenda somente ocorrencias que nao existem mais na fotografia
completa do Emusys, sem apagar presenca, falta, roster ou outra decisao humana
historica.

## Regra definitiva

1. A fotografia completa do Emusys decide se a ocorrencia operacional ainda
   existe.
2. Se ela estiver ausente, a aula e soft-cancelada com
   `cancelada_origem = 'sync_ausente_emusys'`, mesmo que haja presenca humana
   terminal.
3. A decisao humana continua intacta em `aluno_presenca` e o roster continua
   auditavel em `aula_alunos_emusys`.
4. `get_agenda_dia` exclui a ocorrencia antes de consolidar cards. Assim uma
   linha stale nunca apaga uma aula valida que compartilha turma/horario.
5. Cancelamentos de secretaria, cancelamentos reais do Emusys e uma aula
   reativada pelo Emusys continuam visiveis.

## Checkpoints

- [x] **1. Reproducao:** identificado que a aula local 263139 / Emusys 515512
  permanecia ativa porque a reconciliacao preservava a existencia da aula ao
  encontrar uma falta humana.
- [x] **2. Reconciliacao:** criada a migration
  `20260815220000_reconciliacao_grade_ausente_preserva_presenca.sql`. Ela
  preserva a evidencia humana, corrige a metragem em corrida concorrente e
  inclui a remediacao cirurgica dos IDs externos 515512 e 680696 em Campo
  Grande para 15/08/2026.
- [x] **3. Read model:** criada a migration
  `20260815220100_get_agenda_dia_oculta_ausente_emusys.sql`, baseada na
  definicao atual de producao de `get_agenda_dia` e com um unico predicado no
  CTE `base`, antes da agregacao.
- [x] **4. Testes locais:** fixtures PostgreSQL cobrem presenca preservada,
  roster preservado, corrida entre reconciliacao e presenca, turma mista,
  `agenda_secretaria`, `emusys`, reativacao e RLS/ACL. `npm test` e
  `npm run build` passaram.
- [ ] **5. Gate de producao:** confirmar que a definicao-base da RPC nao mudou
  desde a auditoria, aplicar as duas migrations e rodar advisors.
- [ ] **6. Validacao real:** confirmar por SQL que Matheus nao retorna em
  Campo Grande em 15/08/2026 e que a falta de secretaria permanece; depois
  recarregar a Agenda publicada em uma sessao nova de navegador.
- [ ] **7. Publicacao Git:** commit intencional, push, PR e merge autorizados
  pelo usuario somente apos as validacoes acima.

## Limites

- Nenhum historico e apagado.
- Nenhuma decisao humana e sobrescrita.
- A remediacao usa unidade, data e IDs externos do Emusys; nao usa IDs locais
  gerados.
