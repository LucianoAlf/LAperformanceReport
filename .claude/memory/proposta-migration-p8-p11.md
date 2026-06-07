# Proposta de Migration — P8/P11: Snapshot Imutável + Audit Trail Mínimo

> Data: 2026-06-05
> Status: **PROPOSTA** — aguardando aprovação do Alf antes de executar
> Direção aprovada: Opção A (Congelamento) + pedaço da B (Audit Trail)
> NÃO EXECUTAR sem aprovação explícita do Alf

---

## 1. Resumo da Proposta

**Problema:** `dados_mensais` permite UPSERT ilimitado. Qualquer recálculo sobrescreve o snapshot do mês. O Alf relatou perda de dados de abril.

**Solução em 2 camadas:**
1. **Congelamento** — impedir recálculo de meses já fechados
2. **Audit Trail** — guardar versão anterior antes de sobrescrever

---

## 2. Changes Propostos (NÃO executar)

### 2.1 Schema: `dados_mensais`

Adicionar 2 colunas:

```sql
ALTER TABLE dados_mensais
  ADD COLUMN IF NOT EXISTS congelado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS congelado_em TIMESTAMPTZ;
```

### 2.2 Schema: `dados_mensais_historico` (nova tabela)

```sql
CREATE TABLE IF NOT EXISTS dados_mensais_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID REFERENCES dados_mensais(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,

  -- Campos do snapshot (mesmo schema de dados_mensais)
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

  -- Audit trail
  copiado_em TIMESTAMPTZ DEFAULT NOW(),
  copiado_por UUID REFERENCES auth.users(id),
  motivo TEXT  -- ex: "recalculo manual", "correcao de bug", "ajuste de data_saida"
);

-- Índice para busca eficiente
CREATE INDEX idx_dados_mensais_historico_original 
  ON dados_mensais_historico(unidade_id, ano, mes, versao DESC);
```

### 2.3 Função: `recalcular_dados_mensais` (modificada)

```sql
CREATE OR REPLACE FUNCTION public.recalcular_dados_mensais(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_fim_mes DATE;
  v_congelado BOOLEAN;
  -- (outras variáveis existentes permanecem)
BEGIN
  -- === NOVO: Verificar se snapshot está congelado ===
  SELECT congelado INTO v_congelado
  FROM dados_mensais
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes;

  IF v_congelado = true THEN
    RETURN jsonb_build_object(
      'erro', 'SNAPSHOT_CONGELADO',
      'mensagem', format('Snapshot de %s/%s já foi congelado em %s. Não pode ser recalculado.',
        p_mes, p_ano, v_congelado_em::TEXT),
      'status', 'bloqueado'
    );
  END IF;

  v_fim_mes := (DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1)) + INTERVAL '1 month - 1 day')::DATE;

  -- (cálculos existentes permanecem inalterados)
  -- ... (linhas 1-12 do cálculo) ...

  -- === NOVO: Backup da versão atual antes de sobrescrever ===
  INSERT INTO dados_mensais_historico (
    original_id, unidade_id, ano, mes, versao,
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, reajuste_parcelas,
    copiado_em, copiado_por, motivo
  )
  SELECT
    id, unidade_id, ano, mes,
    COALESCE((SELECT MAX(versao) + 1 FROM dados_mensais_historico
              WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes), 1),
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, reajuste_parcelas,
    NOW(), auth.uid(), 'recalculo manual'
  FROM dados_mensais
  WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes;

  -- UPSERT existente (inalterado)
  INSERT INTO dados_mensais (...) VALUES (...)
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET ...;

  RETURN v_result;
END;
$$;
```

### 2.4 Função: `congelar_snapshot` (nova)

```sql
CREATE OR REPLACE FUNCTION public.congelar_snapshot(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID DEFAULT NULL  -- NULL = todas as unidades
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_unidade_id IS NOT NULL THEN
    UPDATE dados_mensais
    SET congelado = true, congelado_em = NOW()
    WHERE unidade_id = p_unidade_id AND ano = p_ano AND mes = p_mes
      AND (congelado IS NULL OR congelado = false);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    UPDATE dados_mensais
    SET congelado = true, congelado_em = NOW()
    WHERE ano = p_ano AND mes = p_mes
      AND (congelado IS NULL OR congelado = false);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'acao', 'congelamento',
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'snapshots_congelados', v_count,
    'congelado_em', NOW()
  );
END;
$$;
```

### 2.5 Trigger de auto-congelamento (opcional)

```sql
-- Se quiser congelar automaticamente no dia 5 do mês seguinte
-- (pode ser feito via cron ou manualmente pelo Alf)

-- Exemplo de cron (só proposta, não ativar sem teste):
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

### 2.6 Frontend: Botão "Recalcular" com estado congelado

```typescript
// Em TabGestao.tsx e AlunosPage.tsx
// Adicionar check antes de chamar RPC:

const { data: snapshotData } = await supabase
  .from('dados_mensais')
  .select('congelado, congelado_em')
  .eq('unidade_id', unidade)
  .eq('ano', ano)
  .eq('mes', mes)
  .single();

if (snapshotData?.congelado) {
  toast.error(`Snapshot de ${mes}/${ano} já foi congelado em ${formatarData(snapshotData.congelado_em)}. Não pode ser recalculado.`);
  return;
}

// Chamada RPC existente
const { data, error } = await supabase.rpc('recalcular_dados_mensais', {
  p_ano: ano, p_mes: mes, p_unidade_id: unidade
});
```

---

## 3. Rollback

Se precisar descongelar um snapshot (ex: erro encontrado no mês):

```sql
UPDATE dados_mensais
SET congelado = false, congelado_em = NULL
WHERE ano = 2026 AND mes = 4 AND unidade_id = '...';
```

Para restaurar versão anterior do histórico:

```sql
-- (requer script de backfill, não trivial)
-- Copiar linha do historico para dados_mensais
```

---

## 4. Checklist de Aprovação

Antes de executar esta migration, confirmar com Alf:

- [ ] SELECTs de verificação executados e resultados revisados
- [ ] `dados_mensais` é tabela com UNIQUE (unidade_id, ano, mes)
- [ ] Tamanho da tabela permite adicionar histórico sem custo
- [ ] Meses que devem ser congelados AGORA (ex: janeiro-abril 2026)
- [ ] Meses que NÃO devem ser congelados ainda (ex: maio 2026, em auditoria)
- [ ] Quem pode executar `congelar_snapshot`? (Só admin? Qualquer gestor?)
- [ ] Quer auto-congelamento no dia 5, ou manual sempre?
- [ ] Quer audit trail com `motivo` obrigatório?

---

## 5. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Migration falha e corrompe dados | Executar em staging primeiro. Backup `dados_mensais` antes. |
| `dados_mensais_historico` cresce muito | Índice eficiente. Se necessário, arquivar versões > 12 meses. |
| Usuário confundido com "snapshot congelado" | Tooltip no frontend explicando. Documento no canônico. |
| Precisa descongelar para corrigir bug | Funcao `descongelar_snapshot` com log de auditoria. |
| Performance do backup antes de UPSERT | INSERT ... SELECT em CTE, atomic. Overhead mínimo. |
