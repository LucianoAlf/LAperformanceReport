-- Projecao aditiva em sombra: uma linha por aluno e slot real. Nenhum
-- consumidor e alterado nesta migration e nenhuma evidencia bruta e reescrita.

create or replace function public.fn_presenca_slot_key_v2(
  p_aluno_id integer,
  p_unidade_id uuid,
  p_professor_id integer,
  p_data_hora_inicio timestamptz,
  p_data_hora_fim timestamptz,
  p_curso_nome text
)
returns text
language sql
immutable
parallel safe
set search_path to 'pg_catalog', 'public'
as $function$
  select md5(jsonb_build_array(
    p_aluno_id,
    p_unidade_id::text,
    p_professor_id,
    case when p_data_hora_inicio is null then null
         else extract(epoch from p_data_hora_inicio)::numeric end,
    case when p_data_hora_fim is null then null
         else extract(epoch from p_data_hora_fim)::numeric end,
    lower(btrim(coalesce(p_curso_nome, '')))
  )::text)
$function$;

revoke all on function public.fn_presenca_slot_key_v2(
  integer, uuid, integer, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.fn_presenca_slot_key_v2(
  integer, uuid, integer, timestamptz, timestamptz, text
) to service_role;

create or replace view public.vw_presenca_ocorrencia_canonica_v2
with (security_invoker = true) as
with base as (
  select
    ap.id,
    ap.aluno_id,
    ap.unidade_id,
    coalesce(ap.professor_id, ae.professor_id) as professor_id,
    coalesce(ae.data_aula, ap.data_aula) as data_aula,
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
    politica.ausencia_emusys_resultado,
    politica.exige_revisao_operacional,
    politica.regra_versao as politica_regra_versao
  from public.aluno_presenca ap
  left join public.aulas_emusys ae
    on ae.id = ap.aula_emusys_id
   and ae.unidade_id = ap.unidade_id
  left join lateral (
    select p.ausencia_emusys_resultado,
           p.exige_revisao_operacional,
           p.regra_versao
      from public.presenca_politicas_confiabilidade p
     where p.unidade_id = ap.unidade_id
       and p.ativa
       and coalesce(ae.data_aula, ap.data_aula) between p.data_inicio and p.data_fim
     order by p.data_inicio desc, p.created_at desc, p.id
     limit 1
  ) politica on true
  where ae.id is null
     or coalesce(ae.categoria, 'normal') = 'normal'
), normalizada as (
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
), classificada as (
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
  from normalizada n
), ranqueada as (
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
  from classificada c
), agregada as (
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
        bool_or(c.decisao_humana = 'presente')
        and bool_or(c.emusys_presenca_normalizada = 'ausente')
      )
      or (
        bool_or(c.decisao_humana in ('falta', 'falta_justificada'))
        and bool_or(c.emusys_presenca_normalizada = 'presente')
      )
      or (
        bool_or(c.emusys_presenca_normalizada = 'presente')
        and bool_or(c.emusys_presenca_normalizada = 'ausente')
      )
      or (
        bool_or(c.aula_cancelada or c.aula_justificada)
        and (
          bool_or(c.decisao_humana = 'presente')
          or bool_or(c.emusys_presenca_normalizada = 'presente')
        )
      )
    ) as possui_conflito
  from classificada c
  group by c.slot_key
)
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
  ('presenca-ocorrencia-canonica-v2.1'
    || coalesce('+' || r.politica_regra_versao, ''))::text as regra_versao
from ranqueada r
join agregada a using (slot_key)
where r.posicao = 1;

revoke all on public.vw_presenca_ocorrencia_canonica_v2
  from public, anon, authenticated;
grant select on public.vw_presenca_ocorrencia_canonica_v2 to service_role;

comment on function public.fn_presenca_slot_key_v2(
  integer, uuid, integer, timestamptz, timestamptz, text
) is 'Chave v2 da ocorrencia: aluno, unidade, professor, inicio, fim e curso normalizado.';

comment on view public.vw_presenca_ocorrencia_canonica_v2 is
  'Read model v2 regular em sombra. Experimental permanece em contrato proprio. Evento cancelado/justificado nao fecha; humano terminal prevalece sobre sync; Emusys presente fecha; ausencia Emusys segue politica temporal e nunca fecha chamada sozinha.';
