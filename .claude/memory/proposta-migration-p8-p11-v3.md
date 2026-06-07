# Proposta de Migration — P8/P11: Snapshot Imutável + Audit Trail Mínimo (REVISÃO v3)

> Data: 2026-06-05 (revisão v3)
> Status: **PROPOSTA REVISADA** — aguardando aprovação do Alf antes de executar
> Direção aprovada: Opção A (Congelamento) + pedaço da B (Audit Trail)
> **NÃO EXECUTAR** sem aprovação explícita do Alf
> **Próxima etapa:** SELECT-only + esta proposta revisada (sem execução)

---

## 1. Resumo da Proposta (revisada)

**Problema:** `dados_mensais` permite UPSERT ilimitado. Qualquer recálculo sobrescreve o snapshot do mês. O Alf relatou perda de dados de abril.

**Decisões de negócio já aprovadas pelo Alf:**
- ✅ Histórico mensal deve ser preservado.
- ✅ Recalcular mês passado não pode sobrescrever dados sem audit trail.
- ✅ Não executar backfill automático.

**Solução em 3 camadas:**
1. **Congelamento** — impedir recálculo de meses já fechados
2. **Audit Trail** — guardar versão anterior antes de sobrescrever
3. **Descongelamento auditado** — descongelar só com motivo e registro

---

## 2. Changes Propostos (NÃO executar)

### 2.1 Schema: `dados_mensais` (ALTER TABLE)

```sql
ALTER TABLE dados_mensais
  ADD COLUMN IF NOT EXISTS congelado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS congelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS congelado_por UUID NULL,
  ADD COLUMN IF NOT EXISTS congelado_por_contexto TEXT DEFAULT 'unknown';
```

---

### 2.2 Schema: `dados_mensais_historico` (nova tabela)

**Correção v3:** `ON DELETE SET NULL` em vez de `ON DELETE CASCADE`. Audit trail não pode depender da existência eterna da linha principal.

```sql
CREATE TABLE IF NOT EXISTS dados_mensais_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID REFERENCES dados_mensais(id) ON DELETE SET NULL,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,

  -- Campos do snapshot (TODOS os campos de dados_mensais)
  alunos_ativos INTEGER,
  alunos_pagantes INTEGER,
  matriculas_ativas INTEGER,
  matriculas_banda INTEGER,
  matriculas_2_curso INTEGER,
  novas_matriculas INTEGER,
  evasoes INTEGER,
  churn_rate NUMERIC,
  ticket_medio NUMERIC,
  taxa_renovacao NUMERIC,
  tempo_permanencia NUMERIC,
  inadimplencia NUMERIC,
  reajuste_parcelas NUMERIC,
  -- NOTA: faturamento_estimado e saldo_liquido são GENERATED ALWAYS;
  -- copiar apenas se forem persistidos. Verificar SELECT de estrutura.

  -- Audit trail
  copiado_em TIMESTAMPTZ DEFAULT NOW(),
  copiado_por UUID NULL,  -- NULL permitido: service_role, cron, manual_sql
  copiado_por_contexto TEXT DEFAULT 'unknown',  -- 'auth_user' | 'service_role' | 'cron' | 'manual_sql' | 'unknown'
  motivo TEXT  -- ex: "recalculo manual", "correcao de bug", "ajuste de data_saida"
);

-- Índice para busca eficiente
CREATE INDEX idx_dados_mensais_historico_original 
  ON dados_mensais_historico(unidade_id, ano, mes, versao DESC);
```

---

### 2.3 Função: `recalcular_dados_mensais` (modificada)

**Correção v3:**
- Declarar `v_congelado_em` (variável faltava)
- Tratar `auth.uid()` nulo (service_role, cron)
- Copiar **todos** os campos no INSERT do histórico (incluindo `inadimplencia`)
- Registrar `copiado_por_contexto`

