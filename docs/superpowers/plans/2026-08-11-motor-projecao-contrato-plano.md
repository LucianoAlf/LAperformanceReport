# Plano de Implementação — Motor de Projeção de Contrato

> **Base:** [SPEC — Motor de Projeção de Contrato](./2026-08-11-motor-projecao-contrato.md)
> **Data:** 11/08/2026
> **Status:** Ajustado após auditoria — usa o que o Emusys já manda

---

## O que mudou após a auditoria

O Emusys **já manda** `data_hora_primeira_aula` e `data_hora_ultima_aula` no webhook de matrícula. A jornada (`aluno_jornada_matricula_disciplina`) **já espelha** esses campos.

**O motor não recria a projeção do zero — ele cruza o que o Emusys manda com o calendário real.**

Isso simplifica tudo:
- Não precisa gerar as 40 datas do zero
- Pega a primeira do Emusys, materializa as 38 do meio pulando feriados/recessos
- Compara a última projetada com a última do Emusys → semáforo

---

## Fase 1 — Fundação

### Task 1.1 — Migration: tabelas do motor

**Arquivo:** `supabase/migrations/20260812000000_motor_projecao_contrato.sql`

- Criar `calendario_escolar` (recessos e emendas por unidade/ano)
- Criar `projecao_aulas` (projeção materializada)
- Criar `projecao_recaculo_log` (auditoria)
- Índices e constraints
- Grants para authenticated

**Estimativa:** 30 min

---

### Task 1.2 — RPC: materializar_projecao_contrato

**Arquivo:** `supabase/migrations/20260812000100_rpc_materializar_projecao.sql`

```sql
materializar_projecao_contrato(
  p_aluno_id integer,
  p_matricula_disciplina_id bigint
) returns jsonb
```

**Lógica:**
1. Buscar `data_primeira_aula`, `data_ultima_aula`, `dia_semana`, `nr_aulas_contratadas` da jornada
2. Buscar feriados globais + recessos/emendas confirmados da unidade
3. Gerar as N datas: próximo dia da semana a partir de data_primeira_aula, pulando feriados/recessos
4. Comparar última projetada vs última Emusys → semáforo
5. Inserir em `projecao_aulas` com versao=1

**Estimativa:** 1h

---

### Task 1.3 — Trigger: jornada → materializar automaticamente

**Arquivo:** `supabase/migrations/20260812000200_trigger_jornada_projecao.sql`

```sql
create trigger trg_jornada_materializa_projecao
  after insert or update of data_primeira_aula, data_ultima_aula on aluno_jornada_matricula_disciplina
  for each row execute function materializar_projecao_contrato(NEW.aluno_id, NEW.emusys_matricula_disciplina_id);
```

**Lógica:** Quando a jornada é sincronizada (webhook ou sync), materializa a projeção automaticamente.

**Estimativa:** 30 min

---

### Task 1.4 — Trigger: aluno_presenca → projecao_aulas

**Arquivo:** `supabase/migrations/20260812000300_trigger_presenca_projecao.sql`

**Lógica:**
- `presente` → marca `projecao_aulas.status = 'realizada'`
- `falta` → marca `projecao_aulas.status = 'falta'`
- `falta_justificada` → marca `projecao_aulas.status = 'falta_justificada'`

**Estimativa:** 30 min

---

### Task 1.5 — Página: Calendário Escolar

**Arquivo:** `src/components/App/Agenda/CalendarioEscolar.tsx`

- Lista de feriados globais (de `feriados`)
- CRUD de recessos/emendas por unidade (de `calendario_escolar`)
- Visualização do ano por dia da semana (banco de segurança)

**Rota:** `/app/agenda/calendario`

**Estimativa:** 2h

---

### Task 1.6 — Componente: Semáforo da Matrícula

**Arquivo:** `src/components/App/Alunos/ModalNovoAluno.tsx` (integrar)

- Quando a jornada é sincronizada, chama `materializar_projecao_contrato`
- Mostra: última aula Emusys, última projetada, delta, semáforo
- Se vermelho: sugere ajuste

**Estimativa:** 1h

---

## Fase 2 — Projeção Viva

### Task 2.1 — RPC: recalcular_projecao

**Arquivo:** `supabase/migrations/20260812000400_rpc_recalcular_projecao.sql`

```sql
recalcular_projecao(
  p_aluno_id integer,
  p_matricula_disciplina_id bigint,
  p_trigger text,
  p_detalhes jsonb
) returns jsonb
```

