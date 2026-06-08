---
name: p00-governanca-proposta-revisada-v2
description: Proposta P0.0 revisada v2 — 8 pontos corrigidos. DDL comentado, não executar. Supersede p00-governanca-competencia-mensal-proposta-oficial.md
metadata:
  type: project
---

# P0.0 — Proposta Revisada v2: Governança de Competência Mensal

Data: 2026-06-07  
Status: **PROPOSTA REVISADA — aguarda aprovação antes de qualquer execução**  
Supersede: `p00-governanca-competencia-mensal-proposta-oficial.md`

---

## Correções por Ponto

---

### Ponto 1 — REVOKE/GRANT: `anon` insuficiente se PUBLIC tem GRANT

**O que estava errado na v1:** propor `REVOKE FROM anon` sem revogar `PUBLIC`.

**Por quê é insuficiente:** o grantee `-` na coluna `proacl` do PostgreSQL representa `PUBLIC`.
`anon` herda de `PUBLIC`. Revogar só de `anon` não tem efeito enquanto `PUBLIC` mantiver GRANT.

**Estado atual confirmado** — todas as 4 RPCs têm:
```
grantee = PUBLIC (representado como "-")
grantee = anon
grantee = authenticated
grantee = postgres
grantee = service_role
```

**Assinaturas exatas confirmadas no banco:**
```
fechar_dados_mensais(p_ano integer, p_mes integer)
recalcular_dados_mensais(p_ano integer, p_mes integer, p_unidade_id uuid)
snapshot_dados_mensais(p_ano integer, p_mes integer)
upsert_dados_mensais(p_unidade_codigo character varying, p_ano integer, p_mes integer,
  p_alunos_pagantes integer, p_novas_matriculas integer, p_evasoes integer,
  p_churn_rate numeric, p_ticket_medio numeric, p_taxa_renovacao numeric,
  p_tempo_permanencia integer, p_inadimplencia numeric, p_reajuste_parcelas numeric)
sync_evasao_to_dados_mensais()  -- trigger function, sig vazia
```

**REVOKE correto — comentado, não executar:**

```sql
-- ⚠️ NÃO EXECUTAR — aguarda aprovação

-- fechar_dados_mensais: só service_role e postgres
REVOKE ALL ON FUNCTION public.fechar_dados_mensais(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_dados_mensais(integer, integer)
  TO service_role, postgres;

-- snapshot_dados_mensais: só service_role e postgres
REVOKE ALL ON FUNCTION public.snapshot_dados_mensais(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_dados_mensais(integer, integer)
  TO service_role, postgres;

-- recalcular_dados_mensais: manter authenticated (botão frontend legítimo)
-- mas revogar anon
REVOKE EXECUTE ON FUNCTION
  public.recalcular_dados_mensais(integer, integer, uuid)
  FROM PUBLIC, anon;
-- Não revogar de authenticated por ora — botão frontend depende disso
-- Guard interno cuidará de meses fechados quando guards (Fase 2) estiverem ativos

-- upsert_dados_mensais: revogar anon e PUBLIC; manter authenticated e service_role
REVOKE EXECUTE ON FUNCTION
  public.upsert_dados_mensais(
    character varying, integer, integer,
    integer, integer, integer,
    numeric, numeric, numeric, integer, numeric, numeric)
  FROM PUBLIC, anon;

-- sync_evasao_to_dados_mensais: é trigger function — chamada pelo motor do PG,
-- não diretamente por usuários. Revogar PUBLIC/anon por completude.
REVOKE EXECUTE ON FUNCTION public.sync_evasao_to_dados_mensais()
  FROM PUBLIC, anon, authenticated;
-- Triggers rodam com os privilégios do owner da função, não do caller
```

**Nota sobre REVOKE FROM PUBLIC em funções existentes:** revogar PUBLIC não afeta
chamadas via trigger (trigger functions são executadas pelo engine PostgreSQL diretamente).
Não quebrará o trigger `trg_sync_evasao_dados_mensais`.

