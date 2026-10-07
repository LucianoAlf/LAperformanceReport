-- 25/09/2026 — pagamento composto no caixa: UMA movimentacao quitando N faturas.
-- Motivador: Lucas Azevedo (CG) pagou 12 parcelas (09/2026 a 08/2027) num cartao so
-- de R$4.752 — o Emusys baixa as 12 faturas com a mesma data_pagamento, e o nosso
-- lancamento precisava apontar para todas. fatura_id segue o fast-path de 1 fatura;
-- composto grava fatura_id NULL + N filhas. Quem le (prova_pagamento, duplicata,
-- view de entradas sem vinculo) faz union pelas duas fontes.

create table if not exists public.caixa_movimentacao_faturas (
  movimentacao_id uuid not null references public.caixa_movimentacoes(id) on delete cascade,
  fatura_id uuid not null references public.emusys_faturas(id) on delete restrict,
  unidade_id uuid not null references public.unidades(id),
  created_at timestamptz not null default now(),
  primary key (movimentacao_id, fatura_id)
);

create index if not exists caixa_movimentacao_faturas_fatura_idx
  on public.caixa_movimentacao_faturas (fatura_id);

-- unidade vem da movimentacao pai: trigger impede deriva e simplifica a policy.
create or replace function public.cmf_herda_unidade()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  select m.unidade_id into new.unidade_id
  from public.caixa_movimentacoes m
  where m.id = new.movimentacao_id;
  if new.unidade_id is null then
    raise exception 'movimentacao % nao encontrada', new.movimentacao_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cmf_herda_unidade on public.caixa_movimentacao_faturas;
create trigger trg_cmf_herda_unidade
  before insert on public.caixa_movimentacao_faturas
  for each row execute function public.cmf_herda_unidade();

alter table public.caixa_movimentacao_faturas enable row level security;

drop policy if exists cmf_select on public.caixa_movimentacao_faturas;
create policy cmf_select on public.caixa_movimentacao_faturas for select using (
  exists (select 1 from usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_movimentacao_faturas.unidade_id)));
drop policy if exists cmf_insert on public.caixa_movimentacao_faturas;
create policy cmf_insert on public.caixa_movimentacao_faturas for insert with check (
  exists (select 1 from usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_movimentacao_faturas.unidade_id)));
drop policy if exists cmf_delete on public.caixa_movimentacao_faturas;
create policy cmf_delete on public.caixa_movimentacao_faturas for delete using (
  exists (select 1 from usuarios u
    where u.auth_user_id = auth.uid()
      and (u.perfil = 'admin' or u.unidade_id = caixa_movimentacao_faturas.unidade_id)));

-- Fonte unica de "quais faturas esta movimentacao quita": coluna OU filhas.
create or replace view public.vw_caixa_movimentacao_fatura_links as
  select m.id as movimentacao_id, m.fatura_id
    from public.caixa_movimentacoes m
   where m.fatura_id is not null
  union
  select mf.movimentacao_id, mf.fatura_id
    from public.caixa_movimentacao_faturas mf;

comment on table public.caixa_movimentacao_faturas is
  'Faturas quitadas por uma movimentacao composta (1 pagamento -> N faturas). Movimentacao simples segue em caixa_movimentacoes.fatura_id; composto tem fatura_id NULL e N linhas aqui.';

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
          join public.vw_caixa_movimentacao_fatura_links lnk on lnk.movimentacao_id = m.id
          join public.emusys_faturas ef on ef.id = lnk.fatura_id
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
            join public.vw_caixa_movimentacao_fatura_links lnk on lnk.movimentacao_id = m.id
            join public.emusys_faturas ef on ef.id = lnk.fatura_id
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
            join public.vw_caixa_movimentacao_fatura_links lnk on lnk.movimentacao_id = m.id
            join public.emusys_faturas ef on ef.id = lnk.fatura_id
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
$function$;

