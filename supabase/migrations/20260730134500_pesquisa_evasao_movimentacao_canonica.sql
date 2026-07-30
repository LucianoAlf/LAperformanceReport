-- A pesquisa de evasao ja usa movimentacoes_admin como fonte operacional,
-- mas a FK antiga ainda apontava para evasoes_v2 e recusava os novos envios.

alter table public.pesquisa_evasao
  drop constraint if exists pesquisa_evasao_evasao_id_fkey;

alter table public.pesquisa_evasao
  add constraint pesquisa_evasao_evasao_id_fkey
  foreign key (evasao_id)
  references public.movimentacoes_admin (id)
  not valid;

alter table public.pesquisa_evasao
  validate constraint pesquisa_evasao_evasao_id_fkey;

comment on constraint pesquisa_evasao_evasao_id_fkey
  on public.pesquisa_evasao is
  'Vincula a pesquisa a movimentacao administrativa canonica de saida.';
