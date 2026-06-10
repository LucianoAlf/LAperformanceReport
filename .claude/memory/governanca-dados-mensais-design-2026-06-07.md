---
name: governanca-dados-mensais-design-2026-06-07
description: Design técnico P0.0 — Governança de mês fechado em dados_mensais. DDL comentado, fluxo de retificação, trava por ponto de escrita, riscos. Nada executado.
metadata:
  type: project
---

# P0.0 — Governança de `dados_mensais`: Design Técnico

Data: 2026-06-07  
Status: **DESENHO original — substituído pela implementação real (ver seção 0-REAL abaixo)**  
Restrições: SELECT-only durante elaboração. Nenhum ALTER, CREATE, UPDATE executado.

---

## 0-REAL. Estado Implementado no Banco (verificado 2026-06-08)

⚠️ A implementação final **divergiu deste design**. O controle NÃO ficou em coluna
`status_fechamento` de `dados_mensais` — ficou em **tabela separada `competencias_mensais`**.
Aplicado via migrations `p00_governanca_competencia_mensal_fase1` (192438) e
`...fase2b_wrappers_alfredo_final` (205515), ambas de 2026-06-07.

### Tabela de controle: `competencias_mensais`
Colunas: `id, unidade_id, ano, mes, status, fechamento_lote_id, fechado_em, fechado_por, motivo, created_at, updated_at`.
`status` ∈ `aberto` | `fechado` | `retificacao_pendente`. **1 linha por (unidade, ano, mes)**.
Ausência de linha = tratado como `aberto`. `fechamento_lote_id` agrupa fechamentos feitos juntos.

### Trava: `assert_competencia_aberta(p_unidade_id, p_ano, p_mes)`
Lê `competencias_mensais`. Se status NULL ou `aberto` → retorna (permite).
Se `fechado` ou `retificacao_pendente` → `RAISE EXCEPTION` "Competencia bloqueada... Use retificacao formal."

### Plugagem da trava nas 5 portas de escrita (estado em 2026-06-08)
| Função | Trava? |
|---|---|
| `recalcular_dados_mensais` | ✅ |
| `fechar_dados_mensais` | ✅ |
| `upsert_dados_mensais` | ✅ |
| `snapshot_dados_mensais` | ❌ **buraco aberto** |
| `sync_evasao_to_dados_mensais` (trigger) | ❌ **buraco aberto — o mais grave** |

O trigger sem trava significa: evasão/movimentação com `data` retroativa em mês fechado
**ainda reescreve** o snapshot fechado. Premiação não está 100% protegida.

### Funções auxiliares existentes
- `fechar_competencia(unidade, ano, mes, fechado_por, motivo)` — marca `fechado`.
- `fechar_dados_mensais_unguarded(ano, mes)` — versão SEM trava (bypass controlado p/ admin).
- `log_competencia_bloqueio(...)` — registra tentativas bloqueadas.

### Retificação: estrutura sim, código não
Tabela `dados_mensais_retificacoes` existe (`snapshot_antes/depois`, `diff`, `solicitado_por`,
`aprovado_por`, `status`, `rollback_de`, `aplicada_em/por`). **MAS** as funções
`criar/aprovar/aplicar/reverter_retificacao` **NÃO existem ainda** — fluxo formal não codificado.
Hoje retificar = UPDATE manual via `_unguarded` ou direto, sem o workflow aprovador.

### Frontend
Hook `useCompetenciaMensalStatus` (`src/hooks/`) lê `competencias_mensais`, deriva
`aberto`/`fechado`/`retificacao_pendente`/`parcial_fechado`/`indisponivel`, expõe `bloqueiaEscrita`
+ badge + tooltip. Consolidado ("todos"): qualquer unidade fechada → `parcial_fechado`.
Mensagem: `COMPETENCIA_FECHADA_MESSAGE = "Competência fechada: alterações exigem retificação formal."`
Mês atual é rotulado "calculados em tempo real".

