# Dominio Alunos — LA Music

## Pagina Principal
- `src/components/App/Alunos/AlunosPage.tsx`
- Tabs: Distribuicao, Importar, Gestao Turmas, Grade Horaria, Sucesso Cliente (Presenca, Feedback, Evasao, Auditoria)

## Tabela Alunos
- `src/components/App/Alunos/TabelaAlunos.tsx`
- Filtros: status, professor, curso
- Edicao inline, historico, anotacoes
- Campos: id, nome, classificacao, idade_atual, data_inicio, data_saida, status, unidade_id, professor_atual_id, valor_parcela

## Status do Aluno
- `ativo` — frequentando normalmente
- `trancado` — pausa temporaria
- `aviso_previo` — vai sair (intervenção possivel)
- `evadido` — saiu (evasao confirmada)
- `nao_renovou` — contrato venceu sem renovacao

## Gestao de Turmas
- `src/components/App/Alunos/GestaoTurmas.tsx`
- Criar turma: nome, curso, professor, dias, horarios, sala, capacidade
- Distribuir alunos entre turmas/professores
- **Remover aluno da turma**: acao nos modais de detalhe em `AlunosPage.tsx` e `GestaoTurmas.tsx`

## Importacao Emusys
- `src/components/App/Alunos/ImportarAlunos.tsx` — bulk import do Emusys

## Presenca (Attendance)
- `src/components/App/Alunos/SucessoCliente/PresencaTab.tsx`
- Grade semanal (seg-sab) por aluno com cards por dia
- Status: presente (check), ausente (X), justificado (warning)
- **Filtro por data**: permite selecionar semana especifica
- Sync log com paginacao (tabela `emusys_sync_log`)

### Fluxo de Sync
1. **Emusys API** (`GET /v1/aulas/`) retorna aulas com presenca individual
2. **Edge Function** `sync-presenca-emusys` processa diariamente (pg_cron 22h BRT)
3. **Tabela `aulas_emusys`**: aula com emusys_id, professor, curso, sala, duracao, alunos
4. **Tabela `aluno_presenca`**: vinculo aluno_id + aula_emusys_id com status presente/ausente
5. **RPC** `atualizar_percentual_presenca` recalcula % por aluno apos sync

### Matching de Alunos
- Nome normalizado (lowercase, sem acentos, sem parenteses)
- Prioriza alunos ativos (`ativo`, `aviso_previo`)
- Inativos sao logados separadamente no sync log
- Nao encontrados: registrados em `nomes_nao_encontrados[]`

### Sync Log
- Tabela `emusys_sync_log` com metricas por unidade/data
- Campos: total_aulas, presentes, ausentes, matched, nao_encontrados, experimentais_count, inativos_count

## Auditoria IA
- `src/components/App/Alunos/Auditoria/RelatorioAuditoria.tsx`
- OpenAI com function calling para insights de alunos

## Automacoes
- `src/components/App/Alunos/Automacao/TabAutomacao.tsx`
- Webhooks n8n para aulas experimentais e matriculas

## Movimentacoes (em AdministrativoPage)
- Renovacao, Nao Renovacao, Aviso Previo, Trancamento, Evasao
- Cada tipo com modal dedicado (`Modal*.tsx`)

## KPIs de Retencao
- alunos_ativos, alunos_pagantes, matriculas_ativas
- renovacoes_previstas/realizadas/pendentes, nao_renovacoes
- ticket_medio, faturamento, churn_rate, ltv_meses, mrr_perdido

## Hooks Relacionados
- `useEvasoesData` — agregacao por mes, motivo, professor, unidade
- `useKPIsRetencao` — KPIs consolidados de retencao
- `useFidelizaPrograma` — programa gamificado Fideliza+
- `useDadosMensais` — snapshots mensais
- `useHealthScore` — presenca = 15% do health score do aluno
