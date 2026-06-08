---
name: p00-governanca-competencia-mensal-proposta-oficial
description: Proposta oficial P0.0 — Governança de competência mensal em dados_mensais. DDL comentado, guards, rollout faseado, riscos. Nada executado.
metadata:
  type: project
---

# P0.0 — Proposta Oficial: Governança de Competência Mensal

Data: 2026-06-07  
Status: **PROPOSTA — aguarda aprovação do Alf antes de qualquer execução**  
Restrições mantidas: SELECT-only durante elaboração. Nenhum ALTER, CREATE, UPDATE executado.

---

## 1. Verificação SELECT-only — Estado Atual Confirmado

### 1.1 pg_cron — cron ausente/inativo

```
SELECT jobid, jobname, schedule, command, active FROM cron.job
WHERE command ILIKE '%dados_mensais%' OR jobname ILIKE '%snapshot%'
→ 0 resultados
```

**Confirmado:** `snapshot_dados_mensais_mensal` está ausente. Não há jobs de cron
ativos relacionados a `dados_mensais`. Risco de sobrescrita automática via cron = **eliminado**.

---

### 1.2 Writers reais de `dados_mensais`

| Função | Tipo | Vetor de ativação | Parâmetros |
|--------|------|------------------|-----------|
| `fechar_dados_mensais` | RPC | chamada explícita | `(p_ano int, p_mes int)` — todas as unidades |
| `recalcular_dados_mensais` | RPC | botão frontend (2 pontos) | `(p_ano int, p_mes int, p_unidade_id uuid)` |
| `snapshot_dados_mensais` | RPC | chamada explícita | `(p_ano int, p_mes int)` — todas as unidades |
| `upsert_dados_mensais` | RPC | hook frontend (`useSupabaseMutations`) | `(p_unidade_codigo, p_ano, p_mes, ...campos opcionais)` |
| `sync_evasao_to_dados_mensais` | TRIGGER | automático em `movimentacoes_admin` | sem parâmetros |

---

### 1.3 Triggers relacionados

| Trigger | Tabela base | Evento | Função | Risco |
|---------|------------|--------|--------|-------|
| `trg_sync_evasao_dados_mensais` | `movimentacoes_admin` | INSERT/UPDATE/DELETE AFTER | `sync_evasao_to_dados_mensais()` | 🔴 Reescreve histórico sem guard |
| `tr_audit_dados_mensais` | `dados_mensais` | INSERT/UPDATE/DELETE AFTER | `audit_dados_mensais()` | ✅ Só audit |
| `trg_audit` | `dados_mensais` | INSERT/UPDATE/DELETE AFTER | `fn_audit_log()` | ✅ Só audit |
| `tr_dados_mensais_updated_at` | `dados_mensais` | UPDATE BEFORE | `update_updated_at()` | ✅ Inofensivo |

---

### 1.4 GRANTs nas RPCs escritoras — ACHADO CRÍTICO

**Todas as 5 RPCs escritoras têm GRANT para `anon` e `authenticated`.**

```
fechar_dados_mensais   → PUBLIC, anon, authenticated, service_role
recalcular_dados_mensais → PUBLIC, anon, authenticated, service_role
snapshot_dados_mensais  → PUBLIC, anon, authenticated, service_role
upsert_dados_mensais    → PUBLIC, anon, authenticated, service_role
sync_evasao_to_dados_mensais → idem (trigger — não chamável diretamente)
```

**Implicação:** qualquer usuário autenticado pode chamar `fechar_dados_mensais(2025, 3)`
ou `snapshot_dados_mensais(2025, 3)` diretamente via API, sem restrição.
O GRANT para `anon` em `fechar_dados_mensais` é particularmente grave — tecnicamente
qualquer requisição sem autenticação poderia chamar essa função.

**Ação necessária (parte do rollout):** `REVOKE EXECUTE ON FUNCTION fechar_dados_mensais, snapshot_dados_mensais FROM anon;`
e considerar restrição adicional para `authenticated` (só admin deve fechar).

---

### 1.5 `dados_mensais_retificacoes` — estrutura atual confirmada

