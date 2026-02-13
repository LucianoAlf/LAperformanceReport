-- ============================================================
-- MIGRATION 2: Triggers e RPCs para crm_conversas/crm_mensagens
-- Painel Conversacional WhatsApp — MVP-A
-- Data: 2026-02-13
-- ============================================================

-- ============================================================
-- TRIGGER: Atualizar crm_conversas quando mensagem é inserida
-- ============================================================
CREATE OR REPLACE FUNCTION atualizar_conversa_on_mensagem()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_conversas SET
    ultima_mensagem_at = NEW.created_at,
    ultima_mensagem_preview = CASE 
      WHEN NEW.is_sistema THEN ultima_mensagem_preview
      WHEN NEW.tipo = 'texto' THEN LEFT(NEW.conteudo, 100)
      WHEN NEW.tipo = 'imagem' THEN '📷 Imagem'
      WHEN NEW.tipo = 'audio' THEN '🎤 Áudio'
      WHEN NEW.tipo = 'video' THEN '🎬 Vídeo'
      WHEN NEW.tipo = 'documento' THEN '📎 ' || COALESCE(NEW.midia_nome, 'Documento')
      WHEN NEW.tipo = 'sticker' THEN '🏷️ Figurinha'
      WHEN NEW.tipo = 'localizacao' THEN '📍 Localização'
      WHEN NEW.tipo = 'contato' THEN '👤 Contato'
      ELSE LEFT(NEW.conteudo, 100)
    END,
    nao_lidas = CASE 
      WHEN NEW.direcao = 'entrada' THEN nao_lidas + 1 
      ELSE nao_lidas 
    END,
    updated_at = NOW()
  WHERE id = NEW.conversa_id;
  
  -- Atualizar data_ultimo_contato no lead
  UPDATE leads SET 
    data_ultimo_contato = NOW(),
    updated_at = NOW()
  WHERE id = NEW.lead_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_atualizar_conversa_on_mensagem
  AFTER INSERT ON crm_mensagens
  FOR EACH ROW EXECUTE FUNCTION atualizar_conversa_on_mensagem();

COMMENT ON FUNCTION atualizar_conversa_on_mensagem IS 'Atualiza preview, timestamp e contador de não lidas na conversa quando uma mensagem é inserida';

-- ============================================================
-- TRIGGER: Preencher unidade_id automaticamente ao criar conversa
-- ============================================================
CREATE OR REPLACE FUNCTION preencher_unidade_conversa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unidade_id IS NULL THEN
    SELECT unidade_id INTO NEW.unidade_id
    FROM leads WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_preencher_unidade_conversa
  BEFORE INSERT ON crm_conversas
  FOR EACH ROW EXECUTE FUNCTION preencher_unidade_conversa();

COMMENT ON FUNCTION preencher_unidade_conversa IS 'Preenche unidade_id automaticamente a partir do lead ao criar conversa';

-- ============================================================
-- TRIGGER: updated_at automático em crm_conversas
-- ============================================================
CREATE OR REPLACE FUNCTION atualizar_updated_at_conversas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_updated_at_conversas
  BEFORE UPDATE ON crm_conversas
  FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at_conversas();

-- ============================================================
-- RPC: Marcar conversa como lida (reseta nao_lidas para 0)
-- Chamada pelo frontend quando Andreza abre/visualiza a conversa
-- ============================================================
CREATE OR REPLACE FUNCTION marcar_conversa_lida(p_conversa_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_conversas 
  SET nao_lidas = 0, updated_at = NOW()
  WHERE id = p_conversa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION marcar_conversa_lida IS 'Reseta contador de não lidas quando Andreza abre a conversa. Frontend chama via supabase.rpc()';

-- ============================================================
-- RPC: Pausar/Retomar Mila em uma conversa
-- Insere mensagem de sistema automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION toggle_mila_conversa(
  p_conversa_id UUID,
  p_pausar BOOLEAN,
  p_operador VARCHAR DEFAULT 'andreza'
)
RETURNS JSON AS $$
DECLARE
  v_lead_id INTEGER;
  v_msg_id UUID;
  v_conteudo TEXT;
BEGIN
  -- Buscar lead_id
  SELECT lead_id INTO v_lead_id FROM crm_conversas WHERE id = p_conversa_id;
  
  IF v_lead_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Conversa não encontrada');
  END IF;

  -- Atualizar conversa
  UPDATE crm_conversas SET
    mila_pausada = p_pausar,
    mila_pausada_em = CASE WHEN p_pausar THEN NOW() ELSE NULL END,
    mila_pausada_por = CASE WHEN p_pausar THEN p_operador ELSE NULL END,
    atribuido_a = CASE WHEN p_pausar THEN 'andreza' ELSE 'mila' END,
    updated_at = NOW()
  WHERE id = p_conversa_id;

  -- Definir conteúdo da mensagem de sistema
  IF p_pausar THEN
    v_conteudo := '👩 Andreza assumiu a conversa — Mila pausada';
  ELSE
    v_conteudo := '🤖 Mila retomou o atendimento';
  END IF;

  -- Inserir mensagem de sistema
  INSERT INTO crm_mensagens (conversa_id, lead_id, direcao, tipo, conteudo, remetente, remetente_nome, is_sistema)
  VALUES (p_conversa_id, v_lead_id, 'saida', 'sistema', v_conteudo, 'sistema', p_operador, true)
  RETURNING id INTO v_msg_id;

  -- Registrar no histórico do lead
  INSERT INTO crm_lead_historico (lead_id, tipo, descricao, created_by)
  VALUES (
    v_lead_id,
    CASE WHEN p_pausar THEN 'mila_pausada' ELSE 'mila_retomada' END,
    v_conteudo,
    NULL
  );

  RETURN json_build_object(
    'success', true, 
    'mensagem_id', v_msg_id,
    'mila_pausada', p_pausar
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION toggle_mila_conversa IS 'Pausa ou retoma a Mila em uma conversa. Insere mensagem de sistema e registra no histórico do lead.';

-- ============================================================
-- RPC: Criar conversa sob demanda (quando lead ainda não tem)
-- ============================================================
CREATE OR REPLACE FUNCTION criar_conversa_lead(
  p_lead_id INTEGER,
  p_atribuido_a VARCHAR DEFAULT 'andreza'
)
RETURNS JSON AS $$
DECLARE
  v_conversa_id UUID;
  v_existente UUID;
BEGIN
  -- Verificar se já existe
  SELECT id INTO v_existente FROM crm_conversas WHERE lead_id = p_lead_id;
  
  IF v_existente IS NOT NULL THEN
    RETURN json_build_object('success', true, 'conversa_id', v_existente, 'criada', false);
  END IF;

  -- Criar nova conversa (unidade_id preenchido pelo trigger)
  INSERT INTO crm_conversas (lead_id, atribuido_a, mila_pausada)
  VALUES (p_lead_id, p_atribuido_a, CASE WHEN p_atribuido_a = 'andreza' THEN true ELSE false END)
  RETURNING id INTO v_conversa_id;

  -- Registrar no histórico
  INSERT INTO crm_lead_historico (lead_id, tipo, descricao, created_by)
  VALUES (p_lead_id, 'conversa_criada', 'Conversa WhatsApp iniciada', NULL);

  RETURN json_build_object('success', true, 'conversa_id', v_conversa_id, 'criada', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION criar_conversa_lead IS 'Cria conversa sob demanda para um lead que ainda não tem. Retorna a existente se já houver.';