---

### Ponto 2 — SECURITY DEFINER precisa de `SET search_path`

**Por que é necessário:** `SECURITY DEFINER` executa com os privilégios do owner da função.
Sem fixar `search_path`, uma função maliciosa criada por um usuário com permissão de CREATE
poderia criar objetos (tabelas, funções) com mesmo nome em um schema precedente e interceptar
a execução. O `pg_temp` no path previne esse vetor.

**Padrão correto para toda função SECURITY DEFINER:**

```sql
-- Exemplo correto — trecho das funções propostas
CREATE OR REPLACE FUNCTION public.assert_competencia_aberta(...)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp   -- ← obrigatório
AS $$...$$;

CREATE OR REPLACE FUNCTION public.fechar_competencia(...)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp   -- ← obrigatório
AS $$...$$;
```

**Funções que precisam da correção:**
- `assert_competencia_aberta` (nova — já incluir)
- `fechar_competencia` (nova — já incluir)
- Futuras funções de retificação
- Verificar se `is_admin()` existente tem o search_path (auditoria separada)

---

### Ponto 3 — `sync_evasao_to_dados_mensais`: log persistente de bloqueio

**O que estava errado na v1:** propor apenas `RAISE WARNING` — ephemeral, sem rastro.

**Problema confirmado:** o trigger já reescreveu meses históricos (Jan, Fev/2026 da Barra)
38+ vezes. Um WARNING no log desaparece; não gera alerta operacional.

**Solução: tabela `sync_evasao_bloqueios` para log persistente:**

```sql
-- ⚠️ NÃO EXECUTAR — aguarda aprovação

CREATE TABLE IF NOT EXISTS public.sync_evasao_bloqueios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      uuid NOT NULL REFERENCES public.unidades(id),
  ano             integer NOT NULL,
  mes             integer NOT NULL,
  movimentacao_id integer,           -- FK opcional para movimentacoes_admin.id
  tipo_operacao   text NOT NULL,     -- 'INSERT' | 'UPDATE' | 'DELETE'
  aluno_nome      text,
  tipo_mov        text,
  data_mov        date,
  motivo_bloqueio text NOT NULL DEFAULT 'competência fechada',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_bloqueios_competencia
  ON public.sync_evasao_bloqueios (unidade_id, ano, mes);

CREATE INDEX idx_sync_bloqueios_created_at
  ON public.sync_evasao_bloqueios (created_at DESC);

-- RLS: leitura para admin; escrita para service_role/postgres (trigger)
ALTER TABLE public.sync_evasao_bloqueios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_bloqueios_select" ON public.sync_evasao_bloqueios
  FOR SELECT USING (public.is_admin() OR auth.role() = 'service_role');

-- INSERT via trigger — sem RLS para service_role
GRANT INSERT ON public.sync_evasao_bloqueios TO postgres;
GRANT SELECT ON public.sync_evasao_bloqueios TO authenticated;
GRANT ALL    ON public.sync_evasao_bloqueios TO service_role;
```

**Lógica do trigger com log persistente — comentada:**

```sql
-- ⚠️ NÃO EXECUTAR — trecho a adicionar na função sync_evasao_to_dados_mensais

-- Verificar competência fechada (sem EXCEPTION — não falha movimentacoes_admin)
IF EXISTS (
  SELECT 1 FROM public.competencias_mensais
  WHERE unidade_id = v_unidade
    AND ano = v_ano
    AND mes = v_mes
    AND status = 'fechado'
) THEN
  -- Log persistente: cria registro para revisão operacional
  INSERT INTO public.sync_evasao_bloqueios (
    unidade_id, ano, mes, movimentacao_id, tipo_operacao,
    aluno_nome, tipo_mov, data_mov
  ) VALUES (
    v_unidade, v_ano, v_mes,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.aluno_nome ELSE NEW.aluno_nome END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.tipo ELSE NEW.tipo END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.data ELSE NEW.data END
  );
  -- A operação original em movimentacoes_admin continua normalmente
  RETURN COALESCE(NEW, OLD);
END IF;
```

