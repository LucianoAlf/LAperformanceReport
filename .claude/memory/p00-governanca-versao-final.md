---
name: p00-governanca-versao-final
description: P0.0 versão final — governança de competência mensal. Decisões do Alf incorporadas. DDL comentado por fase. Nada executado. Supersede v1 e v2.
metadata:
  type: project
---

# P0.0 — Versão Final: Governança de Competência Mensal

Data: 2026-06-07  
Status: **VERSÃO FINAL — aguarda `APPROVE` do Alf para executar Fase 1**  
Supersede: `p00-governanca-competencia-mensal-proposta-oficial.md` e `p00-governanca-proposta-revisada-v2.md`

---

## Decisões do Alf Incorporadas

| # | Decisão | Impacto no design |
|---|---------|------------------|
| 1 | Fechamento por pacote das 3 unidades na mesma janela — 3 chamadas, mas janela única | `fechar_competencia` não muda assinatura; processo operacional garante a janela |
| 2 | Quem fecha: Alf/admin master ou `service_role` controlado | GRANT de `fechar_competencia` só para `service_role` e `postgres` |
| 3 | Retificação P0.0: Alf pode autoaprovar; separar solicitante/aprovador depois | `dados_mensais_retificacoes` exige `aprovado_por` NOT NULL; não impede ser igual a `solicitado_por` agora |
| 4 | Retificação pode alterar financeiro com diff + motivo + aprovação explícita | Schema de retificações já cobre isso |
| 5 | `recalcular_dados_mensais` vira admin-only; por ora mantém no frontend com guard | GRANT mantém `authenticated`; guard da Fase 2 cobre mês fechado |
| 6 | Competência piloto: **Campo Grande / Maio 2026** | Scripts de piloto apontam para CG/2026/5 |

---

## Estado Atual Confirmado (SELECT-only)

| Item | Status |
|------|--------|
| pg_cron `snapshot_dados_mensais_mensal` | ✅ Ausente — neutralizado |
| `competencias_mensais` | ❌ Não existe — campo limpo |
| `dados_mensais_retificacoes` | ✅ Existe, 2 linhas, falta `status`/`tipo`/timestamps |
| `sync_evasao_bloqueios` | ❌ Não existe |
| `is_admin()` | ✅ Existe — usa `auth.uid()` + tabela `usuarios.perfil='admin'` |
| GRANTs nas 4 RPCs escritoras | 🔴 PUBLIC + anon + authenticated em `fechar` e `snapshot` |
| RLS em `dados_mensais_retificacoes` | 🔴 Desativado |
| RLS em `dados_mensais` | ✅ Ativo (não forçado) |

---

## Arquitetura Final

```
┌─────────────────────────────────────────────────────┐
│  competencias_mensais                               │
│  (unidade_id, ano, mes) UNIQUE                      │
│  status: aberto | fechado | retificacao_pendente    │
│  → fonte da verdade sobre estado de cada mês        │
└────────────────┬────────────────────────────────────┘
                 │ assert_competencia_aberta()
                 │ (chamada por todos os writers)
                 ▼
┌─────────────────────────────────────────────────────┐
│  dados_mensais                                      │
│  snapshot histórico; protegido quando fechado       │
└─────────────────────────────────────────────────────┘
                 │ quando writer é bloqueado em mês fechado
                 ▼
┌─────────────────────────────────────────────────────┐
│  sync_evasao_bloqueios                              │
│  log persistente de writes bloqueados pelo trigger  │
└─────────────────────────────────────────────────────┘
                 │ caminho formal para alterar mês fechado
                 ▼
┌─────────────────────────────────────────────────────┐
│  dados_mensais_retificacoes                         │
│  status: pendente→aprovada→aplicada / revertida     │
└─────────────────────────────────────────────────────┘
```

---

## DDL Fase 1 — Estrutural (comentado, não executar)

