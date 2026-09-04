-- 🧹 LIMPEZA DO RUIDO — decisao do Luciano, 04/09:
--   "ate tres vezes de tentativa de marcar o experimental. Faltou, tem que parar
--    de cobrar o consultor comercial, senao cansa o consultor E o interessado."
--   "limpar tudo que e lixo, tudo que e coisa antiga, tudo que vai irritar."
--
-- Duas regras, aplicadas ao backlog E ao detector (senao renasce amanha):
--
-- (1) TETO DE 3 TENTATIVAS de agendamento de experimental.
-- (2) NADA COM MAIS DE 30 DIAS na pauta do consultor.
--
-- Efeito medido: 178 + 66 sinais expirados. Fila por unidade caiu para
-- Barra 14 / CG 48 / Recreio 32 (era 16 / 115 / 45, e antes disso 163 em CG).
--
-- ⚠️ `expirado` + `nao_aplicavel`, NAO `improcedente`: eles nao eram falsos,
--    envelheceram. A distincao preserva a medicao de falso positivo.
-- ⚠️ Nada e deletado. Quem sai daqui e publico de REATIVACAO
--    (`radar_publico_reativacao_v1`), outro movimento e outro dono.
-- ⚠️ O R16 usa a chave `dias_desde_a_data` na evidencia, nao `dias_parado` — a
--    1a passada de limpeza nao o alcancou e 94 sinais de CG (ate 115 dias)
--    ficaram para tras. Ao limpar por idade, cobrir TODAS as chaves de idade.

update public.radar_sinais s
   set status = 'expirado', desfecho = 'nao_aplicavel', desfecho_em = now(),
       desfecho_nota = 'Teto de 3 tentativas de agendamento atingido (decisao do Luciano, 04/09).',
       atualizado_em = now()
  from public.vw_jornada_lead_v1 j
 where j.lead_id = s.entidade_id
   and s.status in ('aberto','triado')
   and s.regra_codigo in ('R15','R16','R17')
   and coalesce(j.aulas_experimentais, 0) >= 3;

update public.radar_sinais s
   set status = 'expirado', desfecho = 'nao_aplicavel', desfecho_em = now(),
       desfecho_nota = 'Parado ha mais de 30 dias: fora da janela em que agir ainda faz sentido.',
       atualizado_em = now()
 where s.status in ('aberto','triado') and s.dominio = 'comercial'
   and greatest(
         coalesce((s.evidencia->>'dias_parado')::int, 0),
         coalesce((s.evidencia->>'dias_desde_a_data')::int, 0),
         coalesce((s.evidencia->>'horas_sem_resposta')::int / 24, 0)
       ) > 30;

-- As mesmas duas regras no DETECTOR (R15/R16/R17), aplicadas por `replace` com
-- guarda sobre o corpo vivo. Ver as migrations aplicadas em 04/09:
--   detector_comercial_teto_e_janela
--   detector_r16_janela_util
