-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela ESPELHO de debug do payload bruto da API do Emusys.
-- Sem FK, sem relação com nenhuma tabela do sistema. Apenas leitura/comparação manual.
-- Não alimenta KPI, não aparece em tela, não toca em `alunos`.
CREATE TABLE public.emusys_api_payload (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  endpoint               text NOT NULL,                 -- ex: 'matriculas', 'aulas', 'professores'
  unidade_codigo         text,                          -- 'cg' | 'recreio' | 'barra' (string crua, sem FK)
  emusys_id              bigint,                         -- id do recurso na API (ex: matricula id) - SEM FK
  emusys_student_id      bigint,                         -- aluno.id da API - SEM FK (chave p/ agrupar por pessoa)
  aluno_nome             text,
  aluno_nome_normalizado text,
  status                 text,                           -- ativa | trancada | finalizada (cru da API)
  curso_nome             text,
  data_ultima_aula       date,
  payload                jsonb NOT NULL,                 -- objeto COMPLETO da API, sem alteração
  synced_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.emusys_api_payload IS
  'Espelho de debug do payload bruto da API Emusys. Sem FK e sem vínculo com o sistema. Uso: comparar Emusys x base manualmente. Não alimenta nada.';

CREATE INDEX idx_emusys_api_payload_endpoint_unidade ON public.emusys_api_payload (endpoint, unidade_codigo);
CREATE INDEX idx_emusys_api_payload_student          ON public.emusys_api_payload (emusys_student_id);
CREATE INDEX idx_emusys_api_payload_nome_norm        ON public.emusys_api_payload (aluno_nome_normalizado);
CREATE INDEX idx_emusys_api_payload_status           ON public.emusys_api_payload (endpoint, status);

-- RLS ligado (a tabela guarda PII vinda do Emusys): leitura só para usuários logados; service_role faz a carga.
ALTER TABLE public.emusys_api_payload ENABLE ROW LEVEL SECURITY;

CREATE POLICY emusys_api_payload_select_authenticated
  ON public.emusys_api_payload FOR SELECT TO authenticated USING (true);
