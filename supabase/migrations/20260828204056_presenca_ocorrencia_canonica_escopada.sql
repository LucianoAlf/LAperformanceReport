-- Kernel canonico parametrizado. A logica abaixo e a mesma da view v2.7 (ledger remoto alinhado);
-- somente antecipa o recorte de unidade e periodo antes de ranquear/agregar.
-- A publicacao ocorre em migration separada, depois da equivalencia em producao.

create or replace function public.fn_presenca_ocorrencia_canonica_escopada_v2(
  p_unidade_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table (
  slot_key text,
  aluno_id integer,
  unidade_id uuid,
  professor_id integer,
  data_aula date,
  data_hora_inicio timestamptz,
  data_hora_fim timestamptz,
  curso_nome text,
  resultado_canonico text,
  fecha_chamada boolean,
  fonte_decisao text,
  decidido_em timestamptz,
  emusys_presenca_bruta text,
  possui_conflito boolean,
  ids_aulas_emusys integer[],
  regra_versao text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
set plan_cache_mode = 'force_custom_plan'
as $function$
with evidencia as not materialized (
  select
    ap.id,
    ap.aluno_id,
    ap.unidade_id,
    coalesce(ap.professor_id, ae.professor_id) as professor_id,
    ae.data_aula,
    coalesce(
      ae.data_hora_inicio,
      case when ap.horario_aula is not null then
        (ap.data_aula::timestamp + ap.horario_aula)
          at time zone 'America/Sao_Paulo'
      end
    ) as data_hora_inicio,
    coalesce(
      ae.data_hora_fim,
      case when ae.data_hora_inicio is not null and ae.duracao_minutos is not null
        then ae.data_hora_inicio + make_interval(mins => ae.duracao_minutos)
      end
    ) as data_hora_fim,
    coalesce(
      nullif(btrim(ae.curso_nome), ''),
      nullif(btrim(ap.curso_nome), ''),
      ''
    ) as curso_nome,
    coalesce(ae.cancelada, false) as aula_cancelada,
    coalesce(ae.justificada, false) as aula_justificada,
    ap.aula_emusys_id,
    lower(nullif(btrim(ap.status::text), '')) as status_legado,
    lower(nullif(btrim(ap.status_presenca), '')) as status_presenca,
    lower(nullif(btrim(ap.respondido_por::text), '')) as respondido_por,
    ap.respondido_em,
    lower(coalesce(
      nullif(btrim(ap.emusys_presenca_bruta), ''),
      case when ap.respondido_por::text in ('emusys', 'sistema')
           then nullif(btrim(ap.status::text), '') end
    )) as emusys_presenca_normalizada,
    ap.sincronizado_emusys_em,
    ae.data_aula is distinct from
      ((ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date)
      as data_slot_divergente
  from public.aulas_emusys ae
  join public.aluno_presenca ap
    on ap.aula_emusys_id = ae.id
   and ap.unidade_id = ae.unidade_id
  where coalesce(ae.categoria, 'normal') = 'normal'
    and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
    and (p_data_inicio is null or ae.data_aula >= p_data_inicio)
    and (p_data_fim is null or ae.data_aula <= p_data_fim)

  union all

  select
    ap.id,
    ap.aluno_id,
    ap.unidade_id,
    ap.professor_id,
    ap.data_aula,
    case when ap.horario_aula is not null then
      (ap.data_aula::timestamp + ap.horario_aula)
        at time zone 'America/Sao_Paulo'
    end as data_hora_inicio,
    null::timestamptz as data_hora_fim,
    coalesce(nullif(btrim(ap.curso_nome), ''), '') as curso_nome,
    false as aula_cancelada,
    false as aula_justificada,
    ap.aula_emusys_id,
    lower(nullif(btrim(ap.status::text), '')) as status_legado,
    lower(nullif(btrim(ap.status_presenca), '')) as status_presenca,
    lower(nullif(btrim(ap.respondido_por::text), '')) as respondido_por,
    ap.respondido_em,
    lower(coalesce(
      nullif(btrim(ap.emusys_presenca_bruta), ''),
      case when ap.respondido_por::text in ('emusys', 'sistema')
           then nullif(btrim(ap.status::text), '') end
    )) as emusys_presenca_normalizada,
    ap.sincronizado_emusys_em,
    false as data_slot_divergente
  from public.aluno_presenca ap
  where (p_unidade_id is null or ap.unidade_id = p_unidade_id)
    and (p_data_inicio is null or ap.data_aula >= p_data_inicio)
    and (p_data_fim is null or ap.data_aula <= p_data_fim)
    and not exists (
    select 1
    from public.aulas_emusys ae
    where ae.id = ap.aula_emusys_id
      and ae.unidade_id = ap.unidade_id
  )
), base as not materialized (
  select
    e.*,
    snap.run_id as emusys_snapshot_run_id,
    snap.status as emusys_snapshot_status,
    snap.started_at as emusys_snapshot_started_at,
    snap.finished_at as emusys_snapshot_finished_at,
    politica.ausencia_emusys_resultado,
    politica.exige_revisao_operacional,
    politica.regra_versao as politica_regra_versao
  from evidencia e
  left join lateral (
    select
      aa.ultimo_run_visto as run_id,
      sx.status,
      sx.criada_em as started_at,
      sx.finalizada_em as finished_at
    from public.aula_alunos_emusys aa
    join public.presenca_sync_execucoes sx
      on sx.id = aa.ultimo_run_visto
     and sx.unidade_id = e.unidade_id
     and sx.data_alvo = e.data_aula
     and sx.modo = 'presenca'
     and sx.status = 'concluida'
     and sx.snapshot_hash ~ '^[0-9a-f]{64}$'
     and sx.finalizada_em is not null
    join public.presenca_sync_cobertura sc
      on sc.unidade_id = sx.unidade_id
     and sc.modo = 'presenca'
     and sc.data_alvo = sx.data_alvo
     and sc.run_id = sx.id
     and sc.status = 'concluida'
     and sc.snapshot_hash = sx.snapshot_hash
     and sc.snapshot_hash ~ '^[0-9a-f]{64}$'
     and sc.finalizada_em is not null
    where aa.unidade_id = e.unidade_id
      and aa.aula_emusys_id = e.aula_emusys_id
      and aa.aluno_id = e.aluno_id
      and aa.ativo_operacional
      and not exists (
        select 1
        from public.presenca_sync_execucoes newer
        where newer.unidade_id = sx.unidade_id
          and newer.data_alvo = sx.data_alvo
          and newer.modo = 'presenca'
          and newer.status = 'concluida'
          and newer.snapshot_hash ~ '^[0-9a-f]{64}$'
          and newer.finalizada_em is not null
          and newer.finalizada_em > sx.finalizada_em
          and exists (
            select 1
            from public.presenca_sync_cobertura newer_cobertura
            where newer_cobertura.unidade_id = newer.unidade_id
              and newer_cobertura.modo = 'presenca'
              and newer_cobertura.data_alvo = newer.data_alvo
              and newer_cobertura.run_id = newer.id
              and newer_cobertura.status = 'concluida'
              and newer_cobertura.snapshot_hash = newer.snapshot_hash
              and newer_cobertura.snapshot_hash ~ '^[0-9a-f]{64}$'
              and newer_cobertura.finalizada_em is not null
          )
      )
    order by aa.updated_at desc nulls last, aa.id desc
    limit 1
  ) snap on true
  left join lateral (
    select p.ausencia_emusys_resultado,
           p.exige_revisao_operacional,
           p.regra_versao
      from public.presenca_politicas_confiabilidade p
     where p.unidade_id = e.unidade_id
       and p.ativa
       and e.data_aula between p.data_inicio and p.data_fim
     order by p.data_inicio desc, p.created_at desc, p.id
     limit 1
  ) politica on true
), normalizada as not materialized (
  select
    b.*,
    (
      b.professor_id is not null
      and b.data_hora_inicio is not null
      and b.data_hora_fim is not null
      and nullif(btrim(b.curso_nome), '') is not null
    ) as identidade_completa,
    case
      when b.professor_id is not null
       and b.data_hora_inicio is not null
       and b.data_hora_fim is not null
       and nullif(btrim(b.curso_nome), '') is not null then
        public.fn_presenca_slot_key_v2(
          b.aluno_id, b.unidade_id, b.professor_id,
          b.data_hora_inicio, b.data_hora_fim, b.curso_nome
        )
      else 'incompleto:' || md5(b.id::text)
    end as slot_key,
    case
      when b.respondido_por in (
        'agenda_secretaria', 'manual', 'professor_la_teacher',
        'fabio_audio', 'professor_whatsapp'
      ) and b.respondido_em is not null then
        case
          when b.status_presenca in ('presente', 'falta', 'falta_justificada')
            then b.status_presenca
          when b.status_legado = 'presente' then 'presente'
          when b.status_legado = 'ausente' then 'falta'
          else null
        end
      else null
    end as decisao_humana,
    case b.respondido_por
      when 'agenda_secretaria' then 500
      when 'manual' then 450
      when 'professor_la_teacher' then 400
      when 'fabio_audio' then 390
      when 'professor_whatsapp' then 380
      else 0
    end as forca_fonte_humana
  from base b
), normalizada_roster as not materialized (
  select
    n.*,
    case
      when n.emusys_presenca_normalizada = 'presente'
       and n.decisao_humana in ('falta', 'falta_justificada')
        then (
          n.emusys_snapshot_run_id is not null
          and exists (
            select 1
            from public.aula_alunos_emusys aa2
            join public.aulas_emusys ae2
              on ae2.id = aa2.aula_emusys_id
             and ae2.unidade_id = aa2.unidade_id
            where aa2.unidade_id = n.unidade_id
              and aa2.aluno_id = n.aluno_id
              and aa2.ativo_operacional
              and aa2.ultimo_run_visto = n.emusys_snapshot_run_id
              and coalesce(ae2.categoria, 'normal') = 'normal'
              and ae2.data_aula = n.data_aula
              and public.fn_presenca_slot_key_v2(
                n.aluno_id,
                n.unidade_id,
                ae2.professor_id,
                ae2.data_hora_inicio,
                coalesce(
                  ae2.data_hora_fim,
                  case when ae2.data_hora_inicio is not null and ae2.duracao_minutos is not null
                    then ae2.data_hora_inicio + make_interval(mins => ae2.duracao_minutos)
                  end
                ),
                coalesce(nullif(btrim(ae2.curso_nome), ''), '')
              ) = n.slot_key
          )
          and not exists (
            select 1
            from public.aula_alunos_emusys aa2
            join public.aulas_emusys ae2
              on ae2.id = aa2.aula_emusys_id
             and ae2.unidade_id = aa2.unidade_id
            where aa2.unidade_id = n.unidade_id
              and aa2.aluno_id = n.aluno_id
              and aa2.ativo_operacional
              and coalesce(ae2.categoria, 'normal') = 'normal'
              and ae2.data_aula = n.data_aula
              and public.fn_presenca_slot_key_v2(
                n.aluno_id,
                n.unidade_id,
                ae2.professor_id,
                ae2.data_hora_inicio,
                coalesce(
                  ae2.data_hora_fim,
                  case when ae2.data_hora_inicio is not null and ae2.duracao_minutos is not null
                    then ae2.data_hora_inicio + make_interval(mins => ae2.duracao_minutos)
                  end
                ),
                coalesce(nullif(btrim(ae2.curso_nome), ''), '')
              ) = n.slot_key
              and (
                aa2.ultimo_run_visto is distinct from n.emusys_snapshot_run_id
                or not exists (
                  select 1
                  from public.aluno_presenca ap2
                  where ap2.unidade_id = n.unidade_id
                    and ap2.aluno_id = n.aluno_id
                    and ap2.aula_emusys_id = aa2.aula_emusys_id
                    and (
                      lower(nullif(btrim(ap2.emusys_presenca_bruta), '')) in ('presente', 'ausente')
                      or (
                        ap2.respondido_por::text in ('emusys', 'sistema')
                        and lower(nullif(btrim(ap2.status::text), '')) in ('presente', 'ausente')
                      )
                    )
                )
              )
          )
        )
      else true
    end as emusys_snapshot_roster_completo
  from normalizada n
), classificada as not materialized (
  select
    n.*,
    case
      when not n.identidade_completa then 'indeterminado'
      when n.aula_cancelada then 'aula_cancelada'
      when n.aula_justificada then 'aula_justificada'
      when n.decisao_humana is not null then n.decisao_humana
      when n.emusys_presenca_normalizada = 'presente' then 'presente'
      when n.emusys_presenca_normalizada = 'ausente'
       and n.ausencia_emusys_resultado = 'falta_confirmada'
        then 'falta'
      else 'indeterminado'
    end as resultado_canonico,
    case
      when not n.identidade_completa then false
      when n.aula_cancelada or n.aula_justificada then false
      when n.decisao_humana is not null then true
      when n.emusys_presenca_normalizada = 'presente' then true
      else false
    end as fecha_chamada,
    case
      when not n.identidade_completa then 'identidade_incompleta'
      when n.aula_cancelada then 'aula_cancelada'
      when n.aula_justificada then 'aula_justificada'
      when n.decisao_humana is not null then n.respondido_por
      when n.emusys_presenca_normalizada = 'presente' then 'emusys'
      when n.emusys_presenca_normalizada = 'ausente'
       and n.ausencia_emusys_resultado = 'falta_confirmada'
        then 'emusys_politica_temporal'
      else 'indeterminado'
    end as fonte_decisao,
    case
      when n.decisao_humana is not null then n.respondido_em
      else n.sincronizado_emusys_em
    end as decidido_em,
    case
      when not n.identidade_completa then 0
      when n.aula_cancelada or n.aula_justificada then 600
      when n.decisao_humana is not null then n.forca_fonte_humana
      when n.emusys_presenca_normalizada = 'presente' then 200
      when n.emusys_presenca_normalizada = 'ausente'
       and n.ausencia_emusys_resultado = 'falta_confirmada'
        then 100
      else 0
    end as forca_fonte
  from normalizada_roster n
), slots_multidata as materialized (
  select distinct n.slot_key
  from normalizada n
  where n.identidade_completa
    and n.data_slot_divergente
), classificada_regular as not materialized (
  select c.*
  from classificada c
  where not exists (
    select 1 from slots_multidata m where m.slot_key = c.slot_key
  )
), classificada_multidata as not materialized (
  select c.*
  from classificada c
  where exists (
    select 1 from slots_multidata m where m.slot_key = c.slot_key
  )
), ranqueada_regular as (
  select
    c.*,
    row_number() over (
      partition by c.aluno_id, c.unidade_id, c.data_aula, c.professor_id,
                   c.data_hora_inicio, c.data_hora_fim,
                   lower(btrim(c.curso_nome)),
                   case when c.identidade_completa then null else c.id end
      order by
        c.fecha_chamada desc,
        c.forca_fonte desc,
        c.decidido_em asc nulls last,
        c.id
    ) as posicao
  from classificada_regular c
), agregada_regular as (
  select
    c.slot_key,
    c.unidade_id,
    c.data_aula,
    array_agg(distinct c.aula_emusys_id order by c.aula_emusys_id)
      filter (where c.aula_emusys_id is not null) as ids_aulas_emusys,
    bool_or(c.aula_cancelada) as slot_cancelado,
    bool_or(c.aula_justificada) as slot_justificado,
    (
      count(distinct c.decisao_humana)
        filter (where c.decisao_humana is not null) > 1
      or (
        bool_or(c.decisao_humana in ('falta', 'falta_justificada'))
        and bool_or(c.emusys_presenca_normalizada = 'presente')
        and (
          count(*) filter (
            where c.emusys_presenca_normalizada is not null
          ) > 0
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
          ) = count(*) filter (
            where c.emusys_presenca_normalizada is not null
          )
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
          ) = count(distinct c.aula_emusys_id)
            filter (where c.emusys_presenca_normalizada = 'presente')
          and count(distinct c.emusys_snapshot_run_id)
            filter (where c.emusys_presenca_normalizada = 'presente') = 1
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
              and c.emusys_snapshot_run_id is null
          ) = 0
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
              and c.emusys_snapshot_status is distinct from 'concluida'
          ) = 0
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
              and not c.emusys_snapshot_roster_completo
          ) = 0
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
              and (
                c.sincronizado_emusys_em is null
                or c.emusys_snapshot_started_at is null
                or c.emusys_snapshot_finished_at is null
                or c.sincronizado_emusys_em < c.emusys_snapshot_started_at
                or c.sincronizado_emusys_em > c.emusys_snapshot_finished_at
              )
          ) = 0
        )
      )
      or (
        bool_or(c.aula_cancelada or c.aula_justificada)
        and (
          bool_or(c.decisao_humana = 'presente')
          or bool_or(c.emusys_presenca_normalizada = 'presente')
        )
      )
    ) as possui_conflito
  from classificada_regular c
  group by c.slot_key, c.unidade_id, c.data_aula
), ranqueada_multidata as (
  select
    c.*,
    row_number() over (
      partition by c.aluno_id, c.unidade_id, c.professor_id,
                   c.data_hora_inicio, c.data_hora_fim,
                   lower(btrim(c.curso_nome)),
                   case when c.identidade_completa then null else c.id end
      order by
        c.fecha_chamada desc,
        c.forca_fonte desc,
        c.decidido_em asc nulls last,
        c.id
    ) as posicao
  from classificada_multidata c
), agregada_multidata as (
  select
    c.slot_key,
    array_agg(distinct c.aula_emusys_id order by c.aula_emusys_id)
      filter (where c.aula_emusys_id is not null) as ids_aulas_emusys,
    bool_or(c.aula_cancelada) as slot_cancelado,
    bool_or(c.aula_justificada) as slot_justificado,
    (
      count(distinct c.decisao_humana)
        filter (where c.decisao_humana is not null) > 1
      or (
        bool_or(c.decisao_humana in ('falta', 'falta_justificada'))
        and bool_or(c.emusys_presenca_normalizada = 'presente')
        and (
          count(*) filter (
            where c.emusys_presenca_normalizada is not null
          ) > 0
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
          ) = count(*) filter (
            where c.emusys_presenca_normalizada is not null
          )
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
          ) = count(distinct c.aula_emusys_id)
            filter (where c.emusys_presenca_normalizada = 'presente')
          and count(distinct c.emusys_snapshot_run_id)
            filter (where c.emusys_presenca_normalizada = 'presente') = 1
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
              and c.emusys_snapshot_run_id is null
          ) = 0
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
              and c.emusys_snapshot_status is distinct from 'concluida'
          ) = 0
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
              and not c.emusys_snapshot_roster_completo
          ) = 0
          and count(*) filter (
            where c.emusys_presenca_normalizada = 'presente'
              and (
                c.sincronizado_emusys_em is null
                or c.emusys_snapshot_started_at is null
                or c.emusys_snapshot_finished_at is null
                or c.sincronizado_emusys_em < c.emusys_snapshot_started_at
                or c.sincronizado_emusys_em > c.emusys_snapshot_finished_at
              )
          ) = 0
        )
      )
      or (
        bool_or(c.aula_cancelada or c.aula_justificada)
        and (
          bool_or(c.decisao_humana = 'presente')
          or bool_or(c.emusys_presenca_normalizada = 'presente')
        )
      )
    ) as possui_conflito
  from classificada_multidata c
  group by c.slot_key
), resolvida as (
  select
    r.slot_key,
    r.aluno_id,
    r.unidade_id,
    r.professor_id,
    r.data_aula,
    r.data_hora_inicio,
    r.data_hora_fim,
    r.curso_nome,
    case when a.slot_cancelado then 'aula_cancelada'
         when a.slot_justificado then 'aula_justificada'
         else r.resultado_canonico end as resultado_canonico,
    case when a.slot_cancelado or a.slot_justificado then false
         else r.fecha_chamada end as fecha_chamada,
    case when a.slot_cancelado then 'aula_cancelada'
         when a.slot_justificado then 'aula_justificada'
         else r.fonte_decisao end as fonte_decisao,
    r.decidido_em,
    r.emusys_presenca_normalizada as emusys_presenca_bruta,
    coalesce(a.possui_conflito, false) as possui_conflito,
    coalesce(a.ids_aulas_emusys, '{}'::integer[]) as ids_aulas_emusys,
    ('presenca-ocorrencia-canonica-v2.7'
      || coalesce('+' || r.politica_regra_versao, ''))::text as regra_versao
  from ranqueada_regular r
  join agregada_regular a
    on a.slot_key = r.slot_key
   and a.unidade_id = r.unidade_id
   and a.data_aula = r.data_aula
  where r.posicao = 1

  union all

  select
    r.slot_key,
    r.aluno_id,
    r.unidade_id,
    r.professor_id,
    r.data_aula,
    r.data_hora_inicio,
    r.data_hora_fim,
    r.curso_nome,
    case when a.slot_cancelado then 'aula_cancelada'
         when a.slot_justificado then 'aula_justificada'
         else r.resultado_canonico end as resultado_canonico,
    case when a.slot_cancelado or a.slot_justificado then false
         else r.fecha_chamada end as fecha_chamada,
    case when a.slot_cancelado then 'aula_cancelada'
         when a.slot_justificado then 'aula_justificada'
         else r.fonte_decisao end as fonte_decisao,
    r.decidido_em,
    r.emusys_presenca_normalizada as emusys_presenca_bruta,
    coalesce(a.possui_conflito, false) as possui_conflito,
    coalesce(a.ids_aulas_emusys, '{}'::integer[]) as ids_aulas_emusys,
    ('presenca-ocorrencia-canonica-v2.7'
      || coalesce('+' || r.politica_regra_versao, ''))::text as regra_versao
  from ranqueada_multidata r
  join agregada_multidata a using (slot_key)
  where r.posicao = 1
)
select * from resolvida
$function$;

revoke all on function public.fn_presenca_ocorrencia_canonica_escopada_v2(
  uuid, date, date
) from public, anon, authenticated, service_role;
grant execute on function public.fn_presenca_ocorrencia_canonica_escopada_v2(
  uuid, date, date
) to service_role;

comment on function public.fn_presenca_ocorrencia_canonica_escopada_v2(
  uuid, date, date
) is 'Implementacao unica da ocorrencia canonica v2.7 com recorte antecipado opcional de unidade e periodo.';