CREATE OR REPLACE VIEW public.vw_caixa_reconciliacao_entradas AS
 WITH mov AS (
         SELECT m_1.id,
            m_1.unidade_id,
            m_1.data_movimento,
            m_1.valor,
            m_1.descricao,
            m_1.categoria,
            m_1.forma_pagamento,
            m_1.criado_por,
            m_1.aluno_id,
                CASE
                    WHEN (m_1.descricao ~ ' - '::text) THEN TRIM(BOTH FROM regexp_replace("substring"(m_1.descricao, '.* - (.+)$'::text), '\s*·.*$'::text, ''::text))
                    WHEN (m_1.descricao ~* '\malun[oa]s?\s+'::text) THEN TRIM(BOTH FROM regexp_replace("substring"(m_1.descricao, '(?i)\malun[oa]s?\s+(.+)$'::text), '\s*(·|\(|\bcurso\b).*$'::text, ''::text))
                    ELSE NULL::text
                END AS nome_extraido
           FROM caixa_movimentacoes m_1
          WHERE ((m_1.tipo = 'entrada'::text) AND (m_1.fatura_id IS NULL) AND (NOT (EXISTS ( SELECT 1
           FROM caixa_movimentacao_faturas mf
          WHERE (mf.movimentacao_id = m_1.id)))))
        ), cand AS (
         SELECT m_1.id AS mov_id,
            f.id AS fatura_id,
            f.emusys_fatura_id,
            a.id AS aluno_id,
            a.nome AS aluno_nome,
            f.data_pagamento,
            f.valor_pago,
            f.competencia AS fatura_competencia,
            abs((f.data_pagamento - m_1.data_movimento)) AS delta_dias,
                CASE
                    WHEN ((m_1.nome_extraido IS NOT NULL) AND sol_nome_mesma_pessoa_v1(m_1.nome_extraido, (a.nome)::text)) THEN 'extraido_aluno'::text
                    WHEN ((m_1.nome_extraido IS NOT NULL) AND (a.responsavel_nome IS NOT NULL) AND sol_nome_mesma_pessoa_v1(m_1.nome_extraido, (a.responsavel_nome)::text)) THEN 'extraido_responsavel'::text
                    WHEN ((m_1.nome_extraido IS NULL) AND (upper(unaccent(m_1.descricao)) ~ (('(^|[^A-Z])'::text || unaccent((a.nome_normalizado)::text)) || '([^A-Z]|$)'::text))) THEN 'boundary_aluno'::text
                    WHEN ((m_1.nome_extraido IS NULL) AND (a.responsavel_nome IS NOT NULL) AND (length((a.responsavel_nome)::text) > 4) AND (upper(unaccent(m_1.descricao)) ~ (('(^|[^A-Z])'::text || upper(unaccent((a.responsavel_nome)::text))) || '([^A-Z]|$)'::text))) THEN 'boundary_responsavel'::text
                    ELSE NULL::text
                END AS via
           FROM ((mov m_1
             JOIN emusys_faturas f ON (((f.unidade_id = m_1.unidade_id) AND (f.status = 'paga'::text) AND ((f.data_pagamento >= (m_1.data_movimento - 7)) AND (f.data_pagamento <= (m_1.data_movimento + 7))) AND (abs((COALESCE(f.valor_pago, (0)::numeric) - m_1.valor)) < 0.011))))
             JOIN alunos a ON ((a.emusys_student_id = (f.emusys_student_id)::text)))
        ), dupla AS (
         SELECT m_1.id AS mov_id
           FROM ((((mov m_1
             JOIN emusys_faturas f1 ON (((f1.unidade_id = m_1.unidade_id) AND (f1.status = 'paga'::text) AND ((f1.data_pagamento >= (m_1.data_movimento - 7)) AND (f1.data_pagamento <= (m_1.data_movimento + 7))))))
             JOIN emusys_faturas f2 ON (((f2.unidade_id = m_1.unidade_id) AND (f2.status = 'paga'::text) AND ((f2.data_pagamento >= (m_1.data_movimento - 7)) AND (f2.data_pagamento <= (m_1.data_movimento + 7))) AND (f2.id > f1.id))))
             JOIN alunos a1 ON ((a1.emusys_student_id = (f1.emusys_student_id)::text)))
             JOIN alunos a2 ON ((a2.emusys_student_id = (f2.emusys_student_id)::text)))
          WHERE ((abs(((COALESCE(f1.valor_pago, (0)::numeric) + COALESCE(f2.valor_pago, (0)::numeric)) - m_1.valor)) < 0.011) AND ((upper(unaccent(m_1.descricao)) ~ (('(^|[^A-Z])'::text || unaccent((a1.nome_normalizado)::text)) || '([^A-Z]|$)'::text)) OR sol_nome_mesma_pessoa_v1(COALESCE(m_1.nome_extraido, ''::text), (a1.nome)::text)) AND ((upper(unaccent(m_1.descricao)) ~ (('(^|[^A-Z])'::text || unaccent((a2.nome_normalizado)::text)) || '([^A-Z]|$)'::text)) OR sol_nome_mesma_pessoa_v1(COALESCE(m_1.nome_extraido, ''::text), (a2.nome)::text)))
          GROUP BY m_1.id
        )
 SELECT m.id AS movimentacao_id,
    m.unidade_id,
    u.nome AS unidade_nome,
    m.data_movimento,
    (date_trunc('month'::text, (m.data_movimento)::timestamp with time zone))::date AS competencia,
    m.forma_pagamento,
    m.categoria,
    m.descricao,
    m.valor,
    m.criado_por,
    m.aluno_id AS mov_aluno_id,
    m.nome_extraido,
        CASE
            WHEN (d.mov_id IS NOT NULL) THEN 'composta_2_faturas'::text
            WHEN (s.n = 1) THEN 'match_unico'::text
            WHEN (s.n > 1) THEN 'ambigua'::text
            ELSE 'sem_match'::text
        END AS classe,
    s.candidatas,
    ((m.categoria = 'parcela'::text) AND (m.forma_pagamento = 'pix'::text) AND (s.n = 1) AND (d.mov_id IS NULL)) AS elegivel_backfill,
    ((s.n = 1) AND (((s.data_pagamento_unica >= '2026-09-18'::date) AND (s.data_pagamento_unica <= '2026-09-20'::date)) OR ((m.valor >= (290)::numeric) AND (m.valor <= (310)::numeric)))) AS revisar_superfolha
   FROM (((mov m
     JOIN unidades u ON ((u.id = m.unidade_id)))
     LEFT JOIN ( SELECT cand.mov_id,
            count(*) AS n,
            max(cand.data_pagamento) AS data_pagamento_unica,
            jsonb_agg(jsonb_build_object('fatura_id', cand.fatura_id, 'emusys_fatura_id', cand.emusys_fatura_id, 'aluno_id', cand.aluno_id, 'aluno_nome', cand.aluno_nome, 'data_pagamento', cand.data_pagamento, 'valor_pago', cand.valor_pago, 'fatura_competencia', cand.fatura_competencia, 'delta_dias', cand.delta_dias, 'via', cand.via) ORDER BY cand.delta_dias, cand.fatura_id) AS candidatas
           FROM cand
          WHERE (cand.via IS NOT NULL)
          GROUP BY cand.mov_id) s ON ((s.mov_id = m.id)))
     LEFT JOIN dupla d ON ((d.mov_id = m.id)));

