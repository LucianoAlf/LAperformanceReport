-- Terceiro cron do sync de faturas: competencia SEGUINTE.
--
-- Por que: a tela "Alunos com aula mas sem fatura por mes" do Emusys tem tres abas
-- (mes anterior, atual e SEGUINTE), e a aba do proximo mes e a mais util -- e a que
-- deixa a ADM emitir a fatura ANTES de o aluno ter a aula. Sem esta competencia no
-- espelho, a lista do mes seguinte marcaria TODO MUNDO como "sem fatura", que e falso.
--
-- Nao foi preciso tocar na edge: `sync-faturas-emusys` ja recebe `competencia` no body
-- e nao tem nada hardcoded -- os dois crons existentes so diferem no `interval`.
--
-- Backfill de setembro rodado a mao em 15/08/2026 13:48 BRT pelo mesmo caminho
-- (net.http_post com os secrets do vault): 964 faturas inseridas, 3 unidades
-- `complete: true`, snapshot_complete, 23s. CG 384 / Recreio 336 / Barra 244.
--
-- ⚠️ HORARIO ESCOLHIDO PARA FUGIR DO 429, NAO POR ACASO. Em 15/08/2026, ao criar este
-- job, foi medido em `sync_runs` que o cron `cron_competencia_anterior` **falhou nas 7
-- execucoes desde 09/08** com `HTTP 429 apos 5 tentativas`, e o `cron_competencia_atual`
-- em 3 de 7. O `pg_cron` marca `succeeded` nos dois casos, porque so avalia se o
-- `net.http_post` foi enfileirado -- a falha so aparece em `sync_runs`.
--   02:00 / 02:20 / 02:40 UTC -> sync-matriculas cg / recreio / barra
--   03:00 UTC                 -> sync-faturas-competencia-anterior  (falha sempre)
-- Este job ficou as **04:30 UTC** (01:30 BRT), longe da janela disputada. A primeira
-- versao estava as 03:30 e foi movida antes de rodar uma vez sequer.
--
-- ⚠️ O 429 do `competencia_anterior` e problema ABERTO e independente deste job: julho
-- deixou de ser sincronizado em 10/08. E o mesmo sintoma registrado em
-- daily-notes/2026-08-15.md para o sync de matriculas (invocacoes paralelas de origem
-- desconhecida). Nao corrigido aqui de proposito -- merece frente propria.
--
-- CONFERIR SEMPRE POR `sync_runs`, nunca pelo pg_cron.

select cron.schedule(
  'sync-faturas-competencia-seguinte',
  '30 4 * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Anon key do vault: o gitleaks barra JWT commitado no repo.
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key'
      ),
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token'
      )
    ),
    body := jsonb_build_object(
      'competencia', to_char(date_trunc('month', (now() at time zone 'America/Sao_Paulo')) + interval '1 month', 'YYYY-MM-01'),
      'trigger_source', 'cron_competencia_seguinte'
    ),
    timeout_milliseconds := 240000
  );
  $cron$
);
