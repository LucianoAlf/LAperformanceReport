-- Primeira versao de aplicar_retificacao_relatorio_gerencial_retencao_v1.
--
-- CONSOLIDADA EM 20260810180747. Esta versao tinha 6 parametros e nenhuma forma
-- de prosseguir quando a guarda de escopo (total_evasoes/avisos_previos alheios
-- a renovacao) disparava -- e ela disparou em producao ao rodar para o
-- Recreio/jul-2026: total_evasoes recalculado (7) nao batia com o congelado no
-- snapshot (5), um bug PRE-EXISTENTE e separado (lista de evasoes do proprio
-- relatorio_admin_mensal tem 5 itens mas o resumo publicado diz 7 -- o mesmo
-- padrao de bug das renovacoes, so que no bloco de evasoes). A funcao nunca
-- escreve nesses campos (so 4 jsonb_set, todos em kpis_retencao.0 nos campos de
-- renovacao), entao bloquear era excesso de cautela sem necessidade real.
--
-- A versao final ganhou o parametro p_confirma_divergencia_alheia (default
-- false, comportamento inalterado) para permitir prosseguir com a divergencia
-- DOCUMENTADA na auditoria em vez de escondida, ao inves de reescrever a guarda
-- para nao mais detecta-la.
--
-- Mantido como arquivo para o historico de schema_migrations ficar completo:
-- esta versao esta registrada no banco de producao (como overload de 6
-- argumentos, removido por 20260810180813_limpa_overload_e_acl...).

-- Sem DDL: o corpo final da funcao esta em
-- 20260810180747_retificacao_gerencial_retencao_permite_confirmar_divergencia_alheia.sql
do $$
begin
  raise notice 'Migration 20260810180359 consolidada em 20260810180747 (ver comentario no topo do arquivo).';
end $$;
