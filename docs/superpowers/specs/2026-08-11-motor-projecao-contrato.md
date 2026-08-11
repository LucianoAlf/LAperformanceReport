# SPEC — Motor de Projeção de Contrato (LA Report)

> **Objetivo:** Cruzar o que o Emusys já calcula (primeira e última aula) com o calendário real da escola (feriados, recessos, emendas) para saber se o contrato fecha — e alertar quando não fecha.

---

## 0. Auditoria — o que o Emusys já manda

O webhook de matrícula do Emusys já traz **todos os campos do contrato**:

```json
{
  "nr_aulas_contratadas": 40,
  "nr_aulas_passadas": 1,
  "nr_aulas_futuras": 39,
  "data_hora_primeira_aula": "2026-08-11 18:00:00",
  "data_hora_ultima_aula": "2027-06-29 18:00:00",
  "dia_da_semana": 3,
  "dia_da_semana_nome": "Terça-feira",
  "frequencia_de_aulas": "Semanal",
  "duracao_em_minutos": 50,
  "dia_vencimento_mensalidade": 5
}
```

**O Emusys já calcula `data_hora_ultima_aula`** — mas pela frequência semanal simples (40 semanas × 1 aula/semana), **sem considerar feriados/recessos da escola**. A jornada (`aluno_jornada_matricula_disciplina`) já espelha esses campos.

O que o Emusys **não faz**:
1. Considerar feriados/recessos/emendas da escola
2. Materializar as 38 datas do meio (só manda a primeira e a última)
3. Alertar quando a projeção muda (feriado novo, recesso, etc.)

**O motor não recria a projeção do zero — ele cruza o que o Emusys manda com o calendário real.**

---

## 1. O que já existe (não criar de novo)

| Tabela/View | O que tem | O que falta |
|---|---|---|
| `aluno_jornada_matricula_disciplina` | `nr_aulas_contratadas`, `nr_aulas_passadas`, `nr_aulas_futuras`, `data_primeira_aula`, `data_ultima_aula`, `dia_semana`, `horario` | Nada — é a fonte de verdade |
| `feriados` | `data`, `nome`, `tipo` (national/municipal), `ativo` | `unidade_id` (hoje é global), `escola_fechada` (bool) |
| `aulas_emusys` | `data_aula`, `matricula_disciplina_id`, `nr_da_aula`, `qtd_aulas_contrato` | Nada — já é o espelho da grade |
| `aluno_presenca` | `status_presenca`, `aula_emusys_id`, `aluno_id` | Nada — já é a presença |
| `aluno_reposicoes` | `status`, `aula_origem_id`, `aula_reposicao_id` | Nada — já é o banco de reposições |

---

## 2. Tabelas novas

### 2.1 `calendario_escolar`

Recessos e emendas por unidade/ano. Feriados continuam em `feriados` (globais).

```sql
create table calendario_escolar (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id),
  ano integer not null,
  tipo text not null check (tipo in ('recesso', 'emenda')),
  data_inicio date not null,
  data_fim date not null,
  nome text not null,
  status text not null default 'confirmado' check (status in ('simulado', 'confirmado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, ano, tipo, data_inicio)
);
```

**Regras:**
- `tipo = 'recesso'`: período sem aula (Carnaval, julho, dezembro)
- `tipo = 'emenda'`: feriado que vira dia sem aula por decisão da escola (ex: emendar 24/04)
- `status = 'simulado'`: o gestor está testando o impacto antes de confirmar
- `status = 'confirmado'`: entra no cálculo da projeção

### 2.2 `projecao_aulas`

A projeção materializada — cada aula do contrato com data prevista.

```sql
create table projecao_aulas (
  id uuid primary key default gen_random_uuid(),
  aluno_id integer not null references alunos(id),
  matricula_disciplina_id bigint not null,
  unidade_id uuid not null references unidades(id),
  sequencia integer not null, -- 1..N (aula 1, aula 2, ...)
  data_projetada date not null,
  dia_semana text not null, -- 'segunda', 'terca', ...
  status text not null default 'projetada' check (status in (
    'projetada',    -- ainda não aconteceu
    'realizada',    -- aula aconteceu (match com aluno_presenca)
    'falta',        -- aluno faltou
    'falta_justificada', -- falta com atestado (gera reposição)
    'reposta',      -- reposição agendada (match com aluno_reposicoes)
    'debitada_evento', -- debitada para evento (Summer Camp, etc.)
    'cancelada'     -- aula cancelada (feriado, recesso, professor faltou)
  )),
  versao integer not null default 1, -- incrementa a cada recálculo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aluno_id, matricula_disciplina_id, sequencia)
);
```

**Índices:**
- `(aluno_id, matricula_disciplina_id, versao)` — consulta por contrato
- `(unidade_id, data_projetada)` — consulta por dia
- `(status, data_projetada)` — watchlist

### 2.3 `projecao_recaculo_log`