**Efeito operacional:** quando um usuário registra uma evasão histórica em mês fechado,
a movimentação é gravada em `movimentacoes_admin` (integridade transacional mantida),
o snapshot em `dados_mensais` não é tocado, e uma linha aparece em `sync_evasao_bloqueios`
sinalizando que aquela competência pode precisar de retificação formal.

**SELECT de inspeção (pode executar a qualquer hora após tabela criada):**
```sql
SELECT u.nome, b.ano, b.mes, b.aluno_nome, b.tipo_mov, b.data_mov,
       b.tipo_operacao, b.created_at
FROM sync_evasao_bloqueios b JOIN unidades u ON u.id = b.unidade_id
ORDER BY b.created_at DESC;
```

---

### Ponto 4 — `fechar_competencia`: validação mínima de snapshot

**O que estava errado na v1:** só verificar `alunos_pagantes > 0`.

**Observação do banco:** `inadimplencia = 0.00` em Barra Mar-Mai/2026 e `taxa_renovacao = 0.00`
em Recreio e Barra Mar-Mai/2026 — ambos são valores legítimos, não indicam snapshot incompleto.

**Campos que indicam snapshot incompleto** (baseado no incidente Jun/2026 — ticket=0, MRR=0):
- `alunos_pagantes = 0 ou NULL` → incompleto
- `ticket_medio = 0 ou NULL` → incompleto (sempre > 0 se há pagantes)
- `faturamento_estimado = 0 ou NULL` → incompleto (sempre > 0 se há pagantes com parcela)

**Campos que podem legitimamente ser zero** (não bloquear fechamento):
- `inadimplencia = 0` → legítimo (Barra não tem inadimplentes)
- `taxa_renovacao = 0` → legítimo (meses sem renovações)
- `churn_rate = 0` → legítimo (mês sem evasões)

**Validação revisada — comentada:**

```sql
-- ⚠️ NÃO EXECUTAR — trecho de fechar_competencia

DECLARE
  v_snap RECORD;
BEGIN
  -- ...guards de mês atual e permissão...

  -- Carregar snapshot existente
  SELECT alunos_pagantes, ticket_medio, faturamento_estimado
  INTO v_snap
  FROM public.dados_mensais
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes;

  -- Verificar existência
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Competência %/% não tem snapshot em dados_mensais. '
      'Execute recalcular_dados_mensais ou snapshot_dados_mensais antes de fechar.',
      p_ano, p_mes;
  END IF;

  -- Verificar campos financeiros essenciais
  IF COALESCE(v_snap.alunos_pagantes, 0) = 0 THEN
    RAISE EXCEPTION
      'Snapshot %/% tem alunos_pagantes = 0. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  IF COALESCE(v_snap.ticket_medio, 0) = 0 THEN
    RAISE EXCEPTION
      'Snapshot %/% tem ticket_medio = 0. Indica snapshot incompleto. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  IF COALESCE(v_snap.faturamento_estimado, 0) = 0 THEN
    RAISE EXCEPTION
      'Snapshot %/% tem faturamento_estimado = 0. Indica snapshot incompleto. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  -- Se passou todas as validações: fechar
  INSERT INTO public.competencias_mensais (...)
  ...
END;
```

---

### Ponto 5 — `public.is_admin()`: confirmado existente

**Resultado confirmado:**
```sql
-- is_admin() existe com a seguinte definição:
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios 
    WHERE auth_user_id = (SELECT auth.uid())
    AND perfil = 'admin' 
    AND ativo = true
  );
END;
```

**Também existem:**
- `is_admin_usuario()` — variante com nome diferente
- `usuario_tem_permissao(p_usuario_id, p_codigo_permissao, p_unidade_id)` — verificação granular

