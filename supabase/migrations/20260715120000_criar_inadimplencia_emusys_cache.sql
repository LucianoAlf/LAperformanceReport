-- Cache de inadimplencia/valor real cobrado, vindo da API do Emusys (contrato_atual.inadimplente
-- e contrato_atual.valor_mensalidade), por matricula ATIVA. Populada pela edge function
-- sync-inadimplencia-emusys (cron 3x/dia por unidade). NAO substitui alunos.status_pagamento
-- (campo manual, com governanca propria) -- e uma fonte adicional, so de leitura no frontend.
-- Spec: docs/superpowers/specs/2026-07-15-inadimplencia-emusys-tempo-real-design.md
CREATE TABLE inadimplencia_emusys_cache (
  unidade_id uuid NOT NULL REFERENCES unidades(id),
  emusys_matricula_id text NOT NULL,
  inadimplente boolean NOT NULL DEFAULT false,
  valor_mensalidade_emusys numeric,
  forma_pagamento_emusys text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade_id, emusys_matricula_id)
);

COMMENT ON TABLE inadimplencia_emusys_cache IS 'Cache de inadimplencia/valor real vindo da API do Emusys (contrato_atual.inadimplente/valor_mensalidade), por matricula ativa. Alimentada por sync-inadimplencia-emusys. Leitura no frontend em AlunosPage.tsx para o banner/filtro/coluna de valor da Lista de Alunos -- nao altera alunos.status_pagamento/valor_parcela.';

ALTER TABLE inadimplencia_emusys_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inadimplencia_emusys_cache_select_authenticated" ON inadimplencia_emusys_cache
  FOR SELECT TO authenticated USING (true);
