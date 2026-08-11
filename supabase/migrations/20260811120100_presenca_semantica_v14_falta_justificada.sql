-- 2026-08-11 — Presenca semantica v1.4: agenda_secretaria e falta_justificada
-- Spec: docs/superpowers/plans/2026-08-11-chamada-agenda-motor-presenca.md
-- falta_justificada CONTA COMO FALTA (decisao D2): status legado segue 'ausente',
-- resultado_pedagogico segue 'falta_confirmada' via fonte humana forte.
-- O rotulo sai pela nova coluna status_presenca no final da view (aditivo).

-- 1) agenda_secretaria passa a ser fonte humana forte
create or replace function public.fn_presenca_e_forte(p_respondido_por text)
returns boolean
language sql
immutable
parallel safe
as $function$
  select coalesce(
    p_respondido_por in (
      'professor_la_teacher',
      'fabio_audio',
      'manual',
      'professor_whatsapp',
      'agenda_secretaria'
    ),
    false
  )
$function$;

-- 2) View v1.4: proveniencia ganha agenda_secretaria; status_presenca exposto
--    no fim da lista de colunas (CREATE OR REPLACE nao permite renomear).
create or replace view public.vw_aluno_presenca_semantica_v1
with (security_invoker = true) as
with evidencia as (
  select
    ap.id,
    ap.aluno_id,
    ap.professor_id,
    ap.unidade_id,
    ap.data_aula,
    ap.horario_aula,
    ap.status,
    ap.respondido_por,
    ap.respondido_em,
    ap.mensagem_uazapi_id,
    ap.token,
    ap.created_at,
    ap.aula_emusys_id,
    ap.curso_nome,
    ap.turma_nome,
    ap.sala_nome,
    ap.status_presenca,
    ap.emusys_presenca_bruta,
    ap.sincronizado_emusys_em,
    coalesce(nullif(lower(ap.emusys_presenca_bruta), ''), lower(ap.status::text)) as estado_emusys_bruto,
    ae.emusys_id as aula_emusys_evento_id,
    ae.cancelada as aula_cancelada,
    ae.justificada as aula_justificada,
    ae.categoria as aula_categoria,
    ae.tipo as aula_tipo,
    ae.data_hora_inicio,
    lower(nullif(ae.professor_presenca, '')) as professor_presenca_emusys,
    case
      when ap.aula_emusys_id is not null
        then bool_or(ap.status::text = 'presente') over (partition by ap.aula_emusys_id)
      else ap.status::text = 'presente'
    end as evento_tem_aluno_presente,
    politica.id as politica_confiabilidade_id,
    politica.ausencia_emusys_resultado,
    politica.exige_revisao_operacional,
    politica.evidencia as politica_evidencia,
    revisao.status as revisao_status
  from public.aluno_presenca ap
  left join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
  left join lateral (
    select p.*
    from public.presenca_politicas_confiabilidade p
    where p.unidade_id = ap.unidade_id
      and p.ativa
      and ap.data_aula between p.data_inicio and p.data_fim
    order by p.data_inicio desc, p.created_at desc, p.id
    limit 1
  ) politica on true
  left join public.aluno_presenca_revisoes_operacionais revisao
    on revisao.aluno_presenca_id = ap.id
),
classificada as (
  select
    e.*,
    lower(coalesce(e.status, 'desconhecido')::text) as estado_origem,
    case
      when e.respondido_por::text = 'professor_la_teacher' then 'la_teacher'
      when e.respondido_por::text = 'fabio_audio' then 'fabio_audio'
      when e.respondido_por::text = 'professor_whatsapp' then 'professor_whatsapp'
      when e.respondido_por::text = 'agenda_secretaria' then 'agenda_secretaria'
      when e.respondido_por::text = 'manual' then 'manual'
      when e.respondido_por::text in ('emusys', 'sistema') then 'emusys'
      else 'desconhecida'
    end as proveniencia,
    case
      when e.status::text = 'presente' then 'registrada'
      when coalesce(e.aula_cancelada, false) or coalesce(e.aula_justificada, false) then 'nao_aplicavel'
      when public.fn_presenca_e_forte(e.respondido_por::text) and e.status::text = 'ausente' then 'registrada'
      when e.respondido_por::text in ('emusys', 'sistema')
        and e.estado_emusys_bruto = 'ausente'
        and e.ausencia_emusys_resultado = 'falta_confirmada'
        then 'registrada_atestada'
      when e.respondido_por::text in ('emusys', 'sistema')
        and e.estado_emusys_bruto = 'ausente'
        and (e.evento_tem_aluno_presente or e.professor_presenca_emusys = 'presente')
        then 'registrada_inferida'
      else 'indeterminada'
    end as situacao_chamada,
    case
      when e.status::text = 'presente' then 'presente'
      when coalesce(e.aula_cancelada, false) then 'aula_cancelada'
      when coalesce(e.aula_justificada, false) then 'aula_justificada'
      when public.fn_presenca_e_forte(e.respondido_por::text) and e.status::text = 'ausente' then 'falta_confirmada'
      when e.respondido_por::text in ('emusys', 'sistema')
        and e.estado_emusys_bruto = 'ausente'
        and e.ausencia_emusys_resultado = 'falta_confirmada'
        then 'falta_confirmada'
      when e.respondido_por::text in ('emusys', 'sistema')
        and e.estado_emusys_bruto = 'ausente'
        and (e.evento_tem_aluno_presente or e.professor_presenca_emusys = 'presente')
        then 'falta_provavel'
      else 'indeterminado'
    end as resultado_pedagogico
  from evidencia e
)
select
  c.id as aluno_presenca_id,
  c.aluno_id,
  c.professor_id,
  c.unidade_id,
  c.aula_emusys_id,
  c.aula_emusys_evento_id,
  c.data_aula,
  c.horario_aula,
  c.data_hora_inicio,
  c.curso_nome,
  c.turma_nome,
  c.aula_categoria,
  c.aula_tipo,
  c.estado_origem,
  c.respondido_por,
  c.respondido_em,
  c.proveniencia,
  c.situacao_chamada,
  c.resultado_pedagogico,
  case
    when c.resultado_pedagogico in ('presente', 'aula_cancelada', 'aula_justificada', 'falta_confirmada')
      then 'confirmada'
    when c.resultado_pedagogico = 'falta_provavel' then 'provavel'
    else 'desconhecida'
  end as confianca,
  c.resultado_pedagogico in ('presente', 'falta_confirmada') as considera_frequencia_denominador,
  c.resultado_pedagogico = 'presente' as considera_presenca,
  c.resultado_pedagogico = 'falta_confirmada' as considera_falta,
  c.resultado_pedagogico in ('aula_cancelada', 'aula_justificada') as exclui_por_evento,
  public.fn_presenca_e_forte(c.respondido_por::text) and c.respondido_em is not null as respondido_em_confiavel,
  (
    c.status::text = 'presente'
    and (coalesce(c.aula_cancelada, false) or coalesce(c.aula_justificada, false))
  ) as possui_conflito,
  'presenca-semantica-v1.4'::text as regra_versao,
  c.estado_emusys_bruto,
  c.sincronizado_emusys_em,
  c.professor_presenca_emusys,
  case
    when public.fn_presenca_e_forte(c.respondido_por::text) then c.respondido_em
    else c.sincronizado_emusys_em
  end as evidencia_registrada_em,
  c.politica_confiabilidade_id,
  case
    when public.fn_presenca_e_forte(c.respondido_por::text) then 'resposta_humana_explicita'
    when c.estado_emusys_bruto = 'ausente' and c.politica_confiabilidade_id is not null then c.politica_evidencia
    when c.resultado_pedagogico = 'falta_provavel' then 'evidencia_de_que_a_aula_ocorreu'
    else 'regra_conservadora_sem_atestado'
  end as fundamento_confianca,
  (
    coalesce(c.exige_revisao_operacional, false)
    and not public.fn_presenca_e_forte(c.respondido_por::text)
    and c.respondido_por::text in ('emusys', 'sistema')
    and c.estado_emusys_bruto = 'ausente'
    and not coalesce(c.aula_cancelada, false)
    and not coalesce(c.aula_justificada, false)
  ) as revisao_operacional_exigida,
  case
    when coalesce(c.exige_revisao_operacional, false)
      and not public.fn_presenca_e_forte(c.respondido_por::text)
      and c.respondido_por::text in ('emusys', 'sistema')
      and c.estado_emusys_bruto = 'ausente'
      and not coalesce(c.aula_cancelada, false)
      and not coalesce(c.aula_justificada, false)
      then coalesce(c.revisao_status, 'pendente')
    else 'nao_exigida'
  end as revisao_operacional_status,
  -- v1.4 aditivo: rotulo fino para separar falta seca de falta justificada
  c.status_presenca
from classificada c;

comment on view public.vw_aluno_presenca_semantica_v1 is
  'Presenca semantica v1.4. agenda_secretaria e fonte humana forte; falta_justificada conta como falta_confirmada (D2) e se distingue pela coluna status_presenca.';
