-- 24/09/2026 — detector de lancamento duplicado no caixa.
-- Caso real (CG): duas entradas de R$377 "Moisés — Bateria" (05/09 e 21/09)
-- apontando a mesma fatura 46286. A de 05/09 era lancamento errado e ficou
-- invisivel ate o Super Folha cruzar extrato x fatura x caixa.
--
-- Regra conservadora: 2+ entradas com o MESMO valor na MESMA fatura =
-- suspeita de duplicata (pagamento dividido gera valores diferentes;
-- composto paga faturas diferentes). Motivo novo: duplicata_caixa.
-- A fatura entra na fila com a prova (as entradas) ja' anexada; a equipe
-- resolve com a decisao nova 'duplicata_caixa_confirmada' ou outra existente.

alter table public.financeiro_fatura_reconciliacao_decisoes
  drop constraint if exists financeiro_fatura_reconciliacao_decisoes_tipo_decisao_check;

alter table public.financeiro_fatura_reconciliacao_decisoes
  add constraint financeiro_fatura_reconciliacao_decisoes_tipo_decisao_check
  check (tipo_decisao = any (array[
    'pagamento_confirmado'::text,
    'renovacao'::text,
    'trancamento'::text,
    'ultima_parcela_aviso_previo'::text,
    'conferido_sem_cobranca'::text,
    'forma_pagamento_manual'::text,
    'parcela_remarcada'::text,
    'outro'::text,
    'duplicata_caixa_confirmada'::text
  ]));

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
    'outro',
    'duplicata_caixa_confirmada'
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

  -- Invalida a leitura cacheada: a fila mudou fora do ciclo do snapshot.
  delete from public.faturas_leitura_cache;

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
$function$

;

