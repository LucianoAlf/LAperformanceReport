-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- Ficha Técnica LA — generalização do perfil para colaboradores
-- ============================================================

-- 1. Generalizar professor_perfil_testes -----------------------
ALTER TABLE public.professor_perfil_testes
  ALTER COLUMN professor_id DROP NOT NULL,
  ALTER COLUMN evento_token DROP NOT NULL;

ALTER TABLE public.professor_perfil_testes
  ADD COLUMN IF NOT EXISTS colaborador_id integer REFERENCES public.colaboradores(id),
  ADD COLUMN IF NOT EXISTS cargo_contexto varchar(40),
  ADD COLUMN IF NOT EXISTS valorizacao_primaria varchar(10),
  ADD COLUMN IF NOT EXISTS valorizacao_secundaria varchar(10),
  ADD COLUMN IF NOT EXISTS valorizacao_contagem jsonb;

ALTER TABLE public.professor_perfil_testes
  DROP CONSTRAINT IF EXISTS chk_perfil_teste_sujeito;
ALTER TABLE public.professor_perfil_testes
  ADD CONSTRAINT chk_perfil_teste_sujeito
  CHECK (num_nonnulls(professor_id, colaborador_id) = 1);

COMMENT ON COLUMN public.professor_perfil_testes.colaborador_id IS
  'Sujeito do teste quando NAO e professor (atendimento, financeiro, gerencia). Exatamente um entre professor_id e colaborador_id.';
COMMENT ON COLUMN public.professor_perfil_testes.cargo_contexto IS
  'Qual banco de cenarios do Bloco A foi aplicado (ex: ATENDIMENTO, FINANCEIRO, GERENCIA). Contexto PROF continua usando os cenarios de sala de aula.';

-- 2. Respostas: separar Bloco A (temperamento) de Bloco B (valorizacao)
ALTER TABLE public.professor_perfil_respostas
  ADD COLUMN IF NOT EXISTS bloco char(1) NOT NULL DEFAULT 'A';

ALTER TABLE public.professor_perfil_respostas
  DROP CONSTRAINT IF EXISTS chk_resposta_bloco;
ALTER TABLE public.professor_perfil_respostas
  ADD CONSTRAINT chk_resposta_bloco CHECK (bloco IN ('A','B'));

-- opcao_canonica passa a caber PAL/TEM/APO/SIM/CEL do Bloco B
ALTER TABLE public.professor_perfil_respostas
  ALTER COLUMN opcao_canonica TYPE varchar(4);

-- a unicidade antiga colidiria: Bloco B reusa os numeros 1..10
ALTER TABLE public.professor_perfil_respostas
  DROP CONSTRAINT IF EXISTS professor_perfil_respostas_teste_id_pergunta_numero_key;
ALTER TABLE public.professor_perfil_respostas
  ADD CONSTRAINT professor_perfil_respostas_teste_bloco_pergunta_key
  UNIQUE (teste_id, bloco, pergunta_numero);

-- 3. Campos de ficha em colaboradores --------------------------
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS foto_url varchar(500),
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS cargo varchar(80),
  ADD COLUMN IF NOT EXISTS aniversario_dia smallint,
  ADD COLUMN IF NOT EXISTS aniversario_mes smallint,
  ADD COLUMN IF NOT EXISTS temperamento_codinome varchar(30),
  ADD COLUMN IF NOT EXISTS valorizacao_codinome varchar(30),
  ADD COLUMN IF NOT EXISTS situacao varchar(20) NOT NULL DEFAULT 'ativo';

ALTER TABLE public.colaboradores
  DROP CONSTRAINT IF EXISTS chk_colaborador_situacao;
ALTER TABLE public.colaboradores
  ADD CONSTRAINT chk_colaborador_situacao
  CHECK (situacao IN ('candidato','ativo','desligado'));

ALTER TABLE public.colaboradores
  DROP CONSTRAINT IF EXISTS chk_colaborador_aniversario;
