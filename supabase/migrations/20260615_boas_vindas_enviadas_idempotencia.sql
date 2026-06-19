-- Controle de idempotencia da edge function enviar-boas-vindas-matricula.
-- Garante que cada matricula receba a boas-vindas UMA unica vez.
-- A chave e reservada (INSERT) antes do envio; o UNIQUE bloqueia disparos
-- duplicados ou simultaneos para a mesma matricula.
CREATE TABLE IF NOT EXISTS boas_vindas_enviadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_idempotencia text NOT NULL UNIQUE,
  telefone text,
  nome_aluno text,
  nome_curso text,
  tipo text,
  unidade text,
  enviado_ok boolean,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE boas_vindas_enviadas IS 'Idempotencia da boas-vindas de matricula (1 envio por matricula). Ver edge function enviar-boas-vindas-matricula.';