**`is_admin()` pode ser usado com segurança em:**
- Políticas RLS de `competencias_mensais` e `dados_mensais_retificacoes`
- Verificações internas de funções (não em SECURITY DEFINER via JWT context)

**Cuidado em SECURITY DEFINER:** `auth.uid()` dentro de SECURITY DEFINER pode não retornar
o usuário correto se o contexto JWT não estiver propagado. Para funções chamadas por triggers
(que rodam como postgres), `auth.uid()` retorna NULL. Portanto:

- **Em triggers:** não usar `is_admin()` para verificação — usar verificação direta na tabela
- **Em RPCs chamadas pelo frontend:** `is_admin()` funciona corretamente
- **Em `fechar_competencia` e `assert_competencia_aberta`:** verificar se são chamadas
  via trigger ou via API antes de depender de `is_admin()` internamente

---

### Ponto 6 — Status machine de `competencias_mensais`

**Status propostos com semântica clara:**

| Status | Significado | Bloqueia escrita direta? |
|--------|-------------|--------------------------|
| `aberto` | Mês em andamento. Recalculos e snapshots são permitidos. | ❌ Não |
| `fechado` | Competência encerrada. Snapshot validado e congelado. | ✅ Sim |
| `retificacao_pendente` | Fechada, mas há retificação formal aguardando aplicação. | ✅ Sim (bloqueia como fechado) |

**Status descartados para v1:**
- `retificada`: redundante — após retificação aplicada, status volta a `fechado`
- `reaberta`: perigoso sem audit trail — se necessário, usar retificação para alterar e manter histórico; não "reabrir"

**Transições válidas:**
```
aberto → fechado                    (via fechar_competencia — apenas admin)
fechado → retificacao_pendente      (via criar_retificacao — apenas admin)
retificacao_pendente → fechado      (via aplicar_retificacao ou rejeitar_retificacao)
```

**Quais status bloqueiam escrita via `assert_competencia_aberta`:**
```sql
IF v_status IN ('fechado', 'retificacao_pendente') THEN
  RAISE EXCEPTION ...
END IF;
```

**DDL revisado com status machine:**

```sql
-- ⚠️ NÃO EXECUTAR

CREATE TABLE public.competencias_mensais (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id  uuid NOT NULL REFERENCES public.unidades(id),
  ano         integer NOT NULL,
  mes         integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status      text NOT NULL DEFAULT 'aberto'
              CHECK (status IN ('aberto', 'fechado', 'retificacao_pendente')),
  fechado_em  timestamptz,
  fechado_por text,
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, ano, mes)
);

CREATE INDEX idx_competencias_status
  ON public.competencias_mensais (unidade_id, ano, mes, status);

CREATE TRIGGER tr_competencias_updated_at
  BEFORE UPDATE ON public.competencias_mensais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.competencias_mensais ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado
CREATE POLICY "comp_select" ON public.competencias_mensais
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- Escrita: apenas admin ou service_role
CREATE POLICY "comp_write" ON public.competencias_mensais
  FOR ALL USING (public.is_admin() OR auth.role() = 'service_role')
           WITH CHECK (public.is_admin() OR auth.role() = 'service_role');

GRANT SELECT ON public.competencias_mensais TO authenticated;
GRANT ALL    ON public.competencias_mensais TO service_role;
GRANT ALL    ON public.competencias_mensais TO postgres;
```

---

### Ponto 7 — `snapshot_dados_mensais`: CONTINUE não pode ser invisível

**O que estava errado na v1:** CONTINUE silencioso — parcial invisível se algumas unidades
estiverem fechadas e outras não.

**Abordagem revisada:** logar quais unidades foram puladas via `sync_evasao_bloqueios`
(reutilizando a mesma tabela de log) ou via retorno explícito da função.

