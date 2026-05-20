# Módulo Saúde das Automações

Monitoramento ativo dos webhooks Emusys e integridade dos dados ingeridos. Detecta falhas silenciosas via invariantes (regras que sempre devem ser verdadeiras). Implementado 2026-05-20.

## Arquitetura em 2 camadas

1. **Tempo real (helper)** — toda execução do `processar-matricula-emusys` chama `gravarLog()` no final de cada handler, registrando ok/warn/erro + payload bruto + invariantes detectadas.
2. **Cron auditor (varredura)** — `auditor-divergencias-emusys` roda toda hora cheia, varre o banco com 13 regras SQL idempotentes via RPC.

## Banco

### `automacao_log` (estendida)
Colunas novas: `status` (ok/warn/erro), `lead_id` (FK), `payload_bruto` (jsonb), `idempotency_key` (text unique).

### `automacao_invariantes` (nova)
1 linha por regra violada. Soft "marcar como visto" via `visto_em` (timestamp NULL = pendente). Campos: `regra`, `severidade` (critico/aviso/info), `entidade_tipo`, `entidade_id`, `contexto` (jsonb), `idempotency_key` (UNIQUE), `visto_em`, `visto_por`.

### RLS
- SELECT permissivo para `authenticated` em ambas
- UPDATE em `automacao_invariantes` apenas para admin (`usuarios.perfil='admin'`) — controla o "marcar como visto"

### RPC `executar_query_auditoria(p_sql text)`
SECURITY DEFINER, restrita a `service_role`. Aceita só `SELECT`/`WITH`. Retorna `jsonb`. Usada pelo auditor para rodar as 13 queries sem hardcode no edge.

## Edge functions

### `processar-matricula-emusys` v17 (atualizada)
- Importa helper `_shared/invariantes.ts`
- Cada handler (matrícula/renovação/trancamento/finalização) chama `checar*()` no final e grava via `gravarLog()`
- Try/catch externo grava invariante meta `processamento_falhou_excecao` em caso de erro não previsto
- Idempotency key: `proc:<tipo>:<emusys_matricula_id>` ou `<lead_id>:<hash_payload>`

### `auditor-divergencias-emusys` v1 (nova)
- Disparo: pg_cron `0 * * * *` OU botão manual no frontend
- Catálogo de 13 regras SQL (texto literal no código) — cada uma roda via `executar_query_auditoria()`
- Grava invariantes com `idempotency_key='audit:<regra>:<id>'` — re-execução não duplica
- Resumo final retornado: `{ total_invariantes, por_regra: {...}, duracao_ms }`

## Helper `supabase/functions/_shared/invariantes.ts`
Exports:
- Types: `Severidade` (critico/aviso/info), `Invariante`, `GravarLogParams`, `ResultadoMatricula`
- `comFallback<T>(fn, fallback)` — wrapper try/catch que devolve fallback em erro
- `gravarLog(supabase, params)` — insert em `automacao_log` + bulk insert em `automacao_invariantes`
- `computarHash(payload)` — SHA-256 para idempotency key derivado do payload
- `checarMatricula(payload, resultado)` — 8 regras (sem aluno_nome, sem emusys_matricula_id, sem disciplinas, sem professor, professor_nao_resolvido, sem curso, sem lead_origem, sem valor_passaporte)
- `checarRenovacao(payload, resultado)` — 2 regras (sem matrícula anterior, reajuste >30%)
- `checarTrancamento(payload, resultado)` — 2 regras (aluno não encontrado, sem motivo)
- `checarFinalizacao(payload, resultado)` — 3 regras (aluno não encontrado, motivo nulo, sem motivo_saida_id)

## Catálogo de invariantes (16 regras)

### Helper (matrícula em tempo real)
matricula_sem_aluno_nome, matricula_sem_emusys_matricula_id, matricula_sem_disciplinas, matricula_sem_professor, matricula_professor_nao_resolvido, matricula_sem_curso, matricula_sem_lead_origem, matricula_sem_valor_passaporte, renovacao_sem_matricula_anterior, renovacao_reajuste_acima_30pct, trancamento_aluno_nao_encontrado, trancamento_sem_motivo, evasao_aluno_nao_encontrado, evasao_motivo_nulo, evasao_sem_motivo_saida_id, invariante_checagem_falhou.

### Cron auditor (SQL — 13 regras)
- **Leads (5):** lead_sem_nome, lead_sem_telefone, lead_telefone_invalido, lead_sem_unidade, lead_duplicado_mesmo_dia
- **Experimentais (5):** experimental_sem_professor, experimental_data_passada, experimental_realizada_e_faltou, experimental_realizada_data_futura, experimental_faltou_data_futura
- **Alunos (3):** matricula_sem_professor_no_banco, matricula_sem_curso_no_banco, matricula_sem_lead_origem_no_banco

## Frontend

### Rota e estrutura
- Rota nova: `/app/automacoes` em `src/router.tsx`
- Diretório: `src/components/App/Automacoes/`
  - `AutomacoesPage.tsx` — container com 2 tabs
  - `TabJornadas.tsx` — agrupa logs por `idempotency_key` (uma "jornada" = vida útil de um payload)
  - `TabFeedEventos.tsx` — feed cronológico de logs
  - `LinhaEvento.tsx` — linha do feed com status badge
  - `ModalPayloadBruto.tsx` — JSON do payload bruto
  - `BotaoRodarAuditoria.tsx` — invoca auditor manualmente
  - `index.ts` — barrel

### Sidebar Admin
Item novo em `AppSidebar.tsx` com badge vermelho mostrando `count(*) FROM automacao_invariantes WHERE visto_em IS NULL AND severidade='critico'`.

### Hooks
- `src/hooks/useBadgeAutomacoes.ts` — count para o badge
- `src/hooks/useAutomacoesData.ts` — fetch de logs e invariantes para as tabs

## pg_cron
`auditor-divergencias-cron` — `0 * * * *` (toda hora cheia) chama edge auditor via `net.http_post`.

## Achados na primeira execução do auditor (baseline 2026-05-20)
- **47** alunos ativos sem `professor_atual_id`
- **22** experimentais com data passada sem realizada/faltou
- **20** alunos sem lead prévio (matrícula direta)
- **19** leads `experimental_realizada=true AND faltou_experimental=true` (bug sistemático em workflow)
- **19** leads sem telefone
- **13** experimentais sem professor
- **8** alunos sem curso
- **3** leads sem nome
- **1** experimental realizada antes da data marcada

A invariante `experimental_realizada_e_faltou` (19 casos) sugere bug no n8n ou no Emusys que marca ambos os flags ao mesmo tempo — investigar antes de zerar manualmente.
