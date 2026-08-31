-- =====================================================================
-- LA-OS: os jobs do pg_cron entram no inventario de crons (28/08/2026)
--
-- PROBLEMA
-- O painel enumerava 2 fontes (crontab do SO e cron nativo do Hermes) e
-- ignorava a MAIOR: 73 jobs em `cron.job` deste mesmo banco -- sync de
-- matricula, presenca, faturas, alertas, watchdogs. "Todo cron novo entra no
-- catalogo" era promessa vazia para metade da casa.
--
-- Achado na 1a coleta: `sincronizar-grade-horaria` falhava desde 20/08 (9
-- execucoes seguidas, `duplicate key` em idx_alunos_duplicata_matricula_unique)
-- sem nunca ter avisado ninguem.
--
-- POR QUE NAO HA COLETOR NOVO
-- A fonte esta DENTRO do banco. Um coletor na VPS precisaria de credencial
-- para ler `cron.job` -- mais superficie por nada. Aqui o proprio pg_cron
-- chama a coleta, e o job de coleta se publica junto com os outros.
--
-- ⚠️ O COMANDO CARREGA SEGREDO. 48 dos 73 jobs tem `Bearer <service_role>` ou
-- `apikey` embutido no `net.http_post`. Copiar `command` cru publicaria a
-- chave do banco num painel que esta na internet.
--
-- DEPENDE DE fiscal-mila/migrations/015_la_os_crons.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Elisao de segredo.
--    Blocklist por regex E verificacao final. A regex pode nao cobrir um
--    formato novo de chave, entao quem decide publicar e o teste no fim:
--    FAIL-CLOSED. Perder a legibilidade de um cron e aceitavel; vazar a
--    service_role nao.
-- ---------------------------------------------------------------------
create or replace function monitoramento.elidir_sql(p_cmd text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v text;
begin
  v := btrim(regexp_replace(coalesce(p_cmd, ''), '\s+', ' ', 'g'));

  v := regexp_replace(v, 'eyJ[A-Za-z0-9._-]{10,}', '…', 'gi');
  v := regexp_replace(v, 'sb_(secret|publishable)_[A-Za-z0-9._-]+', '…', 'gi');
  v := regexp_replace(v, '(bearer)[[:space:]]+[^"''[:space:]}]+', '\1 …', 'gi');
  v := regexp_replace(v,
        '("?(apikey|authorization|token|secret|service_role|key|senha|password)"?[[:space:]]*(:=|[:=])[[:space:]]*"?)[^",''[:space:]}]+',
        '\1…', 'gi');
  v := regexp_replace(v, '((token|apikey|key)=)[^&''"[:space:]]+', '\1…', 'gi');

  if v ~* '(eyJ[A-Za-z0-9._-]{10,}|sb_secret_|sb_publishable_|bearer[[:space:]]+[A-Za-z0-9])' then
    return '(comando omitido: a elisao nao garantiu ausencia de segredo)';
  end if;

  return left(v, 400);
end
$$;

comment on function monitoramento.elidir_sql(text) is
  'Redige segredo em comando de pg_cron antes de publicar na tela. Fail-closed: na duvida omite o comando inteiro.';

-- ---------------------------------------------------------------------
-- 2. Coleta.
--    ⚠️ NAO usar `left join lateral (... limit 1)` por job:
--    `cron.job_run_details` so tem indice na PK (runid), e nao ha permissao
--    para criar outro (a tabela e da extensao -- `must be owner`). Cada job
--    disparava um seq scan nas 238 mil linhas; 73 varreduras estouravam o
--    statement timeout na 2a coleta. Uma passada so: ~1,1s, custo fixo.
-- ---------------------------------------------------------------------
create or replace function monitoramento.coletar_pg_cron()
returns int
language plpgsql
security definer
set search_path = monitoramento, pg_catalog
as $$
declare
  v_usuario text;
  v_crons   jsonb;
  v_total   int := 0;
  v_n       int;
begin
  create temp table if not exists _ultimo_run on commit drop as
  select distinct on (jobid) jobid, status, start_time, return_message
    from cron.job_run_details
   order by jobid, start_time desc;

  for v_usuario in select distinct j.username from cron.job j loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'fonte',           'pg_cron',
             -- jobname, nao jobid: o id muda ao recriar o job, o nome nao --
             -- e e o nome que casa com o catalogo escrito a mao.
             'identificador',   j.jobname,
             'schedule',        j.schedule,
             'comando',         monitoramento.elidir_sql(j.command),
             'habilitado',      j.active,
             'ultima_execucao', r.start_time,
             'ultimo_status',   case r.status
                                  when 'succeeded' then 'ok'
                                  when 'failed'    then 'error'
                                  else r.status
                                end,
             'ultimo_erro',     case when r.status is distinct from 'succeeded'
                                     then left(r.return_message, 300) end
           )), '[]'::jsonb)
      into v_crons
      from cron.job j
      left join _ultimo_run r on r.jobid = j.jobid
     where j.username = v_usuario;

    -- delete+insert por (host, usuario_so): job apagado tem que sumir da
    -- tela, nao virar fantasma.
    v_n := monitoramento.registrar_crons('supabase-lareport', v_usuario, v_crons);
    v_total := v_total + v_n;
  end loop;

  return v_total;
end
$$;

comment on function monitoramento.coletar_pg_cron() is
  'Publica os jobs de cron.job no inventario do LA-OS (fonte pg_cron). Chamada pelo proprio pg_cron a cada 15 min.';

revoke all on function monitoramento.elidir_sql(text) from public, anon, authenticated;
revoke all on function monitoramento.coletar_pg_cron() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Agendamento. O job de coleta aparece no inventario que ele mesmo
--    publica -- se ele parar, o `coletado_em` das 74 linhas congela.
-- ---------------------------------------------------------------------
select cron.schedule('la-os-coletar-pg-cron', '*/15 * * * *',
                     'select monitoramento.coletar_pg_cron()');
