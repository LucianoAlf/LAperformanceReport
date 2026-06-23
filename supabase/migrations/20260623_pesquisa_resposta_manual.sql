-- Lançamento manual de respostas da pesquisa pós-1ª aula (Sucesso do Aluno)
-- Para respostas coletadas fora do sistema (ex: enviadas manualmente antes da automação).

-- Distingue respostas lançadas manualmente das capturadas via WhatsApp
ALTER TABLE pesquisas_whatsapp
  ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

-- RLS está ativo sem policy de INSERT → grava via RPC SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.registrar_resposta_pesquisa_manual(
  p_aluno_id integer,
  p_nota integer,
  p_data date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_unidade_id uuid;
  v_id uuid;
  v_ts timestamptz;
BEGIN
  IF p_nota < 1 OR p_nota > 5 THEN
    RAISE EXCEPTION 'Nota deve estar entre 1 e 5 (recebido: %)', p_nota;
  END IF;

  SELECT unidade_id INTO v_unidade_id FROM alunos WHERE id = p_aluno_id;
  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Aluno % não encontrado', p_aluno_id;
  END IF;

  -- Meio-dia BRT (15:00 UTC) para a data cair no dia certo independente de fuso
  v_ts := (p_data::timestamp + interval '15 hours') AT TIME ZONE 'UTC';

  INSERT INTO pesquisas_whatsapp (
    aluno_id, unidade_id, tipo, enviado_em, enviado_ok,
    nota, respondido_em, manual
  ) VALUES (
    p_aluno_id, v_unidade_id, 'pos_primeira_aula', v_ts, true,
    p_nota, v_ts, true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_resposta_pesquisa_manual(integer, integer, date) TO authenticated;