CREATE OR REPLACE FUNCTION public.sol_caixa_lancar_recebimento(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor numeric := nullif(p_payload->>'valor','')::numeric;
  v_forma text := lower(coalesce(p_payload->>'forma',''));
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''),'parcela'));
  v_aluno text := nullif(trim(coalesce(p_payload->>'aluno','')),'');
  v_desc text := nullif(trim(coalesce(p_payload->>'descricao','')),'');
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_modal text := nullif(p_payload->>'cartao_modalidade','');
  v_parc int := nullif(p_payload->>'cartao_parcelas','')::int;
  v_env text := nullif(trim(coalesce(p_payload->>'enviado_por','')),'');
  v_aut text := nullif(trim(coalesce(p_payload->>'autorizado_por','')),'');
  v_respfin text := nullif(trim(coalesce(p_payload->>'responsavel_financeiro','')),'');
  v_aluno_id integer := nullif(p_payload->>'aluno_id','')::integer;
  v_fatura_id uuid := nullif(p_payload->>'fatura_id','')::uuid;
  v_fatura_ids uuid[] := case
    when jsonb_typeof(p_payload->'fatura_ids') = 'array'
      then (select array_agg(x::uuid) from jsonb_array_elements_text(p_payload->'fatura_ids') x)
    else null end;
  v_resp text;
  v_qualquer boolean;
  v_caixa uuid; v_mov uuid; v_status text; v_mov_existe uuid;
  v_res text; v_motivo text; v_v3 jsonb;