```sql
CREATE OR REPLACE FUNCTION public.recalcular_dados_mensais(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_fim_mes DATE;
  v_congelado BOOLEAN;
  v_congelado_em TIMESTAMPTZ;  -- CORRECAO v3: variavel faltava
BEGIN
  -- === NOVO: Verificar se snapshot está congelado ===
  SELECT congelado, congelado_em
    INTO v_congelado, v_congelado_em
  FROM dados_mensais
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes;

  IF v_congelado = true THEN
    RETURN jsonb_build_object(
      'erro', 'SNAPSHOT_CONGELADO',
      'mensagem', format('Snapshot de %s/%s já foi congelado em %s. Não pode ser recalculado.',
        p_mes, p_ano, COALESCE(v_congelado_em::TEXT, 'data desconhecida')),
      'status', 'bloqueado'
    );
  END IF;

  v_fim_mes := (DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1)) + INTERVAL '1 month - 1 day')::DATE;

  -- (cálculos existentes permanecem inalterados)
  -- ... (todas as variáveis de cálculo) ...

  -- === NOVO: Backup da versão atual antes de sobrescrever ===
  INSERT INTO dados_mensais_historico (
    original_id, unidade_id, ano, mes, versao,
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, inadimplencia, reajuste_parcelas,  -- CORRECAO v3: inadimplencia incluido
    copiado_em, copiado_por, copiado_por_contexto, motivo
  )
  SELECT
    id, unidade_id, ano, mes,
    COALESCE((SELECT MAX(versao) + 1 FROM dados_mensais_historico
              WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes), 1),
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, inadimplencia, reajuste_parcelas,  -- CORRECAO v3: inadimplencia incluido
    NOW(),
    auth.uid(),
    CASE
      WHEN auth.uid() IS NOT NULL THEN 'auth_user'
      WHEN current_user = 'service_role' THEN 'service_role'
      WHEN current_setting('application_name', true) LIKE '%cron%' THEN 'cron'
      ELSE 'unknown'
    END,
    'recalculo manual'
  FROM dados_mensais
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes;

  -- UPSERT existente (inalterado)
  INSERT INTO dados_mensais (...) VALUES (...)
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET ...;

  RETURN v_result;
END;
$$;
```

---

### 2.4 Função: `congelar_snapshot` (nova) — COM AUDIT TRAIL

**Correção v3:** Congelamento também registra no histórico: quem congelou, quando e o motivo.

```sql
CREATE OR REPLACE FUNCTION public.congelar_snapshot(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID DEFAULT NULL,  -- NULL = todas as unidades
  p_motivo TEXT DEFAULT 'congelamento manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Registrar auditoria no histórico ANTES de congelar
  INSERT INTO dados_mensais_historico (
    original_id, unidade_id, ano, mes, versao,
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, inadimplencia, reajuste_parcelas,
    copiado_em, copiado_por, copiado_por_contexto, motivo
  )
  SELECT
    id, unidade_id, ano, mes,
    COALESCE((SELECT MAX(versao) + 1 FROM dados_mensais_historico h
              WHERE h.unidade_id = dados_mensais.unidade_id
                AND h.ano = dados_mensais.ano
                AND h.mes = dados_mensais.mes), 1),
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, inadimplencia, reajuste_parcelas,
    NOW(),
    auth.uid(),
    CASE
      WHEN auth.uid() IS NOT NULL THEN 'auth_user'
      WHEN current_user = 'service_role' THEN 'service_role'
      WHEN current_setting('application_name', true) LIKE '%cron%' THEN 'cron'
      ELSE 'unknown'
    END,
    'CONGELAMENTO: ' || p_motivo
  FROM dados_mensais
  WHERE (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    AND ano = p_ano AND mes = p_mes
    AND (congelado IS NULL OR congelado = false);  -- CORRECAO v3: auditar SÓ o que vai mudar

  -- Agora congelar
  IF p_unidade_id IS NOT NULL THEN
    UPDATE dados_mensais
    SET congelado = true,
        congelado_em = NOW(),
        congelado_por = auth.uid(),
        congelado_por_contexto = CASE
          WHEN auth.uid() IS NOT NULL THEN 'auth_user'
          WHEN current_user = 'service_role' THEN 'service_role'
          WHEN current_setting('application_name', true) LIKE '%cron%' THEN 'cron'
          ELSE 'unknown'
        END
    WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes
      AND (congelado IS NULL OR congelado = false);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    UPDATE dados_mensais
    SET congelado = true,
        congelado_em = NOW(),
        congelado_por = auth.uid(),
        congelado_por_contexto = CASE
          WHEN auth.uid() IS NOT NULL THEN 'auth_user'
          WHEN current_user = 'service_role' THEN 'service_role'
          WHEN current_setting('application_name', true) LIKE '%cron%' THEN 'cron'
          ELSE 'unknown'
        END
    WHERE ano = p_ano AND mes = p_mes
      AND (congelado IS NULL OR congelado = false);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'acao', 'congelamento',
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'motivo', p_motivo,
    'snapshots_congelados', v_count,
    'congelado_em', NOW()
  );
END;
$$;
```

