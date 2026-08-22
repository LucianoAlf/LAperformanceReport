-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Auditoria de saúde das conversas admin — retorna 1 linha por categoria COM problema.
-- Usada pela Sol (heartbeat) para alertar no Telegram. Read-only (STABLE).
CREATE OR REPLACE FUNCTION auditar_saude_conversas()
RETURNS TABLE(categoria text, descricao text, qtd bigint, amostra text)
LANGUAGE sql
STABLE
AS $$
  -- 1) Conversa externa (sem aluno) cujo número bate com um aluno cadastrado → deveria estar vinculada
  SELECT 'externa_com_aluno', 'Conversa externa cujo número bate com aluno cadastrado (deveria estar vinculada)', COUNT(*), left(string_agg(amostra, ' | '), 400)
  FROM (
    SELECT coalesce(c.nome_externo, c.telefone_externo) || ' (' || c.departamento || ')' AS amostra
    FROM admin_conversas c
    WHERE c.aluno_id IS NULL
      AND length(right(regexp_replace(coalesce(c.telefone_externo, c.whatsapp_jid, ''), '\D', '', 'g'), 11)) >= 10
      AND EXISTS (
        SELECT 1 FROM alunos a
        WHERE right(regexp_replace(coalesce(a.telefone, ''), '\D', '', 'g'), 11) = right(regexp_replace(coalesce(c.telefone_externo, c.whatsapp_jid, ''), '\D', '', 'g'), 11)
           OR right(regexp_replace(coalesce(a.whatsapp, ''), '\D', '', 'g'), 11) = right(regexp_replace(coalesce(c.telefone_externo, c.whatsapp_jid, ''), '\D', '', 'g'), 11)
      )
    LIMIT 20
  ) s
  HAVING COUNT(*) > 0

  UNION ALL
  -- 2) Conversa vinculada a aluno mas SEM unidade (inconsistência)
  SELECT 'aluno_sem_unidade', 'Conversa vinculada a aluno mas sem unidade definida', COUNT(*), left(string_agg(amostra, ' | '), 400)
  FROM (
    SELECT a.nome || ' (' || c.departamento || ')' AS amostra
    FROM admin_conversas c JOIN alunos a ON a.id = c.aluno_id
    WHERE c.aluno_id IS NOT NULL AND c.unidade_id IS NULL
    LIMIT 20
  ) s
  HAVING COUNT(*) > 0

  UNION ALL
  -- 3) Conversa aberta sem caixa WhatsApp (não envia/recebe corretamente)
  SELECT 'conversa_sem_caixa', 'Conversa aberta sem caixa WhatsApp associada', COUNT(*), left(string_agg(amostra, ' | '), 400)
  FROM (
    SELECT coalesce((SELECT nome FROM alunos a WHERE a.id = c.aluno_id), c.nome_externo, c.telefone_externo, '?') || ' (' || c.departamento || ')' AS amostra
    FROM admin_conversas c
    WHERE c.status = 'aberta' AND c.caixa_id IS NULL
    LIMIT 20
  ) s
  HAVING COUNT(*) > 0
$$;
