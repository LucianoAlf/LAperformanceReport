-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Novas colunas no leads para o CRM Pré-Atendimento
-- NENHUMA coluna existente é alterada ou removida

-- Pipeline: FK para tabela configurável (ajuste #1 aprovado)
ALTER TABLE leads ADD COLUMN etapa_pipeline_id INTEGER REFERENCES crm_pipeline_etapas(id);

-- Temperatura do lead
ALTER TABLE leads ADD COLUMN temperatura VARCHAR(10) DEFAULT 'quente'
  CHECK (temperatura IN ('quente', 'morno', 'frio'));

-- Faixa etária (LAMK = kids/teens, EMLA = adultos)
ALTER TABLE leads ADD COLUMN faixa_etaria VARCHAR(10)
  CHECK (faixa_etaria IN ('LAMK', 'EMLA'));

-- Tipo de agendamento
ALTER TABLE leads ADD COLUMN tipo_agendamento VARCHAR(20)
  CHECK (tipo_agendamento IN ('experimental', 'visita'));

-- Observações separadas para o professor
ALTER TABLE leads ADD COLUMN observacoes_professor TEXT;

-- Contadores de tentativas
ALTER TABLE leads ADD COLUMN qtd_tentativas_sem_resposta INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN qtd_desmarcacoes INTEGER DEFAULT 0;

-- Motivo não comparecimento: FK para lookup (ajuste #3 aprovado)
ALTER TABLE leads ADD COLUMN motivo_nao_comparecimento_id INTEGER REFERENCES crm_motivos_nao_comparecimento(id);

-- Atendimento: quem está cuidando do lead
ALTER TABLE leads ADD COLUMN atendido_por_id INTEGER REFERENCES colaboradores(id);
ALTER TABLE leads ADD COLUMN consultor_id INTEGER REFERENCES colaboradores(id);

-- Passagem de bastão Mila → Andreza
ALTER TABLE leads ADD COLUMN data_passagem_mila TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN motivo_passagem_mila VARCHAR(100);
ALTER TABLE leads ADD COLUMN qtd_mensagens_mila INTEGER DEFAULT 0;

-- Taxa de compromisso (no-show)
ALTER TABLE leads ADD COLUMN taxa_compromisso_cobrada BOOLEAN DEFAULT false;

-- Setar etapa padrão para leads existentes (novo_lead = id 1)
UPDATE leads SET etapa_pipeline_id = 1 WHERE etapa_pipeline_id IS NULL AND status = 'novo';
UPDATE leads SET etapa_pipeline_id = 10 WHERE etapa_pipeline_id IS NULL AND status = 'convertido';

-- Indexes para queries frequentes do CRM
CREATE INDEX idx_leads_etapa_pipeline ON leads(etapa_pipeline_id);
CREATE INDEX idx_leads_temperatura ON leads(temperatura);
CREATE INDEX idx_leads_atendido_por ON leads(atendido_por_id);
CREATE INDEX idx_leads_unidade_etapa ON leads(unidade_id, etapa_pipeline_id);
