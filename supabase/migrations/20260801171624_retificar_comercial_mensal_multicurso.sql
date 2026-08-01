-- Corrige a composicao comercial mensal para agrupar cursos adicionais pagos.
-- na mesma matricula comercial principal. Competencias fechadas nao sao
-- reescritas: a correcao e registrada em uma camada append-only, com os hashes
-- original e corrigido e uma entrada na auditoria do fechamento.

create table public.fechamento_mensal_retificacoes (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.fechamento_mensal_snapshots(id),
  base_payload_hash text not null check (length(base_payload_hash) = 64),
  payload_corrigido jsonb not null,
  payload_corrigido_hash text not null check (length(payload_corrigido_hash) = 64),
  motivo text not null check (length(btrim(motivo)) >= 20),
  evidencias jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidencias) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (snapshot_id, payload_corrigido_hash)
);

create index fechamento_mensal_retificacoes_snapshot_idx
  on public.fechamento_mensal_retificacoes (snapshot_id, created_at desc);

create or replace function public.bloquear_mutacao_retificacao_mensal_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'RETIFICACAO_MENSAL_IMUTAVEL';
end;
$function$;

create trigger fechamento_mensal_retificacoes_append_only
before update or delete on public.fechamento_mensal_retificacoes
for each row execute function public.bloquear_mutacao_retificacao_mensal_v1();

alter table public.fechamento_mensal_retificacoes enable row level security;

revoke all on table public.fechamento_mensal_retificacoes
  from public, anon, authenticated;
grant select, insert on table public.fechamento_mensal_retificacoes
  to service_role;

comment on table public.fechamento_mensal_retificacoes is
  'Retificacoes append-only aplicadas somente na leitura de relatorios mensais fechados; o snapshot original permanece imutavel.';

alter function public.montar_relatorio_comercial_mensal_payload_v1(uuid, integer, integer)
  rename to montar_relatorio_comercial_mensal_payload_sem_adicionais_v1;

