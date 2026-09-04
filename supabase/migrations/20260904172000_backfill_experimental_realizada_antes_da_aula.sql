-- Backfill do estrago do guard que faltava: linhas marcadas
-- 'experimental_realizada' cuja AULA ainda nao aconteceu. A escrita ja foi
-- corrigida na edge sync-presenca-emusys (guard `ainda_nao_ocorreu`); aqui so o
-- dado que ficou para tras. Foram 7 linhas — 4 do Recreio de hoje, que a Daiana
-- viu na mensagem da Mila e reclamou.
--
-- Volta para 'experimental_agendada', que e a verdade: a aula esta marcada e
-- ainda vai acontecer. NAO mexe em aula passada — ali "realizada" pode ser
-- verdade e nao da para saber sem presenca lancada.
with alvo as (
  select le.id, le.nome_aluno, le.unidade_id, le.data_experimental, a.data_hora_inicio
  from lead_experimentais le
  join aulas_emusys a on a.emusys_id = le.emusys_aula_id
  where le.status = 'experimental_realizada' and a.data_hora_inicio > now()
),
upd as (
  update lead_experimentais le
     set status = 'experimental_agendada', etapa_pipeline_id = 6, updated_at = now()
    from alvo where le.id = alvo.id
  returning le.id, alvo.nome_aluno, alvo.data_hora_inicio, alvo.unidade_id
)
insert into automacao_log (evento, acao, status, aluno_nome, unidade_nome, detalhes)
select 'experimental_corrigida', 'realizada_antes_da_aula', 'ok', u.nome_aluno,
       (select nome from unidades un where un.id = u.unidade_id),
       jsonb_build_object('lead_experimental_id', u.id, 'de', 'experimental_realizada',
                          'para', 'experimental_agendada', 'aula_em', u.data_hora_inicio,
                          'motivo', 'sync marcava realizada so por a aula existir na grade; corrigido em 04/09/2026')
from upd u;
