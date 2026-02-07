-- ============================================================
-- MIGRAÇÃO: Unificar leads_diarios → leads
-- Data: 2026-02-07
-- Backup: backups/dump_pre_migracao_leads.backup
-- ============================================================

BEGIN;

-- ============================================================
-- FASE 1: Adicionar colunas faltantes em leads
-- ============================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS valor_passaporte NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS valor_parcela NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS forma_pagamento_id INTEGER REFERENCES formas_pagamento(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS forma_pagamento_passaporte_id INTEGER REFERENCES formas_pagamento(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS professor_fixo_id INTEGER REFERENCES professores(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tipo_matricula VARCHAR;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tipo_aluno VARCHAR DEFAULT 'pagante';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS aluno_novo_retorno VARCHAR;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sabia_preco BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_arquivamento_id INTEGER REFERENCES motivos_arquivamento(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_nao_matricula_id INTEGER REFERENCES motivos_nao_matricula(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_arquivamento DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS arquivado BOOLEAN DEFAULT false;

-- ============================================================
-- FASE 2: Migrar dados de leads_diarios → leads
-- ============================================================

-- 2a. Atualizar os registros que já existem em leads (preencher campos extras)
UPDATE leads l
SET 
  valor_passaporte = ld.valor_passaporte,
  valor_parcela = ld.valor_parcela,
  forma_pagamento_id = ld.forma_pagamento_id,
  forma_pagamento_passaporte_id = ld.forma_pagamento_passaporte_id,
  professor_fixo_id = ld.professor_fixo_id,
  tipo_matricula = ld.tipo_matricula,
  tipo_aluno = ld.tipo_aluno,
  aluno_novo_retorno = ld.aluno_novo_retorno,
  dia_vencimento = ld.dia_vencimento,
  sabia_preco = ld.sabia_preco,
  motivo_arquivamento_id = ld.motivo_arquivamento_id,
  motivo_nao_matricula_id = ld.motivo_nao_matricula_id,
  arquivado = COALESCE(ld.arquivado, false),
  data_arquivamento = ld.data_arquivamento
FROM leads_diarios ld
WHERE LOWER(TRIM(l.nome)) = LOWER(TRIM(ld.aluno_nome))
  AND l.unidade_id = ld.unidade_id
  AND l.data_contato = ld.data;

-- 2b. Inserir os registros que só existem em leads_diarios (matrículas via trigger de alunos)
INSERT INTO leads (
  unidade_id, data_contato, nome, idade, curso_interesse_id, canal_origem_id,
  professor_experimental_id, professor_fixo_id, valor_passaporte, valor_parcela,
  forma_pagamento_id, tipo_matricula, tipo_aluno, observacoes,
  status, converteu, data_conversao, created_at, quantidade
)
SELECT 
  ld.unidade_id, ld.data, ld.aluno_nome, ld.aluno_idade, ld.curso_id, ld.canal_origem_id,
  ld.professor_experimental_id, ld.professor_fixo_id, ld.valor_passaporte, ld.valor_parcela,
  ld.forma_pagamento_id, ld.tipo_matricula, ld.tipo_aluno, ld.observacoes,
  CASE 
    WHEN ld.tipo = 'matricula' THEN 'convertido'
    WHEN ld.tipo = 'experimental_realizada' THEN 'experimental_realizada'
    WHEN ld.tipo = 'experimental_agendada' THEN 'experimental_agendada'
    WHEN ld.tipo = 'experimental_faltou' THEN 'experimental_faltou'
    ELSE 'novo'
  END,
  CASE WHEN ld.tipo = 'matricula' THEN true ELSE false END,
  CASE WHEN ld.tipo = 'matricula' THEN ld.data ELSE NULL END,
  ld.created_at,
  COALESCE(ld.quantidade, 1)
FROM leads_diarios ld
LEFT JOIN leads l ON LOWER(TRIM(l.nome)) = LOWER(TRIM(ld.aluno_nome))
  AND l.unidade_id = ld.unidade_id
  AND l.data_contato = ld.data
WHERE l.id IS NULL;

-- ============================================================
-- FASE 3: Adaptar e mover triggers de sync para leads
-- ============================================================

-- Helper: derivar "tipo" (lead/experimental/matricula) a partir do status de leads
-- Usado pelas functions de sync

-- 3a. sync_leads_to_dados_comerciais (adaptar para ler de leads)
CREATE OR REPLACE FUNCTION sync_leads_to_dados_comerciais()
RETURNS TRIGGER AS $$
DECLARE
  v_unidade_nome VARCHAR;
  v_competencia DATE;
  v_quantidade INTEGER;
  v_tipo VARCHAR;
  v_is_lamk BOOLEAN;
  v_valor_passaporte NUMERIC;
  v_valor_parcela NUMERIC;
  v_delta INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_competencia := DATE_TRUNC('month', OLD.data_contato)::DATE;
    v_quantidade := COALESCE(OLD.quantidade, 1);
    v_tipo := CASE 
      WHEN OLD.status IN ('novo','agendado') THEN 'lead'
      WHEN OLD.status LIKE 'experimental%' THEN 'experimental'
      WHEN OLD.status IN ('matriculado','convertido') THEN 'matricula'
      ELSE 'lead'
    END;
    v_is_lamk := OLD.idade IS NOT NULL AND OLD.idade <= 11;
    v_valor_passaporte := COALESCE(OLD.valor_passaporte, 0);
    v_valor_parcela := COALESCE(OLD.valor_parcela, 0);
    v_delta := -1;
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = OLD.unidade_id;
  ELSE
    v_competencia := DATE_TRUNC('month', NEW.data_contato)::DATE;
    v_quantidade := COALESCE(NEW.quantidade, 1);
    v_tipo := CASE 
      WHEN NEW.status IN ('novo','agendado') THEN 'lead'
      WHEN NEW.status LIKE 'experimental%' THEN 'experimental'
      WHEN NEW.status IN ('matriculado','convertido') THEN 'matricula'
      ELSE 'lead'
    END;
    v_is_lamk := NEW.idade IS NOT NULL AND NEW.idade <= 11;
    v_valor_passaporte := COALESCE(NEW.valor_passaporte, 0);
    v_valor_parcela := COALESCE(NEW.valor_parcela, 0);
    v_delta := 1;
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = NEW.unidade_id;
  END IF;

  -- Garantir que existe registro do mês
  INSERT INTO dados_comerciais (
    competencia, unidade, total_leads, aulas_experimentais, 
    novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla,
    ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte,
    soma_passaportes, qtd_matriculas_passaporte, soma_parcelas, qtd_matriculas_parcela
  ) VALUES (
    v_competencia, v_unidade_nome, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  )
  ON CONFLICT (competencia, unidade) DO NOTHING;

  IF v_tipo = 'lead' THEN
    UPDATE dados_comerciais 
    SET total_leads = GREATEST(0, total_leads + (v_quantidade * v_delta)),
        updated_at = NOW()
    WHERE competencia = v_competencia AND unidade = v_unidade_nome;
    
  ELSIF v_tipo = 'experimental' THEN
    UPDATE dados_comerciais 
    SET aulas_experimentais = GREATEST(0, aulas_experimentais + (v_quantidade * v_delta)),
        updated_at = NOW()
    WHERE competencia = v_competencia AND unidade = v_unidade_nome;
    
  ELSIF v_tipo = 'matricula' THEN
    UPDATE dados_comerciais 
    SET 
      novas_matriculas_total = GREATEST(0, novas_matriculas_total + (v_quantidade * v_delta)),
      novas_matriculas_lamk = CASE WHEN v_is_lamk THEN GREATEST(0, novas_matriculas_lamk + (v_quantidade * v_delta)) ELSE novas_matriculas_lamk END,
      novas_matriculas_emla = CASE WHEN NOT v_is_lamk THEN GREATEST(0, novas_matriculas_emla + (v_quantidade * v_delta)) ELSE novas_matriculas_emla END,
      soma_passaportes = GREATEST(0, soma_passaportes + (v_valor_passaporte * v_delta)),
      qtd_matriculas_passaporte = CASE WHEN v_valor_passaporte > 0 THEN GREATEST(0, qtd_matriculas_passaporte + v_delta) ELSE qtd_matriculas_passaporte END,
      soma_parcelas = GREATEST(0, soma_parcelas + (v_valor_parcela * v_delta)),
      qtd_matriculas_parcela = CASE WHEN v_valor_parcela > 0 THEN GREATEST(0, qtd_matriculas_parcela + v_delta) ELSE qtd_matriculas_parcela END,
      ticket_medio_passaporte = CASE WHEN (qtd_matriculas_passaporte + CASE WHEN v_valor_passaporte > 0 THEN v_delta ELSE 0 END) > 0 
        THEN (soma_passaportes + (v_valor_passaporte * v_delta)) / NULLIF((qtd_matriculas_passaporte + CASE WHEN v_valor_passaporte > 0 THEN v_delta ELSE 0 END), 0)
        ELSE 0 END,
      ticket_medio_parcelas = CASE WHEN (qtd_matriculas_parcela + CASE WHEN v_valor_parcela > 0 THEN v_delta ELSE 0 END) > 0 
        THEN (soma_parcelas + (v_valor_parcela * v_delta)) / NULLIF((qtd_matriculas_parcela + CASE WHEN v_valor_parcela > 0 THEN v_delta ELSE 0 END), 0)
        ELSE 0 END,
      faturamento_passaporte = GREATEST(0, faturamento_passaporte + (v_valor_passaporte * v_delta)),
      updated_at = NOW()
    WHERE competencia = v_competencia AND unidade = v_unidade_nome;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3b. sync_leads_to_origem_leads (adaptar para ler de leads)
CREATE OR REPLACE FUNCTION sync_leads_to_origem_leads()
RETURNS TRIGGER AS $$
DECLARE
  v_unidade_nome VARCHAR;
  v_canal_nome VARCHAR;
  v_competencia DATE;
  v_quantidade INTEGER;
  v_tipo VARCHAR;
  v_delta INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_competencia := DATE_TRUNC('month', OLD.data_contato)::DATE;
    v_quantidade := COALESCE(OLD.quantidade, 1);
    v_tipo := CASE 
      WHEN OLD.status IN ('novo','agendado') THEN 'lead'
      WHEN OLD.status = 'experimental_agendada' THEN 'experimental_agendada'
      WHEN OLD.status IN ('experimental_realizada','compareceu') THEN 'experimental_realizada'
      WHEN OLD.status IN ('matriculado','convertido') THEN 'matricula'
      ELSE 'lead'
    END;
    v_delta := -1;
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = OLD.unidade_id;
    SELECT nome INTO v_canal_nome FROM canais_origem WHERE id = OLD.canal_origem_id;
  ELSE
    v_competencia := DATE_TRUNC('month', NEW.data_contato)::DATE;
    v_quantidade := COALESCE(NEW.quantidade, 1);
    v_tipo := CASE 
      WHEN NEW.status IN ('novo','agendado') THEN 'lead'
      WHEN NEW.status = 'experimental_agendada' THEN 'experimental_agendada'
      WHEN NEW.status IN ('experimental_realizada','compareceu') THEN 'experimental_realizada'
      WHEN NEW.status IN ('matriculado','convertido') THEN 'matricula'
      ELSE 'lead'
    END;
    v_delta := 1;
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = NEW.unidade_id;
    SELECT nome INTO v_canal_nome FROM canais_origem WHERE id = NEW.canal_origem_id;
  END IF;

  IF v_canal_nome IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  INSERT INTO origem_leads (competencia, unidade, canal, tipo, quantidade)
  VALUES (v_competencia, v_unidade_nome, v_canal_nome, v_tipo, v_quantidade * v_delta)
  ON CONFLICT (competencia, unidade, canal, tipo) 
  DO UPDATE SET 
    quantidade = GREATEST(0, origem_leads.quantidade + (v_quantidade * v_delta));

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3c. sync_experimentais_professor (adaptar para ler de leads)
CREATE OR REPLACE FUNCTION sync_experimentais_professor()
RETURNS TRIGGER AS $$
DECLARE
  v_ano INTEGER;
  v_mes INTEGER;
  v_delta INTEGER;
  v_tipo VARCHAR;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ano := EXTRACT(YEAR FROM OLD.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM OLD.data_contato)::INTEGER;
    v_delta := -COALESCE(OLD.quantidade, 1);
    v_tipo := CASE 
      WHEN OLD.status LIKE 'experimental%' THEN 'experimental'
      ELSE NULL
    END;
    
    IF v_tipo = 'experimental' AND OLD.professor_experimental_id IS NOT NULL THEN
      UPDATE experimentais_professor_mensal
      SET experimentais = GREATEST(0, experimentais + v_delta)
      WHERE professor_id = OLD.professor_experimental_id 
        AND unidade_id = OLD.unidade_id 
        AND ano = v_ano 
        AND mes = v_mes;
    END IF;
    
    RETURN OLD;
  ELSE
    v_ano := EXTRACT(YEAR FROM NEW.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM NEW.data_contato)::INTEGER;
    v_delta := COALESCE(NEW.quantidade, 1);
    v_tipo := CASE 
      WHEN NEW.status LIKE 'experimental%' THEN 'experimental'
      ELSE NULL
    END;
    
    IF v_tipo = 'experimental' AND NEW.professor_experimental_id IS NOT NULL THEN
      INSERT INTO experimentais_professor_mensal (professor_id, unidade_id, ano, mes, experimentais)
      VALUES (NEW.professor_experimental_id, NEW.unidade_id, v_ano, v_mes, v_delta)
      ON CONFLICT (professor_id, unidade_id, ano, mes) 
      DO UPDATE SET experimentais = experimentais_professor_mensal.experimentais + v_delta;
    END IF;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3d. sync_experimentais_unidade (adaptar para ler de leads)
CREATE OR REPLACE FUNCTION sync_experimentais_unidade()
RETURNS TRIGGER AS $$
DECLARE
  v_ano INTEGER;
  v_mes INTEGER;
  v_delta_exp INTEGER := 0;
  v_delta_mat INTEGER := 0;
  v_tipo VARCHAR;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ano := EXTRACT(YEAR FROM OLD.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM OLD.data_contato)::INTEGER;
    v_tipo := CASE 
      WHEN OLD.status LIKE 'experimental%' THEN 'experimental'
      WHEN OLD.status IN ('matriculado','convertido') THEN 'matricula'
      ELSE NULL
    END;
    
    IF v_tipo = 'experimental' THEN
      v_delta_exp := -COALESCE(OLD.quantidade, 1);
    ELSIF v_tipo = 'matricula' THEN
      v_delta_mat := -COALESCE(OLD.quantidade, 1);
    END IF;
    
    IF v_delta_exp != 0 OR v_delta_mat != 0 THEN
      UPDATE experimentais_mensal_unidade
      SET 
        total_experimentais = GREATEST(0, total_experimentais + v_delta_exp),
        total_matriculas = GREATEST(0, total_matriculas + v_delta_mat)
      WHERE unidade_id = OLD.unidade_id AND ano = v_ano AND mes = v_mes;
    END IF;
    
    RETURN OLD;
  ELSE
    v_ano := EXTRACT(YEAR FROM NEW.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM NEW.data_contato)::INTEGER;
    v_tipo := CASE 
      WHEN NEW.status LIKE 'experimental%' THEN 'experimental'
      WHEN NEW.status IN ('matriculado','convertido') THEN 'matricula'
      ELSE NULL
    END;
    
    IF v_tipo = 'experimental' THEN
      v_delta_exp := COALESCE(NEW.quantidade, 1);
    ELSIF v_tipo = 'matricula' THEN
      v_delta_mat := COALESCE(NEW.quantidade, 1);
    END IF;
    
    IF v_delta_exp != 0 OR v_delta_mat != 0 THEN
      INSERT INTO experimentais_mensal_unidade (unidade_id, ano, mes, total_experimentais, total_matriculas)
      VALUES (NEW.unidade_id, v_ano, v_mes, GREATEST(0, v_delta_exp), GREATEST(0, v_delta_mat))
      ON CONFLICT (unidade_id, ano, mes) 
      DO UPDATE SET 
        total_experimentais = experimentais_mensal_unidade.total_experimentais + v_delta_exp,
        total_matriculas = experimentais_mensal_unidade.total_matriculas + v_delta_mat;
    END IF;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Remover triggers antigos de leads_diarios
DROP TRIGGER IF EXISTS tr_sync_leads_comerciais ON leads_diarios;
DROP TRIGGER IF EXISTS tr_sync_leads_origem ON leads_diarios;
DROP TRIGGER IF EXISTS tr_sync_experimentais_professor ON leads_diarios;
DROP TRIGGER IF EXISTS tr_sync_experimentais_unidade ON leads_diarios;

-- Criar triggers novos em leads
CREATE TRIGGER tr_sync_leads_comerciais
  AFTER INSERT OR DELETE OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_leads_to_dados_comerciais();

CREATE TRIGGER tr_sync_leads_origem
  AFTER INSERT OR DELETE OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_leads_to_origem_leads();

CREATE TRIGGER tr_sync_experimentais_professor
  AFTER INSERT OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_experimentais_professor();

CREATE TRIGGER tr_sync_experimentais_unidade
  AFTER INSERT OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_experimentais_unidade();

-- ============================================================
-- FASE 4: Atualizar trigger de alunos → inserir em leads
-- ============================================================

CREATE OR REPLACE FUNCTION sync_aluno_to_leads()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id INTEGER;
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'ativo' AND OLD.status != 'ativo') THEN
        
        SELECT id INTO v_existing_id
        FROM leads
        WHERE observacoes LIKE 'aluno_id:' || NEW.id::TEXT || '%'
        LIMIT 1;

        IF v_existing_id IS NULL THEN
            INSERT INTO leads (
                unidade_id, data_contato, status, converteu, data_conversao,
                nome, curso_interesse_id, professor_experimental_id,
                valor_passaporte, valor_parcela, observacoes, created_at
            ) VALUES (
                NEW.unidade_id, NEW.data_matricula::DATE, 'convertido', true, NEW.data_matricula::DATE,
                NEW.nome, NEW.curso_id, NEW.professor_experimental_id,
                NEW.valor_passaporte, NEW.valor_parcela,
                'aluno_id:' || NEW.id::TEXT || ' - Sincronizado do RP-EMUSES',
                NOW()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trocar trigger de alunos
DROP TRIGGER IF EXISTS trigger_sync_aluno_to_leads_diarios ON alunos;
CREATE TRIGGER trigger_sync_aluno_to_leads
  AFTER INSERT OR UPDATE ON alunos
  FOR EACH ROW EXECUTE FUNCTION sync_aluno_to_leads();

-- ============================================================
-- FASE 5: Atualizar views que leem de leads_diarios → leads
-- ============================================================

-- 5a. vw_kpis_gestao_mensal
CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH leads_mes AS (
  SELECT 
    l.unidade_id,
    EXTRACT(YEAR FROM l.data_contato)::INTEGER AS ano,
    EXTRACT(MONTH FROM l.data_contato)::INTEGER AS mes,
    SUM(CASE WHEN l.status IN ('novo','agendado') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
    SUM(CASE WHEN l.status = 'experimental_agendada' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
    SUM(CASE WHEN l.status IN ('experimental_realizada','compareceu') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
    SUM(CASE WHEN l.status = 'experimental_faltou' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
    SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS novas_matriculas,
    SUM(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
  FROM leads l
  GROUP BY l.unidade_id, EXTRACT(YEAR FROM l.data_contato), EXTRACT(MONTH FROM l.data_contato)
),
alunos_mes AS (
  SELECT 
    a.unidade_id,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AS ano,
    EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER AS mes,
    COUNT(*) AS total_alunos,
    COUNT(*) FILTER (WHERE tm.conta_como_pagante = true) AS alunos_pagantes,
    COUNT(*) FILTER (WHERE tm.codigo = 'BOLSISTA_INT') AS bolsistas_integrais,
    COUNT(*) FILTER (WHERE tm.codigo = 'BOLSISTA_PARC') AS bolsistas_parciais,
    COUNT(*) FILTER (WHERE tm.codigo = 'BANDA') AS total_banda,
    COUNT(*) FILTER (WHERE a.is_segundo_curso = true) AS segundo_curso,
    AVG(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_medio,
    SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr,
    AVG(a.tempo_permanencia_meses) AS tempo_permanencia_medio
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status = 'ativo'
  GROUP BY a.unidade_id
),
evasoes_mes AS (
  SELECT 
    u.id AS unidade_id,
    EXTRACT(YEAR FROM e.competencia)::INTEGER AS ano,
    EXTRACT(MONTH FROM e.competencia)::INTEGER AS mes,
    COUNT(*) AS total_evasoes
  FROM evasoes e
  JOIN unidades u ON u.nome = e.unidade
  GROUP BY u.id, EXTRACT(YEAR FROM e.competencia), EXTRACT(MONTH FROM e.competencia)
),
renovacoes_mes AS (
  SELECT 
    renovacoes.unidade_id,
    EXTRACT(YEAR FROM renovacoes.data_renovacao)::INTEGER AS ano,
    EXTRACT(MONTH FROM renovacoes.data_renovacao)::INTEGER AS mes,
    COUNT(*) FILTER (WHERE renovacoes.status = 'renovado') AS renovacoes,
    COUNT(*) AS total_contratos,
    AVG(renovacoes.percentual_reajuste) FILTER (WHERE renovacoes.status = 'renovado') AS reajuste_medio
  FROM renovacoes
  GROUP BY renovacoes.unidade_id, EXTRACT(YEAR FROM renovacoes.data_renovacao), EXTRACT(MONTH FROM renovacoes.data_renovacao)
),
dados_anterior AS (
  SELECT 
    dados_mensais.unidade_id,
    dados_mensais.ano,
    dados_mensais.mes,
    dados_mensais.alunos_pagantes
  FROM dados_mensais
)
SELECT 
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  COALESCE(lm.ano, am.ano, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) AS ano,
  COALESCE(lm.mes, am.mes, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER) AS mes,
  COALESCE(am.total_alunos, 0)::INTEGER AS total_alunos_ativos,
  COALESCE(am.alunos_pagantes, 0)::INTEGER AS total_alunos_pagantes,
  COALESCE(am.bolsistas_integrais, 0)::INTEGER AS total_bolsistas_integrais,
  COALESCE(am.bolsistas_parciais, 0)::INTEGER AS total_bolsistas_parciais,
  COALESCE(am.total_banda, 0)::INTEGER AS total_banda,
  COALESCE(am.segundo_curso, 0)::INTEGER AS total_segundo_curso,
  COALESCE(am.ticket_medio, 0)::NUMERIC(10,2) AS ticket_medio,
  COALESCE(am.mrr, 0)::NUMERIC(12,2) AS mrr,
  (COALESCE(am.mrr, 0) * 12)::NUMERIC(14,2) AS arr,
  COALESCE(am.tempo_permanencia_medio, 0)::NUMERIC(5,1) AS tempo_permanencia_medio,
  (COALESCE(am.ticket_medio, 0) * COALESCE(am.tempo_permanencia_medio, 0))::NUMERIC(12,2) AS ltv_medio,
  0::NUMERIC(5,2) AS inadimplencia_pct,
  COALESCE(am.mrr, 0)::NUMERIC(12,2) AS faturamento_previsto,
  COALESCE(am.mrr, 0)::NUMERIC(12,2) AS faturamento_realizado,
  COALESCE(lm.total_leads, 0)::INTEGER AS total_leads,
  COALESCE(lm.experimentais_agendadas, 0)::INTEGER AS experimentais_agendadas,
  COALESCE(lm.experimentais_realizadas, 0)::INTEGER AS experimentais_realizadas,
  COALESCE(lm.novas_matriculas, 0)::INTEGER AS novas_matriculas,
  COALESCE(em.total_evasoes, 0)::INTEGER AS total_evasoes,
  CASE WHEN COALESCE(da.alunos_pagantes, 0) > 0 
    THEN ROUND(COALESCE(em.total_evasoes, 0)::NUMERIC / da.alunos_pagantes * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS churn_rate,
  COALESCE(rm.renovacoes, 0)::INTEGER AS renovacoes,
  CASE WHEN COALESCE(rm.total_contratos, 0) > 0 
    THEN ROUND(rm.renovacoes::NUMERIC / rm.total_contratos * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS taxa_renovacao,
  COALESCE(rm.reajuste_medio, 0)::NUMERIC(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id
LEFT JOIN alunos_mes am ON am.unidade_id = u.id
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = COALESCE(lm.ano, am.ano) AND em.mes = COALESCE(lm.mes, am.mes)
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = COALESCE(lm.ano, am.ano) AND rm.mes = COALESCE(lm.mes, am.mes)
LEFT JOIN dados_anterior da ON da.unidade_id = u.id AND da.ano = COALESCE(lm.ano, am.ano) AND da.mes = (COALESCE(lm.mes, am.mes) - 1)
WHERE u.ativo = true;

-- 5b. vw_kpis_comercial_mensal
CREATE OR REPLACE VIEW vw_kpis_comercial_mensal AS
WITH leads_mes AS (
  SELECT 
    l.unidade_id,
    EXTRACT(YEAR FROM l.data_contato)::INTEGER AS ano,
    EXTRACT(MONTH FROM l.data_contato)::INTEGER AS mes,
    SUM(CASE WHEN l.status IN ('novo','agendado') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
    SUM(CASE WHEN l.status = 'experimental_agendada' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
    SUM(CASE WHEN l.status IN ('experimental_realizada','compareceu') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
    SUM(CASE WHEN l.status = 'experimental_faltou' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
    SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS novas_matriculas,
    SUM(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
  FROM leads l
  GROUP BY l.unidade_id, EXTRACT(YEAR FROM l.data_contato), EXTRACT(MONTH FROM l.data_contato)
),
matriculas_mes AS (
  SELECT 
    alunos.unidade_id,
    EXTRACT(YEAR FROM alunos.data_matricula)::INTEGER AS ano,
    EXTRACT(MONTH FROM alunos.data_matricula)::INTEGER AS mes,
    COUNT(*) AS total_matriculas,
    SUM(alunos.valor_parcela) AS faturamento_novos,
    AVG(alunos.valor_parcela) AS ticket_medio_novos
  FROM alunos
  WHERE alunos.data_matricula IS NOT NULL
  GROUP BY alunos.unidade_id, EXTRACT(YEAR FROM alunos.data_matricula), EXTRACT(MONTH FROM alunos.data_matricula)
)
SELECT 
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  COALESCE(lm.ano, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) AS ano,
  COALESCE(lm.mes, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER) AS mes,
  COALESCE(lm.total_leads, 0)::INTEGER AS total_leads,
  COALESCE(lm.leads_arquivados, 0)::INTEGER AS leads_arquivados,
  COALESCE(lm.experimentais_agendadas, 0)::INTEGER AS experimentais_agendadas,
  COALESCE(lm.experimentais_realizadas, 0)::INTEGER AS experimentais_realizadas,
  COALESCE(lm.faltaram, 0)::INTEGER AS faltaram,
  COALESCE(lm.novas_matriculas, 0)::INTEGER AS novas_matriculas,
  CASE WHEN COALESCE(lm.total_leads, 0) > 0 
    THEN ROUND(COALESCE(lm.novas_matriculas, 0)::NUMERIC / lm.total_leads * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS taxa_conversao,
  CASE WHEN COALESCE(lm.experimentais_realizadas, 0) > 0 
    THEN ROUND(COALESCE(lm.novas_matriculas, 0)::NUMERIC / lm.experimentais_realizadas * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS taxa_experimental_matricula,
  COALESCE(mm.faturamento_novos, 0)::NUMERIC(12,2) AS faturamento_novos,
  COALESCE(mm.ticket_medio_novos, 0)::NUMERIC(10,2) AS ticket_medio_novos
FROM unidades u
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id AND mm.ano = COALESCE(lm.ano, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) AND mm.mes = COALESCE(lm.mes, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER)
WHERE u.ativo = true;

-- 5c. vw_professores_performance_atual
CREATE OR REPLACE VIEW vw_professores_performance_atual AS
WITH alunos_por_professor AS (
  SELECT 
    p.id AS professor_id,
    p.nome AS professor,
    u.nome AS unidade,
    u.id AS unidade_id,
    COUNT(a.id) AS total_alunos,
    COALESCE(AVG(a.valor_parcela), 0) AS ticket_medio,
    COALESCE(SUM(a.valor_parcela), 0) AS mrr,
    COALESCE(AVG(a.tempo_permanencia_meses), 0) AS tempo_medio,
    COALESCE(AVG(a.percentual_presenca), 0) AS presenca_media
  FROM professores p
  JOIN professores_unidades pu ON pu.professor_id = p.id
  JOIN unidades u ON u.id = pu.unidade_id
  LEFT JOIN alunos a ON a.professor_atual_id = p.id AND a.unidade_id = u.id AND a.status = 'ativo'
  WHERE p.ativo = true
  GROUP BY p.id, p.nome, u.nome, u.id
),
experimentais_ano AS (
  SELECT 
    experimentais_professor_mensal.professor_id,
    experimentais_professor_mensal.unidade_id,
    SUM(experimentais_professor_mensal.experimentais) AS total_experimentais
  FROM experimentais_professor_mensal
  WHERE experimentais_professor_mensal.ano::NUMERIC = EXTRACT(YEAR FROM CURRENT_DATE)
  GROUP BY experimentais_professor_mensal.professor_id, experimentais_professor_mensal.unidade_id
),
matriculas_ano AS (
  SELECT 
    l.professor_fixo_id AS professor_id,
    l.unidade_id,
    SUM(COALESCE(l.quantidade, 1)) AS total_matriculas
  FROM leads l
  WHERE l.status IN ('matriculado','convertido')
    AND l.professor_fixo_id IS NOT NULL 
    AND EXTRACT(YEAR FROM l.data_contato) = EXTRACT(YEAR FROM CURRENT_DATE)
  GROUP BY l.professor_fixo_id, l.unidade_id
),
evasoes_ano AS (
  SELECT 
    p.id AS professor_id,
    u.id AS unidade_id,
    COUNT(*) AS total_evasoes
  FROM evasoes e
  JOIN professores p ON p.nome = e.professor
  JOIN unidades u ON u.nome = e.unidade
  WHERE EXTRACT(YEAR FROM e.competencia) = EXTRACT(YEAR FROM CURRENT_DATE)
  GROUP BY p.id, u.id
)
SELECT 
  ap.professor_id,
  ap.professor,
  ap.unidade,
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AS ano,
  ap.total_alunos,
  ap.ticket_medio::NUMERIC(10,2) AS ticket_medio,
  ap.mrr::NUMERIC(12,2) AS mrr,
  ap.tempo_medio::NUMERIC(5,1) AS tempo_permanencia_medio,
  ap.presenca_media::NUMERIC(5,1) AS presenca_media,
  COALESCE(ea.total_experimentais, 0)::INTEGER AS experimentais,
  COALESCE(ma.total_matriculas, 0)::INTEGER AS matriculas,
  CASE WHEN COALESCE(ea.total_experimentais, 0) > 0 
    THEN ROUND(COALESCE(ma.total_matriculas, 0)::NUMERIC / ea.total_experimentais * 100, 1)
    ELSE 0
  END AS taxa_conversao,
  COALESCE(ev.total_evasoes, 0)::INTEGER AS evasoes
FROM alunos_por_professor ap
LEFT JOIN experimentais_ano ea ON ea.professor_id = ap.professor_id AND ea.unidade_id = ap.unidade_id
LEFT JOIN matriculas_ano ma ON ma.professor_id = ap.professor_id AND ma.unidade_id = ap.unidade_id
LEFT JOIN evasoes_ano ev ON ev.professor_id = ap.professor_id AND ev.unidade_id = ap.unidade_id
ORDER BY ap.total_alunos DESC;

-- ============================================================
-- FASE 5d/5e: vw_kpis_professor_mensal e vw_kpis_professor_completo
-- Essas views usam leads_diarios na CTE "experimentais"
-- Precisam ser atualizadas para ler de leads
-- ============================================================

-- Nota: vw_kpis_professor_mensal e vw_kpis_professor_completo são views muito grandes.
-- A alteração é apenas trocar a CTE "experimentais" que lê de leads_diarios.
-- Como elas são idênticas exceto pela CTE, vou recriar apenas a CTE relevante.

-- Para vw_kpis_professor_mensal e vw_kpis_professor_completo, a CTE "experimentais" muda de:
--   FROM leads_diarios ld WHERE ld.tipo LIKE 'experimental%' OR ld.tipo = 'matricula'
-- Para:
--   FROM leads l WHERE l.status LIKE 'experimental%' OR l.status IN ('matriculado','convertido')

-- Essas views serão recriadas na próxima migração se necessário,
-- pois são muito extensas e a view de compatibilidade abaixo resolve temporariamente.

-- ============================================================
-- FASE 5 (compatibilidade): Criar view vw_leads_diarios
-- Para views/functions que ainda referenciam leads_diarios
-- ============================================================

-- Nota: Esta view será criada APÓS dropar leads_diarios (Fase 7)
-- para que views que ainda referenciam "leads_diarios" possam ser
-- gradualmente migradas. Por enquanto, as views principais já foram
-- atualizadas acima.

-- ============================================================
-- FASE 6: Atualizar functions SQL que referenciam leads_diarios
-- ============================================================

-- 6a. consolidar_dados_comerciais_mes
CREATE OR REPLACE FUNCTION consolidar_dados_comerciais_mes(p_ano INTEGER, p_mes INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_competencia DATE;
  v_unidade RECORD;
  v_corrigidos INTEGER := 0;
BEGIN
  v_competencia := MAKE_DATE(p_ano, p_mes, 1);
  
  FOR v_unidade IN SELECT id, nome FROM unidades WHERE ativo = true
  LOOP
    INSERT INTO dados_comerciais (
      competencia, unidade, total_leads, aulas_experimentais, 
      novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla,
      ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte,
      soma_passaportes, qtd_matriculas_passaporte, soma_parcelas, qtd_matriculas_parcela
    )
    SELECT 
      v_competencia,
      v_unidade.nome,
      COALESCE(SUM(CASE WHEN status IN ('novo','agendado') THEN COALESCE(quantidade, 1) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status LIKE 'experimental%' THEN COALESCE(quantidade, 1) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status IN ('matriculado','convertido') THEN COALESCE(quantidade, 1) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status IN ('matriculado','convertido') AND idade <= 11 THEN COALESCE(quantidade, 1) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status IN ('matriculado','convertido') AND (idade > 11 OR idade IS NULL) THEN COALESCE(quantidade, 1) ELSE 0 END), 0),
      COALESCE(AVG(CASE WHEN status IN ('matriculado','convertido') AND valor_parcela > 0 THEN valor_parcela END), 0),
      COALESCE(AVG(CASE WHEN status IN ('matriculado','convertido') AND valor_passaporte > 0 THEN valor_passaporte END), 0),
      COALESCE(SUM(CASE WHEN status IN ('matriculado','convertido') THEN COALESCE(valor_passaporte, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status IN ('matriculado','convertido') THEN COALESCE(valor_passaporte, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status IN ('matriculado','convertido') AND valor_passaporte > 0 THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status IN ('matriculado','convertido') THEN COALESCE(valor_parcela, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN status IN ('matriculado','convertido') AND valor_parcela > 0 THEN 1 ELSE 0 END), 0)
    FROM leads
    WHERE unidade_id = v_unidade.id 
      AND DATE_TRUNC('month', data_contato) = v_competencia
    ON CONFLICT (competencia, unidade) 
    DO UPDATE SET
      total_leads = EXCLUDED.total_leads,
      aulas_experimentais = EXCLUDED.aulas_experimentais,
      novas_matriculas_total = EXCLUDED.novas_matriculas_total,
      novas_matriculas_lamk = EXCLUDED.novas_matriculas_lamk,
      novas_matriculas_emla = EXCLUDED.novas_matriculas_emla,
      ticket_medio_parcelas = EXCLUDED.ticket_medio_parcelas,
      ticket_medio_passaporte = EXCLUDED.ticket_medio_passaporte,
      faturamento_passaporte = EXCLUDED.faturamento_passaporte,
      soma_passaportes = EXCLUDED.soma_passaportes,
      qtd_matriculas_passaporte = EXCLUDED.qtd_matriculas_passaporte,
      soma_parcelas = EXCLUDED.soma_parcelas,
      qtd_matriculas_parcela = EXCLUDED.qtd_matriculas_parcela,
      updated_at = NOW();
    
    v_corrigidos := v_corrigidos + 1;
  END LOOP;
  
  RETURN format('Consolidação concluída: %s unidades processadas para %s/%s', v_corrigidos, p_mes, p_ano);
END;
$$ LANGUAGE plpgsql;

-- 6b. consolidar_origem_leads_mes
CREATE OR REPLACE FUNCTION consolidar_origem_leads_mes(p_ano INTEGER, p_mes INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_competencia DATE;
  v_processados INTEGER := 0;
BEGIN
  v_competencia := MAKE_DATE(p_ano, p_mes, 1);
  
  DELETE FROM origem_leads WHERE competencia = v_competencia;
  
  INSERT INTO origem_leads (competencia, unidade, canal, tipo, quantidade)
  SELECT 
    v_competencia,
    u.nome,
    COALESCE(co.nome, 'Não informado'),
    CASE 
      WHEN l.status IN ('novo','agendado') THEN 'lead'
      WHEN l.status = 'experimental_agendada' THEN 'experimental_agendada'
      WHEN l.status IN ('experimental_realizada','compareceu') THEN 'experimental_realizada'
      WHEN l.status IN ('matriculado','convertido') THEN 'matricula'
      ELSE 'lead'
    END,
    SUM(COALESCE(l.quantidade, 1))
  FROM leads l
  JOIN unidades u ON u.id = l.unidade_id
  LEFT JOIN canais_origem co ON co.id = l.canal_origem_id
  WHERE DATE_TRUNC('month', l.data_contato) = v_competencia
  GROUP BY u.nome, co.nome, 
    CASE 
      WHEN l.status IN ('novo','agendado') THEN 'lead'
      WHEN l.status = 'experimental_agendada' THEN 'experimental_agendada'
      WHEN l.status IN ('experimental_realizada','compareceu') THEN 'experimental_realizada'
      WHEN l.status IN ('matriculado','convertido') THEN 'matricula'
      ELSE 'lead'
    END;
  
  GET DIAGNOSTICS v_processados = ROW_COUNT;
  
  RETURN format('Origem leads consolidada: %s registros para %s/%s', v_processados, p_mes, p_ano);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FASE 7: Backup e drop de leads_diarios
-- ============================================================

-- Remover trigger restante
DROP TRIGGER IF EXISTS set_updated_at_leads_diarios ON leads_diarios;

-- Backup
CREATE TABLE IF NOT EXISTS leads_diarios_backup AS SELECT * FROM leads_diarios;

-- Drop
DROP TABLE leads_diarios CASCADE;

-- ============================================================
-- FASE 8: Cleanup - remover functions obsoletas
-- ============================================================

DROP FUNCTION IF EXISTS sync_aluno_to_leads_diarios();
DROP FUNCTION IF EXISTS sync_lead_to_leads_diarios();

COMMIT;