### Dados hoje
**Maio/2026 fechado nas 3 unidades** (Barra, CG, Recreio) por `alf/admin-master` em 2026-06-07.
Demais meses = sem linha = abertos. Dashboard ainda lê de `dados_mensais`
(`get_kpis_consolidados`, `get_kpis_evolucao_mensal`): mês aberto = recalculável; mês fechado = snapshot protegido.

### Gaps abertos (pendentes de decisão com o Alf)
1. Plugar trava em `snapshot_dados_mensais` (CONTINUE/pula) e no trigger `sync_evasao` (RETURN+WARNING).
2. Codificar as 4 funções de retificação (hoje só a tabela existe).
3. Saneamento das datas de saída (64 alunos sem `data_saida`) antes de fechar Jun/2026 — alimentado pelas
   regras `aluno_saida_sem_data_saida` / `evasao_data_saida_divergente` do auditor (ver [[modulo-saude-automacoes]]).

---

## 0. Contexto e Achados da Inspeção

### Assinaturas confirmadas no banco

```
fechar_dados_mensais(p_ano integer, p_mes integer)
  → sem p_unidade_id: roda para TODAS as unidades de uma vez

recalcular_dados_mensais(p_ano integer, p_mes integer, p_unidade_id uuid)
  → por unidade específica

snapshot_dados_mensais(p_ano integer, p_mes integer)
  → sem p_unidade_id: roda para TODAS as unidades ativas

upsert_dados_mensais(p_unidade_codigo varchar, p_ano, p_mes, ...campos opcionais...)
  → por unidade, via código (string)

sync_evasao_to_dados_mensais()
  → TRIGGER em movimentacoes_admin (INSERT/UPDATE/DELETE)
  → dispara automaticamente, sem parâmetros
```

### O que o audit_log já captura

- Cada INSERT/UPDATE/DELETE em `dados_mensais` gera linha em `audit_log`
- Campos: `acao`, `usuario` (email JWT ou null), `origem` (manual/system), `dados_antigos (jsonb)`, `dados_novos (jsonb)`, `created_at`
- **Problema:** `usuario=null` quando trigger system dispara — não há rastreio do solicitante
- **Problema:** não há `motivo`, não há `aprovador`, não há `rollback` automatizado

### Achado crítico do audit_log

O snapshot de Recreio Jun/2026 (`alunos_pagantes=311`) foi inserido em `2026-06-06 18:30:54`
por `dai@lamusic.com.br` (origem=manual). Antes disso, UPDATEs automáticos
do trigger `sync_evasao_to_dados_mensais` já tocaram o registro.
Ou seja: hoje **não há como saber** com certeza se o 311 reflete um fechamento
intencional ou um snapshot preliminar com dados incompletos (ticket=0 confirma que é preliminar).

### Tabelas de fechamento/retificação: nenhuma existe hoje

Confirmar: `SELECT tablename FROM pg_tables WHERE tablename ILIKE '%fechamento%' OR '%retificacao%'` → 0 resultados.

---

## 1. Representação de Competência Fechada

### Decisão: campos em `dados_mensais` (não tabela separada)

**Justificativa:**
- Cada linha já é única por `(unidade_id, ano, mes)` — UNIQUE constraint existente
- Adicionar colunas de controle é o caminho com menor impacto: sem novos JOINs em queries existentes
- Tabela separada exigiria JOIN em toda query que precisasse verificar status — mais invasivo
- A tabela de retificações é separada por natureza (N retificações por 1 competência)

### Campos propostos

