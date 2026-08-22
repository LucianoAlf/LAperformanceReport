-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Bloco D: fit cultural. Escolha forcada entre dois valores da LA,
-- os dois defensaveis. O que importa e a prioridade, nao a nota.

ALTER TABLE public.professor_perfil_testes
  ADD COLUMN IF NOT EXISTS valores_primario varchar(12),
  ADD COLUMN IF NOT EXISTS valores_secundario varchar(12),
  ADD COLUMN IF NOT EXISTS valores_sacrificado varchar(12),
  ADD COLUMN IF NOT EXISTS valores_contagem jsonb;

COMMENT ON COLUMN public.professor_perfil_testes.valores_sacrificado IS
  'Valor com menor pontuacao no Bloco D — o que a pessoa larga quando aperta. Nao e defeito, e prioridade.';

-- respostas agora aceitam o bloco D
ALTER TABLE public.professor_perfil_respostas DROP CONSTRAINT IF EXISTS chk_resposta_bloco;
ALTER TABLE public.professor_perfil_respostas
  ADD CONSTRAINT chk_resposta_bloco CHECK (bloco IN ('A','B','D'));

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS valores_codinome varchar(30);
