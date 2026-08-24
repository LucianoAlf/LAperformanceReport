-- FONTE ÚNICA de presença por slot real. Uma linha por (aluno, aula que de fato aconteceu).
--
-- O Emusys emite CADA aula duas vezes — um registro tipo='turma' e outro tipo='individual',
-- mesma data, mesma hora, mesmo professor, ids diferentes. Medido em 01-23/08/2026:
-- 91% da grade de CG, 88% do Recreio, 85% da Barra. `aluno_presenca` guarda uma linha por
-- registro de aula, então UMA aula real vira DUAS linhas de presença por aluno.
--
-- Cada consumidor resolvia isso do seu jeito, ou não resolvia — e por isso as leituras
-- discordavam entre si. Esta view existe para acabar com isso: quem quiser saber
-- "esse aluno esteve nessa aula?" pergunta AQUI.
--
-- A identidade do slot é a MESMA de `fn_aula_operacional_id` (unidade + professor +
-- início + fim + curso), para as duas respostas nunca divergirem.
--
-- DESEMPATE — a decisão mais forte vence, nesta ordem:
--   1. fecha chamada (decisão afirmada, humana ou 'presente' do Emusys)
--   2. origem forte (humano antes de Emusys)
--   3. mais recente entre humanos
--   4. 'turma' antes de 'individual', depois id — só para ser determinístico
-- Assim a linha órfã NUNCA vence de uma linha marcada: some o "sem rumo".
--
-- ⚠️ `tem_divergencia` NÃO é escondido: duas decisões humanas que discordam continuam
-- visíveis. Dedup é para colapsar a duplicata técnica do Emusys, não para calar conflito
-- real — quem some com conflito perde a chance de corrigir. Como window não aceita
-- count(distinct), a divergência é medida por min<>max do resultado entre as linhas fortes.
--
-- ⚠️ NÃO deduplica MATRÍCULA. `alunos` é matrícula, não pessoa: o Miguel Gomes Biancamano
-- (CG) tem duas linhas de Contrabaixo (320 e 1064) e as duas aparecem aqui. Isso é
-- duplicata de cadastro, problema diferente, e fundir em silêncio esconderia o defeito.
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
  l.aluno_presenca_id,
  l.aluno_id,
  l.professor_id,
  l.unidade_id,
  l.aula_emusys_id,
  l.aula_emusys_evento_id,
  l.data_aula,
  l.data_hora_inicio,
  l.data_hora_fim,
  l.horario_aula,
  l.curso_nome,
  l.turma_nome,
  l.aula_categoria,
  l.aula_tipo,
  l.estado_origem,
  l.status_presenca,
  l.respondido_por,
  l.respondido_em,
  l.proveniencia,
  l.situacao_chamada,
  l.resultado_pedagogico,
  l.confianca,
  l.considera_frequencia_denominador,
  l.considera_presenca,
  l.considera_falta,
  l.exclui_por_evento,
  l.estado_emusys_bruto,
  l.professor_presenca_emusys,
  l.evidencia_registrada_em,
  l.fundamento_confianca,
  l.revisao_operacional_exigida,
  l.revisao_operacional_status,
  l.qtd_linhas_no_slot,
  l.qtd_linhas_no_slot > 1 as slot_geminado_no_emusys,
  (l.resultado_forte_min is distinct from l.resultado_forte_max) as tem_divergencia,
  -- a resposta que a tela deve mostrar: só decisão AFIRMADA vira presença/falta.
  -- O 'ausente' cru do Emusys é DEFAULT de sistema, não falta declarada — foi ele que
  -- pintou "Faltou" na tela do professor para aluno presente (caso Valdo/CG 21/08).
  case
    when public.fn_presenca_fecha_chamada(l.status_presenca, l.respondido_por::text)
      then l.status_presenca
    else null
  end as presenca_afirmada,
  public.fn_presenca_fecha_chamada(l.status_presenca, l.respondido_por::text) as chamada_fechada,
  'presenca-slot-canonica-v1'::text as regra_versao
from linhas l
where l.posicao_no_slot = 1;

revoke all on public.vw_presenca_slot_canonica_v1 from public, anon, authenticated;
grant select on public.vw_presenca_slot_canonica_v1 to authenticated, service_role;

comment on view public.vw_presenca_slot_canonica_v1 is
  'FONTE ÚNICA de presença por slot real: uma linha por (aluno, aula que aconteceu). Colapsa a duplicata turma/individual que o Emusys emite (85-91% da grade) e resolve pela decisão mais forte, então linha órfã nunca aparece como "sem rumo". presenca_afirmada carrega SÓ decisão declarada — o "ausente" cru do Emusys é default de sistema e vira NULL. Criada em 24/08/2026 depois que a Sol dizia "tudo fechado" e o LA Teacher dizia "Faltou" para a mesma aula.';;