**Lógica:**
1. Marcar aulas passadas como realizada/falta (match com aluno_presenca)
2. Recalcular datas restantes a partir de hoje, pulando feriados/recessos
3. Inserir novas linhas com versao = versao_anterior + 1
4. Logar em projecao_recaculo_log

**Estimativa:** 1h

---

### Task 2.2 — Trigger: aluno_reposicoes → projecao_aulas

**Arquivo:** `supabase/migrations/20260812000500_trigger_reposicao_projecao.sql`

**Lógica:**
- Reposição agendada → marca original como `falta_justificada`, cria nova data como `reposta`

**Estimativa:** 30 min

---

### Task 2.3 — Trigger: calendario_escolar → recálculo em massa

**Arquivo:** `supabase/migrations/20260812000600_trigger_calendario_projecao.sql`

**Lógica:**
- Recesso/emenda confirmado → recalcula todos os contratos do dia da semana afetado
- Feriado novo → recalcula todos os contratos daquele dia

**Estimativa:** 30 min

---

### Task 2.4 — RPC: get_watchlist_projecao

**Arquivo:** `supabase/migrations/20260812000700_rpc_watchlist_projecao.sql`

```sql
get_watchlist_projecao(
  p_unidade_id uuid default null,
  p_dias_futuros integer default 30
) returns table(...)
```

**Retorna:**
- Alunos na janela de renovação (aula N-5)
- Contratos sem margem (delta_dias ≤ 0)
- Contratos estourando (projeção > última Emusys)

**Estimativa:** 1h

---

### Task 2.5 — Componente: Watchlist de Projeção

**Arquivo:** `src/components/App/Agenda/Chamada/WatchlistProjecao.tsx`

- Lista de alunos que precisam de olhar
- Filtro por status: janela de renovação, sem margem, estourando
- Ação: agendar reposição, abrir drawer do aluno

**Estimativa:** 1.5h

---

## Fase 3 — Inteligência

### Task 3.1 — Simulador de emendas

**Arquivo:** `src/components/App/Agenda/CalendarioEscolar.tsx` (integrar)

- Antes de confirmar uma emenda, mostra o antes/depois do banco de cada dia
- Lista os contratos afetados

**Estimativa:** 1h

---

### Task 3.2 — Calendário provisório para contratos rolling

**Arquivo:** `supabase/migrations/20260812000800_projecao_calendario_provisorio.sql`

**Lógica:**
- Contrato iniciado em outubro/2026 projeta até setembro/2027
- Se o calendário 2027 não existe, usa feriados nacionais + padrão de recessos
- Marca projeção como `is_provisional = true`
- Quando o calendário oficial for lançado, recálculo em massa

**Estimativa:** 1h

---

### Task 3.3 — Radar de renovações por mês

**Arquivo:** `src/components/App/Comercial/RadarRenovacoes.tsx`

- Agregado de `last_lesson_date` de todos os contratos
- Previsão de receita futura distribuída ao longo do ano

**Estimativa:** 1h

---

### Task 3.4 — Componente: Timeline do Contrato

**Arquivo:** `src/components/App/Alunos/TimelineContrato.tsx`

- Visualização das 40 aulas: realizadas, projetadas, repostas
- Integra no drawer do aluno

**Estimativa:** 1h

---

## Resumo

| Fase | Tasks | Estimativa |
|---|---|---|
| Fase 1 — Fundação | 6 tasks | ~5.5h |
| Fase 2 — Projeção Viva | 5 tasks | ~4.5h |
| Fase 3 — Inteligência | 4 tasks | ~4h |
| **Total** | **15 tasks** | **~14h** |

---

## Ordem de execução recomendada

1. Task 1.1 (migration) → Task 1.2 (RPC materializar) → Task 1.3 (trigger jornada) → Task 1.4 (trigger presença)
2. Task 1.5 (calendário) → Task 1.6 (semáforo)
3. Task 2.1 (recalcular) → Task 2.2 (trigger reposição) → Task 2.3 (trigger calendário)
4. Task 2.4 (watchlist RPC) → Task 2.5 (watchlist UI)
5. Task 3.1 (simulador) → Task 3.2 (provisório) → Task 3.3 (radar) → Task 3.4 (timeline)

---

*Plano ajustado em 11/08/2026 após auditoria profunda do banco. Usa o que o Emusys já manda em vez de recriar do zero.*