> Fase 1 não altera dados nem comportamento. Tabelas começam vazias.
> REVOKEs removem exposição de segurança real sem afetar funcionalidade.
> Zero impacto em KPIs live, views ou frontend.

```sql
-- ============================================================
-- P0.0 FASE 1 — ESTRUTURAL
-- ⚠️ NÃO EXECUTAR — aguarda APPROVE explícito do Alf
-- ============================================================

-- ── 1. competencias_mensais ──────────────────────────────────

CREATE TABLE public.competencias_mensais (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id  uuid        NOT NULL REFERENCES public.unidades(id),
  ano         integer     NOT NULL,
  mes         integer     NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status      text        NOT NULL DEFAULT 'aberto'
                          CHECK (status IN ('aberto','fechado','retificacao_pendente')),
  fechado_em  timestamptz,
  fechado_por text,           -- email do executor do fechamento
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competencias_mensais_unidade_ano_mes_key
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

CREATE POLICY "comp_write" ON public.competencias_mensais
  FOR ALL
  USING (public.is_admin() OR auth.role() = 'service_role')
  WITH CHECK (public.is_admin() OR auth.role() = 'service_role');

GRANT SELECT ON public.competencias_mensais TO authenticated;
GRANT ALL    ON public.competencias_mensais TO service_role, postgres;


-- ── 2. assert_competencia_aberta ─────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_competencia_aberta(
  p_unidade_id uuid,
  p_ano        integer,
  p_mes        integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status      text;
  v_unidade_nome text;
BEGIN
  SELECT status INTO v_status
  FROM public.competencias_mensais
  WHERE unidade_id = p_unidade_id
    AND ano = p_ano
    AND mes = p_mes;

  -- Linha inexistente = mês nunca registrado = aberto por definição
  IF v_status IS NULL THEN
    RETURN;
  END IF;

  IF v_status IN ('fechado', 'retificacao_pendente') THEN
    SELECT nome INTO v_unidade_nome
    FROM public.unidades
    WHERE id = p_unidade_id;

    RAISE EXCEPTION
      'Competência %/% da unidade "%" está [%]. Alterações exigem retificação formal.',
      p_ano, p_mes,
      COALESCE(v_unidade_nome, p_unidade_id::text),
      v_status;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  public.assert_competencia_aberta(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.assert_competencia_aberta(uuid, integer, integer)
  TO service_role, postgres;
-- assert é chamada internamente pelas RPCs, não pelo frontend diretamente


-- ── 3. fechar_competencia ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fechar_competencia(
  p_unidade_id  uuid,
  p_ano         integer,
  p_mes         integer,
  p_fechado_por text,
  p_motivo      text DEFAULT 'Fechamento mensal regular'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snap RECORD;
BEGIN
  -- Impede fechar mês atual
  IF p_ano  = EXTRACT(YEAR  FROM CURRENT_DATE)::int
  AND p_mes = EXTRACT(MONTH FROM CURRENT_DATE)::int
  THEN
    RAISE EXCEPTION
      'Não é permitido fechar o mês atual (%/%). Aguarde o encerramento do período.',
      p_ano, p_mes;
  END IF;

  -- Verificar existência e qualidade do snapshot
  SELECT alunos_pagantes, alunos_ativos,
         ticket_medio, faturamento_estimado,
         evasoes, churn_rate, inadimplencia
  INTO v_snap
  FROM public.dados_mensais
  WHERE unidade_id = p_unidade_id
    AND ano = p_ano
    AND mes = p_mes;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Competência %/% sem snapshot em dados_mensais. '
      'Execute recalcular_dados_mensais antes de fechar.',
      p_ano, p_mes;
  END IF;

  IF COALESCE(v_snap.alunos_pagantes, 0) = 0 THEN
    RAISE EXCEPTION
      'Snapshot %/%: alunos_pagantes = 0. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  -- alunos_ativos deve existir e ser >= alunos_pagantes
  IF COALESCE(v_snap.alunos_ativos, 0) = 0 THEN
    RAISE EXCEPTION
      'Snapshot %/%: alunos_ativos = 0. Snapshot incompleto. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  IF v_snap.alunos_ativos < v_snap.alunos_pagantes THEN
    RAISE EXCEPTION
      'Snapshot %/%: alunos_ativos (%) < alunos_pagantes (%). Inconsistência detectada.',
      p_ano, p_mes, v_snap.alunos_ativos, v_snap.alunos_pagantes;
  END IF;

  IF COALESCE(v_snap.ticket_medio, 0) = 0 THEN
    RAISE EXCEPTION
      'Snapshot %/%: ticket_medio = 0. Snapshot incompleto (financeiro não calculado). '
      'Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  IF COALESCE(v_snap.faturamento_estimado, 0) = 0 THEN
    RAISE EXCEPTION
      'Snapshot %/%: faturamento_estimado = 0. Snapshot incompleto. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  -- evasoes e churn_rate não podem ser NULL (valor 0 é válido)
  IF v_snap.evasoes IS NULL THEN
    RAISE EXCEPTION
      'Snapshot %/%: campo evasoes é NULL. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  IF v_snap.churn_rate IS NULL THEN
    RAISE EXCEPTION
      'Snapshot %/%: campo churn_rate é NULL. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  -- inadimplencia NULL é problema; 0 é válido (Barra nunca tem inadimplência)
  IF v_snap.inadimplencia IS NULL THEN
    RAISE EXCEPTION
      'Snapshot %/%: campo inadimplencia é NULL. Recalcule antes de fechar.',
      p_ano, p_mes;
  END IF;

  -- Inserir ou atualizar competência como fechada
  INSERT INTO public.competencias_mensais
    (unidade_id, ano, mes, status, fechado_em, fechado_por, motivo)
  VALUES
    (p_unidade_id, p_ano, p_mes, 'fechado', NOW(), p_fechado_por, p_motivo)
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
    status      = 'fechado',
    fechado_em  = NOW(),
    fechado_por = EXCLUDED.fechado_por,
    motivo      = EXCLUDED.motivo,
    updated_at  = NOW();
END;
$$;

REVOKE ALL ON FUNCTION
  public.fechar_competencia(uuid, integer, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fechar_competencia(uuid, integer, integer, text, text)
  TO service_role, postgres;


-- ── 4. sync_evasao_bloqueios (log persistente do trigger) ────

CREATE TABLE public.sync_evasao_bloqueios (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id      uuid    NOT NULL REFERENCES public.unidades(id),
  ano             integer NOT NULL,
  mes             integer NOT NULL,
  movimentacao_id integer,           -- FK leve para movimentacoes_admin.id
  tipo_operacao   text    NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  aluno_nome      text,
  tipo_mov        text,
  data_mov        date,
  motivo_bloqueio text    NOT NULL DEFAULT 'competência fechada',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_bloqueios_competencia
  ON public.sync_evasao_bloqueios (unidade_id, ano, mes);
CREATE INDEX idx_sync_bloqueios_created
  ON public.sync_evasao_bloqueios (created_at DESC);

ALTER TABLE public.sync_evasao_bloqueios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bloqueios_select" ON public.sync_evasao_bloqueios
  FOR SELECT USING (public.is_admin() OR auth.role() = 'service_role');

GRANT INSERT ON public.sync_evasao_bloqueios TO postgres;
GRANT SELECT ON public.sync_evasao_bloqueios TO authenticated;
GRANT ALL    ON public.sync_evasao_bloqueios TO service_role;


-- ── 5. Evoluir dados_mensais_retificacoes ────────────────────
-- A tabela já existe com 2 linhas. DEFAULT em tudo para não quebrar.

ALTER TABLE public.dados_mensais_retificacoes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aplicada'
    CHECK (status IN ('pendente','aprovada','rejeitada','aplicada','revertida')),
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'correcao'
    CHECK (tipo IN ('correcao','reversao')),
  ADD COLUMN IF NOT EXISTS aprovada_em        timestamptz,
  ADD COLUMN IF NOT EXISTS aplicada_em        timestamptz,
  ADD COLUMN IF NOT EXISTS revertida_em       timestamptz,
  ADD COLUMN IF NOT EXISTS retificacao_origem_id uuid
    REFERENCES public.dados_mensais_retificacoes(id);

CREATE INDEX IF NOT EXISTS idx_retificacoes_competencia
  ON public.dados_mensais_retificacoes (unidade_id, ano, mes, status);

ALTER TABLE public.dados_mensais_retificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retif_select" ON public.dados_mensais_retificacoes
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));

CREATE POLICY "retif_write" ON public.dados_mensais_retificacoes
  FOR ALL
  USING (public.is_admin() OR auth.role() = 'service_role')
  WITH CHECK (public.is_admin() OR auth.role() = 'service_role');

GRANT SELECT ON public.dados_mensais_retificacoes TO authenticated;
GRANT ALL    ON public.dados_mensais_retificacoes TO service_role, postgres;


-- ── 6. REVOKE/GRANT corretos nas 4 RPCs escritoras ───────────
-- Revogar PUBLIC primeiro; anon herda de PUBLIC, então revogar só anon é insuficiente.

-- fechar_dados_mensais: só backend
REVOKE ALL ON FUNCTION
  public.fechar_dados_mensais(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fechar_dados_mensais(integer, integer)
  TO service_role, postgres;

-- snapshot_dados_mensais: só backend
REVOKE ALL ON FUNCTION
  public.snapshot_dados_mensais(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.snapshot_dados_mensais(integer, integer)
  TO service_role, postgres;

-- recalcular_dados_mensais: manter authenticated (botão frontend legítimo por ora)
REVOKE EXECUTE ON FUNCTION
  public.recalcular_dados_mensais(integer, integer, uuid)
  FROM PUBLIC, anon;
-- authenticated mantido; guard (Fase 2) cobrirá meses fechados

-- upsert_dados_mensais: revogar PUBLIC e anon; manter authenticated e service_role
REVOKE EXECUTE ON FUNCTION
  public.upsert_dados_mensais(
    character varying, integer, integer,
    integer, integer, integer,
    numeric, numeric, numeric, integer, numeric, numeric)
  FROM PUBLIC, anon;

-- sync_evasao_to_dados_mensais: trigger function — revogar de usuários diretos
REVOKE EXECUTE ON FUNCTION
  public.sync_evasao_to_dados_mensais()
  FROM PUBLIC, anon, authenticated;
-- Engine PG executa triggers diretamente; REVOKE de usuários não afeta o trigger
```