```sql
-- ⚠️ NÃO EXECUTAR — trecho de snapshot_dados_mensais (dentro do loop)

DECLARE
  v_puladas text[] := '{}';
  v_processadas text[] := '{}';
BEGIN
  FOR v_unidade IN SELECT id, nome FROM unidades WHERE ativo = true LOOP
    -- Verificar competência
    IF EXISTS (
      SELECT 1 FROM public.competencias_mensais
      WHERE unidade_id = v_unidade.id AND ano = p_ano AND mes = p_mes
        AND status IN ('fechado','retificacao_pendente')
    ) THEN
      v_puladas := v_puladas || v_unidade.nome;
      CONTINUE;
    END IF;

    -- ...cálculo e INSERT normal...
    v_processadas := v_processadas || v_unidade.nome;
  END LOOP;

  -- Retorno explícito com resumo (a função pode retornar JSONB)
  IF array_length(v_puladas, 1) > 0 THEN
    RAISE NOTICE 'snapshot_dados_mensais %/%: processadas=%, puladas(fechadas)=%',
      p_ano, p_mes, v_processadas, v_puladas;
  END IF;
  RETURN jsonb_build_object(
    'processadas', to_jsonb(v_processadas),
    'puladas',     to_jsonb(v_puladas)
  );
END;
```

**Nota:** mudar o tipo de retorno de `VOID` para `JSONB` requer um `CREATE OR REPLACE`
que quebra chamadas existentes que ignoram o retorno. Alternativa mais segura: manter VOID
e usar apenas o RAISE NOTICE (que aparece nos logs do servidor e na resposta da API Supabase
via `NOTICE` channel). Isso é reversível sem quebrar callers.

---

### Ponto 8 — Rollout: separação clara por fase

| Fase | O que entra | Pré-condição | Impacto | Pode executar? |
|------|------------|-------------|---------|----------------|
| **Fase 1** | DDL estrutural (tabelas, função `assert_competencia_aberta`, `fechar_competencia`, tabela `sync_evasao_bloqueios`, RLS em `dados_mensais_retificacoes`, `REVOKE` correto) | Nenhuma | Zero sobre dados e comportamento | **Após aprovação do Alf** |
| **Fase 2** | Guards nas 4 RPCs: `recalcular`, `fechar`, `snapshot`, `upsert` | Fase 1 concluída | Zero enquanto `competencias_mensais` estiver vazia | Após Fase 1 |
| **Fase 3** | Guard no trigger `sync_evasao` + log em `sync_evasao_bloqueios` | Fase 1 concluída | Zero enquanto `competencias_mensais` vazia | Junto ou após Fase 2 |
| **Fase 4** | Frontend: verificar `competencias_mensais.status` antes de habilitar botão "Recalcular" | Fase 1 concluída | Visual apenas | Independente — pode ser paralela a Fase 2 |
| **Fase 5** | Piloto: fechar 1 competência histórica validada (ex: Recreio Mai/2026) | Fases 1+2+3 concluídas | Ativa proteção real para aquela competência | Após validar Fases 2+3 |
| **Fase 6** | Fechar demais competências históricas (Barra, CG, outros meses) | Fase 5 validada | Histórico protegido | Após piloto |
| **Fase 7** | Trigger hard em `dados_mensais` (se necessário) | Monitorar audit_log pós-Fases 2+3 por 2-4 semanas | Última camada defensiva; pode bloquear manutenção | Só se mapeamento mostrar path não coberto |

**O que definitivamente NÃO entra ainda:**
- Fechar Jun/2026 (mês aberto/preliminar)
- Correções de KPI live
- Alterações em views (`vw_kpis_gestao_mensal`, `vw_dashboard_unidade`)
- Alterações em `AlunosPage.tsx` além de botão/UX de fechamento

---

## DDL Consolidado — Fase 1 Completa (comentado, não executar)

