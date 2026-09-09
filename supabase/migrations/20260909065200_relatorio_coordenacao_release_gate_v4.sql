-- Gate final do documento unico da coordenacao.
--
-- O mesmo commit transacional instala o produtor identificado, materializa os
-- seis recortes publicados em todos os escopos e, somente depois de validar
-- cada artefato, confirma o leitor de compatibilidade V3 sobre o documento V4.

begin;

alter function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) rename to montar_rel_coord_conteudo_before_release_20260909;

revoke all on function public.montar_rel_coord_conteudo_before_release_20260909(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_rel_coord_conteudo_before_release_20260909(
  uuid, integer, integer, text
) to service_role;

create or replace function public.montar_relatorio_coordenacao_conteudo_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select (
    public.montar_rel_coord_conteudo_before_release_20260909(
      p_unidade_id,
      p_ano,
      p_mes,
      p_periodicidade
    ) - 'motor_documento'
  ) || jsonb_build_object(
    'motor_documento',
    jsonb_build_object(
      'versao', 'coordenacao-v4-20260909065200',
      'periodicidade', p_periodicidade
    )
  );
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) to service_role;

do $release_gate$
declare
  v_escopo record;
  v_periodo record;
  v_resultado jsonb;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_documentos integer := 0;
  v_esperados integer;
begin
  for v_escopo in
    select u.id as unidade_id
    from public.unidades u
    where u.ativo = true
    union all
    select null::uuid as unidade_id
  loop
    for v_periodo in
      select *
      from (values
        (2026, 6, 'mensal'::text, 'retificado'::text),
        (2026, 7, 'mensal'::text, 'retificado'::text),
        (2026, 8, 'mensal'::text, 'retificado'::text),
        (2026, 6, 'ciclo'::text,  'retificado'::text),
        (2026, 9, 'mensal'::text, 'preview'::text),
        (2026, 9, 'ciclo'::text,  'preview'::text)
      ) p(ano, mes, periodicidade, status)
    loop
      v_resultado := public.materializar_relatorio_coordenacao_documento_v4(
        v_escopo.unidade_id,
        v_periodo.ano,
        v_periodo.mes,
        v_periodo.periodicidade,
        v_periodo.status,
        case
          when v_periodo.status = 'retificado'
            then 'Release final do documento unico da coordenacao V4.'
          else 'Carga progressiva do ciclo em andamento no release V4.'
        end
      );

      if coalesce((v_resultado ->> 'ok')::boolean, false) is not true
         or nullif(v_resultado ->> 'id', '') is null then
        raise exception 'RELEASE_MATERIALIZACAO_FALHOU: %/% % %',
          v_periodo.ano,
          v_periodo.mes,
          v_periodo.periodicidade,
          coalesce(v_escopo.unidade_id::text, 'consolidado');
      end if;

      select s.*
        into v_snapshot
      from public.fechamento_mensal_snapshots s
      where s.id = (v_resultado ->> 'id')::uuid;

      if v_snapshot.id is null then
        raise exception 'RELEASE_DOCUMENTO_AUSENTE: %/% % %',
          v_periodo.ano,
          v_periodo.mes,
          v_periodo.periodicidade,
          coalesce(v_escopo.unidade_id::text, 'consolidado');
      end if;

      if v_snapshot.ano <> v_periodo.ano
         or v_snapshot.mes <> v_periodo.mes
         or v_snapshot.unidade_id is distinct from v_escopo.unidade_id
         or v_snapshot.dominio <> (
              case when v_periodo.periodicidade = 'ciclo'
                then 'relatorio_coordenacao_ciclo'
                else 'relatorio_coordenacao'
              end
            )
         or v_snapshot.status <> v_periodo.status
         or v_snapshot.payload ->> 'schema_version' <> '4'
         or v_snapshot.payload #>> '{motor_documento,versao}'
              <> 'coordenacao-v4-20260909065200'
         or v_snapshot.payload_hash is distinct from
              public.hash_jsonb_canonico(v_snapshot.payload - 'documento') then
        raise exception 'RELEASE_DOCUMENTO_INVALIDO: %', v_snapshot.id;
      end if;

      v_documentos := v_documentos + 1;
    end loop;
  end loop;

  select (count(*) + 1) * 6
    into v_esperados
  from public.unidades u
  where u.ativo = true;

  if v_documentos <> v_esperados then
    raise exception 'RELEASE_DOCUMENTOS_INCOMPLETOS: esperado %, obtido %',
      v_esperados,
      v_documentos;
  end if;
end;
$release_gate$;

-- Compatibilidade para clientes ainda compilados com o nome V3. A funcao e
-- publicada apenas depois que todos os documentos acima passaram pelo gate.
create or replace function public.get_relatorio_coordenacao_canonico_v3(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text default 'mensal'
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.get_relatorio_coordenacao_documento_v4(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade
  );
$function$;

revoke all on function public.get_relatorio_coordenacao_canonico_v3(
  uuid, integer, integer, text
) from public, anon;
grant execute on function public.get_relatorio_coordenacao_canonico_v3(
  uuid, integer, integer, text
) to authenticated, service_role;

comment on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) is 'Produtor factual privado liberado pelo gate transacional coordenacao-v4-20260909065200.';

commit;