---

## DDL Fase 2 — Guards nas RPCs (comentado, só após Fase 1 estável)

```sql
-- ============================================================
-- P0.0 FASE 2 — GUARDS NAS RPCs E TRIGGER
-- ⚠️ NÃO EXECUTAR — só após Fase 1 validada em produção
-- Enquanto competencias_mensais estiver vazia: zero impacto
-- ============================================================

-- ── recalcular_dados_mensais: adicionar PERFORM no início ────
-- Localizar no corpo da função e inserir como primeira instrução:

-- PERFORM public.assert_competencia_aberta(p_unidade_id, p_ano, p_mes);

-- ── fechar_dados_mensais: guard no loop por unidade ─────────
-- Dentro do FOR v_unidade IN ..., antes de qualquer cálculo:

-- PERFORM public.assert_competencia_aberta(v_unidade.id, p_ano, p_mes);

-- ── snapshot_dados_mensais: guard com CONTINUE + log ────────
-- Dentro do FOR v_unidade IN ..., com tratamento explícito:

-- DECLARE v_puladas text[] := '{}'; v_ok text[] := '{}';
-- BEGIN
--   IF EXISTS (SELECT 1 FROM competencias_mensais
--              WHERE unidade_id=v_unidade.id AND ano=p_ano AND mes=p_mes
--                AND status IN ('fechado','retificacao_pendente')) THEN
--     v_puladas := v_puladas || v_unidade.nome;
--     RAISE NOTICE 'snapshot_dados_mensais: unidade % %/% fechada — pulada.',
--       v_unidade.nome, p_ano, p_mes;
--     CONTINUE;
--   END IF;
--   -- ... cálculo e INSERT normal ...
--   v_ok := v_ok || v_unidade.nome;
-- END LOOP;
-- RAISE NOTICE 'snapshot_dados_mensais %/%: ok=%, puladas=%', p_ano, p_mes, v_ok, v_puladas;

-- ── upsert_dados_mensais: guard após resolver unidade_id ────
-- Logo após SELECT id INTO v_unidade_id FROM unidades WHERE codigo=...:

-- PERFORM public.assert_competencia_aberta(v_unidade_id, p_ano, p_mes);

-- ── sync_evasao_to_dados_mensais: guard com log persistente ─
-- Substituir a lógica de UPDATE condicional por:

-- IF EXISTS (SELECT 1 FROM public.competencias_mensais
--            WHERE unidade_id=v_unidade AND ano=v_ano AND mes=v_mes
--              AND status IN ('fechado','retificacao_pendente')) THEN
--   INSERT INTO public.sync_evasao_bloqueios (
--     unidade_id, ano, mes, movimentacao_id, tipo_operacao,
--     aluno_nome, tipo_mov, data_mov)
--   VALUES (
--     v_unidade, v_ano, v_mes,
--     CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,
--     TG_OP,
--     CASE WHEN TG_OP='DELETE' THEN OLD.aluno_nome ELSE NEW.aluno_nome END,
--     CASE WHEN TG_OP='DELETE' THEN OLD.tipo       ELSE NEW.tipo       END,
--     CASE WHEN TG_OP='DELETE' THEN OLD.data       ELSE NEW.data       END);
--   RETURN COALESCE(NEW, OLD);  -- operação em movimentacoes_admin continua normalmente
-- END IF;
-- -- ... UPDATE dados_mensais (só chega aqui se mês aberto) ...
```

