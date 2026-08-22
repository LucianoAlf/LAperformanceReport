-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Detalhe de pagamento em cartao no caixa diario: modalidade (debito/credito),
-- numero de parcelas (credito parcelado) e link de pagamento. Aditivo e nullable.
ALTER TABLE caixa_movimentacoes
  ADD COLUMN IF NOT EXISTS cartao_modalidade text,
  ADD COLUMN IF NOT EXISTS cartao_parcelas integer,
  ADD COLUMN IF NOT EXISTS link_pagamento text;

-- modalidade so aceita debito/credito (ou NULL)
ALTER TABLE caixa_movimentacoes
  ADD CONSTRAINT caixa_movimentacoes_cartao_modalidade_check
  CHECK (cartao_modalidade IS NULL OR cartao_modalidade = ANY (ARRAY['debito','credito']));

-- parcelas >= 1 quando informado
ALTER TABLE caixa_movimentacoes
  ADD CONSTRAINT caixa_movimentacoes_cartao_parcelas_check
  CHECK (cartao_parcelas IS NULL OR cartao_parcelas >= 1);

-- coerencia: detalhe de cartao so existe quando forma_pagamento = 'cartao'
ALTER TABLE caixa_movimentacoes
  ADD CONSTRAINT caixa_movimentacoes_cartao_coerencia_check
  CHECK (
    forma_pagamento = 'cartao'
    OR (cartao_modalidade IS NULL AND cartao_parcelas IS NULL)
  );

-- parcelas so faz sentido no credito
ALTER TABLE caixa_movimentacoes
  ADD CONSTRAINT caixa_movimentacoes_parcelas_credito_check
  CHECK (cartao_parcelas IS NULL OR cartao_modalidade = 'credito');

COMMENT ON COLUMN caixa_movimentacoes.cartao_modalidade IS 'debito | credito — preenchido apenas quando forma_pagamento = cartao';
COMMENT ON COLUMN caixa_movimentacoes.cartao_parcelas IS 'Numero de parcelas; apenas no credito parcelado';
COMMENT ON COLUMN caixa_movimentacoes.link_pagamento IS 'Link de pagamento associado a movimentacao (ex: cartao remoto)';