CREATE OR REPLACE FUNCTION public.get_faturas_alunos_financeiro_v1_canonica_20260817(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_modo_periodo text DEFAULT 'janela_3'::text, p_status text DEFAULT 'todas'::text, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_service_role boolean := false;
  v_is_admin boolean := false;
  v_inicio date;
  v_fim date;
  v_canonical jsonb;
  v_collection_allowed boolean := false;
  v_result jsonb;
begin
  if p_ano not between 2000 and 2200
     or p_mes not between 1 and 12 then
    raise exception using
      errcode = '22023',
      message = 'competencia financeira invalida';
  end if;

  if p_modo_periodo not in ('janela_3', 'competencia') then
    raise exception using
      errcode = '22023',
      message = 'p_modo_periodo deve ser janela_3 ou competencia';
  end if;

  if p_status not in (
    'todas',
    'pagas',
    'em_aberto',
    'em_atraso_d0',
    'a_vencer',
    'canceladas',
    'cobranca_d2',
    'reconciliacao'
  ) then
    raise exception using
      errcode = '22023',
      message = 'p_status financeiro invalido';
  end if;

  if p_as_of_date is null
     or p_as_of_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using
      errcode = '22023',
      message = 'p_as_of_date nao pode estar no futuro';
  end if;

  if v_role not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'papel nao autorizado para consultar faturas';
  end if;

  v_service_role := v_role = 'service_role';
  if not v_service_role then
    v_is_admin := public.is_admin();
    if not v_is_admin
       and p_unidade_id is not null
       and not exists (
         select 1
         from public.get_user_unidade_ids() as unidade_autorizada(id)
         where unidade_autorizada.id = p_unidade_id
       ) then
      raise exception using
        errcode = '42501',
        message = 'usuario nao autorizado para esta unidade';
    end if;
  end if;

  v_fim := make_date(p_ano, p_mes, 1);
  v_inicio := case
    when p_modo_periodo = 'janela_3' then (v_fim - interval '2 months')::date
    else v_fim
  end;

  -- A chamada abaixo conserva a regra de negocio ja publicada: somente aluno
  -- matriculado e ativo entra na fila D+2; trancado, evadido e ex-aluno ficam
  -- fora da cobranca, sem desaparecer do historico de faturas.
  v_canonical := public.get_inadimplencia_canonica(p_unidade_id, p_as_of_date);
  v_collection_allowed := coalesce(
    (v_canonical #>> '{operational,collection_allowed}')::boolean,
    false
  );

  with unidades_autorizadas as (
    select u.id
    from public.unidades u
    where u.ativo is true
      and (p_unidade_id is null or u.id = p_unidade_id)
      and (
        v_service_role
        or v_is_admin
        or u.id in (select public.get_user_unidade_ids())
      )
  ),
  competencias_desejadas as (
    select generate_series(v_inicio, v_fim, interval '1 month')::date as competencia
  ),
  runs_ranqueados as (
    select
      sr.id,
      sr.competencia,
      sr.completed_at,
      sr.stale_after,
      row_number() over (
        partition by sr.competencia
        order by sr.completed_at desc nulls last, sr.id desc
      ) as ordem
    from public.sync_runs sr
    join competencias_desejadas cd on cd.competencia = sr.competencia
    where sr.run_type = 'live'
      and sr.status = 'succeeded'
      and sr.snapshot_complete is true
      and sr.unidades_concluidas = 3
      and sr.completed_at is not null
  ),
  ultimo_run_por_competencia as (
    select id, competencia, completed_at, stale_after
    from runs_ranqueados
    where ordem = 1
  ),
  frescor as (
    select
      cd.competencia,
      ur.id as run_id,
      ur.completed_at,
      ur.stale_after as fresh_until,
      ur.id is not null
        and ur.stale_after >= now() as is_fresh
    from competencias_desejadas cd
    left join ultimo_run_por_competencia ur on ur.competencia = cd.competencia
  ),
  -- A identidade financeira usa o estado canônico sincronizado do Emusys.
  -- O cadastro bruto de alunos pode ter matrícula e student_id em linhas
  -- diferentes (ou student_id nulo em uma linha duplicada); cruzá-lo diretamente
  -- cria falsos \"sem vínculo\" e bloqueia cobrança de uma fatura que tem dono.
  local_por_matricula as (
    select
      e.unidade_id,
      btrim(e.emusys_matricula_id::text) as emusys_matricula_id,
      btrim(e.emusys_aluno_id::text) as emusys_student_id,
      min(e.aluno_id) as aluno_id,
      min(a.nome) as aluno_nome,
      (array_agg(a.professor_atual_id order by e.aluno_id nulls last))[1] as professor_id,
      (array_agg(prof.nome order by e.aluno_id nulls last))[1] as professor_nome,
      string_agg(distinct c.nome, ' / ' order by c.nome)
        filter (where c.nome is not null) as curso_nome,
      case
        when count(distinct fp.nome) filter (
          where a.arquivado_em is null and fp.nome is not null
        ) = 1 then min(fp.nome) filter (
          where a.arquivado_em is null and fp.nome is not null
        )
        else null
      end as forma_pagamento_prevista,
      case
        when bool_or(e.status_emusys = 'ativa' and a.arquivado_em is null) then 'ativo'
        when bool_or(e.status_emusys = 'trancada' and a.arquivado_em is null) then 'trancado'
        when bool_or(
          e.status_emusys = 'inativa'
          or a.data_saida is not null
          or a.arquivado_em is not null
        ) then 'evadido'
        else coalesce(min(e.status_emusys), min(a.status), 'desconhecido')
      end as estado_operacional
    from (
      -- espelho canonico (fonte primaria)
      select v.unidade_id, v.emusys_matricula_id::text, v.emusys_aluno_id::text, v.aluno_id, v.status_emusys
      from public.vw_aluno_estado_operacional_canonico v
      union all
      -- fallback_cadastro_pre_espelho: matricula que ja existe no cadastro e ainda
      -- nao foi materializada pelo sync diario. Exige os TRES identificadores
      -- exatos, igual ao ramo de cima; so a origem da linha e diferente.
      select al.unidade_id,
             al.emusys_matricula_id::text,
             al.emusys_student_id::text,
             al.id,
             case al.status when 'ativo' then 'ativa' when 'trancado' then 'trancada' end
      from public.alunos al
      where al.arquivado_em is null
        and al.status in ('ativo', 'trancado')
        and nullif(btrim(al.emusys_matricula_id), '') is not null
        and nullif(btrim(al.emusys_student_id), '') is not null
        and not exists (
          select 1 from public.vw_aluno_estado_operacional_canonico v2
          where v2.unidade_id = al.unidade_id
            and btrim(v2.emusys_matricula_id::text) = btrim(al.emusys_matricula_id)
            and btrim(v2.emusys_aluno_id::text) = btrim(al.emusys_student_id)
        )
    ) e (unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id, status_emusys)
    join unidades_autorizadas ua on ua.id = e.unidade_id
    left join public.alunos a on a.id = e.aluno_id
    left join public.cursos c on c.id = a.curso_id
    left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
    left join public.professores prof on prof.id = a.professor_atual_id
    where nullif(btrim(e.emusys_matricula_id::text), '') is not null
      and nullif(btrim(e.emusys_aluno_id::text), '') is not null
    group by
      e.unidade_id,
      btrim(e.emusys_matricula_id::text),
      btrim(e.emusys_aluno_id::text)
  ),
  -- Passaporte e lançamentos antigos podem vir sem matrícula. Só usamos o
  -- student_id como fallback quando ele aponta para uma única pessoa local,
  -- sempre dentro da mesma unidade; student_id ambíguo continua reconciliável.
  local_por_aluno as (
    select
      unidade_id,
      emusys_student_id,
      count(distinct aluno_id) filter (where aluno_id is not null)::integer as aluno_count,
      min(aluno_id) filter (where aluno_id is not null) as aluno_id,
      min(aluno_nome) filter (where aluno_nome is not null) as aluno_nome,
      (array_agg(professor_id order by aluno_id nulls last))[1] as professor_id,
      (array_agg(professor_nome order by aluno_id nulls last))[1] as professor_nome,
      string_agg(distinct curso_nome, ' / ' order by curso_nome)
        filter (where curso_nome is not null) as curso_nome,
      case
        when count(distinct forma_pagamento_prevista) filter (
          where forma_pagamento_prevista is not null
        ) = 1 then min(forma_pagamento_prevista)
        else null
      end as forma_pagamento_prevista,
      case
        when bool_or(estado_operacional = 'ativo') then 'ativo'
        when bool_or(estado_operacional = 'trancado') then 'trancado'
        when bool_or(estado_operacional = 'evadido') then 'evadido'
        else min(estado_operacional)
      end as estado_operacional
    from local_por_matricula
    group by unidade_id, emusys_student_id
  ),
  canonical_d2 as (
    select
      (item ->> 'canonical_fatura_id')::uuid as canonical_fatura_id,
      (item ->> 'unidade_id')::uuid as unidade_id,
      coalesce((item ->> 'dias_atraso')::integer, 0) as dias_atraso,
      coalesce(item ->> 'contact_resolution_status', 'missing') as contact_resolution_status
    from jsonb_array_elements(coalesce(v_canonical -> 'items', '[]'::jsonb)) as item
    where coalesce(item ->> 'canonical_fatura_id', '') <> ''
      and coalesce(item ->> 'unidade_id', '') <> ''
  ),
  linhas_snapshot as (
    select
      i.*,
      ur.completed_at as sync_completed_at,
      ur.stale_after as sync_fresh_until,
      case
        when lp.aluno_id is not null then lp.aluno_id
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.aluno_id
        else null
      end as aluno_id,
      case
        when lp.aluno_id is not null then lp.aluno_nome
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.aluno_nome
        else null
      end as aluno_nome,
      case
        when lp.aluno_id is not null then lp.curso_nome
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.curso_nome
        else null
      end as curso_nome,
      case
        when lp.aluno_id is not null then lp.professor_id
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.professor_id
        else null
      end as professor_id,
      case
        when lp.aluno_id is not null then lp.professor_nome
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.professor_nome
        else null
      end as professor_nome,
      case
        when lp.aluno_id is not null then lp.forma_pagamento_prevista
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.forma_pagamento_prevista
        else null
      end as forma_pagamento_prevista,
      case
        when lp.aluno_id is not null or lp.estado_operacional is not null then lp.estado_operacional
        when i.emusys_matricula_id is null and la.aluno_count = 1 then la.estado_operacional
        else null
      end as estado_operacional,
      case
        when lp.aluno_id is not null then 'matricula_canonica'
        when i.emusys_matricula_id is null and la.aluno_count = 1 then 'aluno_unico_canonico'
        else null
      end as vinculo_local_fonte,
      cd2.dias_atraso as canonical_dias_atraso,
      cd2.contact_resolution_status as canonical_contact_status
    from ultimo_run_por_competencia ur
    join public.sync_run_items i on i.run_id = ur.id
    join unidades_autorizadas ua on ua.id = i.unidade_id
    left join local_por_matricula lp
      on lp.unidade_id = i.unidade_id
     and lp.emusys_matricula_id = btrim(i.emusys_matricula_id::text)
     and lp.emusys_student_id = btrim(i.emusys_student_id::text)
    left join local_por_aluno la
      on la.unidade_id = i.unidade_id
     and la.emusys_student_id = btrim(i.emusys_student_id::text)
     and i.emusys_matricula_id is null
    left join canonical_d2 cd2
      on cd2.unidade_id = i.unidade_id
     and cd2.canonical_fatura_id = i.canonical_fatura_id
    where i.competencia between v_inicio and v_fim
  ),
  classificadas as (
    select
      ls.*,
      lower(btrim(coalesce(ls.status, ''))) as status_normalizado,
      case
        when ls.payload #> '{_la_report,validation_issues}' is null then '[]'::jsonb
        when jsonb_typeof(ls.payload #> '{_la_report,validation_issues}') = 'array'
          then ls.payload #> '{_la_report,validation_issues}'
        else jsonb_build_array(jsonb_build_object(
          'field', 'validation_issues',
          'code', 'invalid_validation_metadata'
        ))
      end as validation_issues,
      (
        ls.emusys_student_id is null
        or ls.aluno_id is null
        or (
          ls.emusys_matricula_id is null
          and ls.vinculo_local_fonte is distinct from 'aluno_unico_canonico'
        )
      ) as identidade_invalida,
      nullif(btrim(ls.payload ->> 'forma_pagamento_transacao'), '')
        as forma_pagamento_transacao,
      -- substituta_viva: o Emusys apaga e recria a fatura ao editar a parcela.
      -- Se existe outra fatura da MESMA pessoa na MESMA competencia, com id
      -- diferente e valor > 0, a cobranca continua existindo — so mudou de id.
      (
        ls.source_missing
        and exists (
          select 1 from public.emusys_faturas ef
          where ef.unidade_id = ls.unidade_id
            and ef.emusys_student_id = ls.emusys_student_id
            and ef.competencia = ls.competencia
            and ef.emusys_fatura_id <> ls.emusys_fatura_id
            and coalesce(ef.valor_original, 0) > 0
        )
      ) as substituta_viva
    from linhas_snapshot ls
  ),
  calculadas as (
    select
      c.*,
      public.calcular_valores_fatura_financeiro_v1(
        c.valor_original,
        c.desconto_fixo,
        c.desconto_condicional,
        c.data_vencimento,
        c.status_normalizado,
        p_as_of_date
      ) as valores_calculados
    from classificadas c
  ),
  avaliadas as (
    select
      c.*,
      c.status_normalizado in ('aberta', 'paga', 'cancelada') as status_suportado,
      not c.source_missing
        and c.status_normalizado in ('aberta', 'paga', 'cancelada') as entra_nos_totais,
      c.status_normalizado = 'aberta'
        and c.data_vencimento < p_as_of_date as em_atraso_d0,
      c.status_normalizado = 'aberta'
        and c.data_vencimento >= p_as_of_date as a_vencer,
      v_collection_allowed
        and c.canonical_dias_atraso >= 2
        and not c.source_missing
        and not c.identidade_invalida
        and c.status_normalizado = 'aberta' as cobranca_d2,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then c.forma_pagamento_transacao
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then c.forma_pagamento_prevista
        else null
      end as forma_pagamento_nome,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then 'Pago via'
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then 'Forma prevista'
        else 'Forma nao informada'
      end as forma_pagamento_rotulo,
      case
        when c.status_normalizado = 'paga'
          and c.forma_pagamento_transacao is not null then 'transacao'
        when c.status_normalizado in ('aberta', 'cancelada')
          and c.forma_pagamento_prevista is not null then 'matricula'
        else 'ausente'
      end as forma_pagamento_fonte
    from calculadas c
  ),
  itens_normais as (
    select a.*
    from avaliadas a
    where a.entra_nos_totais
  ),
  itens_filtrados as (
    select n.*
    from itens_normais n
    where p_status = 'todas'
       or (p_status = 'pagas' and n.status_normalizado = 'paga')
       or (p_status = 'em_aberto' and n.status_normalizado = 'aberta')
       or (p_status = 'em_atraso_d0' and n.em_atraso_d0)
       or (p_status = 'a_vencer' and n.a_vencer)
       or (p_status = 'canceladas' and n.status_normalizado = 'cancelada')
       or (p_status = 'cobranca_d2' and n.cobranca_d2)
  ),
  itens_reconciliacao as (
    select a.*,
      coalesce(pp.tem_caixa, false) or coalesce(pp.tem_lancamento, false) as pagamento_detectado,
      pp.prova_pagamento,
      pp.caixa_dup,
      array_remove(array[
        case
          when a.source_missing and not a.substituta_viva
               and not (coalesce(pp.tem_caixa, false) or coalesce(pp.tem_lancamento, false))
            then 'source_missing'
          when a.source_missing and not a.substituta_viva
            then 'pagamento_detectado_fora_origem'
        end,
        case when a.identidade_invalida then 'identidade_invalida' end,
        case when not a.status_suportado then 'status_desconhecido' end,
        case when jsonb_array_length(a.validation_issues) > 0 then 'validacao_origem' end,
        case when a.forma_pagamento_nome is null then 'forma_pagamento_ausente' end,
        case when pp.caixa_dup then 'duplicata_caixa' end,
        case when a.canonical_contact_status is not null
          and a.canonical_contact_status <> 'resolved' then 'contato_pendente' end
      ]::text[], null) as motivos
    from avaliadas a
    -- Prova de pagamento fora do snapshot: baixa manual no caixa linkada a
    -- fatura, ou lancamento bancario que a Rose reconciliou no Emusys
    -- (fatura_id exposto desde 23/09). So' roda para itens da fila.
    left join lateral (
      select
        exists (
          select 1 from public.caixa_movimentacoes m
          join public.emusys_faturas ef on ef.id = m.fatura_id
          where ef.unidade_id = a.unidade_id
            and ef.emusys_fatura_id = a.emusys_fatura_id
            and m.tipo = 'entrada'
        ) as tem_caixa,
        exists (
          select 1 from public.financeiro_emusys_lancamentos l
          where l.unidade_id = a.unidade_id
            and l.emusys_fatura_id = a.emusys_fatura_id
            and l.natureza = 'entrada' and l.sumiu_em is null
        ) as tem_lancamento,
        exists (
          select 1
            from public.caixa_movimentacoes m
            join public.emusys_faturas ef on ef.id = m.fatura_id
            where ef.unidade_id = a.unidade_id
              and ef.emusys_fatura_id = a.emusys_fatura_id
              and m.tipo = 'entrada'
            group by m.valor
            having count(*) > 1
        ) as caixa_dup,
        jsonb_build_object(
          'caixa', coalesce((
            select jsonb_agg(jsonb_build_object(
              'valor', m.valor,
              'data', m.data_movimento,
              'forma', m.forma_pagamento
            ) order by m.data_movimento)
            from public.caixa_movimentacoes m
            join public.emusys_faturas ef on ef.id = m.fatura_id
            where ef.unidade_id = a.unidade_id
              and ef.emusys_fatura_id = a.emusys_fatura_id
              and m.tipo = 'entrada'
          ), '[]'::jsonb),
          'lancamentos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'valor', l.valor,
              'data', l.data,
              'forma', l.forma_pagamento_descricao
            ) order by l.data)
            from public.financeiro_emusys_lancamentos l
            where l.unidade_id = a.unidade_id
              and l.emusys_fatura_id = a.emusys_fatura_id
              and l.natureza = 'entrada' and l.sumiu_em is null
          ), '[]'::jsonb)
        ) as prova_pagamento
    ) pp on true
    where (a.source_missing and not a.substituta_viva)
       or a.identidade_invalida
       or not a.status_suportado
       or jsonb_array_length(a.validation_issues) > 0
       or a.forma_pagamento_nome is null
       or pp.caixa_dup
       or (
         a.canonical_contact_status is not null
         and a.canonical_contact_status <> 'resolved'
       )
  ),
  resumo_frescor as (
    select
      count(*)::integer as competencias_necessarias,
      count(*) filter (where is_fresh)::integer as competencias_frescas,
      count(*) filter (where not is_fresh)::integer as competencias_stale,
      min(completed_at) as sync_mais_antigo,
      min(fresh_until) as valido_ate,
      coalesce(jsonb_agg(jsonb_build_object(
        'competencia', competencia,
        'run_id', run_id,
        'completed_at', completed_at,
        'fresh_until', fresh_until,
        'is_fresh', is_fresh
      ) order by competencia), '[]'::jsonb) as competencias
    from frescor
  ),
  totais as (
    select
      count(*)::integer as todas_quantidade,
      coalesce(sum(
        case
          when status_normalizado = 'paga' then coalesce(valor_pago, 0)
          when status_normalizado = 'aberta' then coalesce((valores_calculados ->> 'valor_hoje')::numeric, 0)
          else 0
        end
      ), 0)::numeric as todas_valor,
      count(*) filter (where status_normalizado = 'paga')::integer as pagas_quantidade,
      coalesce(sum(valor_pago) filter (where status_normalizado = 'paga'), 0)::numeric as pagas_valor,
      count(*) filter (where status_normalizado = 'aberta')::integer as em_aberto_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where status_normalizado = 'aberta'), 0)::numeric as em_aberto_valor,
      count(*) filter (where em_atraso_d0)::integer as em_atraso_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where em_atraso_d0), 0)::numeric as em_atraso_valor,
      count(*) filter (where a_vencer)::integer as a_vencer_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where a_vencer), 0)::numeric as a_vencer_valor,
      count(*) filter (where status_normalizado = 'cancelada')::integer as canceladas_quantidade,
      count(*) filter (where cobranca_d2)::integer as cobranca_d2_quantidade,
      coalesce(sum((valores_calculados ->> 'valor_hoje')::numeric)
        filter (where cobranca_d2), 0)::numeric as cobranca_d2_valor
    from itens_normais
  ),
  total_filtrado as (
    select
      count(*)::integer as quantidade,
      coalesce(sum(
        case
          when status_normalizado = 'paga' then coalesce(valor_pago, 0)
          when status_normalizado = 'aberta' then coalesce((valores_calculados ->> 'valor_hoje')::numeric, 0)
          else 0
        end
      ), 0)::numeric as valor
    from itens_filtrados
  ),
  resumo_reconciliacao as (
    select
      count(*) filter (where source_missing and not substituta_viva and not pagamento_detectado)::integer as source_missing,
      count(*) filter (where 'pagamento_detectado_fora_origem' = any(motivos))::integer as pagamento_detectado,
      count(*) filter (where identidade_invalida)::integer as identidade_invalida,
      count(*) filter (where not status_suportado)::integer as status_desconhecido,
      count(*) filter (where jsonb_array_length(validation_issues) > 0)::integer as validacoes_origem,
      count(*) filter (where forma_pagamento_nome is null)::integer as forma_pagamento_ausente,
      count(*) filter (where caixa_dup)::integer as duplicata_caixa,
      count(*) filter (
        where canonical_contact_status is not null
          and canonical_contact_status <> 'resolved'
      )::integer as contato_pendente,
      count(*)::integer as total
    from itens_reconciliacao
  )
  select jsonb_build_object(
    'schema_version', 1,
    'fonte', 'sync_run_items',
    'as_of_date', p_as_of_date,
    'periodo', jsonb_build_object(
      'modo', p_modo_periodo,
      'competencia_inicio', v_inicio,
      'competencia_fim', v_fim
    ),
    'status', case
      when rf.competencias_stale > 0 then 'stale'
      when rr.total > 0 then 'partial'
      else 'ok'
    end,
    'freshness', jsonb_build_object(
      'policy', 'sync_runs.stale_after',
      'competencias_necessarias', rf.competencias_necessarias,
      'competencias_frescas', rf.competencias_frescas,
      'competencias_stale', rf.competencias_stale,
      'sync_mais_antigo', rf.sync_mais_antigo,
      'valido_ate', rf.valido_ate,
      'competencias', rf.competencias
    ),
    'operational', jsonb_build_object(
      'collection_allowed', v_collection_allowed,
      'collection_scope', coalesce(v_canonical #>> '{operational,collection_scope}', 'blocked'),
      'cobranca_regra', 'd_plus_2_apenas_aluno_ativo'
    ),
    'totais', jsonb_build_object(
      'todas', jsonb_build_object('quantidade', t.todas_quantidade, 'valor', round(t.todas_valor, 2)),
      'pagas', jsonb_build_object('quantidade', t.pagas_quantidade, 'valor', round(t.pagas_valor, 2)),
      'em_aberto', jsonb_build_object('quantidade', t.em_aberto_quantidade, 'valor', round(t.em_aberto_valor, 2)),
      'em_atraso_d0', jsonb_build_object('quantidade', t.em_atraso_quantidade, 'valor', round(t.em_atraso_valor, 2)),
      'a_vencer', jsonb_build_object('quantidade', t.a_vencer_quantidade, 'valor', round(t.a_vencer_valor, 2)),
      'canceladas', jsonb_build_object('quantidade', t.canceladas_quantidade),
      'cobranca_d2', jsonb_build_object('quantidade', t.cobranca_d2_quantidade, 'valor', round(t.cobranca_d2_valor, 2)),
      'visao_atual', jsonb_build_object('status', p_status, 'quantidade', tf.quantidade, 'valor', round(tf.valor, 2))
    ),
    'items', case
      when p_status = 'reconciliacao' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'emusys_fatura_id', i.emusys_fatura_id::text,
          'emusys_matricula_id', i.emusys_matricula_id::text,
          'emusys_contrato_id', i.emusys_contrato_id::text,
          'emusys_student_id', i.emusys_student_id::text,
          'descricao', i.descricao,
          'status', i.status_normalizado,
          'data_vencimento', i.data_vencimento,
          'data_pagamento', i.data_pagamento,
          'aluno', jsonb_build_object(
            'id', i.aluno_id,
            'nome', coalesce(i.aluno_nome, 'Aluno nao vinculado'),
            'curso_nome', i.curso_nome,
            'estado_operacional', i.estado_operacional,
            'vinculo_local_fonte', i.vinculo_local_fonte,
            'professor_id', i.professor_id,
            'professor_nome', i.professor_nome
          ),
          'forma_pagamento', jsonb_build_object(
            'rotulo', i.forma_pagamento_rotulo,
            'nome', i.forma_pagamento_nome,
            'fonte', i.forma_pagamento_fonte
          ),
          'valores', jsonb_build_object(
            'valor_com_desconto', i.valores_calculados -> 'valor_com_desconto',
            'valor_sem_desconto_condicional', i.valores_calculados -> 'valor_sem_desconto_condicional',
            'multa', i.valores_calculados -> 'multa',
            'mora', i.valores_calculados -> 'mora',
            'valor_hoje', i.valores_calculados -> 'valor_hoje',
            'valor_pago', i.valor_pago,
            'juros_e_multa_snapshot', i.juros_e_multa
          ),
          'cobranca', jsonb_build_object(
            'd0', i.em_atraso_d0,
            'd2_elegivel', i.cobranca_d2,
            'motivo_nao_elegivel', case
              when i.cobranca_d2 then null
              when not v_collection_allowed then 'leitura_canonica_bloqueada'
              when i.source_missing then 'source_missing'
              when i.identidade_invalida then 'identidade_invalida'
              when i.status_normalizado <> 'aberta' then 'fatura_nao_aberta'
              when not i.em_atraso_d0 then 'nao_vencida'
              when coalesce(i.canonical_dias_atraso, 0) < 2 then 'carencia_d_plus_2'
              else 'fora_da_carteira_ativa'
            end
          ),
          'sync_completed_at', i.sync_completed_at,
          'sync_fresh_until', i.sync_fresh_until
        ) order by i.data_vencimento, i.unidade_codigo, i.emusys_fatura_id)
        from itens_filtrados i
      ), '[]'::jsonb)
    end,
    'reconciliation', jsonb_build_object(
      'source_missing', rr.source_missing,
      'pagamento_detectado', rr.pagamento_detectado,
      'identidade_invalida', rr.identidade_invalida,
      'status_desconhecido', rr.status_desconhecido,
      'validacoes_origem', rr.validacoes_origem,
      'forma_pagamento_ausente', rr.forma_pagamento_ausente,
      'contato_pendente', rr.contato_pendente,
      'duplicata_caixa', rr.duplicata_caixa,
      'total', rr.total,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'emusys_fatura_id', i.emusys_fatura_id::text,
          'emusys_matricula_id', i.emusys_matricula_id::text,
          'emusys_contrato_id', i.emusys_contrato_id::text,
          'emusys_student_id', i.emusys_student_id::text,
          'descricao', i.descricao,
          'status', i.status_normalizado,
          'data_vencimento', i.data_vencimento,
          'data_pagamento', i.data_pagamento,
          'aluno', jsonb_build_object(
            'id', i.aluno_id,
            'nome', coalesce(i.aluno_nome, 'Aluno nao vinculado'),
            'curso_nome', i.curso_nome,
            'estado_operacional', i.estado_operacional,
            'vinculo_local_fonte', i.vinculo_local_fonte,
            'professor_id', i.professor_id,
            'professor_nome', i.professor_nome
          ),
          'forma_pagamento', jsonb_build_object(
            'rotulo', i.forma_pagamento_rotulo,
            'nome', i.forma_pagamento_nome,
            'fonte', i.forma_pagamento_fonte
          ),
          'valores', jsonb_build_object(
            'valor_original', i.valor_original,
            'valor_com_desconto', i.valores_calculados -> 'valor_com_desconto',
            'valor_sem_desconto_condicional', i.valores_calculados -> 'valor_sem_desconto_condicional',
            'multa', i.valores_calculados -> 'multa',
            'mora', i.valores_calculados -> 'mora',
            'valor_hoje', i.valores_calculados -> 'valor_hoje',
            'valor_pago', i.valor_pago,
            'juros_e_multa_snapshot', i.juros_e_multa
          ),
          'motivos', to_jsonb(i.motivos),
          'prova_pagamento', i.prova_pagamento,
          'validation_issues', i.validation_issues,
          'source_missing_reason', i.source_missing_reason,
          'sync_completed_at', i.sync_completed_at
        ) order by i.data_vencimento, i.unidade_codigo, i.emusys_fatura_id)
        from itens_reconciliacao i
      ), '[]'::jsonb)
    )
  ) into v_result
  from resumo_frescor rf
  cross join totais t
  cross join total_filtrado tf
  cross join resumo_reconciliacao rr;

  return v_result || jsonb_build_object('inadimplencia_canonica', v_canonical);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_modo_periodo text DEFAULT 'janela_3'::text, p_status text DEFAULT 'todas'::text, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_pagamento_detectado integer := 0;
  v_identidade integer := 0;
  v_status integer := 0;
  v_validacoes integer := 0;
  v_forma integer := 0;
  v_contato integer := 0;
  v_duplicata integer := 0;
  v_total integer := 0;
  v_motivo text;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_20260817(
    p_unidade_id, p_ano, p_mes, p_modo_periodo, p_status, p_as_of_date
  );

  v_main_items := public.financeiro_enriquecer_faturas_itens_v1(
    coalesce(v_payload->'items', '[]'::jsonb)
  );
  v_payload := jsonb_set(v_payload, '{items}', v_main_items, true);

  for v_item in
    select value
    from jsonb_array_elements(
      public.financeiro_enriquecer_faturas_itens_v1(
        coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)
      )
    ) as rows(value)
  loop
    v_enriched := v_item;
    v_unidade_id := nullif(v_enriched->>'unidade_id', '')::uuid;
    v_fatura_id := nullif(v_enriched->>'emusys_fatura_id', '')::bigint;
    v_motivos := coalesce(v_enriched->'motivos', '[]'::jsonb);

    -- Se a forma foi encontrada no enriquecimento (Emusys atual ou decisÃ£o
    -- manual), nÃ£o manter a pendÃªncia antiga originada no snapshot.
    if nullif(btrim(v_enriched #>> '{forma_pagamento,nome}'), '') is not null then
      select coalesce(jsonb_agg(motivo), '[]'::jsonb)
        into v_motivos
      from jsonb_array_elements_text(v_motivos) as motivos(motivo)
      where motivo <> 'forma_pagamento_ausente';
      v_enriched := jsonb_set(v_enriched, '{motivos}', v_motivos, true);
    end if;

    v_categoria := case
      when lower(coalesce(v_enriched #>> '{aluno,estado_operacional}', '')) in ('evadido', 'inativo', 'trancado', 'trancada')
        or v_motivos ? 'historico_ex_aluno' then 'historico_ex_aluno'
      when v_motivos ? 'registro_nao_aluno'
        or (
          v_enriched->>'emusys_matricula_id' is null
          and (
            (v_enriched->>'status' = 'paga')
            or lower(coalesce(v_enriched->>'descricao', '')) like '%lojinha%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%baqueta%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%capotraste%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%encordoamento%'
            or coalesce(nullif(btrim(v_enriched->>'emusys_student_id'), ''), '1') in ('0', '1')
            or lower(coalesce(v_enriched->>'descricao', '')) like '%passaporte%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%estoque%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%caderno%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%clips%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%coach%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%palheta%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%rateio entre unidades%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%ingresso%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locacao%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%bora gravar%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprestimo%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprÃƒÆ’Ã‚Â©stimo%'
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
      (motivo in ('source_missing', 'pagamento_detectado_fora_origem') and (
        'pagamento_confirmado' = any(v_decisoes)
        or 'renovacao' = any(v_decisoes)
        or 'trancamento' = any(v_decisoes)
        or 'ultima_parcela_aviso_previo' = any(v_decisoes)
        or 'conferido_sem_cobranca' = any(v_decisoes)
        or 'parcela_remarcada' = any(v_decisoes)
        or 'outro' = any(v_decisoes)
      ))
      or (motivo = 'forma_pagamento_ausente' and 'forma_pagamento_manual' = any(v_decisoes))
      or (motivo = 'duplicata_caixa' and 'duplicata_caixa_confirmada' = any(v_decisoes))
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
      elsif v_motivo = 'pagamento_detectado_fora_origem' then v_pagamento_detectado := v_pagamento_detectado + 1;
      elsif v_motivo = 'identidade_invalida' then v_identidade := v_identidade + 1;
      elsif v_motivo = 'status_desconhecido' then v_status := v_status + 1;
      elsif v_motivo = 'validacao_origem' then v_validacoes := v_validacoes + 1;
      elsif v_motivo = 'forma_pagamento_ausente' then v_forma := v_forma + 1;
      elsif v_motivo = 'contato_pendente' then v_contato := v_contato + 1;
      elsif v_motivo = 'duplicata_caixa' then v_duplicata := v_duplicata + 1;
      end if;
    end loop;
  end loop;

  v_reconciliacao := jsonb_build_object(
    'source_missing', v_source_missing,
    'pagamento_detectado', v_pagamento_detectado,
    'identidade_invalida', v_identidade,
    'status_desconhecido', v_status,
    'validacoes_origem', v_validacoes,
    'forma_pagamento_ausente', v_forma,
    'contato_pendente', v_contato,
    'duplicata_caixa', v_duplicata,
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
$function$

;

do $pos$
declare
  v_def text;
  v_falhas text[] := '{}';
begin
  v_def := pg_get_functiondef('public.get_faturas_alunos_financeiro_v1_canonica_20260817(uuid,integer,integer,text,text,date)'::regprocedure);
  if v_def not like '%duplicata_caixa%' then v_falhas := v_falhas || 'motivo duplicata_caixa ausente na canonica'; end if;
  if v_def not like '%caixa_dup%' then v_falhas := v_falhas || 'flag caixa_dup ausente na canonica'; end if;

  v_def := pg_get_functiondef('public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(uuid,integer,integer,text,text,date)'::regprocedure);
  if v_def not like '%duplicata_caixa_confirmada%' then v_falhas := v_falhas || 'filtro de decisao ausente no contrato_tipo'; end if;
  if v_def not like '%duplicata_caixa%' then v_falhas := v_falhas || 'contador ausente no contrato_tipo'; end if;

  v_def := pg_get_functiondef('public.resolver_reconciliacao_fatura(uuid,bigint,text,text,uuid,bigint,bigint,integer,text)'::regprocedure);
  if v_def not like '%duplicata_caixa_confirmada%' then v_falhas := v_falhas || 'resolver nao aceita a decisao nova'; end if;

  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO duplicata NAO FECHOU:\n  %', array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'regra duplicata_caixa ok';
end $pos$;