Auditoria de cada recálculo — por que a data mudou.

```sql
create table projecao_recaculo_log (
  id uuid primary key default gen_random_uuid(),
  aluno_id integer not null,
  matricula_disciplina_id bigint not null,
  trigger_evento text not null, -- 'feriado_decretado', 'reposicao_agendada', 'mudanca_dia', etc.
  versao_anterior integer not null,
  versao_nova integer not null,
  detalhes jsonb,
  created_at timestamptz not null default now()
);
```

---

## 3. RPCs

### 3.1 `materializar_projecao_contrato`

Chamada quando a jornada é sincronizada (webhook de matrícula ou sync). Pega a primeira e última aula do Emusys e materializa as N datas do meio, pulando feriados/recessos.

```sql
create or replace function materializar_projecao_contrato(
  p_aluno_id integer,
  p_matricula_disciplina_id bigint
)
returns jsonb
```

**Lógica:**
1. Busca `data_primeira_aula`, `data_ultima_aula`, `dia_semana`, `nr_aulas_contratadas` da jornada
2. Busca feriados globais + recessos/emendas confirmados da unidade
3. Gera as N datas: próximo `dia_semana` a partir de `data_primeira_aula`, pulando feriados e recessos
4. Se a última projetada > `data_ultima_aula` do Emusys → o contrato estoura (alerta)
5. Se a última projetada < `data_ultima_aula` do Emusys → o contrato tem folga
6. Insere em `projecao_aulas` com `versao = 1`
7. Retorna: última aula projetada, última aula Emusys, delta (dias), semáforo

**O semáforo:**

| Estado | Condição | Significado |
|---|---|---|
| Verde | Última projetada ≤ última Emusys | Contrato fecha bem, com folga |
| Amarelo | Última projetada = última Emusys | Sem margem para reposição |
| Vermelho | Última projetada > última Emusys | Estoura o ciclo — precisa de ajuste |

### 3.2 `recalcular_projecao`

Chamada quando algo muda. Recalcula as datas restantes.

```sql
create or replace function recalcular_projecao(
  p_aluno_id integer,
  p_matricula_disciplina_id bigint,
  p_trigger text, -- 'feriado_decretado', 'reposicao_agendada', 'mudanca_dia'
  p_detalhes jsonb default null
)
returns jsonb
```

**Lógica:**
1. Marca aulas passadas como `realizada`/`falta`/`falta_justificada` (match com `aluno_presenca`)
2. Recalcula as datas restantes a partir de hoje, pulando feriados/recessos
3. Insere novas linhas com `versao = versao_anterior + 1`
4. Loga em `projecao_recaculo_log`
5. Retorna o delta (quantas aulas mudaram de data)

### 3.3 `get_projecao_contrato`

Consulta a projeção de um contrato.

```sql
create or replace function get_projecao_contrato(
  p_aluno_id integer,
  p_matricula_disciplina_id bigint
)
returns table(
  sequencia integer,
  data_projetada date,
  status text,
  dia_semana text,
  aula_realizada_id integer, -- match com aulas_emusys se já aconteceu
  reposicao_id uuid -- match com aluno_reposicoes se reposta
)
```

### 3.4 `get_watchlist_projecao`

A lista de alunos que precisam de olhar.

```sql
create or replace function get_watchlist_projecao(
  p_unidade_id uuid default null,
  p_dias_futuros integer default 30
)
returns table(
  aluno_id integer,
  aluno_nome text,
  matricula_disciplina_id bigint,
  dia_semana text,
  aulas_restantes integer,
  ultima_aula_projetada date,
  ultima_aula_emusys date,
  delta_dias integer,
  status_alerta text, -- 'janela_renovacao', 'sem_margem', 'estourando'
  folga_banco integer -- excedente do dia da semana
)
```

---

## 4. Triggers e automação

### 4.1 Trigger: aluno_presenca → atualiza projecao_aulas

Quando uma presença é registrada, marca a aula projetada como `realizada`/`falta`.

### 4.2 Trigger: aluno_reposicoes → atualiza projecao_aulas

Quando uma reposição é agendada, marca a aula original como `falta_justificada` e cria a nova data como `reposta`.

### 4.3 Trigger: feriados/calendario_escolar → recálculo em massa

Quando um feriado é criado ou um recesso é confirmado, recalcula todos os contratos afetados.

### 4.4 Trigger: aluno_jornada_matricula_disciplina → materializar_projecao_contrato

Quando a jornada é sincronizada (webhook de matrícula ou sync), materializa a projeção automaticamente.

---

## 5. Frontend

### 5.1 Página: Calendário Escolar (`/app/agenda/calendario`)

- Lista de feriados (globais) + recessos/emendas por unidade
- Botão "Simular emenda" — mostra o impacto antes de confirmar
- Visualização do ano por dia da semana (banco de segurança)

### 5.2 Componente: Semáforo da Matrícula

No modal de nova matrícula, antes de confirmar:

