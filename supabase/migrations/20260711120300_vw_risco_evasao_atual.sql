-- View de leitura: o risco de evasao MAIS RECENTE por aluno (um registro por aluno).
-- risco_evasao guarda historico (uma linha por aluno por calculado_em); a tela so
-- precisa do snapshot atual. security_invoker=true faz a RLS de risco_evasao valer
-- (usuario so ve alunos da propria unidade).

CREATE OR REPLACE VIEW public.vw_risco_evasao_atual
WITH (security_invoker = true) AS
SELECT DISTINCT ON (aluno_id)
  aluno_id,
  unidade_id,
  probabilidade,
  faixa,
  fatores,
  modelo_versao,
  calculado_em
FROM public.risco_evasao
ORDER BY aluno_id, calculado_em DESC;

COMMENT ON VIEW public.vw_risco_evasao_atual IS
  'Ultimo score de risco de evasao por aluno (snapshot corrente). Fonte pra tela Sucesso do Aluno.';
