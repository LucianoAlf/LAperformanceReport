-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualiza fn_audit_log para nao logar updates que so tocaram timestamps/contadores
-- sem alterar nenhum campo de negocio real
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_auth_uid UUID;
  v_usuario TEXT;
  v_origem TEXT;
  v_old JSONB;
  v_new JSONB;
  v_reg_id TEXT;
  v_claims TEXT;
BEGIN
  -- Capturar claims do JWT de forma segura
  BEGIN
    v_claims := current_setting('request.jwt.claims', true);
    IF v_claims IS NOT NULL AND v_claims != '' THEN
      v_usuario := v_claims::jsonb->>'email';
      -- Tentar cast para UUID apenas se parece UUID
      DECLARE
        v_sub TEXT;
      BEGIN
        v_sub := v_claims::jsonb->>'sub';
        IF v_sub IS NOT NULL AND v_sub ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          v_auth_uid := v_sub::uuid;
        END IF;
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_auth_uid := NULL;
    v_usuario := NULL;
  END;

  v_origem := CASE WHEN v_auth_uid IS NOT NULL THEN 'manual' ELSE 'system' END;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := to_jsonb(NEW);
  END IF;

  -- Skip audit quando update nao alterou nada relevante
  -- (ignora campos de tracking: updated_at, data_ultimo_contato, contadores Mila)
  IF TG_OP = 'UPDATE' THEN
    IF (v_old - 'updated_at' - 'data_ultimo_contato' - 'qtd_mensagens_mila' - 'data_passagem_mila')
       = (v_new - 'updated_at' - 'data_ultimo_contato' - 'qtd_mensagens_mila' - 'data_passagem_mila')
    THEN
      RETURN NEW;
    END IF;
  END IF;

  v_reg_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.id::text
    ELSE NEW.id::text
  END;

  BEGIN
    INSERT INTO audit_log (id, tabela, registro_id_text, acao, dados_antigos, dados_novos, usuario, auth_user_id, origem, created_at)
    VALUES (
      gen_random_uuid(),
      TG_TABLE_NAME,
      v_reg_id,
      TG_OP,
      v_old,
      v_new,
      COALESCE(v_usuario, 'system'),
      v_auth_uid,
      v_origem,
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[audit_log] Falha ao registrar: %', SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