| Coluna | Tipo | Obrigatório | Padrão |
|--------|------|------------|--------|
| `id` | uuid PK | ✅ | `gen_random_uuid()` |
| `unidade_id` | uuid | ✅ | — |
| `ano`, `mes` | integer | ✅ | — |
| `motivo` | text | ✅ | — |
| `solicitado_por` | text | ✅ | — |
| `aprovado_por` | text | ✅ | — |
| `origem` | text | ✅ | `'retificacao_controlada'` |
| `snapshot_antes` | jsonb | ✅ | — |
| `snapshot_depois` | jsonb | ✅ | — |
| `diff` | jsonb | ✅ | — |
| `observacoes` | text | nullable | — |
| `created_at` | timestamptz | ✅ | `now()` |

**Ausente vs necessário para fluxo de aprovação:**
- `status` (`pendente`/`aprovada`/`aplicada`/`revertida`) — não existe
- `aprovada_em`, `aplicada_em`, `revertida_em` — não existem
- `tipo` (`correcao`/`reversao`) — não existe
- `retificacao_origem_id` (para reversões) — não existe
- RLS — **desativado** (qualquer usuário com acesso ao schema pode ler/escrever)

**2 retificações existentes:** ambas com `aprovado_por = solicitado_por = "Luciano Alf"`,
aplicadas diretamente sem fluxo pendente/aprovação. O campo `aprovado_por` é NOT NULL
— portanto o schema já exige aprovador, mas não impede auto-aprovação.

---

### 1.6 RLS

| Tabela | RLS ativo | Forçado |
|--------|-----------|---------|
| `dados_mensais` | ✅ sim | ❌ não forçado |
| `dados_mensais_retificacoes` | ❌ não | — |
| `competencias_mensais` | — (não existe) | — |

---

## 2. Design Final — DDL Comentado

### 2.1 `competencias_mensais` — nova tabela de governança

```sql
-- ⚠️ NÃO EXECUTAR — aguarda aprovação

CREATE TABLE public.competencias_mensais (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id  uuid        NOT NULL REFERENCES public.unidades(id),
  ano         integer     NOT NULL,
  mes         integer     NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status      text        NOT NULL DEFAULT 'aberto'
                          CHECK (status IN ('aberto', 'fechado')),
  fechado_em  timestamptz,
  fechado_por text,           -- email do usuário que executou o fechamento
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT competencias_mensais_unidade_ano_mes_key
    UNIQUE (unidade_id, ano, mes)
);

-- Índice para lookup rápido nas guards
CREATE INDEX idx_competencias_status
  ON public.competencias_mensais (unidade_id, ano, mes, status);

-- Trigger de updated_at (reutiliza a função existente)
CREATE TRIGGER tr_competencias_updated_at
  BEFORE UPDATE ON public.competencias_mensais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.competencias_mensais ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado
CREATE POLICY "competencias_mensais_select" ON public.competencias_mensais
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));

-- Escrita: só admin
-- (depende de como is_admin() está definido no projeto)
CREATE POLICY "competencias_mensais_insert" ON public.competencias_mensais
  FOR INSERT WITH CHECK (public.is_admin() OR auth.role()='service_role');

CREATE POLICY "competencias_mensais_update" ON public.competencias_mensais
  FOR UPDATE USING (public.is_admin() OR auth.role()='service_role');

-- GRANTS
GRANT SELECT ON public.competencias_mensais TO authenticated;
GRANT ALL    ON public.competencias_mensais TO service_role;
```

**Observação de design:** a tabela começa vazia. Antes de qualquer fechamento real,
nenhuma linha existe — portanto `assert_competencia_aberta` sempre passa.
Isso garante comportamento zero-impacto na Fase 1.

---

### 2.2 `assert_competencia_aberta` — guarda única