---

## DDL Fase 3 — Frontend (comentado, independente das Fases 2)

```typescript
// AlunosPage.tsx (~linha 1400) e TabGestao.tsx (~linha 1340)
// Adicionar verificação antes de habilitar botão "Recalcular":

// const { data: competencia } = await supabase
//   .from('competencias_mensais')
//   .select('status')
//   .eq('unidade_id', unidadeAtual)
//   .eq('ano', competenciaFiltro.ano)
//   .eq('mes', competenciaFiltro.mes)
//   .maybeSingle();
//
// const mesFechado = competencia?.status === 'fechado'
//                 || competencia?.status === 'retificacao_pendente';
//
// <button
//   disabled={mesFechado || recalculando}
//   title={mesFechado
//     ? `Mês ${competenciaFiltro.mes}/${competenciaFiltro.ano} fechado — use retificação formal`
//     : 'Recalcular snapshot mensal'}
// >
//   Recalcular
// </button>
```

---

## Script do Piloto — CG / Maio 2026 (comentado, só após Fases 1+2+3)

```sql
-- ============================================================
-- PILOTO: Campo Grande / Maio 2026
-- ⚠️ NÃO EXECUTAR — só após Fases 1+2+3 validadas
-- ============================================================

-- Passo 1: Confirmar snapshot completo antes de fechar
SELECT
  u.nome, d.ano, d.mes,
  d.alunos_pagantes, d.alunos_ativos,
  d.ticket_medio, d.faturamento_estimado,
  d.evasoes, d.churn_rate, d.inadimplencia
FROM dados_mensais d
JOIN unidades u ON u.id = d.unidade_id
WHERE u.nome = 'Campo Grande' AND d.ano = 2026 AND d.mes = 5;
-- Esperado: alunos_pagantes=470, ticket_medio=368.66, faturamento_estimado=173270.20
-- churn_rate=2.77, evasoes=13, inadimplencia=0.00 (válido)

-- Passo 2: Fechar competência
-- SELECT public.fechar_competencia(
--   (SELECT id FROM unidades WHERE nome='Campo Grande'),
--   2026, 5,
--   'luciano@lamusic.com.br',
--   'Piloto P0.0 — competência mais auditada e validada'
-- );

-- Passo 3: Confirmar fechamento
-- SELECT status, fechado_em, fechado_por FROM competencias_mensais
-- WHERE unidade_id=(SELECT id FROM unidades WHERE nome='Campo Grande')
--   AND ano=2026 AND mes=5;

-- Passo 4: Testar guard — deve FALHAR com EXCEPTION
-- SELECT public.recalcular_dados_mensais(
--   2026, 5, (SELECT id FROM unidades WHERE nome='Campo Grande')
-- );
-- Esperado: EXCEPTION 'Competência 2026/5 da unidade "Campo Grande" está [fechado]...'

-- Passo 5: Testar trigger — inserir movimentação histórica
-- Verificar que INSERT em movimentacoes_admin com data em mai/2026 para CG:
-- a) grava normalmente em movimentacoes_admin
-- b) NÃO altera dados_mensais (evasoes/churn_rate de mai/2026 CG permanecem iguais)
-- c) gera linha em sync_evasao_bloqueios

-- Passo 6: Verificar audit_log após piloto — não deve aparecer UPDATE automático em CG mai/2026
-- SELECT acao, usuario, created_at,
--        (dados_novos->>'mes')::int as mes,
--        (dados_novos->>'evasoes') as evasoes
-- FROM audit_log
-- WHERE tabela='dados_mensais'
--   AND (dados_novos->>'mes')::int = 5
--   AND created_at > NOW() - INTERVAL '1 hour'
-- ORDER BY created_at DESC;

-- Passo 7 (rollback do piloto, se necessário)
-- UPDATE competencias_mensais SET status='aberto'
-- WHERE unidade_id=(SELECT id FROM unidades WHERE nome='Campo Grande')
--   AND ano=2026 AND mes=5;
-- (reversível enquanto trigger hard não estiver ativo)
```

