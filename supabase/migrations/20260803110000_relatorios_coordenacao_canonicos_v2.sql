begin;

create or replace function public.montar_relatorio_coordenacao_payload_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inicio date;
  v_fim date;
  v_base jsonb;
  v_professores jsonb := '[]'::jsonb;
  v_operacional_por_professor jsonb := '{}'::jsonb;
  v_saidas jsonb := '{}'::jsonb;
  v_total_turmas integer := 0;
  v_ocupacoes_elegiveis integer := 0;
  v_turmas_elegiveis integer := 0;
  v_media_turma numeric := 0;
begin
  if p_ano is null or p_ano < 2020 or p_ano > 2100
     or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_COORDENACAO_V2_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim := (v_inicio + interval '1 month - 1 day')::date;
  v_base := public.get_relatorio_coordenacao_canonico_v1(p_unidade_id, p_ano, p_mes);

  if v_base is null
     or jsonb_typeof(v_base->'professores') <> 'array' then
    raise exception 'RELATORIO_COORDENACAO_V2_BASE_INDISPONIVEL';
  end if;

  with roster as (
    select distinct (item->>'professor_id')::integer as professor_id
    from jsonb_array_elements(v_base->'professores') item
    where nullif(item->>'professor_id', '') is not null
  ),
  kpis as (
    select k.*
    from public.get_kpis_professor_periodo_canonico_v3(
      p_ano,
      p_mes,
      p_unidade_id,
      v_inicio,
      v_fim
    ) k
    join roster r on r.professor_id = k.professor_id
  ),
  kpis_professor as (
    select
      k.professor_id,
      coalesce(sum(k.total_turmas), 0)::integer as total_turmas,
      coalesce(sum(k.alunos_via_turmas), 0)::integer as alunos_via_turmas,
      coalesce(sum(k.turmas_elegiveis_media), 0)::integer as turmas_elegiveis_media,
      coalesce(sum(k.carteira_alunos), 0)::integer as carteira_alunos,
      coalesce(sum(k.evasoes_validas), 0)::integer as evasoes_validas,
      coalesce(sum(k.nao_renovacoes_validas), 0)::integer as nao_renovacoes_validas,
      coalesce(sum(k.saidas_validas_total), 0)::integer as saidas_validas_total,
      coalesce(sum(k.saidas_score_professor), 0)::integer as saidas_score_professor,
      coalesce(sum(k.mrr_perdido_total), 0)::numeric as mrr_perdido_total,
      coalesce(sum(k.mrr_perdido_score), 0)::numeric as mrr_perdido_score
    from kpis k
    group by k.professor_id
  )
  select
    coalesce(
      jsonb_object_agg(
        k.professor_id::text,
        jsonb_build_object(
          'total_turmas', k.total_turmas,
          'alunos_via_turmas', k.alunos_via_turmas,
          'turmas_elegiveis_media', k.turmas_elegiveis_media,
          'carteira_alunos', k.carteira_alunos,
          'evasoes_validas', k.evasoes_validas,
          'nao_renovacoes_validas', k.nao_renovacoes_validas,
          'saidas_validas_total', k.saidas_validas_total,
          'saidas_score_professor', k.saidas_score_professor,
          'mrr_perdido_total', k.mrr_perdido_total,
          'mrr_perdido_score', k.mrr_perdido_score
        )
      ),
      '{}'::jsonb
    ),
    coalesce(sum(k.total_turmas), 0)::integer,
    coalesce(sum(k.alunos_via_turmas), 0)::integer,
    coalesce(sum(k.turmas_elegiveis_media), 0)::integer
  into
    v_operacional_por_professor,
    v_total_turmas,
    v_ocupacoes_elegiveis,
    v_turmas_elegiveis
  from kpis_professor k;

  v_media_turma := case
    when v_turmas_elegiveis > 0
      then round(v_ocupacoes_elegiveis::numeric / v_turmas_elegiveis, 2)
    else 0
  end;

  select coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'operacional',
        coalesce(v_operacional_por_professor->(item->>'professor_id'), '{}'::jsonb)
      )
      order by item->>'nome'
    ),
    '[]'::jsonb
  )
  into v_professores
  from jsonb_array_elements(v_base->'professores') item;

  with movimentos as (
    select
      m.id,
      m.data,
      m.tipo::text as tipo,
      coalesce(nullif(btrim(m.aluno_nome), ''), a.nome, 'Aluno não informado') as aluno_nome,
      m.professor_id,
      coalesce(p.nome, 'Professor não informado') as professor_nome,
      nullif(btrim(coalesce(m.motivo, '')), '') as motivo,
      coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)::numeric as valor_mrr,
      coalesce(ms.conta_score_professor, false) as conta_score_professor
    from public.movimentacoes_admin m
    left join public.alunos a on a.id = m.aluno_id
    left join public.professores p on p.id = m.professor_id
    left join lateral (
      select motivo.conta_score_professor
      from public.motivos_saida motivo
      where motivo.ativo = true
        and (
          motivo.id = m.motivo_saida_id
          or (
            m.motivo_saida_id is null
            and m.motivo is not null
            and lower(btrim(motivo.nome)) = lower(btrim(m.motivo))
          )
        )
      order by case when motivo.id = m.motivo_saida_id then 0 else 1 end, motivo.id
      limit 1
    ) ms on true
    where m.tipo in ('evasao', 'nao_renovacao')
      and m.data between v_inicio and v_fim
      and (p_unidade_id is null or m.unidade_id = p_unidade_id)
      and public.is_movimentacao_admin_retencao_valida(m.id)
      and coalesce(a.is_segundo_curso, false) = false
  )
  select jsonb_build_object(
    'evasoes_validas', count(*) filter (where tipo = 'evasao'),
    'nao_renovacoes_validas', count(*) filter (where tipo = 'nao_renovacao'),
    'saidas_validas_total', count(*),
    'saidas_atribuiveis_professor', count(*) filter (where conta_score_professor),
    'mrr_perdido_total', coalesce(sum(valor_mrr), 0),
    'mrr_perdido_atribuivel', coalesce(sum(valor_mrr) filter (where conta_score_professor), 0),
    'movimentos', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'data', data,
          'tipo', tipo,
          'aluno_nome', aluno_nome,
          'professor_id', professor_id,
          'professor_nome', professor_nome,
          'motivo', motivo,
          'valor_mrr', valor_mrr,
          'conta_score_professor', conta_score_professor
        ) order by data, id
      ),
      '[]'::jsonb
    ),
    'regra_publica', 'Movimentações válidas da competência, com impacto no professor separado do total operacional'
  )
  into v_saidas
  from movimentos;

  return v_base || jsonb_build_object(
    'schema_version', 2,
    'professores', v_professores,
    'carteira_carga', coalesce(v_base->'carteira_carga', '{}'::jsonb) || jsonb_build_object(
      'total_turmas_operacionais', v_total_turmas,
      'ocupacoes_elegiveis', v_ocupacoes_elegiveis,
      'turmas_elegiveis', v_turmas_elegiveis,
      'media_alunos_turma', v_media_turma,
      'grao_carteira', 'vinculo_professor_pessoa',
      'grao_turmas', 'turma_operacional',
      'grao_media', 'ocupacoes_elegiveis_por_turma_elegivel'
    ),
    'saidas_retencao', v_saidas,
    'auditoria', jsonb_build_object(
      'contrato', 'relatorio-coordenacao-pedagogica-2',
      'imutavel', false,
      'fonte_publica', 'Dados oficiais da competência selecionada no LA Report'
    )
  );
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_payload_v2(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.montar_relatorio_coordenacao_payload_v2(uuid, integer, integer) is
  'Produtor interno V2 dos cinco relatorios da Coordenacao. Une Health Score diagnostico, presenca ponderada, carteira com graos explicitos e movimentos de retencao validos.';

create or replace function public.capturar_relatorio_coordenacao_canonico_v2(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null,
  p_motivo text default 'Fechamento canônico dos relatórios da Coordenação'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_mes_atual date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
  v_unidade record;
  v_payload jsonb;
  v_snapshot_id uuid;
  v_versao integer;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_CAPTURA_RELATORIO_COORDENACAO_V2';
  end if;
  if p_ano is null or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'COMPETENCIA_RELATORIO_COORDENACAO_V2_INVALIDA';
  end if;

  v_competencia := make_date(p_ano, p_mes, 1);
  if v_competencia >= v_mes_atual then
    raise exception 'RELATORIO_COORDENACAO_V2_FECHAMENTO_APENAS_HISTORICO';
  end if;

  for v_unidade in
    select u.id as unidade_id, u.nome as unidade_nome, 'unidade'::text as escopo
    from public.unidades u
    where u.ativo = true
      and (p_unidade_id is null or u.id = p_unidade_id)
    union all
    select null::uuid, 'Consolidado'::text, 'consolidado'::text
    where p_unidade_id is null
    order by unidade_nome
  loop
    if exists (
      select 1
      from public.fechamento_mensal_snapshots s
      where s.ano = p_ano
        and s.mes = p_mes
        and s.escopo = v_unidade.escopo
        and s.unidade_id is not distinct from v_unidade.unidade_id
        and s.dominio = 'relatorio_coordenacao'
        and s.status = 'fechado'
        and s.fonte = 'montar_relatorio_coordenacao_payload_v2'
        and s.payload->>'schema_version' = '2'
    ) then
      continue;
    end if;

    v_payload := public.montar_relatorio_coordenacao_payload_v2(
      v_unidade.unidade_id,
      p_ano,
      p_mes
    );
    v_payload := v_payload || jsonb_build_object(
      'auditoria', coalesce(v_payload->'auditoria', '{}'::jsonb) || jsonb_build_object(
        'imutavel', true,
        'fechado_em', now()
      )
    );

    select coalesce(max(s.versao), 0) + 1
      into v_versao
    from public.fechamento_mensal_snapshots s
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = v_unidade.escopo
      and s.unidade_id is not distinct from v_unidade.unidade_id
      and s.dominio = 'relatorio_coordenacao';

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, observacao,
      capturado_por, aprovado_em, aprovado_por, fechado_em, fechado_por
    ) values (
      p_ano, p_mes, v_unidade.escopo, v_unidade.unidade_id,
      'relatorio_coordenacao', v_versao, 'fechado',
      'montar_relatorio_coordenacao_payload_v2', v_payload,
      public.hash_jsonb_canonico(v_payload), nullif(btrim(p_motivo), ''),
      auth.uid(), now(), auth.uid(), now(), auth.uid()
    ) returning id into v_snapshot_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_snapshot_id, p_ano, p_mes, v_unidade.escopo, v_unidade.unidade_id,
      'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_coordenacao',
        'fonte', 'montar_relatorio_coordenacao_payload_v2',
        'versao', v_versao,
        'motivo', p_motivo
      ),
      auth.uid()
    );

    v_count := v_count + 1;
    v_ids := v_ids || jsonb_build_array(v_snapshot_id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'ano', p_ano,
    'mes', p_mes,
    'snapshots_capturados', v_count,
    'snapshot_ids', v_ids
  );