```sql
-- ⚠️ NÃO EXECUTAR — aguarda aprovação

CREATE OR REPLACE FUNCTION public.assert_competencia_aberta(
  p_unidade_id uuid,
  p_ano        integer,
  p_mes        integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER   -- executa com privilégios do owner, não do caller
AS $$
DECLARE
  v_status text;
  v_unidade_nome text;
BEGIN
  SELECT cm.status INTO v_status
  FROM public.competencias_mensais cm
  WHERE cm.unidade_id = p_unidade_id
    AND cm.ano = p_ano
    AND cm.mes = p_mes;

  -- Se não existe linha: mês nunca registrado = aberto por definição
  IF v_status IS NULL THEN
    RETURN; -- OK
  END IF;

  IF v_status = 'fechado' THEN
    SELECT nome INTO v_unidade_nome
    FROM public.unidades WHERE id = p_unidade_id;

    RAISE EXCEPTION
      'Competência %/% da unidade "%" está fechada. '
      'Alterações exigem retificação formal. (competencias_mensais)',
      p_ano, p_mes, COALESCE(v_unidade_nome, p_unidade_id::text);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_competencia_aberta TO service_role;
-- NÃO conceder a anon ou authenticated diretamente —
-- a função é chamada internamente pelas RPCs escritoras
```

---

### 2.3 Onde cada writer chama a guarda

#### `recalcular_dados_mensais(p_ano, p_mes, p_unidade_id)`
```sql
-- Adicionar como PRIMEIRA linha do corpo da função, antes de qualquer SELECT/cálculo
PERFORM public.assert_competencia_aberta(p_unidade_id, p_ano, p_mes);
```

#### `fechar_dados_mensais(p_ano, p_mes)`
```sql
-- Dentro do loop FOR v_unidade IN ..., antes de qualquer cálculo:
PERFORM public.assert_competencia_aberta(v_unidade.id, p_ano, p_mes);
```

#### `snapshot_dados_mensais(p_ano, p_mes)`
```sql
-- Dentro do loop FOR v_unidade IN ..., com CONTINUE (não EXCEPTION)
-- para não abortar as demais unidades do lote:
BEGIN
  PERFORM public.assert_competencia_aberta(v_unidade.id, p_ano, p_mes);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'snapshot_dados_mensais: % — pulando.', SQLERRM;
  CONTINUE;
END;
```

#### `upsert_dados_mensais(p_unidade_codigo, p_ano, p_mes, ...)`
```sql
-- Após resolver v_unidade_id, antes do INSERT/ON CONFLICT:
PERFORM public.assert_competencia_aberta(v_unidade_id, p_ano, p_mes);
```

#### `sync_evasao_to_dados_mensais()` — TRIGGER — regra especial
```sql
-- NÃO usar assert_competencia_aberta aqui — não pode lançar EXCEPTION num trigger
-- que dispara em operações normais de movimentacoes_admin

-- Em vez disso, verificar silenciosamente e RETURN sem modificar dados_mensais:
IF EXISTS (
  SELECT 1 FROM public.competencias_mensais
  WHERE unidade_id = v_unidade
    AND ano = v_ano
    AND mes = v_mes
    AND status = 'fechado'
) THEN
  -- Emite warning no log do banco (não falha a operação)
  RAISE WARNING
    'sync_evasao: competência %/% de unidade % está fechada. '
    'Movimentação gravada em movimentacoes_admin, mas snapshot histórico preservado.',
    v_ano, v_mes, v_unidade;
  RETURN COALESCE(NEW, OLD);  -- continua a operação original sem alterar dados_mensais
END IF;
```

**Por que não usar EXCEPTION no trigger:** o trigger dispara em TODA operação em
`movimentacoes_admin`. Se lançar EXCEPTION, registrar uma evasão no mês atual
(que está aberto) que tecnicamente é um INSERT novo iria falhar se a data da
movimentação coincidisse com qualquer mês fechado. O RETURN silencioso + RAISE WARNING
é a abordagem correta: a movimentação é gravada normalmente; apenas o snapshot
histórico é protegido.

---

### 2.4 Evolução de `dados_mensais_retificacoes`

A tabela existe e tem 2 registros. A evolução não pode usar `NOT NULL` em colunas
novas sem `DEFAULT` — isso quebraria os 2 registros existentes.