---

## Riscos Restantes

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| **`is_admin()` retorna NULL em triggers** | Baixa — não usamos `is_admin()` em triggers | Trigger usa lookup direto em `competencias_mensais`, não `is_admin()` |
| **Fechamento parcial das 3 unidades** | Média — mês fica inconsistente no consolidado | Processo: fechar as 3 na mesma janela operacional; documentar SOP |
| **`recalcular_dados_mensais` acessível a `authenticated`** | Baixa enquanto sem meses fechados; cresce após Fase 5 | Guard (Fase 2) cobre após aplicado; aviso no frontend (Fase 3) |
| **REVOKE de `PUBLIC` em funções com callers existentes** | Baixa — `fechar` e `snapshot` não têm callers de `anon`/`PUBLIC` conhecidos | Verificar n8n/edge functions antes de executar REVOKE |
| **Retificação auto-aprovada** | Baixa para P0.0 — Alf/admin é quem retifica | Documentar como risco de auditoria; separar solicitante/aprovador depois |
| **sync_evasao_bloqueios cresce sem limpeza** | Baixa no curto prazo | Adicionar rotina de purge de registros > 90 dias depois; não blocking para P0.0 |
| **fechar_competencia ON CONFLICT DO UPDATE pode reabrir mês** | Alta se chamada duas vezes com status diferente | Adicionar guard: `IF status='fechado' THEN RAISE NOTICE ... RETURN;` sem alterar — já coberto no ON CONFLICT que só atualiza metadata |