---

### 2.5 Função: `descongelar_snapshot` (nova) — AUDITADA

**Correção v3:** Descongelar não pode ser UPDATE solto. Precisa ser função auditada com motivo obrigatório.

```sql
CREATE OR REPLACE FUNCTION public.descongelar_snapshot(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID,
  p_motivo TEXT  -- OBRIGATORIO
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Validar motivo
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RETURN jsonb_build_object(
      'erro', 'MOTIVO_OBRIGATORIO',
      'mensagem', 'Descongelar snapshot exige motivo obrigatório.',
      'status', 'bloqueado'
    );
  END IF;

  -- Registrar auditoria antes de descongelar
  INSERT INTO dados_mensais_historico (
    original_id, unidade_id, ano, mes, versao,
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, inadimplencia, reajuste_parcelas,
    copiado_em, copiado_por, copiado_por_contexto, motivo
  )
  SELECT
    id, unidade_id, ano, mes,
    COALESCE((SELECT MAX(versao) + 1 FROM dados_mensais_historico
              WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes), 1),
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, inadimplencia, reajuste_parcelas,
    NOW(),
    auth.uid(),
    CASE
      WHEN auth.uid() IS NOT NULL THEN 'auth_user'
      WHEN current_user = 'service_role' THEN 'service_role'
      ELSE 'unknown'
    END,
    'DESCONGELAMENTO: ' || p_motivo
  FROM dados_mensais
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes;

  -- Agora descongelar (limpa TODOS os campos de congelamento)
  UPDATE dados_mensais
  SET congelado = false,
      congelado_em = NULL,
      congelado_por = NULL,
      congelado_por_contexto = NULL
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes
    AND congelado = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'acao', 'descongelamento',
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'motivo', p_motivo,
    'snapshots_descongelados', v_count,
    'descongelado_em', NOW()
  );
END;
$$;
```

---

### 2.6 Permissões / RLS (SUGESTÃO — confirmar estrutura real via SELECT antes de executar)

**⚠️ ATENÇÃO:** A tabela `perfis_usuario` e seus campos (`usuario_id`, `unidade_id`, `perfil`) precisam ser confirmados via SELECT antes de ativar RLS. Se a estrutura for diferente, ajustar as políticas.

**SELECTs de verificação (rodar antes de ativar RLS):**
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('perfis_usuario', 'usuarios', 'profiles', 'user_profiles')
ORDER BY table_name, ordinal_position;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Correção v3:** Definir quem pode fazer o quê antes de criar as funções.

| Ação | Quem pode | Como |
|------|-----------|------|
| Recalcular snapshot | Admin ou gestor da unidade | Via frontend (botão) ou RPC direta |
| Congelar snapshot | Admin apenas | Função `congelar_snapshot` |
| Descongelar snapshot | Admin apenas | Função `descongelar_snapshot` (motivo obrigatório) |
| Ler histórico | Admin + gestor da unidade | View/RPC de leitura |
| Cron auto-congelar | Service role | NÃO ativar sem aprovação final do Alf |

