-- Fase 3 (final) da aposentadoria: renomeia a tabela legada renovacoes -> renovacoes_legado.
-- NUNCA DROP. Dados (452 linhas, incl. as ~44 orfas) permanecem intactos, consultaveis.
-- Auditoria confirmou zero consumidores em runtime (front, views, funcoes). Policies e triggers
-- seguem a tabela renomeada (inertes: so disparam em escrita, que nao ocorre mais).
ALTER TABLE public.renovacoes RENAME TO renovacoes_legado;
COMMENT ON TABLE public.renovacoes_legado IS 'ARQUIVO read-only. Aposentada em 2026-07-01: a fonte de verdade de renovacoes passou a ser movimentacoes_admin. NAO usar em codigo novo. Contem historico legado (incl. ~44 renovacoes que so existiam aqui).';
