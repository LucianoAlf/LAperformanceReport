-- CP1 (parte 3) — Tira os crons de disciplinas da janela de colisao com o sync de presenca.
--
-- SINTOMA
-- De 07/08 a 09/08/2026 o sync de disciplinas de Barra e Campo Grande falhou todo dia com
-- EMUSYS_HTTP_429 (rate limit da API do Emusys, 60 req/min). Campo Grande morria com 14-16
-- das 37 disciplinas processadas. Como reconciliar_professor_curso_modalidade_v2 exige
-- execucao 'completa', a materializacao nem chegava a ser chamada — a unidade ficou
-- congelada com ZERO atribuicoes ativas.
--
-- CAUSA
-- Os tres jobs sync-metadados-aulas-15m (jobid 63/64/65) chamam sync-presenca-emusys com
-- `dias_futuros: 35` a cada 15 minutos, defasados em 5: u0 em 0,15,30,45 / u1 em 5,20,35,50 /
-- u2 em 10,25,40,55. Juntos ocupam TODO minuto multiplo de 5. E os tres crons de disciplinas
-- estavam agendados exatamente em :15, :35 e :55 — ou seja, sempre em cima de um deles.
--
-- EVIDENCIA (experimento natural, 09/08/2026)
-- Campo Grande as 09:55 UTC: falhou com 429 em 07, 08 e 09/08, tres dias seguidos.
-- Campo Grande as 15:16 UTC (mesmo dia, mesmo catalogo, disparo manual fora do minuto
-- multiplo de 5): completou 37/37 sem um unico 429, e a materializacao criou as 108
-- atribuicoes que estavam faltando desde 29/07.
--
-- CORRECAO
-- Move para :07, :27 e :47 — minutos que nenhum job de 5 em 5 ocupa, mantendo os 20 minutos
-- de distancia entre as unidades. Sao ~2,5 minutos de folga de cada lado, o maximo possivel
-- com um job rodando a cada 5 minutos.
--
-- LIMITE CONHECIDO
-- Isto reduz a colisao, nao elimina o risco: qualquer outro consumidor da API do Emusys no
-- mesmo instante pode reabrir o 429. A blindagem definitiva e retry com backoff dentro da
-- edge sync-professor-disciplinas-emusys, que continua pendente.
--
-- ROLLBACK
--   select cron.alter_job(76, schedule => '15 9 * * *');
--   select cron.alter_job(77, schedule => '35 9 * * *');
--   select cron.alter_job(78, schedule => '55 9 * * *');

select cron.alter_job(76, schedule => '7 9 * * *');   -- Barra        06:07 BRT
select cron.alter_job(77, schedule => '27 9 * * *');  -- Recreio      06:27 BRT
select cron.alter_job(78, schedule => '47 9 * * *');  -- Campo Grande 06:47 BRT
