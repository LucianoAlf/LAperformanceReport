-- Subprojeto B / B3: ativação somente para pesquisas criadas depois deste corte.
-- Não atualizar linhas existentes: conversas abertas continuam no motor legado.

do $block$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pesquisa_evasao'
      and column_name = 'resposta_ingestao_versao'
  ) then
    raise exception 'coluna resposta_ingestao_versao ausente; aplique primeiro a migration B2';
  end if;
end;
$block$;

alter table public.pesquisa_evasao
  alter column resposta_ingestao_versao set default 'multipartes_v2';

comment on column public.pesquisa_evasao.resposta_ingestao_versao is
  'Motor inbound por pesquisa. Default multipartes_v2 desde B3; linhas anteriores não são reclassificadas.';
