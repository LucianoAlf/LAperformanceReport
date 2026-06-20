# 2026-06-20 — Régua do professor: troca de fonte + conserto do sync de experimentais

> Catálogo do que foi feito (regra: tudo que fizermos vai aqui em `docs/hugo/`).

## Contexto / problema

A **taxa de conversão do professor** (RPC `get_kpis_professor_periodo`) lia da tabela `leads`, que guarda **1 experimental por pessoa** (1 professor, 1 curso, 1 data). Quem tem o histórico real de cada aula é `lead_experimentais` (1 linha por aula). Consequências medidas (mar–jun 2026, 3 unidades):

- A régua **subcontava realizadas**: capturava 351 de 388 (~10% perdidas) + perdia 62 eventos por agregação (multi-experimental virava 1).
- Resultado: **taxa de conversão inflada** para a maioria dos professores (denominador menor que o real).
- `lead_experimentais` tinha **curso nulo em 73%** dos registros e alguns status desatualizados.

Decisão do Alf (WhatsApp): experimental de aluno existente (2º instrumento) **conta** na régua; trocar a fonte; consertar o pipeline; backfillar; documentar.

## O que foi feito

### Fase 1 — Edge `sync-presenca-emusys` corrigida (deploy CLI, internal v33)
Arquivo: `supabase/functions/sync-presenca-emusys/index.ts`.
1. **Grava `curso_interesse_id`** na reconciliação (interface `ExperimentalParaReconciliar` ganhou `cursoId`; resolvido via `cursoMapa` na coleta; preenchido no INSERT e em registros existentes com curso nulo). Antes: 100% nulo.
2. **Coleta experimentais canceladas** (movido para antes do `if (aula.cancelada) continue`) para a reconciliação marcar `cancelada` em vez de deixar virar `faltou`.
3. **Auto-faltou subordinado ao Emusys**: só marca `faltou` quando existe prova de aula no `/aulas/` (aula_emusys experimental, não cancelada). Sem prova → mantém `agendada`. Limiar 7→15 dias (> janela do cron de 5-7d). Mata a falta-por-silêncio (origem do caso José/Rodolfo).

### Fase 2 — Backfill mar–jun 2026
- Reprocessou 02/03 → 19/06, 3 unidades, em janelas de 7 dias com throttling (pausa 6s) — `dias=30` em rajada estourava o rate limit do Emusys.
- Resultado: **curso 27% → 75%** preenchido (428/571); **+56 experimentais** recuperadas que nem existiam no banco; 0 presas em "agendada".
- Script: `c:/tmp/backfill_exp2.sh` (efêmero).

### Fase 3 — RPC `get_kpis_professor_periodo` (migration `rpc_professor_experimentais_fonte_lead_experimentais`)
Trocado **apenas o CTE `experimentais`** (resto idêntico, mesma assinatura):
- denominador (`experimentais`) = `lead_experimentais.status IN ('experimental_realizada','convertido')`
- numerador (`matriculas_pos_exp`) = realizadas cujo lead converteu (`leads.converteu` / status convertido/matriculado)
- `matriculas_diretas = 0` — matrícula direta sem experimental não entra na régua do professor (decisão #3 do Alf)
- agrupa por `professor_experimental_id` + `unidade_id`

## Validação (RPC em produção bate com a simulação)

| Professor | exp antiga→nova | taxa antiga → nova |
|---|---|---|
| Lucas da Silva Guimarães | 3→10 | 100% → 60% |
| Erick Osmy | 6→13 | 67% → 31% |
| Valdo Delfino | 12→23 | 58% → 43% |
| Pedro Glória | 21→32 | 38% → 31% |
| Joel Gouveia | 8→12 | 50% → 33% |
| Matheus Felipe Lourenço | 12→17 | 0% → 18% (subiu) |

Efeito geral: as taxas **desinflam** (os 100% irreais viram número realista). Precisão da régua estimada: **~82% → ~97%**.

## Impacto

- **Onde aparece**: `TabPerformanceProfessores`, `ModalDetalhesConversao`, modo Trimestral, e os 4 relatórios IA de professor/coordenação. Todos passam a citar a taxa nova.
- **Ranking de professores muda** — quem estava no topo por taxa inflada desce.
- **Atenção (decisão #1 ainda aberta)**: se a taxa for usada para premiar/cobrar, a mudança redistribui — a régua antiga premiava com base em número inflado.

## Pendências

- **143 experimentais (25%) ainda com curso nulo** — nome de curso do Emusys não casou no `normalizarCurso`. Refinar o mapa de cursos.
- **Decisão #1 do Alf**: a taxa do professor é usada para premiar/cobrar? Define o peso da mudança.
- **Cron**: avaliar aumentar a janela do sync (hoje 5-7d) p/ reduzir presença que chega atrasada e nunca é repescada.
- Backfill anterior a mar/2026 não feito (sync não existia; `lead_experimentais` vazio lá) — só necessário se a régua precisar de períodos mais antigos.

## Ponteiros
- Edge: `supabase/functions/sync-presenca-emusys/index.ts`
- RPC: migration `rpc_professor_experimentais_fonte_lead_experimentais`
- Decisões/diagnóstico: `.claude/memory/pendencias-2026-06-20-costura-experimental.md`