```sql
-- ============================================================
-- P0.0 FASE 1 — DDL estrutural
-- ⚠️ NÃO EXECUTAR — aguarda aprovação formal do Alf
-- ============================================================

-- 1. Tabela de governança de competências
CREATE TABLE public.competencias_mensais (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id  uuid NOT NULL REFERENCES public.unidades(id),
  ano         integer NOT NULL,
  mes         integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status      text NOT NULL DEFAULT 'aberto'
              CHECK (status IN ('aberto', 'fechado', 'retificacao_pendente')),
  fechado_em  timestamptz,
  fechado_por text,
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, ano, mes)
);
CREATE INDEX idx_competencias_status
  ON public.competencias_mensais (unidade_id, ano, mes, status);
CREATE TRIGGER tr_competencias_updated_at
  BEFORE UPDATE ON public.competencias_mensais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
ALTER TABLE public.competencias_mensais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp_select" ON public.competencias_mensais
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "comp_write"  ON public.competencias_mensais
  FOR ALL USING (public.is_admin() OR auth.role()='service_role')
           WITH CHECK (public.is_admin() OR auth.role()='service_role');
GRANT SELECT ON public.competencias_mensais TO authenticated;
GRANT ALL    ON public.competencias_mensais TO service_role, postgres;

-- 2. Guarda única
CREATE OR REPLACE FUNCTION public.assert_competencia_aberta(
  p_unidade_id uuid, p_ano integer, p_mes integer
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_status text; v_nome text;
BEGIN
  SELECT status INTO v_status FROM public.competencias_mensais
  WHERE unidade_id=p_unidade_id AND ano=p_ano AND mes=p_mes;
  IF v_status IS NULL THEN RETURN; END IF;
  IF v_status IN ('fechado','retificacao_pendente') THEN
    SELECT nome INTO v_nome FROM public.unidades WHERE id=p_unidade_id;
    RAISE EXCEPTION
      'Competência %/% da unidade "%" está %. Alterações exigem retificação formal.',
      p_ano, p_mes, COALESCE(v_nome, p_unidade_id::text), v_status;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_competencia_aberta(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_competencia_aberta(uuid,integer,integer)
  TO service_role, postgres;

-- 3. Função de fechamento formal
CREATE OR REPLACE FUNCTION public.fechar_competencia(
  p_unidade_id uuid, p_ano integer, p_mes integer,
  p_fechado_por text, p_motivo text DEFAULT 'Fechamento mensal regular'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_snap RECORD;
BEGIN
  IF p_ano=EXTRACT(YEAR FROM CURRENT_DATE)::int
  AND p_mes=EXTRACT(MONTH FROM CURRENT_DATE)::int THEN
    RAISE EXCEPTION 'Não é permitido fechar o mês atual (%/%).', p_ano, p_mes;
  END IF;
  SELECT alunos_pagantes, ticket_medio, faturamento_estimado INTO v_snap
  FROM public.dados_mensais
  WHERE unidade_id=p_unidade_id AND ano=p_ano AND mes=p_mes;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competência %/% sem snapshot. Recalcule antes de fechar.', p_ano, p_mes;
  END IF;
  IF COALESCE(v_snap.alunos_pagantes,0)=0 THEN
    RAISE EXCEPTION 'Snapshot %/% tem alunos_pagantes=0. Recalcule antes de fechar.', p_ano, p_mes;
  END IF;
  IF COALESCE(v_snap.ticket_medio,0)=0 THEN
    RAISE EXCEPTION 'Snapshot %/% tem ticket_medio=0. Snapshot incompleto. Recalcule antes de fechar.', p_ano, p_mes;
  END IF;
  IF COALESCE(v_snap.faturamento_estimado,0)=0 THEN
    RAISE EXCEPTION 'Snapshot %/% tem faturamento_estimado=0. Snapshot incompleto. Recalcule antes de fechar.', p_ano, p_mes;
  END IF;
  INSERT INTO public.competencias_mensais
    (unidade_id, ano, mes, status, fechado_em, fechado_por, motivo)
  VALUES
    (p_unidade_id, p_ano, p_mes, 'fechado', NOW(), p_fechado_por, p_motivo)
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
    status=EXCLUDED.status, fechado_em=EXCLUDED.fechado_em,
    fechado_por=EXCLUDED.fechado_por, motivo=EXCLUDED.motivo, updated_at=NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.fechar_competencia(uuid,integer,integer,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_competencia(uuid,integer,integer,text,text)
  TO service_role, postgres;

-- 4. Tabela de log persistente do trigger sync
CREATE TABLE public.sync_evasao_bloqueios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      uuid NOT NULL REFERENCES public.unidades(id),
  ano             integer NOT NULL,
  mes             integer NOT NULL,
  movimentacao_id integer,
  tipo_operacao   text NOT NULL,
  aluno_nome      text,
  tipo_mov        text,
  data_mov        date,
  motivo_bloqueio text NOT NULL DEFAULT 'competência fechada',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_bloqueios_competencia
  ON public.sync_evasao_bloqueios (unidade_id, ano, mes);
ALTER TABLE public.sync_evasao_bloqueios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bloqueios_select" ON public.sync_evasao_bloqueios
  FOR SELECT USING (public.is_admin() OR auth.role()='service_role');
GRANT INSERT ON public.sync_evasao_bloqueios TO postgres;
GRANT SELECT ON public.sync_evasao_bloqueios TO authenticated;
GRANT ALL    ON public.sync_evasao_bloqueios TO service_role;

-- 5. Evoluir dados_mensais_retificacoes (colunas com DEFAULT para não quebrar 2 linhas existentes)
ALTER TABLE public.dados_mensais_retificacoes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aplicada'
    CHECK (status IN ('pendente','aprovada','rejeitada','aplicada','revertida')),
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'correcao'
    CHECK (tipo IN ('correcao','reversao')),
  ADD COLUMN IF NOT EXISTS aprovada_em  timestamptz,
  ADD COLUMN IF NOT EXISTS aplicada_em  timestamptz,
  ADD COLUMN IF NOT EXISTS revertida_em timestamptz,
  ADD COLUMN IF NOT EXISTS retificacao_origem_id uuid
    REFERENCES public.dados_mensais_retificacoes(id);
ALTER TABLE public.dados_mensais_retificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retif_select" ON public.dados_mensais_retificacoes
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "retif_write"  ON public.dados_mensais_retificacoes
  FOR ALL USING (public.is_admin() OR auth.role()='service_role')
           WITH CHECK (public.is_admin() OR auth.role()='service_role');
GRANT SELECT ON public.dados_mensais_retificacoes TO authenticated;
GRANT ALL    ON public.dados_mensais_retificacoes TO service_role, postgres;

-- 6. REVOKE correto (PUBLIC antes de anon/authenticated)
REVOKE ALL ON FUNCTION public.fechar_dados_mensais(integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_dados_mensais(integer,integer)
  TO service_role, postgres;

REVOKE ALL ON FUNCTION public.snapshot_dados_mensais(integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_dados_mensais(integer,integer)
  TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION
  public.recalcular_dados_mensais(integer,integer,uuid)
  FROM PUBLIC, anon;
-- mantém authenticated para botão frontend

REVOKE EXECUTE ON FUNCTION
  public.upsert_dados_mensais(
    character varying,integer,integer,integer,integer,integer,
    numeric,numeric,numeric,integer,numeric,numeric)
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.sync_evasao_to_dados_mensais()
  FROM PUBLIC, anon, authenticated;
-- trigger function é executada pelo engine PG, não por usuários diretos
```