```sql
-- ⚠️ NÃO EXECUTAR — DDL comentado para revisão e aprovação

ALTER TABLE dados_mensais
  ADD COLUMN IF NOT EXISTS status_fechamento text NOT NULL DEFAULT 'aberto'
    CHECK (status_fechamento IN ('aberto', 'fechado')),
  ADD COLUMN IF NOT EXISTS fechado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS fechado_por text,   -- email do usuário que fechou
  ADD COLUMN IF NOT EXISTS motivo_fechamento text;

-- Índice para queries de verificação rápida nas travas
CREATE INDEX IF NOT EXISTS idx_dados_mensais_status
  ON dados_mensais (unidade_id, ano, mes, status_fechamento);
```

### Semântica dos estados

| status_fechamento | Significado |
|-------------------|-------------|
| `'aberto'` | Mês ainda em andamento. Cálculos live e recalculos são permitidos. Não é base de premiação. |
| `'fechado'` | Competência encerrada. Nenhuma escrita direta. Só via retificação formal aprovada. |

### Operação de fechamento

```sql
-- ⚠️ NÃO EXECUTAR — DDL comentado

-- Função para fechar formalmente uma competência por unidade
-- (executa APÓS snapshot correto estar gravado e validado)
CREATE OR REPLACE FUNCTION fechar_competencia(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_fechado_por text,
  p_motivo text DEFAULT 'Fechamento mensal regular'
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Verifica se existe linha para fechar
  IF NOT EXISTS (
    SELECT 1 FROM dados_mensais
    WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes
  ) THEN
    RAISE EXCEPTION 'Competência %/% inexistente para a unidade. Gerar snapshot primeiro.', p_ano, p_mes;
  END IF;

  -- Verifica se já está fechada (idempotência)
  IF EXISTS (
    SELECT 1 FROM dados_mensais
    WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes
      AND status_fechamento = 'fechado'
  ) THEN
    RAISE NOTICE 'Competência %/% já estava fechada. Nenhuma ação.', p_ano, p_mes;
    RETURN;
  END IF;

  UPDATE dados_mensais
  SET status_fechamento = 'fechado',
      fechado_em        = NOW(),
      fechado_por       = p_fechado_por,
      motivo_fechamento = p_motivo
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes;
END;
$$;
```

---

## 2. Trava em Cada Ponto de Escrita

### Princípio geral

A trava deve ser adicionada no INÍCIO de cada função/trigger.
Deve usar a coluna `status_fechamento` recém-criada.
A mensagem de erro deve ser clara e indicar o caminho correto.

---

### 2.1 `fechar_dados_mensais(p_ano, p_mes)`

Esta RPC itera sobre todas as unidades ativas. A trava deve ser dentro do loop, por unidade.

```sql
-- ⚠️ NÃO EXECUTAR — trecho a adicionar no INÍCIO do loop por unidade

FOR v_unidade IN SELECT id, nome FROM unidades WHERE nome IN ('Barra', 'Campo Grande', 'Recreio')
LOOP
  -- TRAVA: verificar status antes de qualquer cálculo
  IF EXISTS (
    SELECT 1 FROM dados_mensais
    WHERE unidade_id = v_unidade.id AND ano = p_ano AND mes = p_mes
      AND status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION
      'fechar_dados_mensais: competência %/% da unidade % já está fechada. Use retificação formal.',
      p_ano, p_mes, v_unidade.nome;
  END IF;

  -- ... resto do cálculo ...
END LOOP;
```

**Comportamento atual sem trava:** ON CONFLICT DO UPDATE — sobrescreve silenciosamente.

---

### 2.2 `recalcular_dados_mensais(p_ano, p_mes, p_unidade_id)`

```sql
-- ⚠️ NÃO EXECUTAR — adicionar no início da função, antes de qualquer cálculo

IF EXISTS (
  SELECT 1 FROM dados_mensais
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes
    AND status_fechamento = 'fechado'
) THEN
  RAISE EXCEPTION
    'recalcular_dados_mensais: competência %/% está fechada para esta unidade. Use retificação formal.',
    p_ano, p_mes;
END IF;
```

