-- SITUACAO REAL da experimental — resolvida pela AULA, nao pelo status gravado.
--
-- Relato da Daiana (04/09): "ela pegou 11 experimentais e nao sao 11; as de 10 e
-- 11 eu reagendei ontem e ela puxou como se fosse hoje". Confirmado no banco:
--   · Sophie — linha diz 04/09 11:00 'realizada'; a aula 848071 esta em 09/09
--   · Bento  — linha diz 04/09 10:00 'realizada'; a aula 847732 esta em 10/09
-- e as de 18h/19h/20h ja estavam 'realizada' as 16h, antes de acontecerem, SEM
-- nenhuma linha em aluno_presenca (prova de que nao veio de presenca lancada).
--
-- Causa: a reconciliacao em `sync-presenca-emusys` marcava
-- `experimental_realizada` so porque a aula EXISTE na grade e nao esta
-- cancelada. Os crons `sync-presenca-dia-*` rodam 00:43 BRT, entao o dia inteiro
-- nascia "realizado". Corrigido na edge no mesmo dia (guard `ainda_nao_ocorreu`).
--
-- Esta view NAO reescreve status: deriva `situacao` para quem precisa da verdade
-- do dia — e continua util depois do fix, porque cobre o reagendamento (a linha
-- fica com a data velha ate alguem mover).
create or replace view public.vw_experimental_situacao_v1
with (security_invoker = false) as
select
  le.id, le.lead_id, le.unidade_id, le.nome_aluno, le.curso_interesse_id,
  le.professor_experimental_id, le.aluno_id, le.emusys_aula_id,
  le.data_experimental, le.horario_experimental, le.status status_gravado,
  a.data_hora_inicio aula_em,
  (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date aula_data,
  a.cancelada aula_cancelada,
  coalesce((a.data_hora_inicio at time zone 'America/Sao_Paulo')::date, le.data_experimental) data_efetiva,
  case
    when a.cancelada then 'cancelada'
    when a.data_hora_inicio is not null
     and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date <> le.data_experimental then 'reagendada'
    when a.data_hora_inicio is not null and a.data_hora_inicio > now() then 'agendada'
    when le.status = 'experimental_realizada' then 'realizada'
    when le.status = 'experimental_faltou' then 'faltou'
    when le.status = 'cancelada' then 'cancelada'
    when le.status = 'experimental_agendada' then 'agendada'
    else le.status
  end situacao,
  case when a.data_hora_inicio is not null
        and (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date <> le.data_experimental
       then (a.data_hora_inicio at time zone 'America/Sao_Paulo')::date end reagendada_para,
  (a.data_hora_inicio is not null and a.data_hora_inicio <= now()) aula_ja_ocorreu
from public.lead_experimentais le
left join public.aulas_emusys a on a.emusys_id = le.emusys_aula_id;

comment on view public.vw_experimental_situacao_v1 is
'Situacao REAL da experimental resolvida pela aula (aulas_emusys), nao pelo status gravado: pega reagendamento (linha fica com a data velha) e aula que ainda nao ocorreu. Use para dizer "o que tem hoje". Criada em 04/09/2026 a partir do relato da Daiana.';

revoke all on public.vw_experimental_situacao_v1 from public, anon, authenticated;
grant select on public.vw_experimental_situacao_v1 to service_role, mila_acesso_restrito;
