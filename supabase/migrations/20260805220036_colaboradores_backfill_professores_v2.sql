-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- O CHECK de tipo nao previa 'professor'. Amplia sem remover nenhum valor
-- existente (farmer, hunter, gerente, admin, pre_atendimento seguem validos).
ALTER TABLE public.colaboradores DROP CONSTRAINT colaboradores_tipo_check;
ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_tipo_check
  CHECK (tipo::text = ANY (ARRAY['farmer','hunter','gerente','admin','pre_atendimento','professor','coordenador']::text[]));

-- Etapa 2: cada professor ativo ganha um registro em colaboradores.
INSERT INTO public.colaboradores
  (nome, apelido, tipo, departamento, professor_id, unidade_id,
   foto_url, bio, whatsapp, situacao, ativo)
SELECT
  p.nome,
  NULLIF(p.nome_preferido, ''),
  'professor',
  'Professores',
  p.id,
  (SELECT pu.unidade_id FROM public.professores_unidades pu
    WHERE pu.professor_id = p.id ORDER BY pu.unidade_id LIMIT 1),
  p.foto_url,
  p.bio,
  p.telefone_whatsapp,
  'ativo',
  true
FROM public.professores p
WHERE p.ativo
  AND NOT EXISTS (SELECT 1 FROM public.colaboradores c WHERE c.professor_id = p.id);