ALTER TABLE public.colaboradores
  ADD CONSTRAINT chk_colaborador_aniversario
  CHECK ((aniversario_dia IS NULL OR aniversario_dia BETWEEN 1 AND 31)
     AND (aniversario_mes IS NULL OR aniversario_mes BETWEEN 1 AND 12));

COMMENT ON COLUMN public.colaboradores.situacao IS
  'candidato = pre-cadastro de processo seletivo. Contratou, vira ativo e a ficha inteira vai junto, sem refazer teste.';

-- 4. Rider (autodeclarado, editavel pela propria pessoa) -------
CREATE TABLE IF NOT EXISTS public.colaborador_rider (
  id bigserial PRIMARY KEY,
  colaborador_id integer NOT NULL UNIQUE REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao integer NOT NULL DEFAULT 1,
  preenchido_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.colaborador_rider_versoes (
  id bigserial PRIMARY KEY,
  colaborador_id integer NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  respostas jsonb NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rider_versoes_colaborador
  ON public.colaborador_rider_versoes(colaborador_id, versao DESC);

COMMENT ON TABLE public.colaborador_rider IS
  'Bloco autodeclarado da Ficha Tecnica LA. A pessoa e dona do conteudo e edita quando quiser; historico em colaborador_rider_versoes.';

-- 5. Token pessoal (padrao share_token da anamnese) ------------
CREATE TABLE IF NOT EXISTS public.ficha_tokens (
  id bigserial PRIMARY KEY,
  token varchar(64) NOT NULL UNIQUE,
  colaborador_id integer NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  cargo_contexto varchar(40) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por integer,
  usado_em timestamptz,
  ativo boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_ficha_tokens_colaborador
  ON public.ficha_tokens(colaborador_id);

COMMENT ON TABLE public.ficha_tokens IS
  'Token pessoal por colaborador. Uso unico: usado_em preenchido trava o reenvio. RLS sem policy por design — so service_role le; token nunca vai para o client.';

-- 6. RLS -------------------------------------------------------
ALTER TABLE public.colaborador_rider ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaborador_rider_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ficha_tokens ENABLE ROW LEVEL SECURITY;

-- 6a. Perfil: leitura para admin ou mesma unidade (escrita segue service_role)
DROP POLICY IF EXISTS perfil_testes_leitura ON public.professor_perfil_testes;
CREATE POLICY perfil_testes_leitura ON public.professor_perfil_testes
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.usuarios u
            WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin')
    OR unidade_id IN (SELECT u.unidade_id FROM public.usuarios u
                      WHERE u.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS perfil_respostas_leitura ON public.professor_perfil_respostas;
CREATE POLICY perfil_respostas_leitura ON public.professor_perfil_respostas
  FOR SELECT TO authenticated
  USING (teste_id IN (SELECT t.id FROM public.professor_perfil_testes t));

-- 6b. Rider: so a propria pessoa e o admin
DROP POLICY IF EXISTS rider_dono_ou_admin ON public.colaborador_rider;
CREATE POLICY rider_dono_ou_admin ON public.colaborador_rider
  FOR ALL TO authenticated
  USING (
    colaborador_id IN (SELECT c.id FROM public.colaboradores c
                       WHERE c.usuario_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.usuarios u
               WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin')
  )
  WITH CHECK (
    colaborador_id IN (SELECT c.id FROM public.colaboradores c
                       WHERE c.usuario_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.usuarios u
               WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin')
  );

DROP POLICY IF EXISTS rider_versoes_admin ON public.colaborador_rider_versoes;
CREATE POLICY rider_versoes_admin ON public.colaborador_rider_versoes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u
                 WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin'));

-- 6c. Agente Sol: leitura restrita, mesmo padrao ja usado em colaboradores
GRANT SELECT ON public.colaborador_rider TO sol_acesso_restrito;
DROP POLICY IF EXISTS rider_sol_readonly ON public.colaborador_rider;
CREATE POLICY rider_sol_readonly ON public.colaborador_rider
  FOR SELECT TO sol_acesso_restrito USING (true);
