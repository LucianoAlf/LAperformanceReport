-- BLOQUEANTE do review final: `pesquisa_evasao_templates_publico_ativo_uidx`
-- (unique em `publico` where ativo, criado em 20260730173000) so cabia
-- enquanto so existia UMA chave de template vivo (`evasao_aberta`). Com a
-- repescagem o subsistema passa a ter DUAS chaves ativas ao mesmo tempo
-- (`evasao_aberta` para o 1o toque e `evasao_repescagem` para o 2o), cada
-- uma com uma linha 'direto' e uma 'responsavel' -- ou seja, DUAS linhas
-- ativas por publico e nao mais uma. Sem esta migration, a insercao dos
-- templates de repescagem (20260827091000) estoura 23505 contra o indice
-- antigo. Precisa rodar ANTES daquela (por isso o timestamp 090500, entre a
-- criacao da fila e a insercao dos templates).
--
-- A unicidade correta agora e por (chave, publico): no maximo um template
-- ativo por chave+publico, e nao mais por publico sozinho.
drop index if exists public.pesquisa_evasao_templates_publico_ativo_uidx;

create unique index pesquisa_evasao_templates_chave_publico_ativo_uidx
  on public.pesquisa_evasao_templates (chave, publico)
  where ativo;

-- Item 5 do review final: unica funcao de trigger da branch sem revoke de
-- anon/public. Nao e exploravel (funcao de trigger, sem uso direto), mas
-- quebra o padrao do projeto de fechar tudo que nasce em ALTER DEFAULT
-- PRIVILEGES.
revoke execute on function public.fn_pesquisa_evasao_envios_fila_touch()
  from public, anon, authenticated;