**Onde também travar no frontend:** `TabGestao.tsx:1343` e `AlunosPage.tsx:1406` chamam esta RPC.
Quando a RPC lançar EXCEPTION, o frontend receberá `error.message` e o toast de erro já existe.
Adicionar verificação prévia no frontend também (para UX melhor — desabilitar botão).

---

### 2.3 `snapshot_dados_mensais(p_ano, p_mes)`

```sql
-- ⚠️ NÃO EXECUTAR — adicionar dentro do loop por unidade, antes do INSERT

IF EXISTS (
  SELECT 1 FROM dados_mensais
  WHERE unidade_id = v_unidade.id AND ano = p_ano AND mes = p_mes
    AND status_fechamento = 'fechado'
) THEN
  RAISE NOTICE
    'snapshot_dados_mensais: unidade % competência %/% está fechada. Pulando.',
    v_unidade.nome, p_ano, p_mes;
  CONTINUE; -- pula para próxima unidade em vez de falhar tudo
END IF;
```

**Nota:** usar RAISE NOTICE + CONTINUE em vez de EXCEPTION porque `snapshot_dados_mensais`
roda para todas as unidades. Se uma está fechada e outra não, faz sentido pular a fechada
e continuar para as abertas — ao contrário de abortar o processo inteiro.

---

### 2.4 `upsert_dados_mensais(p_unidade_codigo, p_ano, p_mes, ...)`

```sql
-- ⚠️ NÃO EXECUTAR — adicionar após resolver v_unidade_id

DECLARE v_unidade_id UUID;
BEGIN
  SELECT id INTO v_unidade_id FROM unidades WHERE codigo = p_unidade_codigo;

  -- TRAVA
  IF EXISTS (
    SELECT 1 FROM dados_mensais
    WHERE unidade_id = v_unidade_id AND ano = p_ano AND mes = p_mes
      AND status_fechamento = 'fechado'
  ) THEN
    RAISE EXCEPTION
      'upsert_dados_mensais: competência %/% da unidade % está fechada.',
      p_ano, p_mes, p_unidade_codigo;
  END IF;
  -- ... INSERT/ON CONFLICT ...
```

---

### 2.5 `sync_evasao_to_dados_mensais()` — TRIGGER (caso mais crítico)

**Este é o ponto mais delicado.** O trigger dispara em qualquer INSERT/UPDATE/DELETE
em `movimentacoes_admin`. Se lançar EXCEPTION, a operação original na tabela falha.
Isso quebraria o registro de novas evasões.

**Solução: RETURN silencioso (não EXCEPTION)**

```sql
-- ⚠️ NÃO EXECUTAR — adicionar no início do trigger, antes do UPDATE em dados_mensais

-- Verificar se a competência está fechada ANTES de atualizar
IF EXISTS (
  SELECT 1 FROM dados_mensais
  WHERE unidade_id = v_unidade AND ano = v_ano AND mes = v_mes
    AND status_fechamento = 'fechado'
) THEN
  -- NÃO lança exceção — apenas ignora a atualização do snapshot
  -- A operação original em movimentacoes_admin continua normalmente
  -- O registro foi feito; apenas o snapshot histórico não é tocado
  RETURN COALESCE(NEW, OLD);
END IF;

-- ... UPDATE dados_mensais (só chega aqui se mês aberto) ...
```

**Implicação importante:** quando um usuário editar uma movimentação histórica
de mês fechado, o `dados_mensais` desse mês NÃO será recalculado automaticamente.
Isso é o comportamento correto — mudanças em mês fechado devem usar retificação formal.
O dado em `movimentacoes_admin` é atualizado (operação transacional normal);
o snapshot histórico permanece protegido.

---

### 2.6 Frontend — Botão "Recalcular"

Dois locais chamam `recalcular_dados_mensais`:

| Arquivo | Linha | O que fazer |
|---------|-------|-------------|
| `TabGestao.tsx` | 1343 | Verificar `dados_mensais.status_fechamento` antes de habilitar o botão. Se `'fechado'`, desabilitar com tooltip "Mês fechado. Use retificação formal." |
| `AlunosPage.tsx` | 1406 | Idem |

