begin;

alter function public.get_health_score_professor_v3_config_ui()
  set statement_timeout = '60s';

alter function public.get_health_score_professor_v3_config_ui_pre_catalogo_v1()
  set statement_timeout = '60s';

comment on function public.get_health_score_professor_v3_config_ui() is
  'Leitura governada da configuracao V3, com timeout explicito para diagnosticos em cache frio.';

commit;
