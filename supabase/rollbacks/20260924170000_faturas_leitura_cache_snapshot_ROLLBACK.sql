-- Rollback: volta o wrapper sem cache e remove tabela/invalidacao.
-- Recria get_faturas_alunos_financeiro_v1 exatamente como a versao pre-cache
-- (delega para _contrato_tipo_20260817 + enriquecimento de tipos).

CREATE OR REPLACE FUNCTION public.get_faturas_alunos_financeiro_v1(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_modo_periodo text DEFAULT 'janela_3'::text, p_status text DEFAULT 'todas'::text, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
declare
  v_payload jsonb;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(
    p_unidade_id,
    p_ano,
    p_mes,
    p_modo_periodo,
    p_status,
    p_as_of_date
  );
  v_payload := jsonb_set(
    v_payload,
    '{items}',
    public.financeiro_enriquecer_tipos_fatura_v1(coalesce(v_payload->'items', '[]'::jsonb)),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{reconciliation,items}',
    public.financeiro_enriquecer_tipos_fatura_v1(coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)),
    true
  );
  return v_payload;
end;
$function$;

-- Remove a invalidacao do resolver (o delete no fim do corpo): sem a tabela
-- o delete quebraria a funcao. Reaplicar o resolver original do arquivo
-- 20260822153000_conciliacao_parcela_remarcada_e_outro.sql se necessario —
-- aqui basta dropar a tabela DEPOIS de restaurar o resolver sem o delete.
-- Como o rollback acima nao toca o resolver, fazemos a troca na ordem certa:
-- 1) restaura o resolver sem a linha de delete (edicao minima);

CREATE OR REPLACE FUNCTION public.resolver_reconciliacao_fatura(p_unidade_id uuid, p_emusys_fatura_id bigint, p_tipo_decisao text, p_observacao text, p_canonical_fatura_id uuid DEFAULT NULL::uuid, p_emusys_matricula_id bigint DEFAULT NULL::bigint, p_emusys_student_id bigint DEFAULT NULL::bigint, p_forma_pagamento_id integer DEFAULT NULL::integer, p_decidido_por text DEFAULT 'usuario_app'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    'forma_pagamento_manual',
    'parcela_remarcada',
    'outro'
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

drop table if exists public.faturas_leitura_cache;
