-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE public.fila_relatorios_whatsapp (
  id          bigserial PRIMARY KEY,
  unidade_id  uuid        NOT NULL REFERENCES public.unidades(id),
  unidade_nome text       NOT NULL,
  jid         text        NOT NULL,
  grupo_nome  text        NOT NULL,
  texto       text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente','enviando','enviada','erro')),
  agendada_para timestamptz NOT NULL,
  enviada_em  timestamptz,
  erro        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fila_relatorios_pendente
  ON public.fila_relatorios_whatsapp (agendada_para)
  WHERE status = 'pendente';

COMMENT ON TABLE public.fila_relatorios_whatsapp IS
  'Fila de envio dos relatórios diários por unidade — processada pelo cron processar-mensagens-agendadas com 1 min de intervalo entre cada envio';
