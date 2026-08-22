-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- PROGRAMA MATRICULADOR+ LA - TABELAS
-- =====================================================

-- 1. Configurações do Programa (editável pelo admin)
CREATE TABLE IF NOT EXISTS programa_matriculador_config (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL DEFAULT 2026,
  
  -- Metas de Taxa de Conversão (iguais para todos)
  meta_taxa_showup_experimental DECIMAL(5,2) NOT NULL DEFAULT 18.0,
  meta_taxa_experimental_matricula DECIMAL(5,2) NOT NULL DEFAULT 75.0,
  meta_taxa_lead_matricula DECIMAL(5,2) NOT NULL DEFAULT 13.5,
  
  -- Volume Médio Matrículas/Mês por unidade
  meta_volume_campo_grande INTEGER NOT NULL DEFAULT 25,
  meta_volume_recreio INTEGER NOT NULL DEFAULT 20,
  meta_volume_barra INTEGER NOT NULL DEFAULT 15,
  
  -- Ticket Médio Anual por unidade
  meta_ticket_campo_grande DECIMAL(10,2) NOT NULL DEFAULT 387.00,
  meta_ticket_recreio DECIMAL(10,2) NOT NULL DEFAULT 435.00,
  meta_ticket_barra DECIMAL(10,2) NOT NULL DEFAULT 450.00,
  
  -- Sistema de Pontuação
  pontos_taxa_showup INTEGER NOT NULL DEFAULT 20,
  pontos_taxa_exp_mat INTEGER NOT NULL DEFAULT 25,
  pontos_taxa_geral INTEGER NOT NULL DEFAULT 30,
  pontos_volume_medio INTEGER NOT NULL DEFAULT 15,
  pontos_ticket_medio INTEGER NOT NULL DEFAULT 10,
  
  -- Bônus por performance acima da meta
  bonus_taxa_showup_por_2pct INTEGER NOT NULL DEFAULT 5,
  bonus_taxa_exp_mat_por_5pct INTEGER NOT NULL DEFAULT 5,
  bonus_taxa_geral_por_1pct INTEGER NOT NULL DEFAULT 10,
  bonus_volume_por_2_acima INTEGER NOT NULL DEFAULT 5,
  bonus_ticket_por_20_acima INTEGER NOT NULL DEFAULT 5,
  
  -- Penalidades Emusys
  penalidade_nao_preencheu_emusys INTEGER NOT NULL DEFAULT 3,
  penalidade_nao_preencheu_lareport INTEGER NOT NULL DEFAULT 3,
  penalidade_lead_abandonado INTEGER NOT NULL DEFAULT 2,
  penalidade_reincidencia_mes INTEGER NOT NULL DEFAULT 5,
  
  -- Nota de Corte
  nota_corte INTEGER NOT NULL DEFAULT 80,
  
  -- Período do Programa
  mes_inicio INTEGER NOT NULL DEFAULT 1,
  mes_fim INTEGER NOT NULL DEFAULT 11,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ano)
);

-- 2. Penalidades Emusys (lançadas pela líder comercial)
CREATE TABLE IF NOT EXISTS programa_matriculador_penalidades (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL DEFAULT 2026,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  
  -- Tipo de penalidade
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN (
    'nao_preencheu_emusys',
    'nao_preencheu_lareport', 
    'lead_abandonado',
    'tarefas_atrasadas',
    'reincidencia',
    'outro'
  )),
  
  -- Detalhes
  descricao TEXT,
  pontos_descontados INTEGER NOT NULL DEFAULT 0,
  data_ocorrencia DATE NOT NULL,
  
  -- Quem registrou
  registrado_por TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Histórico mensal de métricas (para cálculo de médias)
CREATE TABLE IF NOT EXISTS programa_matriculador_historico (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  
  -- Métricas do mês
  total_leads INTEGER NOT NULL DEFAULT 0,
  experimentais_agendadas INTEGER NOT NULL DEFAULT 0,
  experimentais_realizadas INTEGER NOT NULL DEFAULT 0,
  matriculas INTEGER NOT NULL DEFAULT 0,
  
  -- Taxas calculadas
  taxa_showup_experimental DECIMAL(5,2) DEFAULT 0,
  taxa_experimental_matricula DECIMAL(5,2) DEFAULT 0,
  taxa_lead_matricula DECIMAL(5,2) DEFAULT 0,
  
  -- Ticket médio do mês
  ticket_medio DECIMAL(10,2) DEFAULT 0,
  
  -- Pontuação calculada do mês
  pontos_taxa_showup INTEGER DEFAULT 0,
  pontos_taxa_exp_mat INTEGER DEFAULT 0,
  pontos_taxa_geral INTEGER DEFAULT 0,
  pontos_volume INTEGER DEFAULT 0,
  pontos_ticket INTEGER DEFAULT 0,
  pontos_bonus INTEGER DEFAULT 0,
  penalidades_emusys INTEGER DEFAULT 0,
  pontos_total INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ano, mes, unidade_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_penalidades_ano ON programa_matriculador_penalidades(ano);
CREATE INDEX IF NOT EXISTS idx_penalidades_unidade ON programa_matriculador_penalidades(unidade_id);
CREATE INDEX IF NOT EXISTS idx_historico_ano_mes ON programa_matriculador_historico(ano, mes);
CREATE INDEX IF NOT EXISTS idx_historico_unidade ON programa_matriculador_historico(unidade_id);

-- Inserir configuração padrão para 2026
INSERT INTO programa_matriculador_config (ano)
VALUES (2026)
ON CONFLICT (ano) DO NOTHING;

-- Habilitar RLS
ALTER TABLE programa_matriculador_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa_matriculador_penalidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa_matriculador_historico ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (leitura para todos autenticados)
CREATE POLICY "Leitura config programa" ON programa_matriculador_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leitura penalidades programa" ON programa_matriculador_penalidades
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leitura historico programa" ON programa_matriculador_historico
  FOR SELECT TO authenticated USING (true);

-- Políticas de escrita (apenas para admins - via service role)
CREATE POLICY "Admin gerencia config" ON programa_matriculador_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin gerencia penalidades" ON programa_matriculador_penalidades
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin gerencia historico" ON programa_matriculador_historico
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