end;
$function$;

revoke all on function public.capturar_relatorio_coordenacao_canonico_v2(integer, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.capturar_relatorio_coordenacao_canonico_v2(integer, integer, uuid, text)
  to service_role;

comment on function public.capturar_relatorio_coordenacao_canonico_v2(integer, integer, uuid, text) is
  'Captura uma nova versao fechada e imutavel do contrato V2 sem alterar versoes historicas existentes.';

create or replace function public.get_relatorio_coordenacao_canonico_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_mes_atual date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
  v_escopo text;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_payload jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_ano is null or p_ano < 2020 or p_ano > 2100
     or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_COORDENACAO_V2_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_competencia := make_date(p_ano, p_mes, 1);
  if v_competencia >= v_mes_atual then
    return public.montar_relatorio_coordenacao_payload_v2(p_unidade_id, p_ano, p_mes);
  end if;

  v_escopo := case when p_unidade_id is null then 'consolidado' else 'unidade' end;
  select * into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = v_escopo
    and s.unidade_id is not distinct from p_unidade_id
    and s.dominio = 'relatorio_coordenacao'
    and s.status = 'fechado'
    and s.fonte = 'montar_relatorio_coordenacao_payload_v2'
    and s.payload->>'schema_version' = '2'
  order by s.versao desc
  limit 1;

  if v_snapshot.id is null then
    raise exception 'RELATORIO_COORDENACAO_V2_FECHADO_INDISPONIVEL';
  end if;
  if public.hash_jsonb_canonico(v_snapshot.payload) <> v_snapshot.payload_hash then
    raise exception 'RELATORIO_COORDENACAO_V2_HASH_DIVERGENTE';
  end if;

  v_payload := v_snapshot.payload || jsonb_build_object(
    'auditoria', coalesce(v_snapshot.payload->'auditoria', '{}'::jsonb) || jsonb_build_object(
      'imutavel', true,
      'snapshot_id', v_snapshot.id,
      'payload_hash', v_snapshot.payload_hash,
      'versao', v_snapshot.versao,
      'status', v_snapshot.status,
      'fechado_em', v_snapshot.fechado_em
    )
  );
  return v_payload;
end;
$function$;

revoke all on function public.get_relatorio_coordenacao_canonico_v2(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_coordenacao_canonico_v2(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_coordenacao_canonico_v2(uuid, integer, integer) is
  'Leitura unica dos cinco relatorios da Coordenacao: competencia historica usa fechamento V2 imutavel; competencia atual usa dados vivos.';

commit;
