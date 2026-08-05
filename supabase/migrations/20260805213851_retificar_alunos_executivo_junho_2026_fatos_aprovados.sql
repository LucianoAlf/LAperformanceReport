-- Retificacao append-only de junho/2026, aprovada pelo Alf em 05/08/2026.
--
-- Preserva integralmente os quatro snapshots V1 de alunos_executivo e copia
-- todos os campos de estado para V2. Somente os fatos/derivadas explicitamente
-- aprovados sao substituidos: evasoes regulares, churn, MRR perdido e reajuste.

do $retificar_alunos_executivo_junho_2026$
declare
  v_base record;
  v_payload_novo jsonb;
  v_snapshot_novo_id uuid;
  v_churn numeric;
  v_quantidade integer;
  v_divergencias_estado integer;
  v_campos_mutaveis text[] := array[
    'evasoes',
    'total_evasoes',
    'churn_rate',
    'mrr_perdido',
    'reajustes_validos',
    'reajuste_medio',
    'reajuste_pct'
  ];
begin
  if exists (
    select 1
    from public.fechamento_mensal_snapshots s
    where s.ano = 2026
      and s.mes = 6
      and s.dominio = 'alunos_executivo'
      and s.versao > 1
  ) then
    raise exception 'RETIFICACAO_JUNHO_JA_EXISTE';
  end if;

  with aprovados as (
    select *
    from (values
      ('unidade'::text, 'Barra'::text,
       '70f92cbe8cc8edb24ca2a84a46e10698a48c0a6107923648a68dcc13ab18377b'::text,
       3::integer, 1181.00::numeric, 9::integer, 10.17::numeric),
      ('unidade'::text, 'Campo Grande'::text,
       '02d4815fb70a8ae920f5735e5a85d7dcd46ace132e8a78c26a3072d527e102dc'::text,
       24::integer, 8805.00::numeric, 22::integer, 11.77::numeric),
      ('unidade'::text, 'Recreio'::text,
       'c54004721efd0d60239fb6860cac8f852e0a458b0d68e4f53feb86a8f1454a03'::text,
       14::integer, 5964.25::numeric, 14::integer, 9.50::numeric),
      ('consolidado'::text, null::text,
       'c9039f511f74ee453b9238e9025c19cfb66bb7e4d85224205cdcb34cf9c91e94'::text,
       41::integer, 15950.25::numeric, 45::integer, 10.74::numeric)
    ) as x(
      escopo, unidade_nome, payload_hash_esperado, evasoes, mrr_perdido,
      reajustes_validos, reajuste_medio
    )
  )
  select count(*)
  into v_quantidade
  from public.fechamento_mensal_snapshots s
  left join public.unidades u on u.id = s.unidade_id
  join aprovados a
    on a.escopo = s.escopo
   and a.unidade_nome is not distinct from u.nome
   and a.payload_hash_esperado = s.payload_hash
  where s.ano = 2026
    and s.mes = 6
    and s.dominio = 'alunos_executivo'
    and s.versao = 1
    and s.status = 'aprovado'
    and public.hash_jsonb_canonico(s.payload) = s.payload_hash;

  if v_quantidade <> 4 then
    raise exception 'BASE_JUNHO_DIVERGENTE: esperados 4 graos V1 integros, encontrados %', v_quantidade;
  end if;

  for v_base in
    with aprovados as (
      select *
      from (values
        ('unidade'::text, 'Barra'::text,
         '70f92cbe8cc8edb24ca2a84a46e10698a48c0a6107923648a68dcc13ab18377b'::text,
         3::integer, 1181.00::numeric, 9::integer, 10.17::numeric),
        ('unidade'::text, 'Campo Grande'::text,
         '02d4815fb70a8ae920f5735e5a85d7dcd46ace132e8a78c26a3072d527e102dc'::text,
         24::integer, 8805.00::numeric, 22::integer, 11.77::numeric),
        ('unidade'::text, 'Recreio'::text,
         'c54004721efd0d60239fb6860cac8f852e0a458b0d68e4f53feb86a8f1454a03'::text,
         14::integer, 5964.25::numeric, 14::integer, 9.50::numeric),
        ('consolidado'::text, null::text,
         'c9039f511f74ee453b9238e9025c19cfb66bb7e4d85224205cdcb34cf9c91e94'::text,
         41::integer, 15950.25::numeric, 45::integer, 10.74::numeric)
      ) as x(
        escopo, unidade_nome, payload_hash_esperado, evasoes, mrr_perdido,
        reajustes_validos, reajuste_medio
      )
    )
    select
      s.*,
      u.nome as unidade_nome,
      a.evasoes as evasoes_aprovadas,
      a.mrr_perdido as mrr_perdido_aprovado,
      a.reajustes_validos as reajustes_validos_aprovados,
      a.reajuste_medio as reajuste_medio_aprovado
    from public.fechamento_mensal_snapshots s
    left join public.unidades u on u.id = s.unidade_id
    join aprovados a
      on a.escopo = s.escopo
     and a.unidade_nome is not distinct from u.nome
     and a.payload_hash_esperado = s.payload_hash
    where s.ano = 2026
      and s.mes = 6
      and s.dominio = 'alunos_executivo'
      and s.versao = 1
    order by s.escopo, u.nome
  loop
    v_churn := round(
      100.0 * v_base.evasoes_aprovadas::numeric
      / nullif((v_base.payload ->> 'alunos_pagantes')::numeric, 0),
      2
    );

    if v_churn is null then
      raise exception 'CHURN_SEM_BASE_PAGANTES: %', coalesce(v_base.unidade_nome, 'Consolidado');
    end if;

    v_payload_novo := v_base.payload || jsonb_build_object(
      'evasoes', v_base.evasoes_aprovadas,
      'total_evasoes', v_base.evasoes_aprovadas,
      'churn_rate', v_churn,
      'mrr_perdido', v_base.mrr_perdido_aprovado,
      'reajustes_validos', v_base.reajustes_validos_aprovados,
      'reajuste_medio', v_base.reajuste_medio_aprovado,
      'reajuste_pct', v_base.reajuste_medio_aprovado
    );

    if public.hash_jsonb_canonico(v_base.payload - v_campos_mutaveis)
       <> public.hash_jsonb_canonico(v_payload_novo - v_campos_mutaveis) then
      raise exception 'CAMPO_ESTADO_DIVERGIU: %', coalesce(v_base.unidade_nome, 'Consolidado');
    end if;

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel, observacao,
      capturado_em, capturado_por, aprovado_em, aprovado_por,
      fechado_em, fechado_por
    ) values (
      2026, 6, v_base.escopo, v_base.unidade_id, 'alunos_executivo', 2,
      'retificado', 'snapshot_estado_v1+fatos_junho_aprovados_20260805',
      v_payload_novo, public.hash_jsonb_canonico(v_payload_novo),
      v_base.financeiro_realizado_disponivel,
      'Retificacao aprovada pelo Alf em 05/08/2026: evasoes regulares, churn, MRR perdido e reajustes; estado integral da V1 preservado.',
      now(), null, now(), null, now(), null
    )
    returning id into v_snapshot_novo_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_snapshot_novo_id, 2026, 6, v_base.escopo, v_base.unidade_id,
      'retificacao_solicitada',
      jsonb_build_object(
        'status', 'publicada',
        'aprovada_por', 'Alf',
        'aprovada_em', '2026-08-05',
        'snapshot_base_id', v_base.id,
        'snapshot_base_versao', 1,
        'snapshot_base_hash', v_base.payload_hash,
        'campos_alterados', v_campos_mutaveis,
        'antes', jsonb_build_object(
          'evasoes', v_base.payload -> 'evasoes',
          'total_evasoes', v_base.payload -> 'total_evasoes',
          'churn_rate', v_base.payload -> 'churn_rate',
          'mrr_perdido', v_base.payload -> 'mrr_perdido',
          'reajustes_validos', v_base.payload -> 'reajustes_validos',
          'reajuste_medio', v_base.payload -> 'reajuste_medio',
          'reajuste_pct', v_base.payload -> 'reajuste_pct'
        ),
        'depois', jsonb_build_object(
          'evasoes', v_payload_novo -> 'evasoes',
          'total_evasoes', v_payload_novo -> 'total_evasoes',
          'churn_rate', v_payload_novo -> 'churn_rate',
          'mrr_perdido', v_payload_novo -> 'mrr_perdido',
          'reajustes_validos', v_payload_novo -> 'reajustes_validos',
          'reajuste_medio', v_payload_novo -> 'reajuste_medio',
          'reajuste_pct', v_payload_novo -> 'reajuste_pct'
        )
      ),
      null
    );
  end loop;

  select count(*)
  into v_quantidade
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026
    and s.mes = 6
    and s.dominio = 'alunos_executivo'
    and s.versao = 2
    and s.status = 'retificado'
    and public.hash_jsonb_canonico(s.payload) = s.payload_hash;

  if v_quantidade <> 4 then
    raise exception 'RETIFICACAO_INCOMPLETA: esperados 4 graos V2, encontrados %', v_quantidade;
  end if;

  select count(*)
  into v_divergencias_estado
  from public.fechamento_mensal_snapshots v1
  join public.fechamento_mensal_snapshots v2
    on v2.ano = v1.ano
   and v2.mes = v1.mes
   and v2.escopo = v1.escopo
   and v2.unidade_id is not distinct from v1.unidade_id
   and v2.dominio = v1.dominio
   and v2.versao = 2
  where v1.ano = 2026
    and v1.mes = 6
    and v1.dominio = 'alunos_executivo'
    and v1.versao = 1
    and public.hash_jsonb_canonico(v1.payload - v_campos_mutaveis)
        is distinct from public.hash_jsonb_canonico(v2.payload - v_campos_mutaveis);

  if v_divergencias_estado <> 0 then
    raise exception 'PARIDADE_ESTADO_FALHOU: % divergencias', v_divergencias_estado;
  end if;
end;
$retificar_alunos_executivo_junho_2026$;
