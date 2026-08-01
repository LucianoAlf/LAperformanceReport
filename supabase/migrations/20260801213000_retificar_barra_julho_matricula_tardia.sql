-- Retifica, de forma append-only, uma matricula comercial criada depois do
-- corte do fechamento, mas cuja competencia de negocio pertence ao mes fechado.
-- O snapshot original e seu hash permanecem imutaveis.

create or replace function public.aplicar_retificacao_relatorio_comercial_matricula_tardia_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_payload_hash_esperado text,
  p_aluno_id bigint,
  p_emusys_matricula_id text,
  p_data_matricula date,
  p_motivo text,
  p_evidencias jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inicio date;
  v_fim_exclusivo date;
  v_documento jsonb;
  v_payload_atual jsonb;
  v_payload_corrigido jsonb;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_item jsonb;
  v_matriculas jsonb;
  v_conciliacao jsonb;
  v_resumo_conciliacao jsonb;
  v_matriculas_total integer;
  v_experimentais integer;
  v_conversoes integer;
  v_pendencias integer;
  v_leads integer;
  v_total_passaporte numeric;
  v_total_parcela numeric;
  v_qtd_passaporte integer;
  v_qtd_parcela integer;
  v_matriculas_canal jsonb;
  v_matriculas_curso jsonb;
  v_payload_corrigido_hash text;
  v_retificacao_id uuid;
  v_inserida boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_RETIFICACAO_MATRICULA_TARDIA';
  end if;
  if p_unidade_id is null
     or p_ano not between 2020 and 2100
     or p_mes not between 1 and 12
     or p_aluno_id is null
     or nullif(btrim(coalesce(p_emusys_matricula_id, '')), '') is null
     or p_data_matricula is null then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_PARAMETROS_INVALIDOS';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 20 then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_MOTIVO_OBRIGATORIO';
  end if;
  if jsonb_typeof(coalesce(p_evidencias, '{}'::jsonb)) <> 'object' then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_EVIDENCIAS_INVALIDAS';
  end if;

  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim_exclusivo := (v_inicio + interval '1 month')::date;
  if p_data_matricula < v_inicio or p_data_matricula >= v_fim_exclusivo then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_COMPETENCIA_DIVERGENTE';
  end if;

  v_documento := public.get_relatorio_mensal_canonico_v1(
    'comercial', p_unidade_id, p_ano, p_mes
  );
  if coalesce(v_documento->>'status', '') <> 'fechado'
     or jsonb_typeof(v_documento->'payload') <> 'object' then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_SNAPSHOT_INDISPONIVEL';
  end if;
  if coalesce(v_documento->>'payload_hash', '') <> p_payload_hash_esperado then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_HASH_EFETIVO_DIVERGENTE';
  end if;

  select * into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.id = nullif(v_documento->>'snapshot_id', '')::uuid
    and s.unidade_id = p_unidade_id
    and s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.dominio = 'relatorio_comercial_mensal'
    and s.status = 'fechado'
  for update;

  if v_snapshot.id is null
     or public.hash_jsonb_canonico(v_snapshot.payload) <> v_snapshot.payload_hash
     or coalesce(
       nullif(v_documento->>'snapshot_payload_hash', ''),
       nullif(v_documento->>'payload_hash', '')
     ) <> v_snapshot.payload_hash then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_HASH_BASE_DIVERGENTE';
  end if;

  v_payload_atual := v_documento->'payload';
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload_atual->'matriculas', '[]'::jsonb)) item
    where item->>'id' = p_aluno_id::text
  ) then
    return jsonb_build_object(
      'snapshot_id', v_snapshot.id,
      'snapshot_payload_hash', v_snapshot.payload_hash,
      'retificacao_id', nullif(v_documento->>'retificacao_id', '')::uuid,
      'payload_corrigido_hash', v_documento->>'payload_hash',
      'inserida', false
    );
  end if;

  select jsonb_build_object(
    'id', a.id,
    'nome', a.nome,
    'idade', a.idade_atual,
    'data_matricula', a.data_matricula,
    'cursos', c.nome,
    'professores', pf.nome,
    'professores_experimentais', pe.nome,
    'formas_pagamento', fp.nome,
    'canal', coalesce(coa.nome, col.nome, 'Nao informado'),
    'valor_passaporte', coalesce(a.valor_passaporte, 0),
    'valor_parcela', coalesce(a.valor_parcela, 0),
    'parcelas', case
      when coalesce(a.valor_parcela, 0) > 0 then jsonb_build_array(a.valor_parcela)
      else '[]'::jsonb
    end
  ) into v_item
  from public.alunos a
  left join public.cursos c on c.id = a.curso_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  left join public.professores pf on pf.id = a.professor_atual_id
  left join public.professores pe on pe.id = a.professor_experimental_id
  left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
  left join public.canais_origem coa on coa.id = a.canal_origem_id
  left join lateral (
    select l.canal_origem_id
    from public.leads l
    where l.unidade_id = a.unidade_id
      and (
        l.aluno_id = a.id
        or l.id = a.lead_origem_id
        or (
          nullif(a.emusys_lead_id, '') ~ '^[0-9]+$'
          and l.emusys_lead_id = a.emusys_lead_id::integer
        )
      )
    order by (l.aluno_id = a.id) desc, l.created_at desc, l.id desc
    limit 1
  ) lead on true
  left join public.canais_origem col on col.id = lead.canal_origem_id
  where a.unidade_id = p_unidade_id
    and a.id = p_aluno_id
    and a.emusys_matricula_id = p_emusys_matricula_id
    and a.data_matricula = p_data_matricula
    and a.data_matricula >= v_inicio
    and a.data_matricula < v_fim_exclusivo
    and a.created_at > v_snapshot.capturado_em
    and a.arquivado_em is null
    and lower(coalesce(a.status, '')) not in (
      'excluido', 'excluida', 'cancelado', 'cancelada'
    )
    and coalesce(a.is_segundo_curso, false) = false
    and coalesce(c.is_projeto_banda, false) = false
    and lower(coalesce(c.nome, '')) not like '%banda%'
    and lower(coalesce(c.nome, '')) not like '%canto coral%'
    and upper(coalesce(tm.codigo, '')) not in (
      'BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA',
      'SEGUNDO_CURSO', 'TRANSFERENCIA'
    )
    and (
      coalesce(tm.conta_como_pagante, false) = true
      or coalesce(tm.entra_ticket_medio, false) = true
    )
    and coalesce(a.valor_parcela, 0) > 0;

  if v_item is null then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_ITEM_NAO_ELEGIVEL';
  end if;

  if jsonb_array_length(coalesce(v_payload_atual->'matriculas', '[]'::jsonb))
       <> coalesce((v_payload_atual#>>'{resumo,matriculas}')::integer, -1) then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_LISTA_DIVERGENTE';
  end if;

  select coalesce(jsonb_agg(item order by
    (item->>'data_matricula')::date,
    item->>'nome',
    (item->>'id')::bigint
  ), '[]'::jsonb)
  into v_matriculas
  from (
    select item
    from jsonb_array_elements(coalesce(v_payload_atual->'matriculas', '[]'::jsonb)) item
    union all
    select v_item
  ) q;
  v_matriculas_total := jsonb_array_length(v_matriculas);

  v_conciliacao := public.get_conciliacao_experimentais_v2(
    p_unidade_id, p_ano, p_mes, 'mensal', null
  );
  v_resumo_conciliacao := coalesce(v_conciliacao->'resumo', '{}'::jsonb);
  v_experimentais := coalesce(
    nullif(v_resumo_conciliacao->>'denominador_taxa_exp_mat', '')::integer,
    0
  );
  v_conversoes := coalesce(
    nullif(v_resumo_conciliacao->>'conversoes_exp_mat_canonicas', '')::integer,
    0
  );
  v_pendencias := coalesce(
    nullif(v_resumo_conciliacao->>'pendencias_taxa_exp_mat', '')::integer,
    0
  );
  if coalesce(
       nullif(v_resumo_conciliacao->>'matriculas_comerciais_canonicas_periodo', '')::integer,
       -1
     ) <> v_matriculas_total
     or v_experimentais <> coalesce((v_payload_atual#>>'{resumo,experimentais}')::integer, -1)
     or v_pendencias <> 0
     or v_conversoes > v_matriculas_total then
    raise exception 'RETIFICACAO_MATRICULA_TARDIA_CONCILIACAO_DIVERGENTE';
  end if;

  select
    coalesce(sum((item->>'valor_passaporte')::numeric), 0),
    coalesce(sum((item->>'valor_parcela')::numeric), 0),
    count(*) filter (where coalesce((item->>'valor_passaporte')::numeric, 0) > 0)::integer,
    count(*) filter (where coalesce((item->>'valor_parcela')::numeric, 0) > 0)::integer
  into v_total_passaporte, v_total_parcela, v_qtd_passaporte, v_qtd_parcela
  from jsonb_array_elements(v_matriculas) item;

  select coalesce(jsonb_agg(
    jsonb_build_object('nome', nome, 'quantidade', quantidade)
    order by quantidade desc, nome
  ), '[]'::jsonb)
  into v_matriculas_canal
  from (
    select coalesce(item->>'canal', 'Nao informado') as nome,
           count(*)::integer as quantidade
    from jsonb_array_elements(v_matriculas) item
    group by coalesce(item->>'canal', 'Nao informado')
  ) canais;

  select coalesce(jsonb_agg(
    jsonb_build_object('nome', nome, 'quantidade', quantidade)
    order by quantidade desc, nome
  ), '[]'::jsonb)
  into v_matriculas_curso
  from (
    select curso as nome, count(*)::integer as quantidade
    from jsonb_array_elements(v_matriculas) item
    cross join lateral regexp_split_to_table(
      coalesce(item->>'cursos', 'Nao informado'), '\s+e\s+'
    ) curso
    group by curso
  ) cursos;

  v_leads := coalesce((v_payload_atual#>>'{resumo,leads}')::integer, 0);
  v_payload_corrigido := jsonb_set(v_payload_atual, '{matriculas}', v_matriculas, false);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{matriculas_por_canal}', v_matriculas_canal, false);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{matriculas_por_curso}', v_matriculas_curso, false);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{resumo,matriculas}', to_jsonb(v_matriculas_total), false);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{resumo,conversoes_exp_mat}', to_jsonb(v_conversoes), false);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{resumo,pendencias_conciliacao}', to_jsonb(v_pendencias), false);
  v_payload_corrigido := jsonb_set(
    v_payload_corrigido, '{resumo,taxa_lead_exp}',
    to_jsonb(case when v_leads > 0 then round(v_experimentais::numeric / v_leads * 100, 1) else 0 end), false
  );
  v_payload_corrigido := jsonb_set(
    v_payload_corrigido, '{resumo,taxa_exp_mat}',
    to_jsonb(case when v_experimentais > 0 then round(v_conversoes::numeric / v_experimentais * 100, 1) else null end), false
  );
  v_payload_corrigido := jsonb_set(
    v_payload_corrigido, '{resumo,taxa_lead_mat}',
    to_jsonb(case when v_leads > 0 then round(v_matriculas_total::numeric / v_leads * 100, 1) else 0 end), false
  );
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{resumo,total_passaportes}', to_jsonb(round(v_total_passaporte, 2)), false);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{resumo,total_parcelas}', to_jsonb(round(v_total_parcela, 2)), false);
  v_payload_corrigido := jsonb_set(
    v_payload_corrigido, '{resumo,ticket_medio_passaporte}',
    to_jsonb(case when v_qtd_passaporte > 0 then round(v_total_passaporte / v_qtd_passaporte, 2) else 0 end), false
  );
  v_payload_corrigido := jsonb_set(
    v_payload_corrigido, '{resumo,ticket_medio_parcela}',
    to_jsonb(case when v_qtd_parcela > 0 then round(v_total_parcela / v_qtd_parcela, 2) else 0 end), false
  );

  v_payload_corrigido_hash := public.hash_jsonb_canonico(v_payload_corrigido);
  insert into public.fechamento_mensal_retificacoes (
    snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
    motivo, evidencias, created_by
  ) values (
    v_snapshot.id, v_snapshot.payload_hash, v_payload_corrigido,
    v_payload_corrigido_hash, btrim(p_motivo),
    coalesce(p_evidencias, '{}'::jsonb) || jsonb_build_object(
      'tipo', 'matricula_tardia',
      'aluno_id', p_aluno_id,
      'emusys_matricula_id', p_emusys_matricula_id,
      'data_matricula', p_data_matricula,
      'created_at_apos_corte', true
    ),
    auth.uid()
  )
  on conflict (snapshot_id, payload_corrigido_hash) do nothing
  returning id into v_retificacao_id;

  if v_retificacao_id is not null then
    v_inserida := true;
    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_snapshot.id, v_snapshot.ano, v_snapshot.mes, v_snapshot.escopo,
      v_snapshot.unidade_id, 'retificacao_matricula_tardia',
      jsonb_build_object(
        'status', 'aplicada',
        'retificacao_id', v_retificacao_id,
        'base_payload_hash', v_snapshot.payload_hash,
        'payload_anterior_hash', v_documento->>'payload_hash',
        'payload_corrigido_hash', v_payload_corrigido_hash,
        'motivo', btrim(p_motivo),
        'evidencias', coalesce(p_evidencias, '{}'::jsonb),
        'antes', jsonb_build_object(
          'matriculas', v_payload_atual#>'{resumo,matriculas}',
          'conversoes_exp_mat', v_payload_atual#>'{resumo,conversoes_exp_mat}',
          'total_passaportes', v_payload_atual#>'{resumo,total_passaportes}',
          'total_parcelas', v_payload_atual#>'{resumo,total_parcelas}'
        ),
        'depois', jsonb_build_object(
          'matriculas', v_payload_corrigido#>'{resumo,matriculas}',
          'conversoes_exp_mat', v_payload_corrigido#>'{resumo,conversoes_exp_mat}',
          'total_passaportes', v_payload_corrigido#>'{resumo,total_passaportes}',
          'total_parcelas', v_payload_corrigido#>'{resumo,total_parcelas}'
        )
      ),
      auth.uid()
    );
  else
    select r.id into v_retificacao_id
    from public.fechamento_mensal_retificacoes r
    where r.snapshot_id = v_snapshot.id
      and r.payload_corrigido_hash = v_payload_corrigido_hash;
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot.id,
    'snapshot_payload_hash', v_snapshot.payload_hash,
    'retificacao_id', v_retificacao_id,
    'payload_corrigido_hash', v_payload_corrigido_hash,
    'inserida', v_inserida
  );
end;
$function$;

revoke all on function public.aplicar_retificacao_relatorio_comercial_matricula_tardia_v1(
  uuid, integer, integer, text, bigint, text, date, text, jsonb
) from public, anon, authenticated;
grant execute on function public.aplicar_retificacao_relatorio_comercial_matricula_tardia_v1(
  uuid, integer, integer, text, bigint, text, date, text, jsonb
) to service_role;

comment on function public.aplicar_retificacao_relatorio_comercial_matricula_tardia_v1(
  uuid, integer, integer, text, bigint, text, date, text, jsonb
) is 'Acrescenta uma matricula tardia comprovada ao documento mensal efetivo por retificacao append-only, sem alterar o snapshot fechado.';

-- Responsabilidade vigente e configuracao operacional, nao dado historico do
-- fechamento. O produtor gerencial le este valor atual antes do nome congelado.
update public.unidades
set gerente_nome = 'Clayton'
where id = '95553e96-971b-4590-a6eb-0201d013c14d'
  and gerente_nome = 'Fabiola/Clayton';

do $validar_gerente_recreio$
begin
  if not exists (
    select 1 from public.unidades
    where id = '95553e96-971b-4590-a6eb-0201d013c14d'
      and gerente_nome = 'Clayton'
  ) then
    raise exception 'GERENTE_RECREIO_DIVERGENTE';
  end if;
end;
$validar_gerente_recreio$;

do $retificar_barra_julho$
declare
  v_documento jsonb;
begin
  v_documento := public.get_relatorio_mensal_canonico_v1(
    'comercial',
    '368d47f5-2d88-4475-bc14-ba084a9a348e',
    2026,
    7
  );

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_documento#>'{payload,matriculas}', '[]'::jsonb)) item
    where item->>'id' = '1893'
  ) then
    return;
  end if;

  if coalesce(
       nullif(v_documento->>'snapshot_payload_hash', ''),
       nullif(v_documento->>'payload_hash', '')
     ) <> '136c1626f4c512e82b82138c395f585a5c3de7e10ad1269862176d7acd8d0458' then
    raise exception 'RETIFICACAO_BARRA_JULHO_HASH_NAO_AUTORIZADO';
  end if;

  perform public.aplicar_retificacao_relatorio_comercial_matricula_tardia_v1(
    '368d47f5-2d88-4475-bc14-ba084a9a348e',
    2026,
    7,
    v_documento->>'payload_hash',
    1893,
    '840',
    date '2026-07-31',
    'Inclusao auditada de Luiza P Caruso, lancada depois do corte com data de matricula pertencente a julho; snapshot original preservado.',
    jsonb_build_object(
      'aluna', 'Luiza P Caruso',
      'origem', 'validacao_operacional_barra',
      'snapshot_base_hash', '136c1626f4c512e82b82138c395f585a5c3de7e10ad1269862176d7acd8d0458',
      'criterio', 'data_matricula_2026_07_31_e_created_at_apos_fechamento'
    )
  );
end;
$retificar_barra_julho$;