**RLS sugerido para `dados_mensais_historico` (SÓ ATIVAR APÓS CONFIRMAR ESTRUTURA):**

```sql
-- Política: gestor só vê histórico da sua unidade
ALTER TABLE dados_mensais_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historico_gestor_unidade" ON dados_mensais_historico
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM perfis_usuario
      WHERE usuario_id = auth.uid()
        AND unidade_id = dados_mensais_historico.unidade_id
    )
  );

CREATE POLICY "historico_admin_tudo" ON dados_mensais_historico
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM perfis_usuario
      WHERE usuario_id = auth.uid() AND perfil = 'admin'
    )
  );
```

---

### 2.7 Auto-congelamento (NÃO aprovado ainda)

**Correção v3:** Documentado como opcional. NÃO criar cron. NÃO ativar.

```sql
-- NÃO EXECUTAR — documentado apenas como opção futura
-- Aguardar decisão final do Alf

-- SELECT cron.schedule(
--   'congelar_snapshot_mensal',
--   '0 3 5 * *',
--   $cron$
--     SELECT congelar_snapshot(
--       EXTRACT(YEAR FROM (CURRENT_DATE - INTERVAL '1 month'))::INTEGER,
--       EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '1 month'))::INTEGER
--     );
--   $cron$
-- );
```

---

### 2.8 Frontend: Botão "Recalcular" com estado congelado

**Correção v3:** Não basta backend bloquear. Usuário precisa entender por que.

```typescript
// Em TabGestao.tsx e AlunosPage.tsx

// Adicionar check antes de chamar RPC:
const { data: snapshotData } = await supabase
  .from('dados_mensais')
  .select('congelado, congelado_em, congelado_por')
  .eq('unidade_id', unidade)
  .eq('ano', ano)
  .eq('mes', mes)
  .single();

if (snapshotData?.congelado) {
  toast.error(
    `Snapshot de ${mes}/${ano} já foi congelado em ${formatarData(snapshotData.congelado_em)}. ` +
    `Não pode ser recalculado. ` +
    `Entre em contato com o administrador se precisar corrigir dados.`
  );
  return;
}

// Botão deve mostrar tooltip explicativo quando desabilitado
// Tooltip: "Mês fechado em [data]. Para recalcular, solicite descongelamento ao admin."

// Chamada RPC existente
const { data, error } = await supabase.rpc('recalcular_dados_mensais', {
  p_ano: ano, p_mes: mes, p_unidade_id: unidade
});
```

---

## 3. Rollback / Descongelamento

**Correção v3:** Não usar UPDATE solto. Usar função auditada.

| Cenário | Ação |
|---------|------|
| Precisa recalcular mês congelado | Chamar `descongelar_snapshot(ano, mes, unidade, motivo)` |
| Erro encontrado no snapshot | Descongelar → corrigir dados → recalcular → congelar novamente |
| Restaurar versão anterior | Copiar linha do `dados_mensais_historico` para `dados_mensais` (script de backfill) |

---

## 4. Checklist de Aprovação (revisado v3)

Antes de executar esta migration, confirmar com Alf:

- [x] SELECTs de verificação gerados (arquivo `verificacao-p8-p11-select-only.md`)
- [ ] SELECTs de verificação **executados** e resultados revisados
- [ ] `dados_mensais` é tabela com UNIQUE (unidade_id, ano, mes)
- [ ] Tamanho da tabela permite adicionar histórico sem custo
- [ ] `faturamento_estimado` e `saldo_liquido` são GENERATED ALWAYS (não copiar para histórico)
- [ ] Meses que devem ser congelados AGORA (ex: janeiro-abril 2026)
- [ ] Meses que NÃO devem ser congelados ainda (ex: maio 2026, em auditoria)
- [ ] Quem pode recalcular? (Admin? Gestor da unidade?)
- [ ] Quem pode congelar? (Apenas admin?)
- [ ] Quem pode descongelar? (Apenas admin?)
- [ ] Auto-congelamento no dia 5: aprovar ou rejeitar?
- [ ] RLS em `dados_mensais_historico`: aprovar política sugerida?