---

## Riscos Restantes

### R1 — `is_admin()` retorna FALSE dentro de trigger (SECURITY DEFINER + sem JWT)
**Severidade:** baixa para Fase 1 (não usamos `is_admin()` em triggers).
**Ação:** nunca chamar `is_admin()` dentro de função trigger; usar apenas em RPCs chamadas via API.

### R2 — Fechamento parcial entre unidades
**Cenário:** fechar Recreio em dia diferente de CG e Barra. Consolidados do Fideliza+
ficam inconsistentes (1 unidade imutável, 2 recalculáveis).
**Ação:** documentar que `fechar_competencia` deve ser chamado para as 3 unidades
na mesma janela operacional.

### R3 — Retificação com `status='pendente'` sem aprovador disponível
**Cenário:** admin técnico cria retificação, aprovador necessário está indisponível,
competência fica em `retificacao_pendente` bloqueando recalculos.
**Ação:** definir timeout ou escalonamento de aprovação; não blocking para Fase 1.

### R4 — REVOKE de `recalcular_dados_mensais` para `anon/PUBLIC` insuficiente
**Contexto:** mantemos GRANT para `authenticated` pois o botão frontend depende.
**Risco residual:** qualquer usuário autenticado pode chamar `recalcular_dados_mensais`
para qualquer mês/unidade — incluindo meses históricos (enquanto `competencias_mensais`
estiver vazia e sem guards ativos).
**Ação:** adicionar guard `assert_competencia_aberta` na Fase 2 fecha este risco.