**Verificação sugerida (SELECT-only para implementar depois):**
```sql
SELECT status_fechamento FROM dados_mensais
WHERE unidade_id = $1 AND ano = $2 AND mes = $3;
```

---

## 3. Retificação Formal

### Tabela proposta

```sql
-- ⚠️ NÃO EXECUTAR — DDL comentado

CREATE TABLE IF NOT EXISTS dados_mensais_retificacoes (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Referência
  dados_mensais_id uuid NOT NULL REFERENCES dados_mensais(id),
  unidade_id       uuid NOT NULL REFERENCES unidades(id),
  ano              integer NOT NULL,
  mes              integer NOT NULL,

  -- Autoria
  solicitante      text NOT NULL,   -- email de quem pediu
  aprovador        text,            -- email de quem aprovou (NULL = pendente)

  -- Conteúdo
  motivo           text NOT NULL,
  snapshot_antes   jsonb NOT NULL,  -- cópia completa da linha antes
  novos_valores    jsonb NOT NULL,  -- apenas os campos que mudam
  snapshot_depois  jsonb,           -- preenchido ao aplicar

  -- Controle
  status           text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'rejeitada', 'aplicada', 'revertida')),
  tipo             text NOT NULL DEFAULT 'correcao'
    CHECK (tipo IN ('correcao', 'reversao')),
  retificacao_origem_id uuid REFERENCES dados_mensais_retificacoes(id),
    -- preenchido quando tipo='reversao', aponta para a retificação revertida

  created_at       timestamptz DEFAULT now(),
  aprovada_em      timestamptz,
  aplicada_em      timestamptz,
  revertida_em     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_retificacoes_competencia
  ON dados_mensais_retificacoes (unidade_id, ano, mes, status);
```

### Fluxo completo

```
1. SOLICITANTE
   └─ Chama criar_retificacao(unidade_id, ano, mes, motivo, novos_valores jsonb)
      ├─ Sistema captura snapshot_antes = linha atual de dados_mensais
      ├─ Calcula diff (novos_valores vs snapshot_antes)
      ├─ Grava em dados_mensais_retificacoes com status='pendente'
      └─ Retorna id da retificação + diff para revisão

2. APROVADOR (admin)
   └─ Chama aprovar_retificacao(id, aprovador_email)
      ├─ Verifica status='pendente'
      ├─ SET status='aprovada', aprovador=email, aprovada_em=NOW()
      └─ (não aplica ainda — aplicação é passo separado ou automático após aprovação)

3. SISTEMA
   └─ Chama aplicar_retificacao(id)
      ├─ Verifica status='aprovada'
      ├─ Atualiza dados_mensais com novos_valores (merge: só campos especificados)
      ├─ Captura snapshot_depois
      ├─ SET status='aplicada', aplicada_em=NOW()
      └─ Mantém status_fechamento='fechado' (retificação não reabre o mês)

4. ROLLBACK (se necessário)
   └─ Chama reverter_retificacao(id)
      ├─ Verifica status='aplicada'
      ├─ Copia snapshot_antes de volta para dados_mensais
      ├─ Cria nova linha com tipo='reversao', retificacao_origem_id=id
      ├─ SET status original='revertida', revertida_em=NOW()
      └─ O dado volta ao estado anterior à retificação
```

### Funções de suporte (pseudocódigo)

```sql
-- ⚠️ NÃO EXECUTAR

-- Cria e retorna o diff para revisão antes de aprovar
CREATE FUNCTION criar_retificacao(
  p_unidade_id uuid, p_ano int, p_mes int,
  p_solicitante text, p_motivo text, p_novos_valores jsonb
) RETURNS uuid ...

-- Aprova sem aplicar (permite revisão do diff antes)
CREATE FUNCTION aprovar_retificacao(p_id uuid, p_aprovador text) RETURNS void ...

-- Aplica valores aprovados — única via de escrita em mês fechado
CREATE FUNCTION aplicar_retificacao(p_id uuid) RETURNS void ...

-- Reverte uma retificação aplicada
CREATE FUNCTION reverter_retificacao(p_id uuid) RETURNS void ...
```