---

## 5. Diff da Revisão v3 (correções do Alf)

| # | Problema na v1/v2 | Correção na v3 |
|---|-------------------|----------------|
| 1 | `v_congelado_em` não declarada na função | Adicionada no `DECLARE` com `SELECT congelado, congelado_em INTO` |
| 2 | `ON DELETE CASCADE` no histórico | `ON DELETE SET NULL` — audit trail independente |
| 3 | `inadimplencia` não copiada no INSERT do histórico | Incluída no SELECT/INSERT |
| 4 | Rollback era UPDATE solto | Função `descongelar_snapshot` auditada com motivo obrigatório |
| 5 | `auth.uid()` podia ser NULL | Tratado com `CASE` + campo `copiado_por_contexto` |
| 6 | Sem definição de permissões | Tabela de permissões + RLS sugerido (confirmar estrutura antes) |
| 7 | Frontend só desabilitava botão | Tooltip explicativo + instrução para contatar admin |
| 8 | Auto-congelamento como proposta ativa | Documentado como opcional, NÃO ativar |
| 9 | Frontend referencia `congelado_por` sem coluna | Colunas `congelado_por` e `congelado_por_contexto` adicionadas em `dados_mensais` |
| 10 | `congelar_snapshot` sem audit trail | Agora registra no histórico antes de congelar: quem, quando, motivo |
| 11 | Funções `SECURITY DEFINER` sem `search_path` | Adicionado `SET search_path = public` em todas as funções |
| 12 | RLS assume estrutura de `perfis_usuario` | Marcado como sugestão; SELECTs de verificação antes de ativar |

---

## 6. Riscos e Mitigações (revisado v3)

| Risco | Mitigação |
|-------|-----------|
| Migration falha e corrompe dados | Executar em staging primeiro. Backup `dados_mensais` antes. |
| `dados_mensais_historico` cresce muito | Índice eficiente. Se necessário, arquivar versões > 12 meses. |
| Usuário confundido com "snapshot congelado" | Tooltip no frontend + documento no canônico. |
| Precisa descongelar para corrigir bug | Função `descongelar_snapshot` com log de auditoria + motivo obrigatório. |
| Performance do backup antes de UPSERT | INSERT ... SELECT em CTE, atomic. Overhead mínimo. |
| auth.uid() NULL em cron/service role | Campo `copiado_por_contexto` identifica origem. |
| Usuário não-autorizado descongela | RLS + permissões definidas. Apenas admin pode descongelar. |

---

## 7. Status Atual

| Item | Status |
|------|--------|
| Canônico/skill | ✅ Aprovados como documentação |
| Migration P8/P11 v3 | ✅ Aprovada como desenho técnico |
| SELECT-only P8/P11 | ✅ Aprovado para executar |
| Staging / migration | 🚫 Aguardando resultados dos SELECTs |
| Produção | 🚫 Bloqueada até aprovação final |

---

## 8. Próxima Entrega Esperada

1. ✅ **SELECTs de verificação P8/P11** (arquivo já entregue)
2. ✅ **Migration revisada v3** (este documento)
3. ✅ **Diff documental** das correções
4. ⏳ **Resultado dos SELECTs** (aguardando execução pelo Alf/equipe)
5. ⏳ **Definição de meses a congelar** (ex: janeiro-abril 2026)
6. ⏳ **Confirmação de estrutura real de RLS/perfis**
7. ⏳ **Aprovação final do Alf** para staging/migration

**Proibido até aprovação final:**
- ❌ Não executar migration
- ❌ Não alterar banco
- ❌ Não alterar view/RPC
- ❌ Não rodar backfill
- ❌ Não executar CREATE OR REPLACE FUNCTION/TABLE/VIEW
- ❌ Não executar ALTER TABLE/UPDATE/DELETE/INSERT
- ❌ Não ativar cron
- ❌ Não mexer em produção
