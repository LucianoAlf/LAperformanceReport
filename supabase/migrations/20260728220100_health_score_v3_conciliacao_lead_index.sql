-- Cobre a FK lead_id com a coluna inicial esperada pelo planner.
-- A tabela permanece interna, com RLS e grants definidos na migration anterior.

create index if not exists idx_hs_v3_exp_lead_conciliacoes_lead_id
  on public.health_score_v3_experimental_lead_conciliacoes(lead_id);