### SELECT de inspeção — verificar retificações pendentes

```sql
-- SELECT-only — pode executar a qualquer momento (após criação da tabela)
SELECT
  r.id, r.ano, r.mes, u.nome as unidade,
  r.solicitante, r.aprovador, r.motivo, r.status,
  r.novos_valores,
  r.snapshot_antes,
  r.created_at
FROM dados_mensais_retificacoes r
JOIN unidades u ON u.id = r.unidade_id
WHERE r.status IN ('pendente','aprovada')
ORDER BY r.created_at DESC;
```

---

## 4. Mês Atual = Aberto

### Definição canônica

| Situação | status_fechamento | Fonte de KPI | Base de premiação? |
|----------|------------------|-------------|-------------------|
| Mês atual em andamento | `'aberto'` (default) | `vw_kpis_gestao_mensal` (live) | ❌ Não |
| Mês anterior a fechar | `'aberto'` → processo de fechamento → `'fechado'` | `vw_kpis_gestao_mensal` até fechar; `dados_mensais` após fechar | ❌ Não (até fechar) |
| Mês fechado | `'fechado'` | `dados_mensais` | ✅ Sim (Fideliza+, relatórios) |

### Regra de ouro

> O mês atual NUNCA deve ter `status_fechamento='fechado'`.
> Ele só fecha quando o período de competência encerrar,
> o snapshot correto estiver validado e o processo formal for executado.

### Proteção adicional sugerida (função de fechamento)

```sql
-- ⚠️ NÃO EXECUTAR — lógica a adicionar em fechar_competencia()

-- Impede fechar o mês atual
IF p_ano = EXTRACT(YEAR FROM CURRENT_DATE)::int
   AND p_mes = EXTRACT(MONTH FROM CURRENT_DATE)::int
THEN
  RAISE EXCEPTION
    'Não é permitido fechar o mês atual (%/%). Aguarde o encerramento do período.',
    p_ano, p_mes;
END IF;
```

---

## 5. Riscos de Ativar a Trava Cedo Demais

### Risco 1 — Trigger com mês ainda precisando correção

**Cenário:** DDL entra, trava do trigger é ativada, mas Recreio Jun/2026 ainda tem
`ticket_medio=0` e `MRR=0`. Se fecharmos o mês com esses valores zerados,
não será possível corrigir sem retificação formal.

**Mitigação:** só executar o fechamento após recalcular e validar todos os campos do snapshot.

---

### Risco 2 — Barra sem snapshot

**Cenário:** se ativar a trava antes de criar o snapshot de Barra Jun/2026,
a linha não existe. A trava em `fechar_dados_mensais` vai passar pela Barra
sem erro (linha inexistente → SELECT retorna vazio → sem trava).
Mas `fechar_competencia()` vai falhar com "Competência inexistente".

**Mitigação:** gerar snapshot da Barra ANTES de executar qualquer fechamento.

---

### Risco 3 — Trigger quebrando inserções históricas

**Cenário:** usuário insere movimentação com `data` em mês fechado (ex: correção retroativa de
saída de agosto/2025). Com a trava RETURN silencioso, a movimentação é gravada normalmente,
mas o snapshot histórico NÃO é atualizado. Se ninguém souber, o dado em `movimentacoes_admin`
e o `dados_mensais` ficam dessincronizados.

**Mitigação A:** logar o bloqueio — inserir em tabela `sync_bloqueios` o aviso:
`"Movimentação histórica gravada mas snapshot protegido. Retificação necessária."`