```sql
-- ⚠️ NÃO EXECUTAR — aguarda aprovação

-- Adicionar controle de workflow (todas com DEFAULT para não quebrar linhas existentes)
ALTER TABLE public.dados_mensais_retificacoes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aplicada'
    CHECK (status IN ('pendente','aprovada','rejeitada','aplicada','revertida')),
  ADD COLUMN IF NOT EXISTS aprovada_em  timestamptz,
  ADD COLUMN IF NOT EXISTS aplicada_em  timestamptz,
  ADD COLUMN IF NOT EXISTS revertida_em timestamptz,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'correcao'
    CHECK (tipo IN ('correcao','reversao')),
  ADD COLUMN IF NOT EXISTS retificacao_origem_id uuid
    REFERENCES public.dados_mensais_retificacoes(id);

-- Ativar RLS (hoje desativado — qualquer usuário pode ler/escrever)
ALTER TABLE public.dados_mensais_retificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retificacoes_select" ON public.dados_mensais_retificacoes
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));

CREATE POLICY "retificacoes_insert" ON public.dados_mensais_retificacoes
  FOR INSERT WITH CHECK (public.is_admin() OR auth.role()='service_role');

CREATE POLICY "retificacoes_update" ON public.dados_mensais_retificacoes
  FOR UPDATE USING (public.is_admin() OR auth.role()='service_role');

-- Índice para busca por competência
CREATE INDEX IF NOT EXISTS idx_retificacoes_competencia
  ON public.dados_mensais_retificacoes (unidade_id, ano, mes, status);

-- Os 2 registros existentes já estão 'aplicados' — retroativamente corretos
-- com DEFAULT 'aplicada'; nada precisa de UPDATE aqui.
```

---

### 2.5 Função de fechamento formal — `fechar_competencia`

```sql
-- ⚠️ NÃO EXECUTAR — aguarda aprovação

CREATE OR REPLACE FUNCTION public.fechar_competencia(
  p_unidade_id uuid,
  p_ano        integer,
  p_mes        integer,
  p_fechado_por text,
  p_motivo     text DEFAULT 'Fechamento mensal regular'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Impede fechar mês atual
  IF p_ano  = EXTRACT(YEAR  FROM CURRENT_DATE)::int
  AND p_mes = EXTRACT(MONTH FROM CURRENT_DATE)::int
  THEN
    RAISE EXCEPTION
      'Não é permitido fechar o mês atual (%/%). Aguarde o encerramento do período.',
      p_ano, p_mes;
  END IF;

  -- Impede fechar se snapshot não existe ou tem campos críticos zerados
  IF NOT EXISTS (
    SELECT 1 FROM public.dados_mensais
    WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes
      AND alunos_pagantes IS NOT NULL AND alunos_pagantes > 0
  ) THEN
    RAISE EXCEPTION
      'Competência %/% não tem snapshot válido (pagantes=0 ou ausente). '
      'Execute recalcular_dados_mensais antes de fechar.',
      p_ano, p_mes;
  END IF;

  INSERT INTO public.competencias_mensais
    (unidade_id, ano, mes, status, fechado_em, fechado_por, motivo)
  VALUES
    (p_unidade_id, p_ano, p_mes, 'fechado', NOW(), p_fechado_por, p_motivo)
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
    status     = 'fechado',
    fechado_em = NOW(),
    fechado_por = EXCLUDED.fechado_por,
    motivo     = EXCLUDED.motivo,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.fechar_competencia FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fechar_competencia TO service_role;
-- Apenas service_role (backend admin) pode fechar competências
```

---

### 2.6 REVOKE de permissões excessivas

```sql
-- ⚠️ NÃO EXECUTAR — aguarda aprovação

-- fechar_dados_mensais e snapshot_dados_mensais não devem ser acessíveis por anon
REVOKE EXECUTE ON FUNCTION public.fechar_dados_mensais   FROM anon;
REVOKE EXECUTE ON FUNCTION public.snapshot_dados_mensais  FROM anon;

-- recalcular pode continuar para authenticated (botão frontend)
-- mas idealmente deve verificar is_admin() internamente para meses não-atuais
-- (isso é melhoria futura, não blocking para P0.0)
```

---

### 2.7 Frontend — desabilitar botão "Recalcular" para mês fechado

Dois arquivos chamam `recalcular_dados_mensais`:

