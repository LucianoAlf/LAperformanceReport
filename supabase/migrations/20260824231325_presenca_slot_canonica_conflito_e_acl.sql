-- `possui_conflito` faltava e é consumido pela frequência do professor.
-- CREATE OR REPLACE VIEW só aceita coluna NOVA no fim — por isso vai no fim, não junto
-- de `tem_divergencia`, apesar de serem parentes.
--
-- ⚠️ ACL: a view nasceu com `authenticated=r`, `fabio_agent=r`, `sol_acesso_restrito=r`
-- etc. herdados de ALTER DEFAULT PRIVILEGES — e todos falhariam em runtime, porque ela é
-- `security_invoker = true` e nenhum desses papéis tem SELECT em
-- `vw_aluno_presenca_semantica_v1`, que está embaixo. Grant que não funciona é pior que
-- grant ausente: promete acesso e devolve "permission denied" na cara do usuário.
-- Esta é camada interna, igual à semântica: quem consome são RPCs SECURITY DEFINER.
create or replace view public.vw_presenca_slot_canonica_v1
  with (security_invoker = true) as
with linhas as (
  select
    v.*,
    ae.data_hora_fim,
    count(*) over w as qtd_linhas_no_slot,
    min(case when public.fn_presenca_e_forte(v.respondido_por::text)
             then v.resultado_pedagogico end) over w as resultado_forte_min,
    max(case when public.fn_presenca_e_forte(v.respondido_por::text)
             then v.resultado_pedagogico end) over w as resultado_forte_max,
    bool_or(v.possui_conflito) over w as conflito_em_alguma_linha,
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
)
select
  l.aluno_presenca_id, l.aluno_id, l.professor_id, l.unidade_id,
  l.aula_emusys_id, l.aula_emusys_evento_id,
  l.data_aula, l.data_hora_inicio, l.data_hora_fim, l.horario_aula,
  l.curso_nome, l.turma_nome, l.aula_categoria, l.aula_tipo,
  l.estado_origem, l.status_presenca, l.respondido_por, l.respondido_em,
  l.proveniencia, l.situacao_chamada, l.resultado_pedagogico, l.confianca,
  l.considera_frequencia_denominador, l.considera_presenca, l.considera_falta,
  l.exclui_por_evento, l.estado_emusys_bruto, l.professor_presenca_emusys,
  l.evidencia_registrada_em, l.fundamento_confianca,
  l.revisao_operacional_exigida, l.revisao_operacional_status,
  l.qtd_linhas_no_slot,
  l.qtd_linhas_no_slot > 1 as slot_geminado_no_emusys,
  (l.resultado_forte_min is distinct from l.resultado_forte_max) as tem_divergencia,
  case
    when public.fn_presenca_fecha_chamada(l.status_presenca, l.respondido_por::text)
      then l.status_presenca
    else null
  end as presenca_afirmada,
  public.fn_presenca_fecha_chamada(l.status_presenca, l.respondido_por::text) as chamada_fechada,
  'presenca-slot-canonica-v1'::text as regra_versao,
  -- conflito de QUALQUER linha do slot sobe para a linha eleita: colapsar a duplicata
  -- não pode engolir o sinal de que algo está errado naquele horário.
  coalesce(l.conflito_em_alguma_linha, false) as possui_conflito
from linhas l
where l.posicao_no_slot = 1;

revoke all on public.vw_presenca_slot_canonica_v1
  from public, anon, authenticated, fabio_agent, sol_acesso_restrito,
       mila_acesso_restrito, lia_acesso_restrito;
grant select on public.vw_presenca_slot_canonica_v1 to service_role;;