**Mitigação B (melhor):** RAISE WARNING no trigger para que o log do banco registre,
sem falhar a operação:
```sql
RAISE WARNING 'sync_evasao: competência %/% de % fechada. Snapshot não atualizado.',
  v_ano, v_mes, v_unidade;
```

---

### Risco 4 — Botão sem feedback no frontend

**Cenário:** trava ativa no banco, botão "Recalcular" visível no frontend.
Usuário clica, o banco rejeita com EXCEPTION, o toast mostra erro genérico
("Erro ao recalcular"). Confuso.

**Mitigação:** frontend deve verificar `status_fechamento` antes de habilitar o botão.
Desabilitar + tooltip "Mês fechado — use retificação formal."

---

### Risco 5 — n8n ou cron chamando as RPCs

**Cenário:** se houver workflow em n8n ou job agendado chamando `recalcular_dados_mensais`
ou `fechar_dados_mensais`, após a trava estar ativa esses jobs vão começar a falhar
silenciosamente (ou com erro não monitorado).

**Mitigação:** antes de ativar a trava, verificar via n8n MCP se há workflows
que chamam essas RPCs. Atualizar os workflows para não chamar em meses fechados.

---

### Risco 6 — Retificação sem aprovador disponível

**Cenário:** precisa corrigir um número em mês fechado, mas o aprovador não está disponível.
O fluxo formal bloqueia a correção urgente.

**Mitigação:** definir quem pode ser aprovador (admin do sistema) e garantir que
pelo menos 2 pessoas tenham essa permissão. Ou: permitir que o solicitante seja
também o aprovador em casos de admin.

---

## 6. Sequência Segura de Rollout

```
Fase 0 — Preparação (SELECT-only, já feito)
  ✅ Mapeamento dos 5 pontos de escrita
  ✅ Confirmação dos campos do audit_log
  ✅ Inspeção das assinaturas das RPCs
  ✅ Estado atual: Jun/2026 stale, Barra sem snapshot

Fase 1 — DDL estrutural (não altera dados, pode entrar a qualquer hora)
  ⏳ ALTER TABLE dados_mensais ADD COLUMN status_fechamento DEFAULT 'aberto'
  ⏳ ALTER TABLE dados_mensais ADD COLUMN fechado_em, fechado_por, motivo_fechamento
  ⏳ CREATE TABLE dados_mensais_retificacoes
  ⏳ CREATE INDEX idx_dados_mensais_status
  Impacto: zero — apenas adiciona estrutura

Fase 2 — Corrigir snapshots antes de fechar (janela de recalculo)
  ⏳ Gerar snapshot correto para Barra Jun/2026
  ⏳ Recalcular Recreio e CG Jun/2026 (ticket, MRR, inadimplência, ativos)
  ⏳ Validar before/after
  Impacto: muda dados_mensais para o mês ABERTO atual — seguro

Fase 3 — Adicionar travas nas 5 funções (não ativa ainda para meses abertos)
  ⏳ Adicionar guard em fechar_dados_mensais
  ⏳ Adicionar guard em recalcular_dados_mensais
  ⏳ Adicionar guard em snapshot_dados_mensais (CONTINUE, não EXCEPTION)
  ⏳ Adicionar guard em upsert_dados_mensais
  ⏳ Adicionar RETURN silencioso em trigger sync_evasao (com RAISE WARNING)
  Impacto: zero enquanto nenhum mês estiver marcado como 'fechado'
  
Fase 4 — Criar funções de fechamento e retificação
  ⏳ CREATE FUNCTION fechar_competencia(...)
  ⏳ CREATE FUNCTION criar_retificacao(...)
  ⏳ CREATE FUNCTION aprovar_retificacao(...)
  ⏳ CREATE FUNCTION aplicar_retificacao(...)
  ⏳ CREATE FUNCTION reverter_retificacao(...)
  Impacto: zero — funções criadas mas não chamadas

Fase 5 — Atualizar frontend
  ⏳ TabGestao.tsx: verificar status antes de habilitar botão Recalcular
  ⏳ AlunosPage.tsx: idem
  Impacto: UX apenas — botão desabilitado para meses fechados

Fase 6 — Fechar meses históricos (janela controlada, 1 unidade piloto)
  ⏳ Iniciar com 1 mês/unidade (ex: mai/2026 Recreio)
  ⏳ Validar que trava funciona
  ⏳ Validar que audit_log captura corretamente
  ⏳ Expandir para demais meses/unidades
  Impacto: histórico protegido de sobrescrita

Fase 7 — Fechar junho (janela pós-fechamento)
  ⏳ Validar snapshot correto de Jun/2026 para 3 unidades
  ⏳ Executar fechar_competencia para as 3 unidades
  ⏳ Verificar Fideliza+ com histórico fechado
  Impacto: muda churn/pagantes do mês no Fideliza+
```

