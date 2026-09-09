begin;

-- Documentos finais da Coordenacao sao append-only. A tabela e compartilhada,
-- entao a protecao adicional fica restrita aos dois dominios V4.
create or replace function public.proteger_relatorio_coordenacao_final_v4()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if old.dominio in ('relatorio_coordenacao', 'relatorio_coordenacao_ciclo')
     and old.status in ('aprovado', 'fechado', 'retificado') then
    raise exception 'RELATORIO_COORDENACAO_V4_DOCUMENTO_FINAL_IMUTAVEL: %', old.id
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.proteger_relatorio_coordenacao_final_v4()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_relatorio_coordenacao_final_v4
  on public.fechamento_mensal_snapshots;
create trigger trg_relatorio_coordenacao_final_v4
before update or delete on public.fechamento_mensal_snapshots
for each row execute function public.proteger_relatorio_coordenacao_final_v4();

-- Conserva o produtor ja testado e acrescenta uma maquina de estados na borda.
-- Depois de aprovado/fechado/retificado, job diario nao pode criar preview nova.
alter function public.materializar_relatorio_coordenacao_documento_v4(
  uuid, integer, integer, text, text, text
) rename to materializar_rel_coord_doc_before_finalidade_20260909;

revoke all on function public.materializar_rel_coord_doc_before_finalidade_20260909(
  uuid, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.materializar_rel_coord_doc_before_finalidade_20260909(
  uuid, integer, integer, text, text, text
) to service_role;

create or replace function public.materializar_relatorio_coordenacao_documento_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_status text default 'preview',
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_dominio text;
  v_escopo text;
  v_final public.fechamento_mensal_snapshots%rowtype;
  v_resultado jsonb;
begin
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODICIDADE_INVALIDA'
      using errcode = '22023';
  end if;
  if p_status not in ('preview', 'aprovado', 'fechado', 'retificado') then
    raise exception 'RELATORIO_COORDENACAO_V4_STATUS_INVALIDO'
      using errcode = '22023';
  end if;
  if p_status = 'retificado' and nullif(btrim(p_observacao), '') is null then
    raise exception 'RELATORIO_COORDENACAO_V4_RETIFICACAO_SEM_JUSTIFICATIVA'
      using errcode = '22023';
  end if;

  v_dominio := case when p_periodicidade = 'ciclo'
    then 'relatorio_coordenacao_ciclo' else 'relatorio_coordenacao' end;
  v_escopo := case when p_unidade_id is null then 'consolidado' else 'unidade' end;

  select s.* into v_final
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = v_escopo
    and s.unidade_id is not distinct from p_unidade_id
    and s.dominio = v_dominio
    and s.status in ('aprovado', 'fechado', 'retificado')
    and s.payload @> '{"schema_version": 4}'::jsonb
  order by
    case s.status
      when 'retificado' then 3
      when 'fechado' then 2
      else 1
    end desc,
    s.versao desc
  limit 1;

  if v_final.id is not null then
    -- Previa e aprovacao nunca podem sobrepor um documento final.
    if p_status in ('preview', 'aprovado')
       or (p_status = 'fechado' and v_final.status in ('fechado', 'retificado')) then
      return jsonb_build_object(
        'ok', true,
        'criado', false,
        'id', v_final.id,
        'versao', v_final.versao,
        'hash', v_final.payload_hash,
        'dominio', v_final.dominio,
        'escopo', v_final.escopo,
        'status', v_final.status,
        'finalizado', true
      );
    end if;
  end if;

  v_resultado := public.materializar_rel_coord_doc_before_finalidade_20260909(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade,
    p_status,
    p_observacao
  );

  return v_resultado || jsonb_build_object(
    'status', p_status,
    'finalizado', p_status in ('aprovado', 'fechado', 'retificado')
  );
end;
$function$;

revoke all on function public.materializar_relatorio_coordenacao_documento_v4(
  uuid, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.materializar_relatorio_coordenacao_documento_v4(
  uuid, integer, integer, text, text, text
) to service_role;

-- O leitor prioriza estado final antes da versao. Assim uma previa tardia, mesmo
-- com versao maior, jamais substitui o documento aprovado pela coordenacao.
create or replace function public.get_relatorio_coordenacao_documento_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text default 'mensal'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_dominio text;
  v_escopo text;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODICIDADE_INVALIDA'
      using errcode = '22023';
  end if;

  v_dominio := case when p_periodicidade = 'ciclo'
    then 'relatorio_coordenacao_ciclo' else 'relatorio_coordenacao' end;
  v_escopo := case when p_unidade_id is null then 'consolidado' else 'unidade' end;

  select s.* into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.dominio = v_dominio
    and s.escopo = v_escopo
    and s.unidade_id is not distinct from p_unidade_id
    and s.status in ('preview', 'aprovado', 'fechado', 'retificado')
    and s.payload @> '{"schema_version": 4}'::jsonb
  order by
    case s.status
      when 'retificado' then 4
      when 'fechado' then 3
      when 'aprovado' then 2
      else 1
    end desc,
    s.versao desc
  limit 1;

  if v_snapshot.id is null then
    raise exception 'RELATORIO_COORDENACAO_V4_DOCUMENTO_INDISPONIVEL'
      using errcode = 'P0002';
  end if;
  if v_snapshot.payload_hash is distinct from
       public.hash_jsonb_canonico(v_snapshot.payload - 'documento') then
    raise exception 'RELATORIO_COORDENACAO_V4_HASH_INVALIDO'
      using errcode = '22000';
  end if;

  return v_snapshot.payload;
end;
$function$;

revoke all on function public.get_relatorio_coordenacao_documento_v4(
  uuid, integer, integer, text
) from public, anon;
grant execute on function public.get_relatorio_coordenacao_documento_v4(
  uuid, integer, integer, text
) to authenticated, service_role;

comment on function public.materializar_relatorio_coordenacao_documento_v4(
  uuid, integer, integer, text, text, text
) is 'Materializador V4 append-only com transicao monotona; documento final so muda por nova retificacao justificada.';

comment on function public.get_relatorio_coordenacao_documento_v4(
  uuid, integer, integer, text
) is 'Leitor V4 materializado que prioriza retificado, fechado e aprovado antes de qualquer preview.';

commit;