begin
  if v_key is not null then
    select status, movimentacao_id into v_status, v_mov_existe
      from public.sol_caixa_ingestao_recebimentos where idempotency_key = v_key;
    if v_status = 'lancado' then
      return jsonb_build_object('ok', true, 'ja_lancado', true, 'movimentacao_id', v_mov_existe);
    end if;
  end if;

  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_valor is null or v_valor <= 0 then v_motivo := 'valor_invalido';
  elsif v_forma not in ('dinheiro','pix','cartao','cheque','transferencia','outro') then v_motivo := 'forma_invalida';
  elsif v_categoria !~ '^[a-z0-9_-]+$' or length(v_categoria) < 2 then v_motivo := 'categoria_invalida';
  end if;

  if v_motivo is null then
    select autoriza_qualquer_membro into v_qualquer
      from public.sol_caixa_unidade_policy where unidade_id = v_unidade;
    if coalesce(v_qualquer, false) then
      if v_num is null or length(v_num) < 8 then v_motivo := 'ator_sem_numero'; end if;
    elsif not exists (select 1 from public.sol_caixa_autorizados a
                      where a.unidade_id = v_unidade and a.numero = v_num and a.ativo) then
      v_motivo := 'ator_nao_autorizado';
    end if;
  end if;

  if v_motivo is null then
    select id into v_caixa from public.caixas_diarios
      where unidade_id = v_unidade and data_caixa = v_data and status = 'aberto'
      order by aberto_em desc limit 1;
    if v_caixa is null then v_motivo := 'caixa_nao_aberto'; end if;
  end if;

  if v_motivo is null then
    v_v3 := public.sol_caixa_v3_validar_approval_v1(p_payload, 'lancar_recebimento');
    if not coalesce((v_v3->>'ok')::boolean, false) then
      v_motivo := coalesce(v_v3->>'motivo', 'approval_v3_invalido');
    end if;
  end if;

  if v_motivo is not null then
    v_res := 'recusado';
    insert into public.sol_caixa_lancamento_auditoria
      (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
       idempotency_key, unidade_id, data_caixa, payload, resultado, motivo)
    values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
       p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, v_res, v_motivo);
    return jsonb_build_object('ok', false, 'motivo', v_motivo, 'data', v_data);
  end if;

  if v_desc is null or length(v_desc) < 3 then
    v_desc := trim(concat_ws(' ', initcap(v_categoria),
                             case when v_aluno is not null then '- '||v_aluno end));
    if length(v_desc) < 3 then v_desc := 'Recebimento via Sol'; end if;
  end if;
  if v_respfin is not null and position(lower(v_respfin) in lower(v_desc)) = 0 then
    v_desc := v_desc || ' · resp. ' || v_respfin;
  end if;
  v_resp := case
    when v_aut is not null and v_env is not null and lower(v_aut) is distinct from lower(v_env)
      then v_aut || ' (aut.) · ' || v_env || ' (env.) · via Sol'
    when v_aut is not null then v_aut || ' · via Sol'
    when v_env is not null then v_env || ' · via Sol'
    else 'Sol (agente)' end;

  if v_aluno_id is not null and not exists (
    select 1 from public.alunos a where a.id = v_aluno_id and a.unidade_id = v_unidade
  ) then v_aluno_id := null; end if;
  if v_fatura_ids is not null then
    v_fatura_ids := (
      select array_agg(f.id) from public.emusys_faturas f
      where f.id = any(v_fatura_ids) and f.unidade_id = v_unidade
    );
    if v_fatura_ids is not null and array_length(v_fatura_ids, 1) = 1 then
      v_fatura_id := coalesce(v_fatura_id, v_fatura_ids[1]);
      v_fatura_ids := null;
    elsif v_fatura_ids is not null then
      v_fatura_id := null;
    end if;
  end if;
  if v_fatura_id is not null and not exists (
    select 1 from public.emusys_faturas f where f.id = v_fatura_id and f.unidade_id = v_unidade
  ) then v_fatura_id := null; end if;

  insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
     forma_pagamento, categoria, descricao, valor, criado_por, responsavel,
     cartao_modalidade, cartao_parcelas, aluno_id, fatura_id)
  values
    (v_caixa, v_unidade, v_data, 'venda', 'entrada',
     v_forma, v_categoria, v_desc, v_valor,
     concat_ws(':', 'sol-agente', v_papel, v_num), v_resp, v_modal, v_parc, v_aluno_id, v_fatura_id)
  returning id into v_mov;

  if v_fatura_ids is not null then
    insert into public.caixa_movimentacao_faturas (movimentacao_id, fatura_id, unidade_id)
    select v_mov, x, v_unidade from unnest(v_fatura_ids) x
    on conflict do nothing;
  end if;

  if v_key is not null then
    update public.sol_caixa_ingestao_recebimentos
      set status = 'lancado', movimentacao_id = v_mov, lancado_em = now(),
          lancado_por = v_num, valor_extraido = v_valor, forma_extraida = v_forma,
          categoria_extraida = v_categoria, aluno_extraido = v_aluno,
          preview_message_id = coalesce(preview_message_id, p_payload->>'preview_message_id'),
          atualizado_em = now()
      where idempotency_key = v_key;
  end if;

  insert into public.sol_caixa_lancamento_auditoria
    (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
     idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
     movimentacao_id, caixa_diario_id)
  values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
     p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, 'lancado', null,
     v_mov, v_caixa);

  return jsonb_build_object('ok', true, 'movimentacao_id', v_mov,
    'caixa_diario_id', v_caixa, 'valor', v_valor, 'forma', v_forma,
    'categoria', v_categoria, 'descricao', v_desc, 'responsavel', v_resp, 'data', v_data);
