-- Normaliza whatsapp_message_id removendo o prefixo "<numero>:" que o UAZAPI põe
-- no campo `id` das mensagens enviadas por API (enviar-mensagem-admin grava com prefixo,
-- o webhook grava sem). Sem essa normalização, o dedup por igualdade exata (check em
-- webhook-whatsapp-inbox + UNIQUE index) não reconhece o eco da própria saída → duplica.
-- Com o formato unificado (sempre sem prefixo), o dedup funciona, permitindo remover
-- o filtro excludeMessages:["wasSentByApi"] e registrar as respostas do agente (Lia).

CREATE OR REPLACE FUNCTION normalizar_whatsapp_message_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.whatsapp_message_id IS NOT NULL THEN
    NEW.whatsapp_message_id := regexp_replace(NEW.whatsapp_message_id, '^[0-9]+:', '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalizar_wa_msg_id ON admin_mensagens;
CREATE TRIGGER trg_normalizar_wa_msg_id
  BEFORE INSERT OR UPDATE OF whatsapp_message_id ON admin_mensagens
  FOR EACH ROW EXECUTE FUNCTION normalizar_whatsapp_message_id();

DROP TRIGGER IF EXISTS trg_normalizar_wa_msg_id ON crm_mensagens;
CREATE TRIGGER trg_normalizar_wa_msg_id
  BEFORE INSERT OR UPDATE OF whatsapp_message_id ON crm_mensagens
  FOR EACH ROW EXECUTE FUNCTION normalizar_whatsapp_message_id();
