-- O INSERT de aplicar_snapshot_experimentais_emusys_v1 usa um LEFT JOIN LATERAL para herdar
-- a versao anterior de cada item (aula_emusys_id, telefone, lead_id...). O predicado e
-- (unidade_id, emusys_aula_id, participante_chave) SEM filtro de snapshot_ativo: ele precisa
-- alcancar tambem as linhas ja inativadas.
--
-- O unico indice com essas 3 colunas era emusys_experimentais_raw_snapshot_ativo_key_idx, que e
-- PARCIAL (WHERE snapshot_ativo IS TRUE) e por isso nao serve ao lateral. Sem indice util, cada
-- item fazia Bitmap Heap Scan em todas as linhas da unidade.
--
-- Medido em 2026-08-26, Recreio (90.947 linhas): "Rows Removed by Filter: 90947",
-- 60 ms POR ITEM x 189 itens = ~11 s so nesse passo. Como a tabela cresce a cada execucao
-- (481 linhas mortas para cada vigente), o custo sobe sozinho ate cruzar o statement_timeout:
-- Recreio falhava em 100% das tentativas com FALHA_APLICAR_SNAPSHOT_EXPERIMENTAIS, enquanto
-- Barra (56 mil linhas) e Campo Grande (25 mil) passavam. Foi a causa do relatorio comercial
-- nao sair para o Recreio.
--
-- Indice aditivo: nao altera comportamento, so o plano. Reversivel com DROP INDEX.
create index if not exists emusys_experimentais_raw_versao_anterior_idx
  on public.emusys_experimentais_raw (unidade_id, emusys_aula_id, participante_chave);