---

## Checklist de Validação Antes de Executar Fase 1

```
BANCO
[ ] Confirmar que pg_cron não tem jobs relacionados a dados_mensais
    SELECT jobid, jobname FROM cron.job WHERE command ILIKE '%dados_mensais%';
    → deve retornar 0 linhas

[ ] Confirmar que competencias_mensais não existe ainda
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name='competencias_mensais');
    → deve retornar FALSE

[ ] Confirmar que is_admin() existe
    SELECT proname FROM pg_proc WHERE proname='is_admin' AND pronamespace=(
      SELECT oid FROM pg_namespace WHERE nspname='public');
    → deve retornar 1 linha

[ ] Confirmar que update_updated_at() existe (usada pelo trigger de competencias_mensais)
    SELECT proname FROM pg_proc WHERE proname='update_updated_at' AND pronamespace=(
      SELECT oid FROM pg_namespace WHERE nspname='public');
    → deve retornar 1 linha

[ ] Confirmar snapshot de CG/mai/2026 antes do piloto (pós-Fase 5)
    SELECT alunos_pagantes, ticket_medio, faturamento_estimado
    FROM dados_mensais d JOIN unidades u ON u.id=d.unidade_id
    WHERE u.nome='Campo Grande' AND d.ano=2026 AND d.mes=5;
    → alunos_pagantes=470, ticket_medio=368.66, faturamento_estimado=173270.20

N8N / EDGE FUNCTIONS
[ ] Confirmar que nenhum workflow n8n chama fechar_dados_mensais ou snapshot_dados_mensais
    (verificação manual via n8n MCP ou inspeção de workflows)

[ ] Confirmar que nenhuma edge function chama essas RPCs com service_role

AMBIENTE
[ ] Executar Fase 1 em horário de baixo tráfego (final de semana ou madrugada)
[ ] Ter backup recente de dados_mensais antes de executar qualquer fase
[ ] Ter Alf disponível para validar após Fase 1

APÓS FASE 1
[ ] Confirmar tabelas criadas: competencias_mensais, sync_evasao_bloqueios
[ ] Confirmar colunas adicionadas em dados_mensais_retificacoes
[ ] Confirmar RLS ativo em dados_mensais_retificacoes
[ ] Confirmar GRANTs: fechar e snapshot não acessíveis via anon/PUBLIC
[ ] Testar assert_competencia_aberta com tabela vazia — deve retornar sem erro
[ ] Testar fechar_competencia com snapshot zerado — deve EXCEPTION
[ ] Testar fechar_competencia com snapshot completo (CG mai/2026) — deve INSERIR linha
    (só no piloto, Fase 5+)
```