```tsx
// AlunosPage.tsx linha ~1400 e TabGestao.tsx linha ~1340
// Adicionar verificação ANTES de habilitar o botão:

const { data: competencia } = await supabase
  .from('competencias_mensais')
  .select('status')
  .eq('unidade_id', unidadeAtual)
  .eq('ano', competenciaFiltro.ano)
  .eq('mes', competenciaFiltro.mes)
  .maybeSingle();

const mesFechado = competencia?.status === 'fechado';

// No render:
// <button
//   disabled={mesFechado || recalculando}
//   title={mesFechado ? 'Mês fechado — use retificação formal' : 'Recalcular snapshot'}
// >
```

**Observação:** enquanto `competencias_mensais` estiver vazia (Fases 1-2), o query
retornará `null` e `mesFechado = false` — botão permanece habilitado como hoje.
O comportamento visual só muda após competências serem inseridas (Fase 5+).

---

## 3. Rollout Faseado

### Fase 1 — Estrutura, zero comportamento destrutivo

**O que entra:**
- `CREATE TABLE competencias_mensais` (começa vazia)
- `CREATE FUNCTION assert_competencia_aberta`
- `ALTER TABLE dados_mensais_retificacoes ADD COLUMN status, tipo, ...`
- `ENABLE ROW LEVEL SECURITY ON dados_mensais_retificacoes`
- `CREATE FUNCTION fechar_competencia`
- `REVOKE EXECUTE ON fechar_dados_mensais, snapshot_dados_mensais FROM anon`

**Impacto:** zero sobre dados e comportamento. A tabela está vazia, então a guarda
sempre passa. O REVOKE remove acesso não-autenticado a funções de admin.

**Pré-condição:** nenhuma. Pode entrar em qualquer janela.

---

### Fase 2 — Guards nas funções escritoras (ativas mas sem meses fechados)

**O que entra (migrations nas 4 RPCs + trigger):**
- `recalcular_dados_mensais`: adicionar `PERFORM assert_competencia_aberta(...)` no início
- `fechar_dados_mensais`: idem dentro do loop
- `snapshot_dados_mensais`: idem com CONTINUE
- `upsert_dados_mensais`: idem após resolver unidade_id
- `sync_evasao_to_dados_mensais`: substituir UPDATE condicional por lógica de RETURN silencioso + RAISE WARNING

**Impacto:** zero enquanto `competencias_mensais` estiver vazia.
A guarda passa sempre porque não há linha com `status='fechado'`.

**Pré-condição:** Fase 1 concluída.

**Risco desta fase:** se um bug na guarda gerar falso-positivo, pode bloquear
recalculos legítimos. Mitigação: testar em staging com uma linha de competência aberta.

---

### Fase 3 — Frontend / UX

**O que entra:**
- `AlunosPage.tsx`: verificar `competencias_mensais.status` antes de habilitar botão
- `TabGestao.tsx`: idem
- Toast/tooltip com mensagem clara para mês fechado

**Impacto:** visual apenas enquanto nenhum mês estiver fechado.

**Pré-condição:** Fase 1. (Não precisa esperar Fase 2.)

---

### Fase 4 — Trigger hard em `dados_mensais` (se ainda fizer sentido)

**Decisão diferida.** Com a guarda no trigger `sync_evasao` (Fase 2) e nas RPCs,
um trigger hard em `dados_mensais` seria uma terceira camada defensiva.
Só faz sentido se existirem outros caminhos de escrita não cobertos.

**Critério para decidir:** após Fase 2, monitorar o `audit_log` por 2-4 semanas.
Se não aparecerem UPDATEs automáticos em meses fechados, a Fase 4 é desnecessária.
Se aparecerem, há um path não mapeado — investigar antes de adicionar trigger hard.

**Risco de trigger hard prematuro:** pode bloquear migrações, backfills de meses
anteriores ou operações de manutenção legítimas que precisam de acesso SECURITY DEFINER.

---

### Fase 5 — Piloto: fechar uma competência histórica validada

**O que entra:**
1. Escolher uma competência histórica com snapshot completo (ex: Recreio Mai/2026,
   que tem ticket e MRR preenchidos)
2. Validar: `SELECT * FROM dados_mensais WHERE unidade_id=... AND ano=2026 AND mes=5`
   — confirmar que ticket_medio > 0, faturamento_estimado > 0