```
┌─────────────────────────────────┐
│ Projeção do contrato            │
│ 40 aulas · 12 parcelas          │
│                                 │
│ Última aula (Emusys): 29/06/27  │
│ Última aula (projetada): 15/07/27│
│ Delta: +16 dias                 │
│                                 │
│ ● Vermelho — estoura o ciclo    │
│                                 │
│ [Confirmar matrícula]           │
└─────────────────────────────────┘
```

### 5.3 Componente: Watchlist de Projeção

Na página de Alunos ou na Chamada:

```
┌─────────────────────────────────┐
│ Alunos que precisam de olhar    │
├─────────────────────────────────┤
│ 🔴 Maria Silva — quarta         │
│    38/40 aulas · estoura 15/07  │
│    Última aula Emusys: 29/06    │
│    → Agendar reposição          │
├─────────────────────────────────┤
│ 🟡 João Santos — segunda        │
│    35/40 aulas · sem margem     │
│    → Atenção nas próximas       │
├─────────────────────────────────┤
│ 🟢 Ana Costa — quarta           │
│    38/40 aulas · janela de renov│
│    → Chamar para renovar        │
└─────────────────────────────────┘
```

### 5.4 Componente: Timeline do Contrato

No drawer do aluno (ou modal):

```
Aula 35 ●─── Aula 36 ●─── Aula 37 ○─── Aula 38 ○─── Aula 39 ○─── Aula 40 ○
05/08      12/08      19/08      26/08      02/09      09/09
                     ↑
              reposição agendada
```

---

## 6. Integração com o que existe

| O que existe | Como integra |
|---|---|
| `aluno_jornada_matricula_disciplina` | Fonte de `nr_aulas_contratadas`, `data_primeira_aula`, `data_ultima_aula`, `dia_semana`, `horario` |
| `aulas_emusys` | Match por `data_aula` + `aluno_id` para marcar aula como `realizada` |
| `aluno_presenca` | Trigger atualiza `projecao_aulas.status` |
| `aluno_reposicoes` | Trigger marca original como `falta_justificada` e cria nova data como `reposta` |
| `feriados` | Fonte global de feriados (nacional/estadual/municipal) |
| `vw_contratos_vencendo` | Substituir por `get_watchlist_projecao` (mais preciso) |

---

## 7. Fases de implementação

### Fase 1 — Fundação (calendário + projeção)

- [ ] Migration: `calendario_escolar` + `projecao_aulas` + `projecao_recaculo_log`
- [ ] RPC: `materializar_projecao_contrato`
- [ ] Trigger: `aluno_jornada_matricula_disciplina` → materializar automaticamente
- [ ] Trigger: `aluno_presenca` → `projecao_aulas`
- [ ] Página: Calendário Escolar (CRUD de recessos/emendas)
- [ ] Componente: Semáforo da Matrícula

### Fase 2 — Projeção viva (recálculo + alertas)

- [ ] RPC: `recalcular_projecao`
- [ ] Trigger: `aluno_reposicoes` → `projecao_aulas`
- [ ] Trigger: `feriados`/`calendario_escolar` → recálculo em massa
- [ ] RPC: `get_watchlist_projecao`
- [ ] Componente: Watchlist de Projeção

### Fase 3 — Inteligência (simulador + radar)

- [ ] Simulador de emendas (antes/depois do banco)
- [ ] Calendário provisório para contratos que atravessam a virada de ano
- [ ] Radar de renovações por mês
- [ ] Componente: Timeline do Contrato

---

## 8. Regras de negócio (canônicas)

1. **A projeção é materializada, não calculada on-the-fly.** As datas ficam em `projecao_aulas` — performance e auditoria.

2. **A versão incrementa a cada recálculo.** `versao = 1` na matrícula, `versao = 2` após o primeiro recálculo, etc. O histórico fica em `projecao_recaculo_log`.

3. **Feriado global afeta todas as unidades.** Recesso/emenda é por unidade.

4. **Emenda confirmada entra no cálculo.** Emenda simulada não — é só para o gestor testar.

5. **O banco de segurança é por dia da semana.** Quarta tem +4, segunda tem +1. O motor usa esse excedente para reposições e eventos.

6. **Reposição restrita protege o banco.** Só com atestado médico + 2 cortesias por contrato. O motor não deixa a reposição consumir o banco além do limite.

7. **Contrato rolling atravessa a virada de ano.** A projeção usa o calendário do ano seguinte (provisório) quando necessário.

8. **O Emusys é a fonte de verdade para a primeira e última aula.** O motor materializa as do meio e alerta quando a projeção real diverge da do Emusys.

---

*SPEC ajustada em 11/08/2026 após auditoria profunda do banco. Baseada na conversa Luciano × Matheus, no Motor de Projeção de Contrato (proposta técnica), no Modelo 40 Aulas — A Matemática do Calendário, e na auditoria do que o Emusys já manda.*