revoke all on function public.montar_relatorio_comercial_mensal_payload_sem_adicionais_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.montar_relatorio_comercial_mensal_payload_v1(
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
  v_payload jsonb;
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim_exclusivo date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
  v_capturado_em timestamptz;
  v_matriculas jsonb := '[]'::jsonb;
  v_matriculas_curso jsonb := '[]'::jsonb;
  v_matriculas_total integer := 0;
  v_total_passaporte numeric := 0;
  v_total_parcela numeric := 0;
  v_qtd_passaporte integer := 0;
  v_qtd_parcela integer := 0;
begin
  v_payload := public.montar_relatorio_comercial_mensal_payload_sem_adicionais_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );
  v_capturado_em := nullif(v_payload->>'capturado_em', '')::timestamptz;

  if v_capturado_em is null then
    raise exception 'RELATORIO_COMERCIAL_MENSAL_SEM_CORTE_TEMPORAL';
  end if;

  with base as (
    select
      a.id,
      a.unidade_id,
      a.nome,
      a.idade_atual,
      a.data_matricula,
      a.telefone,
      a.responsavel_telefone,
      a.valor_passaporte,
      a.valor_parcela,
      c.nome as curso_nome,
      pf.nome as professor_nome,
      pe.nome as professor_experimental_nome,
      fp.nome as forma_pagamento,
      coalesce(coa.nome, col.nome, 'Nao informado') as canal_nome,
      coalesce(a.is_segundo_curso, false) as is_segundo_curso,
      (
        coalesce(a.is_segundo_curso, false) = false
        and upper(coalesce(tm.codigo, '')) <> 'SEGUNDO_CURSO'
      ) as eh_principal,
      lower(regexp_replace(trim(coalesce(a.nome, '')), '\s+', ' ', 'g'))
        || '|tel:' || regexp_replace(
          coalesce(nullif(a.telefone, ''), a.responsavel_telefone, ''),
          '\D', '', 'g'
        ) as pessoa_key
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
        and l.created_at <= v_capturado_em
        and (
          l.aluno_id = a.id
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
      and a.data_matricula >= v_inicio
      and a.data_matricula < v_fim_exclusivo
      and a.created_at <= v_capturado_em
      and a.arquivado_em is null
      and lower(coalesce(a.status, '')) not in (
        'excluido', 'excluida', 'cancelado', 'cancelada'
      )
      and coalesce(c.is_projeto_banda, false) = false
      and lower(coalesce(c.nome, '')) not like '%banda%'
      and lower(coalesce(c.nome, '')) not like '%canto coral%'
      and upper(coalesce(tm.codigo, '')) not in (
        'BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'TRANSFERENCIA'
      )
      and (
        coalesce(tm.conta_como_pagante, false) = true
        or coalesce(tm.entra_ticket_medio, false) = true
      )
      and coalesce(a.valor_parcela, 0) > 0
  ), agrupadas as (
    select
      unidade_id,
      data_matricula,
      pessoa_key,
      min(id) filter (where eh_principal) as id,
      min(nome) as nome,
      max(idade_atual) as idade,
      string_agg(curso_nome, ' e ' order by eh_principal desc, id)
        filter (where curso_nome is not null) as cursos,
      string_agg(distinct professor_nome, ' e ' order by professor_nome)
        filter (where professor_nome is not null) as professores,
      string_agg(distinct professor_experimental_nome, ' e ' order by professor_experimental_nome)
        filter (where professor_experimental_nome is not null) as professores_experimentais,
      string_agg(distinct forma_pagamento, ' e ' order by forma_pagamento)
        filter (where forma_pagamento is not null) as formas_pagamento,
      (array_agg(canal_nome order by eh_principal desc, id))[1] as canal,
      max(coalesce(valor_passaporte, 0)) as valor_passaporte,
      sum(coalesce(valor_parcela, 0)) as valor_parcela,
      jsonb_agg(valor_parcela order by id)
        filter (where coalesce(valor_parcela, 0) > 0) as parcelas
    from base
    group by unidade_id, data_matricula, pessoa_key
    having bool_or(coalesce(is_segundo_curso, false) = false and eh_principal)
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'nome', nome,
        'idade', idade,
        'data_matricula', data_matricula,
        'cursos', cursos,
        'professores', professores,
        'professores_experimentais', professores_experimentais,
        'formas_pagamento', formas_pagamento,
        'canal', canal,
        'valor_passaporte', valor_passaporte,
        'valor_parcela', valor_parcela,
        'parcelas', coalesce(parcelas, '[]'::jsonb)
      ) order by data_matricula, nome, id
    ), '[]'::jsonb),
    count(*)::integer,
    coalesce(sum(valor_passaporte), 0),
    count(*) filter (where valor_passaporte > 0)::integer,
    coalesce(sum(valor_parcela), 0),
    count(*) filter (where valor_parcela > 0)::integer
  into
    v_matriculas,
    v_matriculas_total,
    v_total_passaporte,
    v_qtd_passaporte,
    v_total_parcela,
    v_qtd_parcela
  from agrupadas;

  if v_matriculas_total <> coalesce((v_payload#>>'{resumo,matriculas}')::integer, 0) then
    raise exception 'RELATORIO_COMERCIAL_MENSAL_QUANTIDADE_DIVERGENTE: agrupadas %, principais %',
      v_matriculas_total,
      coalesce((v_payload#>>'{resumo,matriculas}')::integer, 0);
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('nome', curso, 'quantidade', quantidade)
    order by quantidade desc, curso
  ), '[]'::jsonb)
  into v_matriculas_curso
  from (
    select curso, count(*)::integer as quantidade
    from jsonb_array_elements(v_matriculas) item
    cross join lateral regexp_split_to_table(
      coalesce(item->>'cursos', 'Nao informado'),
      '\s+e\s+'
    ) curso
    group by curso
  ) q;

  v_payload := jsonb_set(v_payload, '{matriculas}', v_matriculas, false);
  v_payload := jsonb_set(v_payload, '{matriculas_por_curso}', v_matriculas_curso, false);
  v_payload := jsonb_set(
    v_payload,
    '{resumo,total_passaportes}',
    to_jsonb(round(v_total_passaporte, 2)),
    false
  );
  v_payload := jsonb_set(
    v_payload,
    '{resumo,total_parcelas}',
    to_jsonb(round(v_total_parcela, 2)),
    false
  );
  v_payload := jsonb_set(
    v_payload,
    '{resumo,ticket_medio_passaporte}',
    to_jsonb(
      case when v_qtd_passaporte > 0
        then round(v_total_passaporte / v_qtd_passaporte, 2)
        else 0
      end
    ),
    false
  );
  v_payload := jsonb_set(
    v_payload,
    '{resumo,ticket_medio_parcela}',
    to_jsonb(
      case when v_qtd_parcela > 0
        then round(v_total_parcela / v_qtd_parcela, 2)
        else 0
      end
    ),
    false
  );

  return v_payload;
end;
$function$;

revoke all on function public.montar_relatorio_comercial_mensal_payload_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.aplicar_retificacao_relatorio_comercial_mensal_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_payload_hash_esperado text,
  p_motivo text,
  p_evidencias jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_payload_corrigido jsonb;
  v_payload_corrigido_hash text;
  v_retificacao_id uuid;
  v_inserida boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_RETIFICACAO_MENSAL';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 20 then
    raise exception 'RETIFICACAO_MENSAL_MOTIVO_OBRIGATORIO';
  end if;
  if jsonb_typeof(coalesce(p_evidencias, '{}'::jsonb)) <> 'object' then
    raise exception 'RETIFICACAO_MENSAL_EVIDENCIAS_INVALIDAS';
  end if;

  select * into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.unidade_id = p_unidade_id
    and s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.dominio = 'relatorio_comercial_mensal'
    and s.status = 'fechado'
  order by s.versao desc
  limit 1
  for update;

  if v_snapshot.id is null then
    raise exception 'RETIFICACAO_MENSAL_SNAPSHOT_INDISPONIVEL';
  end if;
  if public.hash_jsonb_canonico(v_snapshot.payload) <> v_snapshot.payload_hash
     or v_snapshot.payload_hash <> p_payload_hash_esperado then
    raise exception 'RETIFICACAO_MENSAL_HASH_BASE_DIVERGENTE';
  end if;

  v_payload_corrigido := public.montar_relatorio_comercial_mensal_payload_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  if coalesce((v_snapshot.payload#>>'{resumo,leads}')::integer, 0)
       <> coalesce((v_payload_corrigido#>>'{resumo,leads}')::integer, 0)
     or coalesce((v_snapshot.payload#>>'{resumo,experimentais}')::integer, 0)
       <> coalesce((v_payload_corrigido#>>'{resumo,experimentais}')::integer, 0)
     or coalesce((v_snapshot.payload#>>'{resumo,faltas}')::integer, 0)
       <> coalesce((v_payload_corrigido#>>'{resumo,faltas}')::integer, 0)
     or coalesce((v_snapshot.payload#>>'{resumo,visitas}')::integer, 0)
       <> coalesce((v_payload_corrigido#>>'{resumo,visitas}')::integer, 0)
     or coalesce((v_snapshot.payload#>>'{resumo,matriculas}')::integer, 0)
       <> coalesce((v_payload_corrigido#>>'{resumo,matriculas}')::integer, 0)
     or coalesce((v_snapshot.payload#>>'{resumo,conversoes_exp_mat}')::integer, 0)
       <> coalesce((v_payload_corrigido#>>'{resumo,conversoes_exp_mat}')::integer, 0)
     or coalesce((v_snapshot.payload#>>'{resumo,total_passaportes}')::numeric, 0)
       <> coalesce((v_payload_corrigido#>>'{resumo,total_passaportes}')::numeric, 0) then
    raise exception 'RETIFICACAO_MENSAL_INVARIANTE_DIVERGENTE';
  end if;

  v_payload_corrigido_hash := public.hash_jsonb_canonico(v_payload_corrigido);
  if v_payload_corrigido_hash = v_snapshot.payload_hash then
    raise exception 'RETIFICACAO_MENSAL_SEM_DIFERENCA';
  end if;

  insert into public.fechamento_mensal_retificacoes (
    snapshot_id,
    base_payload_hash,
    payload_corrigido,
    payload_corrigido_hash,
    motivo,
    evidencias,
    created_by
  ) values (
    v_snapshot.id,
    v_snapshot.payload_hash,
    v_payload_corrigido,
    v_payload_corrigido_hash,
    btrim(p_motivo),
    coalesce(p_evidencias, '{}'::jsonb),
    auth.uid()
  )
  on conflict (snapshot_id, payload_corrigido_hash) do nothing
  returning id into v_retificacao_id;

  if v_retificacao_id is not null then
    v_inserida := true;
    insert into public.fechamento_mensal_auditoria (
      snapshot_id,
      ano,
      mes,
      escopo,
      unidade_id,
      acao,
      detalhes,
      actor_id
    ) values (
      v_snapshot.id,
      v_snapshot.ano,
      v_snapshot.mes,
      v_snapshot.escopo,
      v_snapshot.unidade_id,
      'retificacao_solicitada',
      jsonb_build_object(
        'status', 'aplicada',
        'retificacao_id', v_retificacao_id,
        'base_payload_hash', v_snapshot.payload_hash,
        'payload_corrigido_hash', v_payload_corrigido_hash,
        'motivo', btrim(p_motivo),
        'evidencias', coalesce(p_evidencias, '{}'::jsonb),
        'antes', jsonb_build_object(
          'total_parcelas', v_snapshot.payload#>'{resumo,total_parcelas}',
          'ticket_medio_parcela', v_snapshot.payload#>'{resumo,ticket_medio_parcela}'
        ),
        'depois', jsonb_build_object(
          'total_parcelas', v_payload_corrigido#>'{resumo,total_parcelas}',
          'ticket_medio_parcela', v_payload_corrigido#>'{resumo,ticket_medio_parcela}'
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

revoke all on function public.aplicar_retificacao_relatorio_comercial_mensal_v1(
  uuid, integer, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.aplicar_retificacao_relatorio_comercial_mensal_v1(
  uuid, integer, integer, text, text, jsonb
) to service_role;

alter function public.get_relatorio_mensal_canonico_v1(text, uuid, integer, integer)
  rename to get_relatorio_mensal_snapshot_base_v1;

revoke all on function public.get_relatorio_mensal_snapshot_base_v1(text, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_relatorio_mensal_snapshot_base_v1(text, uuid, integer, integer)
  to service_role;

create or replace function public.get_relatorio_mensal_canonico_v1(
  p_tipo text,
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
  v_resultado jsonb;
  v_retificacao public.fechamento_mensal_retificacoes%rowtype;
begin
  v_resultado := public.get_relatorio_mensal_snapshot_base_v1(
    p_tipo,
    p_unidade_id,
    p_ano,
    p_mes
  );

  select * into v_retificacao
  from public.fechamento_mensal_retificacoes r
  where r.snapshot_id = nullif(v_resultado->>'snapshot_id', '')::uuid
  order by r.created_at desc, r.id desc
  limit 1;

  if v_retificacao.id is null then
    return v_resultado;
  end if;
  if v_retificacao.base_payload_hash <> v_resultado->>'payload_hash' then
    raise exception 'RETIFICACAO_MENSAL_HASH_BASE_DIVERGENTE';
  end if;
  if public.hash_jsonb_canonico(v_retificacao.payload_corrigido)
       <> v_retificacao.payload_corrigido_hash then
    raise exception 'RETIFICACAO_MENSAL_HASH_CORRIGIDO_DIVERGENTE';
  end if;

  return v_resultado || jsonb_build_object(
    'snapshot_payload_hash', v_resultado->>'payload_hash',
    'payload_hash', v_retificacao.payload_corrigido_hash,
    'payload', v_retificacao.payload_corrigido,
    'retificacao_id', v_retificacao.id,
    'retificado', true
  );
end;
$function$;

revoke all on function public.get_relatorio_mensal_canonico_v1(text, uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_mensal_canonico_v1(text, uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_mensal_canonico_v1(text, uuid, integer, integer) is
  'Le o snapshot mensal imutavel e, quando houver, entrega a ultima retificacao append-only com ambos os hashes validados.';

do $retificar_recreio_julho$
declare
  v_unidade_id uuid;
begin
  select u.id into strict v_unidade_id
  from public.unidades u
  where upper(u.codigo) = 'REC'
    and upper(u.nome) = 'RECREIO'
    and u.ativo = true;

  perform public.aplicar_retificacao_relatorio_comercial_mensal_v1(
    v_unidade_id,
    2026,
    7,
    'e8d111092e57b40e34ab0b1856f9fc1434b1ecad798b7a8bbff0dff3c4001a8f',
    'Inclusao auditada do curso Contrabaixo e da segunda parcela de R$ 395,00 de Gabriela da Silva Machado; snapshot original preservado.',
    jsonb_build_object(
      'aluna', 'Gabriela da Silva Machado',
      'curso_adicional', 'Contrabaixo',
      'parcela_adicional', 395.00,
      'auditoria_rede', jsonb_build_object(
        'barra_diferenca', 0,
        'campo_grande_diferenca', 0,
        'recreio_diferenca', 395.00
      )
    )
  );
end;
$retificar_recreio_julho$;
