begin;

-- Cutover estritamente de ACL. O prototipo antigo permanece disponivel para
-- leitura historica, mas deixa de aceitar novas classificacoes pelo cliente.
-- Nenhuma pesquisa ou classificacao existente e reescrita nesta migration.

revoke execute on function public.classificar_resposta_evasao(uuid, text)
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito;

comment on column public.pesquisa_evasao.categoria_resposta is
  'LEGADO desde o Subprojeto C de 04/08/2026; vazio no cutover e sem novo escritor.';

comment on column public.pesquisa_evasao.sentimento is
  'LEGADO desde o Subprojeto C de 04/08/2026; vazio no cutover e sem novo escritor.';

comment on function public.classificar_resposta_evasao(uuid, text) is
  'LEGADO: execucao do cliente revogada no Subprojeto C; preservada apenas para rastreabilidade do prototipo.';

commit;