3. Chamar `fechar_competencia(recreio_id, 2026, 5, 'luciano@lamusic.com.br', 'Piloto governança P0.0')`
4. Tentar `recalcular_dados_mensais(2026, 5, recreio_id)` — deve falhar com EXCEPTION
5. Tentar INSERT em `movimentacoes_admin` com data em mai/2026 — deve gravar normalmente,
   trigger deve logar WARNING e NÃO atualizar `dados_mensais`
6. Verificar `audit_log` para confirmar que nenhum UPDATE automático ocorreu no snapshot

**Rollback do piloto:** `UPDATE competencias_mensais SET status='aberto' WHERE ...`
(reversível enquanto `fechar_competencia` for a única operação — sem trigger hard ainda)

---

## 4. Riscos

### 4.1 Ativar guards antes de validar todos os paths

**Risco:** se existir algum path não documentado de escrita em `dados_mensais`
(ex: edge function, n8n com service_role), o guard vai causar falha silenciosa
ou erro inesperado.

**Mitigação:** monitorar `audit_log` após Fase 2 por 1-2 semanas com competências
abertas. Qualquer write que passe pela guarda e falhe vai aparecer no log de erros.

---

### 4.2 RPCs públicas com `anon` GRANT

**Risco confirmado:** `fechar_dados_mensais` e `snapshot_dados_mensais` são acessíveis
por requisições não-autenticadas. Qualquer pessoa com a URL do projeto Supabase pode
chamar `fechar_dados_mensais(2025, 1)` e sobrescrever o histórico de janeiro/2025.

**Mitigação:** `REVOKE EXECUTE FROM anon` (Fase 1, item imediato).

---

### 4.3 Trigger silencioso — desalinhamento invisível

**Risco:** após Fase 2, inserções em `movimentacoes_admin` com datas históricas
serão silenciosas no snapshot. O usuário registra uma evasão de agosto/2025,
o dado fica em `movimentacoes_admin`, mas `dados_mensais.evasoes` de ago/2025 não muda.
Sem comunicação clara ao usuário, isso pode gerar confusão ("registrei mas não apareceu").

**Mitigação:** o RAISE WARNING aparece nos logs do banco. Para o usuário ver, o frontend
precisa mostrar um aviso quando a movimentação tem data em competência fechada.
Isso é melhoria de UX (Fase 3 estendida).

---

### 4.4 Fechamento parcial — unidades inconsistentes

**Risco:** fechar Recreio em um dia e CG/Barra no dia seguinte. Durante esse período,
um consolidado `SELECT SUM(evasoes) FROM dados_mensais WHERE ano=2026 AND mes=5` vai
misturar 1 mês fechado (imutável) e 2 meses abertos (ainda recalculáveis).
O Fideliza+ usa médias trimestrais — se 1 das 3 unidades estiver fechada e as outras não,
a média trimestral mistura fontes de confiabilidade diferente.

**Mitigação:** fechar as 3 unidades de cada competência na mesma janela. Definir
na `fechar_competencia` um modo `p_todas_unidades = true` que faz o loop internamente.

---

### 4.5 Retificação sem aprovador independente

**Risco confirmado:** as 2 retificações existentes têm `solicitado_por = aprovado_por`.
A estrutura não impede auto-aprovação. Para um sistema de premiação (Fideliza+),
retificações auto-aprovadas podem ser questionadas.

**Mitigação para P0.0:** documentar que auto-aprovação é permitida apenas para
`service_role` (admin técnico). Qualquer retificação que altere métricas que
afetam Fideliza+ deve ter aprovador diferente do solicitante.
Isso é uma regra de processo, não de banco — pode ser enforcement manual no curto prazo.

---

### 4.6 Retificação sem rollback automatizado

**Risco:** a estrutura atual não tem função de rollback. Se uma retificação for
aplicada incorretamente, só é possível reverter via nova retificação manual.

**Mitigação:** a coluna `tipo='reversao'` + `retificacao_origem_id` proposta
na evolução da tabela cria o histórico necessário. O rollback automatizado
(`reverter_retificacao(id)`) é item de Fase 5+ — não blocking para o piloto.

---

## 5. Recomendação Final

