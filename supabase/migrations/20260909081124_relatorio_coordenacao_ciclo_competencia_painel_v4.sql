begin;

-- A chave publica do ciclo continua sendo o primeiro mes (por exemplo,
-- setembro para Set-Nov), mas a fotografia consultada precisa avancar com o
-- calendario: setembro, depois outubro e por fim novembro. O adaptador abaixo
-- passa a competencia efetiva para toda a cadeia ja validada e restaura a
-- chave estavel somente no envelope publico do documento.
alter function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) rename to montar_rel_coord_conteudo_before_competencia_painel_20260909;

revoke all on function public.montar_rel_coord_conteudo_before_competencia_painel_20260909(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_rel_coord_conteudo_before_competencia_painel_20260909(
  uuid, integer, integer, text
) to service_role;

create or replace function public.montar_relatorio_coordenacao_conteudo_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_competencia_seletor date;
  v_competencia_painel date;
  v_conteudo jsonb;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_competencia_seletor := make_date(p_ano, p_mes, 1);
  v_competencia_painel := case
    when p_periodicidade = 'ciclo' then
      public.fn_health_score_professor_v3_competencia_ciclo_vivo(
        v_competencia_seletor,
        current_date
      )
    else v_competencia_seletor
  end;

  v_conteudo := public.montar_rel_coord_conteudo_before_competencia_painel_20260909(
    p_unidade_id,
    extract(year from v_competencia_painel)::integer,
    extract(month from v_competencia_painel)::integer,
    p_periodicidade
  );

  if v_conteudo is null
     or jsonb_typeof(v_conteudo -> 'periodo') <> 'object'
     or jsonb_typeof(v_conteudo -> 'professores') <> 'array' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO'
      using errcode = '22023';
  end if;

  if p_periodicidade = 'ciclo' then
    v_conteudo := jsonb_set(
      jsonb_set(v_conteudo, '{periodo,ano}', to_jsonb(p_ano), true),
      '{periodo,mes}',
      to_jsonb(p_mes),
      true
    );
  end if;

  return v_conteudo;
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) to service_role;

comment on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) is
  'Documento da Coordenacao V4; no ciclo aberto consulta a mesma competencia progressiva exibida no painel e preserva a chave estavel do seletor.';

commit;
