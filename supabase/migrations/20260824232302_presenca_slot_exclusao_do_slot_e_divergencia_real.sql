-- Dois ajustes na canônica, achados testando o sinal antes de confiar nele.
--
-- (A) EXCLUSÃO É DO SLOT, NÃO DA LINHA ELEITA — e isso mexe em métrica.
-- Medido: em 244 dos 3.498 slots (7%) as gêmeas DISCORDAM do flag `justificada` da aula.
-- A decisão humana é a mesma nas duas (falta), mas uma linha vira `aula_justificada` (sai
-- do denominador) e a outra `falta_confirmada` (conta contra o professor). Como as duas
-- têm chamada fechada e mesma origem, o desempate caía no id — ou seja, **o acaso decidia
-- se a falta contava**. Justificativa é atributo da AULA REAL: se qualquer gêmea a carrega,
-- ela vale para o slot. Mesmo raciocínio de `possui_conflito`, que já subia por bool_or.
--
-- (B) DIVERGÊNCIA É CONFLITO DE DECISÃO, NÃO DIFERENÇA DE ATRIBUTO.
-- `tem_divergencia` comparava `resultado_pedagogico`, que embute o flag acima: acusava
-- 13 a 29 casos por dia em CG contra 0-1 da lista da Sol. Comparando o que o humano de
-- fato respondeu (`status_presenca`), sobram **5 conflitos reais em 23 dias** — que é a
-- ordem de grandeza certa, e são os que merecem alguém olhando.
create or replace view public.vw_presenca_slot_canonica_v1
  with (security_invoker = true) as
with linhas as (
  select
    v.*,
    ae.data_hora_fim,
    count(*) over w as qtd_linhas_no_slot,
    min(case when public.fn_presenca_e_forte(v.respondido_por::text)
             then v.status_presenca end) over w as decisao_forte_min,
    max(case when public.fn_presenca_e_forte(v.respondido_por::text)
             then v.status_presenca end) over w as decisao_forte_max,
    bool_or(v.possui_conflito) over w as conflito_em_alguma_linha,
    bool_or(v.resultado_pedagogico = 'aula_cancelada') over w as slot_cancelado,
    bool_or(v.resultado_pedagogico = 'aula_justificada') over w as slot_justificado,
    row_number() over (
      partition by v.aluno_id, v.unidade_id, v.professor_id,
                   v.data_hora_inicio, ae.data_hora_fim, v.curso_nome
      order by
        public.fn_presenca_fecha_chamada(v.status_presenca, v.respondido_por::text) desc,
        public.fn_presenca_e_forte(v.respondido_por::text) desc,
        v.respondido_em desc nulls last,
        case when v.aula_tipo = 'turma' then 0 else 1 end,
        v.aluno_presenca_id
    ) as posicao_no_slot
  from public.vw_aluno_presenca_semantica_v1 v
  left join public.aulas_emusys ae on ae.id = v.aula_emusys_id
  window w as (partition by v.aluno_id, v.unidade_id, v.professor_id,
                            v.data_hora_inicio, ae.data_hora_fim, v.curso_nome)
), resolvido as (
  select l.*,
    case
      when l.slot_cancelado then 'aula_cancelada'
      when l.slot_justificado then 'aula_justificada'
      else l.resultado_pedagogico
    end as resultado_do_slot
  from linhas l
  where l.posicao_no_slot = 1
)
select
  r.aluno_presenca_id, r.aluno_id, r.professor_id, r.unidade_id,
  r.aula_emusys_id, r.aula_emusys_evento_id,
  r.data_aula, r.data_hora_inicio, r.data_hora_fim, r.horario_aula,
  r.curso_nome, r.turma_nome, r.aula_categoria, r.aula_tipo,
  r.estado_origem, r.status_presenca, r.respondido_por, r.respondido_em,
  r.proveniencia,
  case when r.resultado_do_slot in ('aula_cancelada','aula_justificada')
       then 'nao_aplicavel' else r.situacao_chamada end as situacao_chamada,
  r.resultado_do_slot as resultado_pedagogico,
  case
    when r.resultado_do_slot in ('presente','aula_cancelada','aula_justificada','falta_confirmada')
      then 'confirmada'
    when r.resultado_do_slot = 'falta_provavel' then 'provavel'
    else 'desconhecida'
  end as confianca,
  r.resultado_do_slot in ('presente','falta_confirmada') as considera_frequencia_denominador,
  r.resultado_do_slot = 'presente' as considera_presenca,
  r.resultado_do_slot = 'falta_confirmada' as considera_falta,
  r.resultado_do_slot in ('aula_cancelada','aula_justificada') as exclui_por_evento,
  r.estado_emusys_bruto, r.professor_presenca_emusys,
  r.evidencia_registrada_em, r.fundamento_confianca,
  r.revisao_operacional_exigida, r.revisao_operacional_status,
  r.qtd_linhas_no_slot,
  r.qtd_linhas_no_slot > 1 as slot_geminado_no_emusys,
  (r.decisao_forte_min is distinct from r.decisao_forte_max) as tem_divergencia,
  case
    when r.resultado_do_slot in ('aula_cancelada','aula_justificada') then null
    when public.fn_presenca_fecha_chamada(r.status_presenca, r.respondido_por::text)
      then r.status_presenca
    else null
  end as presenca_afirmada,
  (r.resultado_do_slot not in ('aula_cancelada','aula_justificada')
   and public.fn_presenca_fecha_chamada(r.status_presenca, r.respondido_por::text)) as chamada_fechada,
  'presenca-slot-canonica-v1.1'::text as regra_versao,
  coalesce(r.conflito_em_alguma_linha, false) as possui_conflito
from resolvido r;

revoke all on public.vw_presenca_slot_canonica_v1
  from public, anon, authenticated, fabio_agent, sol_acesso_restrito,
       mila_acesso_restrito, lia_acesso_restrito;
grant select on public.vw_presenca_slot_canonica_v1 to service_role;;