### O que aprovar AGORA (sem risco, reversível)

1. **DDL Fase 1 completo:**
   - `CREATE TABLE competencias_mensais` (vazia, zero impacto)
   - `CREATE FUNCTION assert_competencia_aberta`
   - `CREATE FUNCTION fechar_competencia`
   - `ALTER TABLE dados_mensais_retificacoes ADD COLUMN status, tipo, ...`
   - `ENABLE ROW LEVEL SECURITY ON dados_mensais_retificacoes`
   - `REVOKE EXECUTE ON fechar_dados_mensais, snapshot_dados_mensais FROM anon`

2. **Motivo:** DDL puro não altera dados nem comportamento enquanto a tabela
   `competencias_mensais` estiver vazia. O REVOKE corrige exposição de segurança real.

---

### O que NÃO aprovar ainda

1. **Guards nas RPCs e trigger (Fase 2):** aguardar validação completa de
   todos os paths de escrita, confirmar que nenhum n8n/edge function usa
   essas RPCs com service_role diretamente.

2. **Trigger hard em `dados_mensais` (Fase 4):** diferir — pode ser desnecessário
   após Fases 1-2 e pode bloquear manutenção legítima.

3. **Fechar qualquer competência histórica:** diferir até Fases 2+3 validadas.
   Jun/2026 permanece aberto como preliminar.

4. **Qualquer correção de KPI live:** fora do escopo P0.0.

---

### Perguntas que ficam para o Alf responder antes de avançar

1. **Aprovação de retificações:** auto-aprovação por admin é aceitável para P0.0,
   ou já quer aprovador independente desde o início?

2. **`fechar_competencia` com todas as unidades de uma vez ou por unidade:**
   quando fechar maio/2026, deve ser 1 chamada para as 3 unidades simultaneamente
   ou 3 chamadas separadas?

3. **Meses de 2025 devem ser fechados retroativamente?**
   Isso afetará a imutabilidade do histórico do Fideliza+ 2025.
   Decisão de negócio, não técnica.

4. **GRANT para `authenticated` em `recalcular_dados_mensais`:**
   hoje qualquer usuário logado pode recalcular qualquer mês.
   Deseja adicionar verificação `is_admin()` internamente para meses não-atuais?

5. **n8n/edge functions:** há workflows de automação que chamam as RPCs escritoras
   com service_role? Se sim, precisam ser auditados antes de ativar Fase 2.

---

## Apêndice — SQLs de Verificação (SELECT-only, podem ser executados a qualquer hora)

```sql
-- Verificar se pg_cron voltou a ter jobs
SELECT jobid, jobname, schedule, active FROM cron.job;

-- Estado atual de todas as competências (após Fase 1)
SELECT u.nome, c.ano, c.mes, c.status, c.fechado_por, c.fechado_em
FROM competencias_mensais c
JOIN unidades u ON u.id = c.unidade_id
ORDER BY c.ano DESC, c.mes DESC, u.nome;

-- Competências com snapshot zerado (candidatas a recalcular antes de fechar)
SELECT u.nome, d.ano, d.mes, d.alunos_pagantes, d.ticket_medio, d.faturamento_estimado
FROM dados_mensais d JOIN unidades u ON u.id = d.unidade_id
WHERE d.ticket_medio = 0 OR d.faturamento_estimado = 0
ORDER BY d.ano DESC, d.mes DESC;

-- UPDATEs automáticos por competência (monitorar após Fase 2)
SELECT (dados_novos->>'ano')::int ano, (dados_novos->>'mes')::int mes,
       (SELECT nome FROM unidades WHERE id=(dados_novos->>'unidade_id')::uuid) unidade,
       COUNT(*) n_updates, MAX(created_at)::date ultimo
FROM audit_log
WHERE tabela='dados_mensais' AND acao='UPDATE' AND origem='system'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1,2,3 ORDER BY n_updates DESC;

-- Retificações pendentes/aprovadas
SELECT r.ano, r.mes, u.nome, r.status, r.motivo, r.solicitado_por, r.aprovado_por
FROM dados_mensais_retificacoes r JOIN unidades u ON u.id=r.unidade_id
ORDER BY r.created_at DESC;
```
