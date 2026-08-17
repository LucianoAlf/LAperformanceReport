-- Decisoes operacionais da conciliacao financeira.
--
-- Esta tabela nao substitui o snapshot do Emusys e nao e uma forma alternativa
-- de marcar uma fatura como paga. Ela registra apenas o que a equipe conferiu
-- para que a fila operacional possa deixar de repetir o mesmo caso.

create table if not exists public.financeiro_fatura_reconciliacao_decisoes (
  id bigint generated always as identity primary key,
  unidade_id uuid not null references public.unidades(id),
  canonical_fatura_id uuid,
  competencia date not null,
  emusys_fatura_id bigint not null,
  emusys_matricula_id bigint,
  emusys_student_id bigint,
  tipo_decisao text not null check (tipo_decisao in (
    'pagamento_confirmado',
    'renovacao',
    'trancamento',
    'ultima_parcela_aviso_previo',
    'conferido_sem_cobranca',
    'forma_pagamento_manual'
  )),
  forma_pagamento_id integer references public.formas_pagamento(id),
  observacao text not null check (char_length(btrim(observacao)) >= 3),
  decidido_por text not null default 'usuario_app',
  decidido_em timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists financeiro_fatura_reconciliacao_decisoes_fatura_idx
  on public.financeiro_fatura_reconciliacao_decisoes
    (unidade_id, emusys_fatura_id, decidido_em desc, id desc);

create index if not exists financeiro_fatura_reconciliacao_decisoes_competencia_idx
  on public.financeiro_fatura_reconciliacao_decisoes
    (unidade_id, competencia, decidido_em desc);

alter table public.financeiro_fatura_reconciliacao_decisoes enable row level security;
revoke all on table public.financeiro_fatura_reconciliacao_decisoes from public, anon, authenticated;

create or replace function public.financeiro_fatura_reconciliacao_decisao_immutavel()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception using
    errcode = '55006',
    message = 'decisoes de conciliacao sao append-only; registre uma nova decisao';
end;
$function$;

drop trigger if exists financeiro_fatura_reconciliacao_decisao_immutavel
  on public.financeiro_fatura_reconciliacao_decisoes;

create trigger financeiro_fatura_reconciliacao_decisao_immutavel
before update or delete on public.financeiro_fatura_reconciliacao_decisoes
for each row execute function public.financeiro_fatura_reconciliacao_decisao_immutavel();

comment on table public.financeiro_fatura_reconciliacao_decisoes is
  'Auditoria append-only das decisoes operacionais da conciliacao de faturas. Nunca altera o status do snapshot Emusys.';

create or replace function public.resolver_reconciliacao_fatura(
  p_unidade_id uuid,
  p_emusys_fatura_id bigint,
  p_tipo_decisao text,
  p_observacao text,
  p_canonical_fatura_id uuid default null,
  p_emusys_matricula_id bigint default null,
  p_emusys_student_id bigint default null,
  p_forma_pagamento_id integer default null,
  p_decidido_por text default 'usuario_app'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_item public.sync_run_items%rowtype;
  v_forma public.formas_pagamento%rowtype;
  v_aluno_id integer;
  v_decidido_em timestamptz := now();
  v_decidido_por text := coalesce(nullif(btrim(p_decidido_por), ''), 'usuario_app');
begin
  if v_role not in ('authenticated', 'service_role') then
    raise exception using errcode = '42501', message = 'usuario nao autorizado';
  end if;

  if v_role <> 'service_role' then
    v_is_admin := public.is_admin();
    if not v_is_admin
       and not exists (
         select 1
         from public.get_user_unidade_ids() as autorizada(id)
         where autorizada.id = p_unidade_id
       ) then
      raise exception using errcode = '42501', message = 'usuario nao autorizado para esta unidade';
    end if;
  end if;

  if p_tipo_decisao not in (
    'pagamento_confirmado',
    'renovacao',
    'trancamento',
    'ultima_parcela_aviso_previo',
    'conferido_sem_cobranca',
    'forma_pagamento_manual'
  ) then
    raise exception using errcode = '22023', message = 'tipo de decisao financeira invalido';
  end if;

  if char_length(btrim(coalesce(p_observacao, ''))) < 3 then
    raise exception using errcode = '22023', message = 'observacao obrigatoria para resolver a conciliacao';
  end if;

  select i.*
    into v_item
  from public.sync_run_items i
  where i.unidade_id = p_unidade_id
    and i.emusys_fatura_id = p_emusys_fatura_id
    and (p_canonical_fatura_id is null or i.canonical_fatura_id = p_canonical_fatura_id)
  order by i.created_at desc nulls last, i.canonical_fatura_id desc
  limit 1;

  if not found then
    raise exception using errcode = 'P0002', message = 'fatura Emusys nao encontrada na unidade informada';
  end if;

  if p_emusys_matricula_id is not null
     and p_emusys_matricula_id is distinct from v_item.emusys_matricula_id then
    raise exception using errcode = '22023', message = 'matricula Emusys nao confere com a fatura';
  end if;

  if p_emusys_student_id is not null
     and p_emusys_student_id is distinct from v_item.emusys_student_id then
    raise exception using errcode = '22023', message = 'aluno Emusys nao confere com a fatura';
  end if;

  if p_tipo_decisao = 'forma_pagamento_manual' then
    if p_forma_pagamento_id is null then
      raise exception using errcode = '22023', message = 'forma de pagamento obrigatoria';
    end if;

    select *
      into v_forma
    from public.formas_pagamento
    where id = p_forma_pagamento_id
      and ativo is true;

    if not found then
      raise exception using errcode = '22023', message = 'forma de pagamento nao encontrada ou inativa';
    end if;

    if v_item.emusys_matricula_id is null or v_item.emusys_student_id is null then
      raise exception using errcode = '22023', message = 'forma manual exige matricula e aluno Emusys';
    end if;

    select e.aluno_id
      into v_aluno_id
    from public.emusys_matriculas_estado_atual e
    join public.alunos a on a.id = e.aluno_id
                         and a.unidade_id = e.unidade_id
                         and a.arquivado_em is null
    where e.unidade_id = p_unidade_id
      and e.emusys_matricula_id = v_item.emusys_matricula_id
      and e.emusys_aluno_id = v_item.emusys_student_id
      and e.aluno_id is not null
    order by e.updated_at desc nulls last
    limit 1;

    if v_aluno_id is null then
      raise exception using errcode = 'P0002', message = 'aluno local nao encontrado por matricula e aluno Emusys exatos';
    end if;

    update public.alunos
    set forma_pagamento_id = v_forma.id,
        updated_at = v_decidido_em,
        updated_by = v_decidido_por
    where id = v_aluno_id;

    insert into public.matriculas_campos_fixados
      (aluno_id, campo, valor, fixado_por, fixado_em)
    values
      (v_aluno_id, 'forma_pagamento_id', to_jsonb(v_forma.id), v_decidido_por, v_decidido_em)
    on conflict (aluno_id, campo) do update
      set valor = excluded.valor,
          fixado_por = excluded.fixado_por,
          fixado_em = excluded.fixado_em;
  end if;

  insert into public.financeiro_fatura_reconciliacao_decisoes (
    unidade_id,
    canonical_fatura_id,
    competencia,
    emusys_fatura_id,
    emusys_matricula_id,
    emusys_student_id,
    tipo_decisao,
    forma_pagamento_id,
    observacao,
    decidido_por,
    decidido_em,
    metadata
  ) values (
    p_unidade_id,
    v_item.canonical_fatura_id,
    v_item.competencia,
    v_item.emusys_fatura_id,
    v_item.emusys_matricula_id,
    v_item.emusys_student_id,
    p_tipo_decisao,
    case when p_tipo_decisao = 'forma_pagamento_manual' then p_forma_pagamento_id else null end,
    btrim(p_observacao),
    v_decidido_por,
    v_decidido_em,
    jsonb_build_object(
      'source_missing', v_item.source_missing,
      'status', v_item.status,
      'aluno_local_id', v_aluno_id,
      'fonte', 'la_report_operacao'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'canonical_fatura_id', v_item.canonical_fatura_id,
    'emusys_fatura_id', v_item.emusys_fatura_id,
    'tipo_decisao', p_tipo_decisao,
    'forma_pagamento_id', case when p_tipo_decisao = 'forma_pagamento_manual' then p_forma_pagamento_id else null end,
    'aluno_local_id', v_aluno_id,
    'status_fatura_preservado', v_item.status,
    'source_missing_preservado', v_item.source_missing
  );
end;
$function$;

revoke all on function public.resolver_reconciliacao_fatura(
  uuid, bigint, text, text, uuid, bigint, bigint, integer, text
) from public, anon;
grant execute on function public.resolver_reconciliacao_fatura(
  uuid, bigint, text, text, uuid, bigint, bigint, integer, text
) to authenticated, service_role;

-- Enriquecimento server-side: a equipe vê o nome e a forma da matrícula
-- canônica; o cruzamento continua sendo por unidade e IDs Emusys.
create or replace function public.financeiro_enriquecer_fatura_item(p_item jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_unidade_id uuid := nullif(p_item->>'unidade_id', '')::uuid;
  v_fatura_id bigint := nullif(p_item->>'emusys_fatura_id', '')::bigint;
  v_matricula_id bigint := nullif(p_item->>'emusys_matricula_id', '')::bigint;
  v_student_id bigint := nullif(p_item->>'emusys_student_id', '')::bigint;
  v_nome text := nullif(btrim(p_item #>> '{aluno,nome}'), '');
  v_nome_estado text;
  v_forma_estado text;
  v_forma_manual text;
  v_forma_nome text := nullif(btrim(p_item #>> '{forma_pagamento,nome}'), '');
  v_forma_fonte text := coalesce(nullif(p_item #>> '{forma_pagamento,fonte}', ''), 'ausente');
  v_forma_rotulo text := coalesce(nullif(p_item #>> '{forma_pagamento,rotulo}', ''), 'Forma nao informada');
begin
  select
    nullif(btrim(e.payload_snapshot #>> '{aluno,nome}'), ''),
    coalesce(
      nullif(btrim(e.payload_snapshot #>> '{contrato_atual,forma_pagamento}'), ''),
      nullif(btrim(e.payload_snapshot #>> '{cobranca_automatica,forma_pagamento}'), ''),
      nullif(btrim(e.payload_snapshot #>> '{forma_pagamento}'), '')
    )
    into v_nome_estado, v_forma_estado
  from public.emusys_matriculas_estado_atual e
  where e.unidade_id = v_unidade_id
    and (v_matricula_id is not null or v_student_id is not null)
    and (v_matricula_id is null or e.emusys_matricula_id = v_matricula_id)
    and (v_student_id is null or e.emusys_aluno_id = v_student_id)
  order by e.updated_at desc nulls last
  limit 1;

  if v_nome is null or v_nome in ('Aluno nao vinculado', 'Historico de ex-aluno', 'Lancamento financeiro sem aluno') then
    select a.nome
      into v_nome
    from public.alunos a
    where a.unidade_id = v_unidade_id
      and a.arquivado_em is null
      and (
        (v_matricula_id is not null and a.emusys_matricula_id = v_matricula_id::text)
        or (v_student_id is not null and a.emusys_student_id = v_student_id::text)
      )
    order by case when v_matricula_id is not null and a.emusys_matricula_id = v_matricula_id::text then 0 else 1 end, a.id
    limit 1;
  end if;

  if v_nome is null or v_nome in ('Aluno nao vinculado', 'Historico de ex-aluno', 'Lancamento financeiro sem aluno') then
    select a.nome
      into v_nome
    from public.alunos_arquivados a
    where a.unidade_id = v_unidade_id
      and (
        (v_matricula_id is not null and a.emusys_matricula_id = v_matricula_id::text)
        or (v_student_id is not null and a.emusys_student_id = v_student_id::text)
      )
    order by case when v_matricula_id is not null and a.emusys_matricula_id = v_matricula_id::text then 0 else 1 end, a.id
    limit 1;
  end if;

  if v_nome is null or v_nome in ('Aluno nao vinculado', 'Historico de ex-aluno', 'Lancamento financeiro sem aluno') then
    v_nome := v_nome_estado;
  end if;

  select fp.nome
    into v_forma_manual
  from public.financeiro_fatura_reconciliacao_decisoes d
  join public.formas_pagamento fp on fp.id = d.forma_pagamento_id
  where d.unidade_id = v_unidade_id
    and d.emusys_fatura_id = v_fatura_id
    and d.tipo_decisao = 'forma_pagamento_manual'
    and d.forma_pagamento_id is not null
  order by d.decidido_em desc, d.id desc
  limit 1;

  if v_forma_manual is not null then
    v_forma_nome := v_forma_manual;
    v_forma_fonte := 'manual';
    v_forma_rotulo := 'Forma informada';
  elsif v_forma_nome is null and v_forma_estado is not null then
    v_forma_nome := v_forma_estado;
    v_forma_fonte := 'emusys_matricula';
    v_forma_rotulo := 'Forma prevista';
  end if;

  return p_item
    || jsonb_build_object(
      'aluno', coalesce(p_item->'aluno', '{}'::jsonb)
        || jsonb_build_object('nome', coalesce(v_nome, p_item #>> '{aluno,nome}', 'Aluno nao vinculado')),
      'forma_pagamento', coalesce(p_item->'forma_pagamento', '{}'::jsonb)
        || jsonb_build_object(
          'nome', v_forma_nome,
          'fonte', v_forma_fonte,
          'rotulo', v_forma_rotulo
        )
    );
end;
$function$;

-- Publica a mesma leitura canonica com a fila operacional resolvivel.
create or replace function public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default extract(month from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_item jsonb;
  v_enriched jsonb;
  v_motivos jsonb;
  v_filtrados jsonb;
  v_reconciliacao jsonb;
  v_main_items jsonb := '[]'::jsonb;
  v_reconciliation_items jsonb := '[]'::jsonb;
  v_unidade_id uuid;
  v_fatura_id bigint;
  v_decisoes text[];
  v_categoria text;
  v_fora_historico integer := 0;
  v_fora_avulso integer := 0;
  v_resolvidas integer := 0;
  v_source_missing integer := 0;
  v_identidade integer := 0;
  v_status integer := 0;
  v_validacoes integer := 0;
  v_forma integer := 0;
  v_contato integer := 0;
  v_total integer := 0;
  v_motivo text;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_20260817(
    p_unidade_id, p_ano, p_mes, p_modo_periodo, p_status, p_as_of_date
  );

  select coalesce(jsonb_agg(public.financeiro_enriquecer_fatura_item(value) order by ord), '[]'::jsonb)
    into v_main_items
  from jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) with ordinality as rows(value, ord);
  v_payload := jsonb_set(v_payload, '{items}', v_main_items, true);

  for v_item in select value from jsonb_array_elements(coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)) as rows(value) loop
    v_enriched := public.financeiro_enriquecer_fatura_item(v_item);
    v_unidade_id := nullif(v_enriched->>'unidade_id', '')::uuid;
    v_fatura_id := nullif(v_enriched->>'emusys_fatura_id', '')::bigint;
    v_motivos := coalesce(v_enriched->'motivos', '[]'::jsonb);
    v_categoria := case
      when lower(coalesce(v_enriched #>> '{aluno,estado_operacional}', '')) in ('evadido', 'inativo', 'trancado', 'trancada')
        or v_motivos ? 'historico_ex_aluno' then 'historico_ex_aluno'
      when v_motivos ? 'registro_nao_aluno'
        or (
          v_enriched->>'emusys_matricula_id' is null
          and (
            coalesce(nullif(btrim(v_enriched->>'emusys_student_id'), ''), '1') in ('0', '1')
            or lower(coalesce(v_enriched->>'descricao', '')) like '%passaporte%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%estoque%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%caderno%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%clips%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%coach%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%palheta%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%rateio entre unidades%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%ingresso%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locacao%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locação%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%bora gravar%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprestimo%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%empréstimo%'
          )
        ) then 'registro_nao_aluno'
      else null
    end;

    if v_categoria = 'historico_ex_aluno' then
      v_fora_historico := v_fora_historico + 1;
      continue;
    elsif v_categoria = 'registro_nao_aluno' then
      v_fora_avulso := v_fora_avulso + 1;
      continue;
    end if;

    select coalesce(array_agg(distinct d.tipo_decisao), '{}'::text[])
      into v_decisoes
    from public.financeiro_fatura_reconciliacao_decisoes d
    where d.unidade_id = v_unidade_id
      and d.emusys_fatura_id = v_fatura_id;

    select coalesce(jsonb_agg(motivo), '[]'::jsonb)
      into v_filtrados
    from jsonb_array_elements_text(v_motivos) as motivos(motivo)
    where not (
      (motivo = 'source_missing' and (
        'pagamento_confirmado' = any(v_decisoes)
        or 'renovacao' = any(v_decisoes)
        or 'trancamento' = any(v_decisoes)
        or 'ultima_parcela_aviso_previo' = any(v_decisoes)
        or 'conferido_sem_cobranca' = any(v_decisoes)
      ))
      or (motivo = 'forma_pagamento_ausente' and 'forma_pagamento_manual' = any(v_decisoes))
      or ('conferido_sem_cobranca' = any(v_decisoes))
    );

    if jsonb_array_length(v_filtrados) = 0 then
      if cardinality(v_decisoes) > 0 then v_resolvidas := v_resolvidas + 1; end if;
      continue;
    end if;

    v_enriched := jsonb_set(v_enriched, '{motivos}', v_filtrados, true);
    v_reconciliation_items := v_reconciliation_items || jsonb_build_array(v_enriched);
    v_total := v_total + 1;

    for v_motivo in select value from jsonb_array_elements_text(v_filtrados) as motivos(value) loop
      if v_motivo = 'source_missing' then v_source_missing := v_source_missing + 1;
      elsif v_motivo = 'identidade_invalida' then v_identidade := v_identidade + 1;
      elsif v_motivo = 'status_desconhecido' then v_status := v_status + 1;
      elsif v_motivo = 'validacao_origem' then v_validacoes := v_validacoes + 1;
      elsif v_motivo = 'forma_pagamento_ausente' then v_forma := v_forma + 1;
      elsif v_motivo = 'contato_pendente' then v_contato := v_contato + 1;
      end if;
    end loop;
  end loop;

  v_reconciliacao := jsonb_build_object(
    'source_missing', v_source_missing,
    'identidade_invalida', v_identidade,
    'status_desconhecido', v_status,
    'validacoes_origem', v_validacoes,
    'forma_pagamento_ausente', v_forma,
    'contato_pendente', v_contato,
    'total', v_total,
    'resolvidas_manualmente', v_resolvidas,
    'fora_operacao', jsonb_build_object(
      'historico_ex_aluno', v_fora_historico,
      'registro_nao_aluno', v_fora_avulso,
      'total', v_fora_historico + v_fora_avulso
    ),
    'items', v_reconciliation_items
  );

  v_payload := jsonb_set(v_payload, '{reconciliation}', v_reconciliacao, true);
  v_payload := jsonb_set(
    v_payload,
    '{status}',
    to_jsonb(case
      when coalesce((v_payload #>> '{freshness,competencias_stale}')::integer, 0) > 0 then 'stale'
      when v_total > 0 then 'partial'
      else 'ok'
    end),
    true
  );
  return v_payload;
end;
$function$;

comment on function public.get_faturas_alunos_financeiro_v1(
  uuid, integer, integer, text, text, date
) is
  'Leitura canonica de faturas com reconciliacao operacional manual auditavel; historico e lancamentos avulsos ficam fora da fila.';

revoke all on function public.get_faturas_alunos_financeiro_v1(
  uuid, integer, integer, text, text, date
) from public, anon;
grant execute on function public.get_faturas_alunos_financeiro_v1(
  uuid, integer, integer, text, text, date
) to authenticated, service_role;
