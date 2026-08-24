-- Convergência das gêmeas deixa de depender de EVENTO e passa a ter passada periódica.
--
-- O defeito de origem não era o espelhamento — era ele ser event-driven. `trg_sincronizar_gemeos_presenca`
-- só dispara quando alguém grava decisão FORTE. Quando a equipe marca primeiro e o sync
-- cria a linha gêmea depois (com `respondido_por='emusys'`, que não é forte), nada
-- reexecuta o espelho: a órfã fica lá para sempre. Provado em 24/08 — chamar a função à
-- mão sincronizava na hora linhas paradas desde 18/08.
--
-- Custo medido: 408 ms / 167k buffers para a base inteira, e é idempotente (7 páginas
-- sujas na segunda passada). Diário é suficiente porque a LEITURA já está correta desde
-- a `vw_presenca_slot_canonica_v1` — isto aqui é para os ~50 consumidores que ainda leem
-- `aluno_presenca` crua, que passam a ver a tabela convergida sem precisar ser reescritos.
--
-- ⚠️ Chamada SQL direta, sem edge e sem `net.http_post`: o projeto tem histórico de cron
-- que o `pg_cron` marca `succeeded` enquanto o gateway devolve 401 (sync-inadimplencia,
-- 13 dias invisíveis). Função no banco não tem gateway, não tem token e não tem
-- `verify_jwt` para alguém resetar num deploy.
--
-- ⚠️ 03:40 UTC = 00:40 BRT: depois do último movimento do dia e fora das janelas de
-- 02:00/02:20/02:40 (sync-matriculas), 03:00 e 04:30 (faturas) — o Emusys já derrubou
-- unidade por concorrência de varredura.
select cron.schedule(
  'reconciliar-gemeas-presenca-diario',
  '40 3 * * *',
  $cron$select public.fn_sincronizar_gemeos_presenca(null);$cron$
);;
