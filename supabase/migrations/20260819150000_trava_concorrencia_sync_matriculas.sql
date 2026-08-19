-- Trava de concorrência do sync de matrículas (2026-08-19)
--
-- POR QUE: cada disparo do cron chega à edge como 2-4 execuções. Medido em
-- 2026-08-19: `cron.job_run_details` registra 1 execução por minuto para os jobs
-- de 1 min (20 em 20 min), `net._http_response` registra 1 resposta por cron
-- (4 crons/min -> 4 respostas/min, e teste isolado deu 1 request -> 1 resposta),
-- mas `emusys_matriculas_sync_execucoes` tem 3 linhas por janela de cron, com
-- ids e horários distintos — ou seja, 3 execuções REAIS. A multiplicação ocorre
-- entre o pg_net e a execução da função, fora do nosso alcance.
--
-- CONSEQUÊNCIA MEDIDA: as 3 execuções varrem `GET /matriculas` da MESMA unidade
-- ao mesmo tempo. Campo Grande (primeiro do rodízio, maior volume) falhou nas 3
-- tentativas de 2026-08-19 com "API 429 (ativa) apos 5 tentativas" e não
-- sincronizou. Barra e Recreio, menores, passaram.
--
-- POR QUE ÍNDICE E NÃO "SELECT antes do INSERT": as 3 execuções chegam em ~0,6s
-- (medido: 02:00:02.684 / 02:00:02.811 / 02:00:03.303). As 3 fariam o SELECT
-- antes de qualquer INSERT, as 3 veriam "nada rodando" e as 3 entrariam — o
-- clássico check-then-act. O índice único faz o Postgres decidir no momento da
-- gravação: verificar e agir viram um passo só, sem janela de corrida.
--
-- POR QUE NÃO ADVISORY LOCK: `pg_advisory_lock` é preso à sessão, e via
-- PostgREST a conexão volta para o pool com o lock pendurado. A variante `xact`
-- dura só a transação (milissegundos), enquanto a edge roda por ~30s.
--
-- PRECEDENTE NO PROJETO: `processarFilaAgente` em `processar-mensagens-agendadas`
-- já usa o mesmo princípio (`UPDATE ... WHERE processando = false ... RETURNING`),
-- com o comentário "Buscar E travar (atômico) — evita que dois ciclos concorrentes
-- do cron peguem a mesma mensagem duas vezes". Esta migration leva a mesma
-- proteção ao sync, que é a única edge que junta ausência de trava com varredura
-- de API externa com rate limit.
--
-- ESCOPO: a trava é POR UNIDADE. Campo Grande nunca bloqueia Barra ou Recreio —
-- e os 3 crons já rodam em horários separados (02:00 / 02:20 / 02:40 UTC).

-- 1) Higiene: nenhuma execução deve estar presa em 'running' na criação do
--    índice. Se estiver (execução morta de antes desta migration), encerra como
--    'failed' para não bloquear o índice nem o primeiro run.
update emusys_matriculas_sync_execucoes
   set status = 'failed',
       completed_at = coalesce(completed_at, now()),
       erro = coalesce(erro, 'encerrada na criacao da trava de concorrencia (20260819150000)')
 where status = 'running';

-- 2) A trava: no máximo uma execução viva por unidade.
create unique index if not exists uq_sync_matriculas_execucao_viva_por_unidade
    on emusys_matriculas_sync_execucoes (unidade_id)
 where status = 'running';

comment on index uq_sync_matriculas_execucao_viva_por_unidade is
  'Trava de concorrencia do sync de matriculas: 1 execucao viva por unidade. '
  'O INSERT da edge vira a tomada de vez — a 2a/3a invocacao (multiplicadas fora '
  'do nosso controle, ver cabecalho da migration 20260819150000) recebem 23505 e '
  'saem sem chamar a API do Emusys. A edge libera marcando succeeded/failed.';

-- 3) Guarda contra execução travada: sem isto, uma linha presa em 'running'
--    (crash, timeout do runtime, deploy no meio do run) bloquearia a unidade
--    para sempre — o índice não sabe de tempo. A edge chama esta função ANTES
--    de tentar o INSERT.
--
--    10 min é folgado de propósito: o run mais lento medido leva ~70s (CG, escopo
--    completo) e o idle timeout da edge é 150s. Nada saudável chega perto disso.
create or replace function liberar_sync_matriculas_travado(
  p_unidade_id uuid,
  p_limite interval default interval '10 minutes'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liberadas integer;
begin
  update emusys_matriculas_sync_execucoes
     set status = 'failed',
         completed_at = now(),
         erro = coalesce(erro, format('execucao presa em running ha mais de %s — liberada automaticamente', p_limite))
   where unidade_id = p_unidade_id
     and status = 'running'
     and started_at < now() - p_limite;

  get diagnostics v_liberadas = row_count;
  return v_liberadas;
end;
$$;

-- ACL: recriar função reabre EXECUTE para `anon` por causa do
-- ALTER DEFAULT PRIVILEGES do schema public (regra do CLAUDE.md — já mordeu
-- get_agenda_dia, get_kpis_alunos_canonicos_base_v131 e
-- aplicar_retificacao_relatorio_gerencial_retencao_v1). Revogar nominalmente.
revoke all on function liberar_sync_matriculas_travado(uuid, interval) from public, anon;
grant execute on function liberar_sync_matriculas_travado(uuid, interval) to service_role;

comment on function liberar_sync_matriculas_travado(uuid, interval) is
  'Libera execucao de sync presa em running ha mais de p_limite (default 10 min). '
  'Chamada pela edge sync-matriculas-emusys antes de tomar a vez. Devolve quantas liberou.';