---

## O que Aprovar Agora

**Fase 1 — DDL estrutural completo acima.**

Justificativa: zero impacto em dados, comportamento e KPIs. Tabelas começam vazias;
REVOKEs corrigem exposição de segurança real sem afetar funcionalidade do sistema.

---

## O que NÃO Aprovar Agora

| Item | Por quê |
|------|---------|
| Guards nas RPCs (Fase 2) | Aguardar Fase 1 estável e validar que não há callers desconhecidos |
| Guard no trigger (Fase 2/3) | Idem — mudança mais invasiva |
| Frontend (Fase 3) | Pode ser paralelo, mas depende da Fase 1 no banco |
| Piloto CG/mai/2026 (Fase 5) | Depende de Fases 1+2+3 validadas |
| Fechar Jun/2026 | Mês aberto/preliminar — não fecha agora |
| Correções de KPI live | Fora do escopo P0.0 |
| Alterações em views ou AlunosPage | Fora do escopo P0.0 |

---

## Perguntas Finais

Apenas uma questão operacional ainda aberta:

**N8n / edge functions:** há algum workflow ou edge function que chama `fechar_dados_mensais`
ou `snapshot_dados_mensais` com `service_role`? Se sim, o REVOKE de `authenticated`
não os afeta (service_role continua com acesso), mas é importante documentar para
que esses callers não sejam surpreendidos pelo guard da Fase 2.

Se a resposta for "não há callers automatizados conhecidos além do cron já neutralizado",
a proposta está completa e pode ir para execução da Fase 1.
