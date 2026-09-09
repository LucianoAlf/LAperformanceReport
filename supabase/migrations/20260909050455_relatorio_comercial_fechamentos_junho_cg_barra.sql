begin;

-- Campo Grande e Barra tinham o fechamento administrativo de junho, mas nao o
-- documento comercial detalhado. O construtor mensal ainda conserva o corte
-- original de 01/07 e devolve 13 matriculas para cada unidade. Materializamos
-- essas duas lacunas como novas evidencias append-only; nenhum snapshot antigo
-- e alterado e nenhuma linha e criada por diferenca de total.
do $migration$
declare
  v_unidade record;
  v_payload jsonb;
  v_existente public.fechamento_mensal_snapshots%rowtype;
  v_snapshot_id uuid;
  v_versao integer;
  v_hash text;
  v_invalidas integer;
  v_unidades_alvo integer;
  v_ids_esperados integer[];
  v_ids_obtidos integer[];
begin
  select count(*) into v_unidades_alvo
  from public.unidades u
  where upper(u.codigo) in ('CG', 'BARRA');

  -- Ambientes novos nao carregam dados de producao. Neles a migration de
  -- reparo historico e deliberadamente um no-op; nenhuma fixture e fabricada.
  if v_unidades_alvo = 0 then
    raise notice 'RELATORIO_COMERCIAL_JUNHO_SEM_UNIDADES_DE_PRODUCAO';
    return;
  end if;

  if v_unidades_alvo <> 2 then
    raise exception 'RELATORIO_COMERCIAL_JUNHO_UNIDADES_INESPERADAS'
      using errcode = '22000';
  end if;

  for v_unidade in
    select u.id, upper(u.codigo) as codigo, u.nome, 13::integer as total_esperado
    from public.unidades u
    where upper(u.codigo) in ('CG', 'BARRA')
    order by u.codigo
  loop
    v_ids_esperados := case v_unidade.codigo
      when 'CG' then array[1745,1746,1751,1752,1756,1758,1763,1770,1773,1790,1792,1801,1806]
      when 'BARRA' then array[1737,1765,1769,1777,1791,1793,1794,1796,1797,1798,1800,1802,1807]
      else array[]::integer[]
    end;

    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws(':', 'relatorio-comercial-junho-2026', v_unidade.codigo),
      0
    ));

    v_existente := null;
    select s.* into v_existente
    from public.fechamento_mensal_snapshots s
    where s.ano = 2026
      and s.mes = 6
      and s.escopo = 'unidade'
      and s.unidade_id = v_unidade.id
      and s.dominio = 'relatorio_comercial_mensal'
    order by s.versao desc
    limit 1;

    if v_existente.id is not null then
      if v_existente.status not in ('aprovado', 'fechado', 'retificado')
         or jsonb_typeof(v_existente.payload -> 'matriculas') <> 'array'
         or jsonb_array_length(v_existente.payload -> 'matriculas') <> v_unidade.total_esperado
         or nullif(v_existente.payload #>> '{resumo,matriculas}', '')::integer
              <> v_unidade.total_esperado
         or v_existente.payload_hash <> public.hash_jsonb_canonico(v_existente.payload) then
        raise exception 'RELATORIO_COMERCIAL_JUNHO_EXISTENTE_INVALIDO: unidade %',
          v_unidade.nome using errcode = '22000';
      end if;

      select coalesce(
        array_agg(distinct (item ->> 'id')::integer order by (item ->> 'id')::integer),
        array[]::integer[]
      ) into v_ids_obtidos
      from jsonb_array_elements(v_existente.payload -> 'matriculas') item
      where coalesce(item ->> 'id', '') ~ '^\d+$';

      if v_ids_obtidos is distinct from v_ids_esperados then
        raise exception 'RELATORIO_COMERCIAL_JUNHO_IDS_INESPERADOS: unidade %',
          v_unidade.nome using errcode = '22000';
      end if;
      continue;
    end if;

    v_payload := public.montar_relatorio_comercial_mensal_payload_v1(
      v_unidade.id,
      2026,
      6
    );

    if jsonb_typeof(v_payload) <> 'object'
       or jsonb_typeof(v_payload -> 'matriculas') <> 'array'
       or nullif(v_payload #>> '{competencia,ano}', '')::integer <> 2026
       or nullif(v_payload #>> '{competencia,mes}', '')::integer <> 6
       or nullif(v_payload #>> '{unidade,id}', '')::uuid <> v_unidade.id
       or jsonb_array_length(v_payload -> 'matriculas') <> v_unidade.total_esperado
       or nullif(v_payload #>> '{resumo,matriculas}', '')::integer
            <> v_unidade.total_esperado
       or nullif(v_payload ->> 'capturado_em', '') is null
       or nullif(v_payload ->> 'capturado_em', '')::timestamptz
            < timestamptz '2026-07-01 00:00:00+00'
       or nullif(v_payload ->> 'capturado_em', '')::timestamptz
            >= timestamptz '2026-07-02 00:00:00+00' then
      raise exception 'RELATORIO_COMERCIAL_JUNHO_PAYLOAD_INVALIDO: unidade %',
        v_unidade.nome using errcode = '22000';
    end if;

    select count(*) into v_invalidas
    from jsonb_array_elements(v_payload -> 'matriculas') item
    where coalesce(item ->> 'id', '') !~ '^\d+$'
       or nullif(item ->> 'data_matricula', '')::date < date '2026-06-01'
       or nullif(item ->> 'data_matricula', '')::date >= date '2026-07-01';

    if v_invalidas <> 0 or (
      select count(distinct item ->> 'id')
      from jsonb_array_elements(v_payload -> 'matriculas') item
    ) <> v_unidade.total_esperado then
      raise exception 'RELATORIO_COMERCIAL_JUNHO_LINHAS_INVALIDAS: unidade %',
        v_unidade.nome using errcode = '22000';
    end if;

    select coalesce(
      array_agg(distinct (item ->> 'id')::integer order by (item ->> 'id')::integer),
      array[]::integer[]
    ) into v_ids_obtidos
    from jsonb_array_elements(v_payload -> 'matriculas') item
    where coalesce(item ->> 'id', '') ~ '^\d+$';

    if v_ids_obtidos is distinct from v_ids_esperados then
      raise exception 'RELATORIO_COMERCIAL_JUNHO_IDS_INESPERADOS: unidade %',
        v_unidade.nome using errcode = '22000';
    end if;

    select coalesce(max(s.versao), 0) + 1 into v_versao
    from public.fechamento_mensal_snapshots s
    where s.ano = 2026
      and s.mes = 6
      and s.escopo = 'unidade'
      and s.unidade_id = v_unidade.id
      and s.dominio = 'relatorio_comercial_mensal';

    v_hash := public.hash_jsonb_canonico(v_payload);
    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, observacao,
      capturado_em, capturado_por, aprovado_em, aprovado_por,
      fechado_em, fechado_por
    ) values (
      2026, 6, 'unidade', v_unidade.id, 'relatorio_comercial_mensal',
      v_versao, 'retificado',
      'montar_relatorio_comercial_mensal_payload_v1',
      v_payload, v_hash,
      'Fechamento comercial de junho materializado a partir do corte original preservado no construtor mensal',
      now(), auth.uid(), now(), auth.uid(), now(), auth.uid()
    ) returning id into v_snapshot_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_snapshot_id, 2026, 6, 'unidade', v_unidade.id,
      'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_comercial_mensal',
        'fonte', 'montar_relatorio_comercial_mensal_payload_v1',
        'versao', v_versao,
        'motivo', 'fechamento_comercial_junho_ausente',
        'total_matriculas', v_unidade.total_esperado,
        'corte_preservado', v_payload ->> 'capturado_em',
        'payload_hash', v_hash
      ),
      auth.uid()
    );
  end loop;
end;
$migration$;

commit;
