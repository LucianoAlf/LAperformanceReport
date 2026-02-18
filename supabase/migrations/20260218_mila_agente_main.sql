-- ============================================================================
-- Migration: Adicionar funcionalidade do Agente Mila na Main
-- Data: 18/02/2026
-- Descrição: Cria tabelas, funções e policies necessárias para o agente Mila
-- IMPORTANTE: Todas as alterações são ADITIVAS - nenhum dado existente será perdido
-- ============================================================================

-- ============================================================================
-- 1. TABELA: whatsapp_caixas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_caixas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    numero VARCHAR(50),
    uazapi_url VARCHAR(500) NOT NULL,
    uazapi_token VARCHAR(500) NOT NULL,
    unidade_id UUID REFERENCES public.unidades(id),
    ativo BOOLEAN DEFAULT true,
    webhook_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_caixas IS 'Caixas de WhatsApp configuradas para cada unidade';

-- Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_caixas_unidade ON public.whatsapp_caixas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_caixas_ativo ON public.whatsapp_caixas(ativo);

-- RLS
ALTER TABLE public.whatsapp_caixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_caixas_select_all ON public.whatsapp_caixas
    FOR SELECT USING (true);

CREATE POLICY whatsapp_caixas_insert_auth ON public.whatsapp_caixas
    FOR INSERT WITH CHECK (true);

CREATE POLICY whatsapp_caixas_update_auth ON public.whatsapp_caixas
    FOR UPDATE USING (true);

CREATE POLICY whatsapp_caixas_delete_auth ON public.whatsapp_caixas
    FOR DELETE USING (true);

-- ============================================================================
-- 2. TABELA: mila_config
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mila_config (
    id SERIAL PRIMARY KEY,
    unidade_id UUID NOT NULL REFERENCES public.unidades(id),
    ativo BOOLEAN NOT NULL DEFAULT true,
    prompt_sistema TEXT NOT NULL,
    modelo_openai VARCHAR(50) NOT NULL DEFAULT 'gpt-4o',
    temperatura_modelo NUMERIC(3,2) NOT NULL DEFAULT 0.7,
    max_tokens INTEGER NOT NULL DEFAULT 500,
    base_conhecimento TEXT,
    horarios_disponiveis JSONB DEFAULT '{}'::jsonb,
    emusys_token VARCHAR(255),
    emusys_url VARCHAR(500) DEFAULT 'https://sys.emusys.com.br/w2bh99k_/api/criar_lead.php',
    nome_atendente VARCHAR(100),
    endereco_unidade TEXT,
    horario_funcionamento TEXT,
    cursos_disponiveis JSONB DEFAULT '[]'::jsonb,
    debounce_segundos INTEGER NOT NULL DEFAULT 8,
    max_mensagens_contexto INTEGER NOT NULL DEFAULT 20,
    whatsapp_consultor VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT mila_config_unidade_unique UNIQUE (unidade_id)
);

COMMENT ON TABLE public.mila_config IS 'Configuração do agente Mila por unidade';

-- RLS
ALTER TABLE public.mila_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY mila_config_select ON public.mila_config
    FOR SELECT USING (true);

CREATE POLICY mila_config_update ON public.mila_config
    FOR UPDATE USING (true) WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_mila_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mila_config_updated_at ON public.mila_config;
CREATE TRIGGER trigger_mila_config_updated_at
    BEFORE UPDATE ON public.mila_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_mila_config_updated_at();

-- ============================================================================
-- 3. TABELA: mila_message_buffer
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mila_message_buffer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id UUID NOT NULL,
    lead_id INTEGER NOT NULL,
    conteudo TEXT NOT NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'texto',
    created_at TIMESTAMPTZ DEFAULT now(),
    processado BOOLEAN NOT NULL DEFAULT false,
    processado_at TIMESTAMPTZ
);

COMMENT ON TABLE public.mila_message_buffer IS 'Buffer de mensagens para debounce do agente Mila';

-- Índices
CREATE INDEX IF NOT EXISTS idx_mila_buffer_conversa_pendente 
    ON public.mila_message_buffer(conversa_id, processado) 
    WHERE processado = false;

CREATE INDEX IF NOT EXISTS idx_mila_buffer_created 
    ON public.mila_message_buffer(created_at);

-- RLS
ALTER TABLE public.mila_message_buffer ENABLE ROW LEVEL SECURITY;

CREATE POLICY mila_buffer_service_role ON public.mila_message_buffer
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 4. COLUNA: crm_conversas.caixa_id (nullable)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'crm_conversas' AND column_name = 'caixa_id'
    ) THEN
        ALTER TABLE public.crm_conversas ADD COLUMN caixa_id INTEGER;
    END IF;
END $$;

-- ============================================================================
-- 5. FUNÇÃO: resetar_teste_mila
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resetar_teste_mila(p_lead_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_conversa_id uuid;
  v_msgs_deletadas int;
  v_buffer_deletado int;
BEGIN
  SELECT id INTO v_conversa_id FROM crm_conversas WHERE lead_id = p_lead_id LIMIT 1;
  
  IF v_conversa_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversa não encontrada para este lead');
  END IF;

  DELETE FROM crm_mensagens WHERE conversa_id = v_conversa_id;
  GET DIAGNOSTICS v_msgs_deletadas = ROW_COUNT;

  DELETE FROM mila_message_buffer WHERE conversa_id = v_conversa_id;
  GET DIAGNOSTICS v_buffer_deletado = ROW_COUNT;

  UPDATE crm_conversas SET
    status = 'aberta', atribuido_a = 'mila', mila_pausada = false,
    mila_pausada_em = NULL, mila_pausada_por = NULL, nao_lidas = 0,
    ultima_mensagem_at = NULL, ultima_mensagem_preview = NULL, updated_at = NOW()
  WHERE id = v_conversa_id;

  UPDATE leads SET
    status = 'novo', etapa_pipeline_id = 1, temperatura = NULL,
    curso_interesse_id = NULL, canal_origem_id = NULL, faixa_etaria = NULL,
    experimental_agendada = false, data_experimental = NULL, horario_experimental = NULL,
    professor_experimental_id = NULL, experimental_realizada = false,
    faltou_experimental = false, converteu = false, data_conversao = NULL,
    qtd_mensagens_mila = 0, qtd_tentativas_sem_resposta = 0,
    data_passagem_mila = NULL, motivo_passagem_mila = NULL,
    observacoes = NULL, updated_at = NOW()
  WHERE id = p_lead_id;

  RETURN jsonb_build_object(
    'success', true, 'mensagens_deletadas', v_msgs_deletadas,
    'buffer_deletado', v_buffer_deletado, 'conversa_id', v_conversa_id
  );
END;
$function$;

COMMENT ON FUNCTION public.resetar_teste_mila IS 'Reseta um lead para teste do agente Mila';

-- ============================================================================
-- 6. FUNÇÃO: limpar_mila_buffer_antigo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.limpar_mila_buffer_antigo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM mila_message_buffer
  WHERE processado = true
  AND processado_at < now() - interval '24 hours';
END;
$function$;

COMMENT ON FUNCTION public.limpar_mila_buffer_antigo IS 'Limpa mensagens processadas há mais de 24h do buffer da Mila';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
