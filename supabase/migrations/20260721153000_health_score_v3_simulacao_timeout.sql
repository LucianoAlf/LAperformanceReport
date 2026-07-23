-- A simulacao administrativa calcula a matriz segmentada completa e grava o
-- fingerprint que autoriza a ativacao. O timeout padrao do PostgREST era menor
-- que o tempo desse calculo, embora a consulta conclua normalmente no banco.
-- O motor e o contrato de retorno permanecem inalterados.

alter function public.simular_health_score_professor_v3_config(uuid, date)
  set statement_timeout = '60s';

alter function public.simular_health_score_professor_v3_config_pre_catalogo_v1(uuid, date)
  set statement_timeout = '60s';

comment on function public.simular_health_score_professor_v3_config(uuid, date) is
  'Simula a configuracao V3 com guard de catalogo e timeout administrativo isolado de 60 segundos.';

comment on function public.simular_health_score_professor_v3_config_pre_catalogo_v1(uuid, date) is
  'Motor integral da simulacao V3; timeout administrativo isolado de 60 segundos, sem alterar calculo ou fingerprint.';