end $function$;

CREATE OR REPLACE FUNCTION public.sol_caixa_lancar_recebimento_lote_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_total numeric := nullif(p_payload->>'valor','')::numeric;
  v_forma text := lower(coalesce(p_payload->>'forma',''));
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''),'parcela'));
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_caixa uuid;
  v_lote uuid;
  v_preview public.sol_caixa_shadow_previews_v1%rowtype;
  v_v3 jsonb;
  v_snapshot jsonb;
  v_item jsonb;
  v_mov uuid;
  v_movs jsonb := '[]'::jsonb;
  v_ordem integer := 0;
  v_soma_ins numeric := 0;
  v_resp text;
  v_motivo text;
  -- (02/09) montagem da descrição por item
  v_cat_item text;
  v_nome text;
  v_respfin text;
  v_desc text;
begin
  if v_key is null then
    return jsonb_build_object('ok', false, 'motivo', 'idempotency_key_obrigatoria');
  end if;

  select id into v_lote from public.sol_caixa_lotes_v1 where idempotency_key = v_key;
  if v_lote is not null then
    select coalesce(jsonb_agg(jsonb_build_object('movimentacao_id',movimentacao_id,'aluno_nome',aluno_nome,'valor',valor) order by ordem),'[]'::jsonb)
      into v_movs from public.sol_caixa_lote_itens_v1 where lote_id = v_lote;
    return jsonb_build_object('ok', true, 'ja_lancado', true, 'lote_id', v_lote, 'movimentacoes', v_movs);
  end if;

  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_total is null or v_total <= 0 then v_motivo := 'valor_invalido';
  elsif v_forma not in ('dinheiro','pix','cartao','cheque','transferencia','outro') then v_motivo := 'forma_invalida';
  elsif jsonb_typeof(p_payload->'itens') is distinct from 'array' or jsonb_array_length(p_payload->'itens') < 2 then v_motivo := 'multi_aluno_exige_dois_itens';
  end if;

  if v_motivo is null then
    select id into v_caixa from public.caixas_diarios where unidade_id=v_unidade and data_caixa=v_data and status='aberto' order by aberto_em desc limit 1;
    if v_caixa is null then v_motivo := 'caixa_nao_aberto'; end if;
  end if;

  if v_motivo is null then
    select * into v_preview from public.sol_caixa_shadow_previews_v1 where id=nullif(p_payload->>'v3_preview_id','')::uuid for update;
    if v_preview.id is null then v_motivo := 'preview_v3_nao_encontrado';
    elsif coalesce(v_preview.preview_json #>> '{pending,tipoOperacao}','') <> 'lancar_recebimento_lote' then v_motivo := 'preview_nao_e_lote_multi_aluno';
    elsif coalesce(v_preview.preview_json #> '{pending,itens}','null'::jsonb) is distinct from coalesce(p_payload->'itens','null'::jsonb) then v_motivo := 'itens_divergentes_do_preview_v3';
    end if;
  end if;

  if v_motivo is null then
    -- Valida o snapshot do preview; não faz nova seleção de fatura.
    v_snapshot := public.sol_caixa_validar_multi_aluno_snapshot_v1(v_unidade, p_payload->'itens', v_total, v_data);
    if not coalesce((v_snapshot->>'ok')::boolean,false) then
      v_motivo := coalesce(v_snapshot->>'motivo','snapshot_nao_validado');
    end if;
  end if;

  if v_motivo is null then
    v_v3 := public.sol_caixa_v3_validar_approval_v1(p_payload,'lancar_recebimento');
    if not coalesce((v_v3->>'ok')::boolean,false) then v_motivo := coalesce(v_v3->>'motivo','approval_v3_invalido'); end if;
  end if;

  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,origem_message_id,preview_message_id,idempotency_key,unidade_id,data_caixa,payload,resultado,motivo)
    values(v_num,v_papel,p_payload->>'chat_id',p_payload->>'origem_message_id',p_payload->>'preview_message_id',v_key,v_unidade,v_data,p_payload,'recusado',v_motivo);
    return jsonb_build_object('ok',false,'motivo',v_motivo);
  end if;

  insert into public.sol_caixa_lotes_v1(unidade_id,caixa_diario_id,preview_id,approval_id,idempotency_key,valor_total,forma_pagamento,categoria,ator_numero,payload)
  values(v_unidade,v_caixa,nullif(p_payload->>'v3_preview_id','')::uuid,nullif(p_payload->>'v3_approval_id','')::uuid,v_key,v_total,v_forma,v_categoria,v_num,p_payload)
  returning id into v_lote;
  v_resp := coalesce(nullif(p_payload->>'autorizado_por',''),'Sol (agente)') || ' · via Sol';

  for v_item in select value from jsonb_array_elements(v_snapshot->'itens') loop
    v_ordem := v_ordem + 1;

    -- DESCRIÇÃO EM ETAPAS (02/09), espelhando sol_caixa_lancar_recebimento.
    -- A descrição da fatura e a identificação da pessoa são COMPLEMENTARES:
    -- a primeira entra como base, as outras duas se somam a ela. Cada anexo é
    -- condicionado a não estar já contido no texto — é o que impede
    -- "- Davi ... - Davi" no item declarado e "- Bruno · resp. Bruno" em quem
    -- é responsável de si mesmo.
    v_cat_item := coalesce(v_item->>'categoria', v_categoria);
    v_nome     := nullif(trim(coalesce(v_item->>'aluno_nome','')),'');
    v_respfin  := nullif(trim(coalesce(v_item->>'responsavel_financeiro','')),'');
    v_desc     := nullif(trim(coalesce(v_item->>'descricao','')),'');

    if v_desc is null then
      v_desc := trim(concat_ws(' ', initcap(v_cat_item),
                               case when v_nome is not null then '- '||v_nome end));
    end if;
    if v_nome is not null and position(lower(v_nome) in lower(v_desc)) = 0 then
      v_desc := v_desc || ' - ' || v_nome;
    end if;
    if v_respfin is not null and position(lower(v_respfin) in lower(v_desc)) = 0 then
      v_desc := v_desc || ' · resp. ' || v_respfin;
    end if;
    if v_desc is null or length(v_desc) < 3 then
      v_desc := 'Recebimento via Sol';
    end if;

    insert into public.caixa_movimentacoes(caixa_diario_id,unidade_id,data_movimento,ambiente,tipo,forma_pagamento,categoria,descricao,valor,criado_por,responsavel,cartao_modalidade,cartao_parcelas,aluno_id,fatura_id)
    values(v_caixa,v_unidade,v_data,'venda','entrada',v_forma,v_cat_item,v_desc,(v_item->>'valor')::numeric,concat_ws(':','sol-agente',v_papel,v_num),v_resp,nullif(p_payload->>'cartao_modalidade',''),nullif(p_payload->>'cartao_parcelas','')::int,nullif(v_item->>'aluno_id','')::integer,case when jsonb_typeof(v_item->'fatura_ids') = 'array' and jsonb_array_length(v_item->'fatura_ids') > 1 then null else nullif(v_item->>'canonical_fatura_id','')::uuid end)
    returning id into v_mov;
    if jsonb_typeof(v_item->'fatura_ids') = 'array' and jsonb_array_length(v_item->'fatura_ids') > 0 then
      insert into public.caixa_movimentacao_faturas (movimentacao_id, fatura_id, unidade_id)
      select v_mov, x::uuid, v_unidade
        from jsonb_array_elements_text(v_item->'fatura_ids') x
        join public.emusys_faturas f on f.id = x::uuid and f.unidade_id = v_unidade
      on conflict do nothing;
    end if;
    v_soma_ins := v_soma_ins + (v_item->>'valor')::numeric;
    insert into public.sol_caixa_lote_itens_v1(lote_id,ordem,aluno_nome,responsavel_financeiro,competencia,categoria,valor,canonical_fatura_id,movimentacao_id,item_json)
    values(v_lote,v_ordem,v_item->>'aluno_nome',nullif(v_item->>'responsavel_financeiro',''),nullif(v_item->>'competencia',''),v_item->>'categoria',(v_item->>'valor')::numeric,nullif(v_item->>'canonical_fatura_id',''),v_mov,v_item);
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,origem_message_id,preview_message_id,idempotency_key,unidade_id,data_caixa,payload,resultado,motivo,movimentacao_id,caixa_diario_id)
    values(v_num,v_papel,p_payload->>'chat_id',p_payload->>'origem_message_id',p_payload->>'preview_message_id',v_key||':'||v_ordem,v_unidade,v_data,p_payload||jsonb_build_object('item_lote',v_item),'lancado_lote',null,v_mov,v_caixa);
    v_movs := v_movs || jsonb_build_array(jsonb_build_object('movimentacao_id',v_mov,'aluno_nome',v_item->>'aluno_nome','valor',(v_item->>'valor')::numeric));
  end loop;

  -- INVARIANTE DO LOTE (01/09): o que foi gravado tem de ser EXATAMENTE o que
  -- foi aprovado — mesmo nº de itens e mesma soma. Divergiu, RAISE: a transação
  -- inteira volta e nada fica parcial.
  if v_ordem <> jsonb_array_length(p_payload->'itens') or abs(v_soma_ins - v_total) > 0.01 then
    raise exception 'SOL_LOTE_INCOMPLETO: gravados % de % itens, soma % vs total %',
      v_ordem, jsonb_array_length(p_payload->'itens'), v_soma_ins, v_total;
  end if;

  update public.sol_caixa_ingestao_recebimentos
     set status='lancado', movimentacao_id=(v_movs->0->>'movimentacao_id')::uuid, lancado_em=now(), lancado_por=v_num, valor_extraido=v_total, forma_extraida=v_forma, categoria_extraida=v_categoria, preview_message_id=coalesce(preview_message_id,p_payload->>'preview_message_id'), atualizado_em=now()
   where idempotency_key=v_key;
  return jsonb_build_object('ok',true,'lote_id',v_lote,'valor',v_total,'forma',v_forma,'movimentacoes',v_movs);
end;
$function$;
