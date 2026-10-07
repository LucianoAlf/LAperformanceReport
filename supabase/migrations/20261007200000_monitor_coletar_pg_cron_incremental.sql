-- Monitor do banco (LA-OS): `coletar_pg_cron` passa a ler so as execucoes NOVAS do pg_cron (CP7).
--
-- MEDIDO (07/10/2026, pg_stat_statements desde 28/09): a cada 15 min ela ordenava o historico
-- INTEIRO de `cron.job_run_details` (~100 mil linhas, 84 MB) com `distinct on (jobid) ... order by
-- jobid, start_time desc` so para achar a ultima execucao de cada job: 853 chamadas, 2,2 s de media,
-- 22 s de pico, 7,1 milhoes de blocos lidos do disco e 491 mil blocos de transbordo (temp). O vigia
-- do banco era um dos maiores leitores de disco do banco.
--
-- AGORA: guarda ate qual `runid` ja leu (`monitoramento.cron_coleta_cursor`) e rele so a faixa nova
-- pela chave primaria, com margem de 3.000 execucoes (~5 h) para pegar o status FINAL de quem
-- estava rodando na leitura anterior (a linha nasce 'running' e e atualizada no fim). Job sem
-- execucao nova mantem o estado ja coletado (`cron_estado`).
--
-- PROVA (07/10, 149 jobs, comparacao antiga x nova sem gravar): 147 identicos; os 2 restantes sao
-- jobs cuja ultima execucao ja saiu da retencao de 7 dias do pg_cron -- a antiga mostrava "sem
-- execucao", a nova lembra a ultima conhecida (mais correto). Nenhuma divergencia de status.
--
-- Custo/dia: REDUZ (de ~200 s e ~8 GB de leitura/dia para uma leitura por faixa de chave).
-- A primeira execucao, sem cursor, le tudo uma vez (igual a de hoje).

create table if not exists monitoramento.cron_coleta_cursor (
  fonte         text primary key,
  ultimo_runid  bigint not null,
  atualizado_em timestamptz not null default now()
);
revoke all on table monitoramento.cron_coleta_cursor from public, anon, authenticated;

create or replace function monitoramento.coletar_pg_cron()
 returns integer
 language plpgsql
 security definer
 set search_path to 'monitoramento', 'pg_catalog'
as $function$
declare
  v_usuario text;
  v_crons   jsonb;
  v_total   int := 0;
  v_n       int;
  v_cursor  bigint;
  v_max     bigint;
begin
  select c.ultimo_runid into v_cursor
    from monitoramento.cron_coleta_cursor c
   where c.fonte = 'pg_cron';
  select max(d.runid) into v_max from cron.job_run_details d;

  -- So a faixa nova (pela chave primaria) + margem para status que mudou depois.
  create temp table if not exists _ultimo_run on commit drop as
  select distinct on (jobid) jobid, status, start_time, return_message
    from cron.job_run_details
   where runid > coalesce(v_cursor - 3000, 0)
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
             -- Sem execucao na faixa nova: vale o que ja foi coletado.
             'ultima_execucao', coalesce(r.start_time, e.ultima_execucao),
             'ultimo_status',   case
                                  when r.jobid is null then e.ultimo_status
                                  when r.status = 'succeeded' then 'ok'
                                  when r.status = 'failed'    then 'error'
                                  else r.status
                                end,
             'ultimo_erro',     case
                                  when r.jobid is null then e.ultimo_erro
                                  when r.status is distinct from 'succeeded'
                                    then left(r.return_message, 300)
                                end
           )), '[]'::jsonb)
      into v_crons
      from cron.job j
      left join _ultimo_run r on r.jobid = j.jobid
      left join monitoramento.cron_estado e
             on e.host = 'supabase-lareport'
            and e.usuario_so = v_usuario
            and e.fonte = 'pg_cron'
            and e.identificador = j.jobname
     where j.username = v_usuario;

    v_n := monitoramento.registrar_crons('supabase-lareport', v_usuario, v_crons);
    v_total := v_total + v_n;
  end loop;

  if v_max is not null then
    insert into monitoramento.cron_coleta_cursor (fonte, ultimo_runid, atualizado_em)
    values ('pg_cron', v_max, now())
    on conflict (fonte) do update
      set ultimo_runid = excluded.ultimo_runid, atualizado_em = excluded.atualizado_em;
  end if;

  return v_total;
end
$function$;
