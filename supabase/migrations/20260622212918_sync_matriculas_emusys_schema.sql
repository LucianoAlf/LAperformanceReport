-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- Sync de Matrículas Emusys × Banco — schema base
-- Spec: docs/superpowers/specs/2026-06-22-sync-matriculas-emusys-design.md
-- ============================================================

-- 1) Colunas de desconto em alunos (visíveis/editáveis na UI)
ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS valor_cheio numeric,
  ADD COLUMN IF NOT EXISTS desconto_fixo numeric,
  ADD COLUMN IF NOT EXISTS desconto_condicional numeric;

COMMENT ON COLUMN alunos.valor_cheio IS 'valor_mensalidade da API (sem desconto). valor_parcela = valor_cheio - desconto_fixo - desconto_condicional';
COMMENT ON COLUMN alunos.desconto_fixo IS 'desconto_fixo do contrato (API /matriculas)';
COMMENT ON COLUMN alunos.desconto_condicional IS 'desconto_condicional/pontualidade do contrato (API /matriculas)';

-- 2) De-para de curso por ID (unidade + disciplina_id) — substitui cursos.emusys_ids (array global furado)
CREATE TABLE IF NOT EXISTS curso_emusys_depara (
  unidade_id           uuid NOT NULL REFERENCES unidades(id),
  emusys_disciplina_id integer NOT NULL,
  curso_id             integer REFERENCES cursos(id),  -- null = não mapeado ainda (vai pra fila)
  emusys_nome          text,                            -- nome atual no Emusys (referência)
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade_id, emusys_disciplina_id)
);
COMMENT ON TABLE curso_emusys_depara IS 'De-para (unidade, disciplina_id Emusys) -> curso. Casamento por ID, imune a renomeação. Fonte: GET /disciplinas.';

-- 3) ID Emusys do professor (casa por ID, não por nome)
ALTER TABLE professores ADD COLUMN IF NOT EXISTS emusys_id integer;
COMMENT ON COLUMN professores.emusys_id IS 'ID da pessoa do professor no Emusys (id_professor da disciplina / id em /aulas)';

-- 4) Fila de divergências detectadas pelo sync
CREATE TABLE IF NOT EXISTS matriculas_divergencias (
  id                  bigserial PRIMARY KEY,
  aluno_id            integer REFERENCES alunos(id),
  emusys_matricula_id text,
  unidade_id          uuid REFERENCES unidades(id),
  tipo_divergencia    text NOT NULL,   -- ambiguo|ausente_api|duas_matriculas|disciplina_nao_mapeada|professor_nao_mapeado|valor_fixado_divergente
  campo               text,
  valor_nosso         jsonb,
  valor_api           jsonb,
  sugestao            jsonb,
  severidade          text DEFAULT 'media',  -- alta|media|baixa
  resolvido           boolean NOT NULL DEFAULT false,
  detectado_em        timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, tipo_divergencia, campo)
);
CREATE INDEX IF NOT EXISTS idx_matriculas_divergencias_aberto
  ON matriculas_divergencias (unidade_id, tipo_divergencia) WHERE resolvido = false;

-- 5) Decisão humana sobre a divergência (espelha lead_experimentais_decisoes_humanas)
CREATE TABLE IF NOT EXISTS matriculas_divergencias_decisoes (
  id              bigserial PRIMARY KEY,
  divergencia_id  bigint NOT NULL REFERENCES matriculas_divergencias(id) ON DELETE CASCADE,
  aluno_id        integer,
  decisao         text NOT NULL,   -- aceitar_api|manter_nosso|escolher|ignorar
  valor_escolhido jsonb,
  motivo          text NOT NULL,
  decidido_por    text NOT NULL,
  decidido_em     timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (divergencia_id)
);

-- 6) Override manual ("campo fixado") — sync não sobrescreve campo editado à mão
CREATE TABLE IF NOT EXISTS matriculas_campos_fixados (
  id          bigserial PRIMARY KEY,
  aluno_id    integer NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  campo       text NOT NULL,   -- valor_parcela|desconto_fixo|desconto_condicional|curso_id|professor_atual_id|...
  valor       jsonb NOT NULL,
  fixado_por  text NOT NULL,
  fixado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, campo)
);
COMMENT ON TABLE matriculas_campos_fixados IS 'Campos editados manualmente que o sync deve respeitar (não sobrescrever).';
