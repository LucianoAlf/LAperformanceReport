-- Primeira versao de aplicar_retificacao_relatorio_gerencial_financeiro_v1.
--
-- CONSOLIDADA EM 20260808204844. Esta versao tinha um defeito: atualizava o
-- bloco financeiro apenas em {kpis_gestao,0,financeiro_faturas_emusys}, mas o
-- payload gerencial guarda o mesmo bloco TAMBEM em {financeiro_faturas_emusys,
-- totais} (nivel raiz) -- e a leitura resolve por coalesce tentando o raiz
-- PRIMEIRO. Resultado: a retificacao era gravada, lida e silenciosamente
-- ignorada, e o relatorio seguia publicando o numero congelado.
--
-- O defeito foi encontrado na validacao pos-aplicacao (conferindo o retorno da
-- RPC de leitura em vez de confiar no "sucesso" da funcao) e corrigido 20
-- minutos depois. Como a versao corrigida e um CREATE OR REPLACE da mesma
-- funcao, o corpo vive integralmente em 20260808204844 -- aplicar as migrations
-- em ordem chega ao mesmo estado.
--
-- Mantido como arquivo para o historico de schema_migrations ficar completo:
-- esta version esta registrada no banco de producao.

-- Sem DDL: o corpo da funcao esta em 20260808204844_retificacao_gerencial_financeiro_atualiza_bloco_raiz.sql
do $$
begin
  raise notice 'Migration 20260808201841 consolidada em 20260808204844 (ver comentario no topo do arquivo).';
end $$;