---

## 7. SQL de Inspeção SELECT-only (podem ser executados agora)

```sql
-- Verificar estado atual de todos os snapshots (após DDL da Fase 1)
SELECT u.nome, d.ano, d.mes,
       d.status_fechamento,
       d.alunos_pagantes, d.ticket_medio, d.faturamento_estimado,
       d.fechado_em, d.fechado_por
FROM dados_mensais d
JOIN unidades u ON u.id = d.unidade_id
ORDER BY u.nome, d.ano DESC, d.mes DESC;

-- Verificar se existem competências com campos zerados (snapshot incompleto)
SELECT u.nome, d.ano, d.mes,
       d.ticket_medio, d.faturamento_estimado, d.inadimplencia
FROM dados_mensais d
JOIN unidades u ON u.id = d.unidade_id
WHERE d.ticket_medio = 0 OR d.faturamento_estimado = 0
ORDER BY d.ano DESC, d.mes DESC;

-- Quantos UPDATEs automáticos (trigger) por mês nos últimos 30 dias
SELECT DATE_TRUNC('day', created_at) AS dia,
       COUNT(*) AS updates_sistema
FROM audit_log
WHERE tabela = 'dados_mensais'
  AND acao = 'UPDATE'
  AND origem = 'system'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 1 DESC;

-- Quem recalculou o quê nos últimos 30 dias
SELECT usuario, origem, acao,
       (dados_novos->>'ano')  AS ano,
       (dados_novos->>'mes')  AS mes,
       (dados_antigos->>'alunos_pagantes') AS pag_antes,
       (dados_novos->>'alunos_pagantes')   AS pag_depois,
       created_at
FROM audit_log
WHERE tabela = 'dados_mensais'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

---

## 8. Decisões Pendentes (precisam de validação do Alf)

1. **`fechar_dados_mensais` para todas as unidades de uma vez vs por unidade:**
   - A RPC atual roda para Barra+CG+Recreio em 1 chamada
   - Se uma estiver fechada e outra não, hoje a proposta usa EXCEPTION (para tudo) para `fechar_dados_mensais`, mas CONTINUE (só pula) para `snapshot_dados_mensais`
   - Alf precisa confirmar: fechar_dados_mensais deve parar tudo ou pular a fechada?

2. **Aprovação de retificação — quem pode aprovar?**
   - Sugestão: perfil `admin` com permissão `gerenciar_fechamentos`
   - Alf confirmar se auto-aprovação por admin é aceitável

3. **Mês atual pode ser fechado manualmente?**
   - Proposta diz NÃO (proteção hardcoded)
   - Se houver caso de uso legítimo, remover a proteção

4. **Retroatividade — fechar meses de 2025 também?**
   - O impacto é simbólico (dados corretos) vs prático (proteção real)
   - Recomendação: sim, fechar retroativamente após validar cada snapshot
   - Mas isso é decisão de negócio: Fideliza+ de 2025 deve ser "congelado"?
