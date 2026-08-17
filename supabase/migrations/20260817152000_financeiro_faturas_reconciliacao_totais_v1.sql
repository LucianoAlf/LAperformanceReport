-- Faturas confirmadas na origem continuam nos totais mesmo quando o vinculo local esta pendente.
-- Esta versão substitui o cruzamento bruto por unidade + matrícula + student_id canônico.
-- Elas permanecem fora da carteira de cobranca ate a identidade ser reconciliada.
-- source_missing continua fora: ausencia na origem nunca e prova de pagamento.
create or replace function public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default extract(month from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
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
  -- cria falsos "sem vínculo" e bloqueia cobrança de uma fatura que tem dono.
  local_por_matricula as (
    select
      e.unidade_id,
      btrim(e.emusys_matricula_id::text) as emusys_matricula_id,
      btrim(e.emusys_aluno_id::text) as emusys_student_id,
      min(e.aluno_id) as aluno_id,
      min(a.nome) as aluno_nome,
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
    from public.vw_aluno_estado_operacional_canonico e
    join unidades_autorizadas ua on ua.id = e.unidade_id
    left join public.alunos a on a.id = e.aluno_id
    left join public.cursos c on c.id = a.curso_id
    left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
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
        ls.emusys_matricula_id is null
        or ls.emusys_student_id is null
        or ls.aluno_id is null
      ) as identidade_invalida,
      nullif(btrim(ls.payload ->> 'forma_pagamento_transacao'), '')
        as forma_pagamento_transacao
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
      array_remove(array[
        case when a.source_missing then 'source_missing' end,
        case when a.identidade_invalida then 'identidade_invalida' end,
        case when not a.status_suportado then 'status_desconhecido' end,
        case when jsonb_array_length(a.validation_issues) > 0 then 'validacao_origem' end,
        case when a.forma_pagamento_nome is null then 'forma_pagamento_ausente' end,
        case when a.canonical_contact_status is not null
          and a.canonical_contact_status <> 'resolved' then 'contato_pendente' end
      ]::text[], null) as motivos
    from avaliadas a
    where a.source_missing
       or a.identidade_invalida
       or not a.status_suportado
       or jsonb_array_length(a.validation_issues) > 0
       or a.forma_pagamento_nome is null
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
      count(*) filter (where source_missing)::integer as source_missing,
      count(*) filter (where identidade_invalida)::integer as identidade_invalida,
      count(*) filter (where not status_suportado)::integer as status_desconhecido,
      count(*) filter (where jsonb_array_length(validation_issues) > 0)::integer as validacoes_origem,
      count(*) filter (where forma_pagamento_nome is null)::integer as forma_pagamento_ausente,
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
            'vinculo_local_fonte', i.vinculo_local_fonte
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
      'identidade_invalida', rr.identidade_invalida,
      'status_desconhecido', rr.status_desconhecido,
      'validacoes_origem', rr.validacoes_origem,
      'forma_pagamento_ausente', rr.forma_pagamento_ausente,
      'contato_pendente', rr.contato_pendente,
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
            'vinculo_local_fonte', i.vinculo_local_fonte
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

  return v_result;
end;
$function$;

comment on function public.get_faturas_alunos_financeiro_v1(uuid, integer, integer, text, text, date) is
  'Leitura global de faturas por snapshot completo: historico navegavel, D+0 informativo, D+2 acionavel somente pela carteira canonica e reconciliacao financeira local.';

revoke all on function public.get_faturas_alunos_financeiro_v1(uuid, integer, integer, text, text, date)
  from public, anon;
grant execute on function public.get_faturas_alunos_financeiro_v1(uuid, integer, integer, text, text, date)
  to authenticated, service_role;