### R5 — `dados_mensais_retificacoes` sem FK para `dados_mensais`
**Contexto:** a tabela referencia por `(unidade_id, ano, mes)`, não por FK de ID.
Isso significa que uma retificação pode ser registrada mesmo se a linha de `dados_mensais`
for deletada (situação improvável mas possível).
**Ação:** aceitar o design atual — adicionar FK complexifica e a UNIQUE constraint
em `dados_mensais` garante existência enquanto a linha existir.

---

## O que Aprovar Agora

**Fase 1 completa — DDL puro acima:**
- `CREATE TABLE competencias_mensais`
- `CREATE FUNCTION assert_competencia_aberta` com `SECURITY DEFINER SET search_path`
- `CREATE FUNCTION fechar_competencia` com validação de snapshot
- `CREATE TABLE sync_evasao_bloqueios`
- `ALTER TABLE dados_mensais_retificacoes ADD COLUMN status, tipo...`
- `ENABLE ROW LEVEL SECURITY` em `dados_mensais_retificacoes`
- `REVOKE` correto (revoga PUBLIC antes de anon)

**Motivo:** estrutura pura, zero impacto em dados e comportamento. Tabelas começam
vazias, REVOKEs corrigem exposição de segurança real sem afetar funcionalidade.

---

## O que NÃO Aprovar Agora

- Guards nas RPCs e trigger (Fase 2+3) — esperar Fase 1 estável
- Fechar qualquer competência (Fase 5+)
- Jun/2026 permanece aberto
- Correções de KPI live
- Alterações em views de KPI ou AlunosPage

---

## Perguntas Finais para o Alf

1. **Status `retificacao_pendente`:** o status machine de 3 estados (`aberto`, `fechado`,
   `retificacao_pendente`) é suficiente para P0.0, ou é necessário mais granularidade já?

2. **Aprovação de retificação:** para P0.0, auto-aprovação por admin é aceitável?
   Ou já quer aprovador independente desde o primeiro piloto?

3. **Fechamento simultâneo das 3 unidades:** `fechar_competencia` deve ter modo
   `p_todas_unidades boolean` para fechar as 3 de uma vez, ou chamadas separadas são preferíveis?

4. **`recalcular_dados_mensais` para authenticated:** manter o GRANT atual (qualquer
   usuário logado pode recalcular qualquer mês) é aceitável para P0.0, sabendo que
   os guards (Fase 2) cobrirão meses fechados?

5. **Retroatividade:** fechar competências de 2025 retroativamente é objetivo de
   curto prazo ou pode esperar o piloto de 2026 funcionar?
