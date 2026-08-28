-- Remove alinhamentos deterministas entre escritores da mesma unidade.
-- A serializacao por unidade e o retry continuam sendo a garantia de seguranca;
-- a folga de cron evita perder ciclos por deduplicacao em operacao normal.

begin;

do $do$
declare
  v_encontrados integer;
  v_job record;
begin
  select count(*) into v_encontrados
    from cron.job j
   where j.jobname in (
     'sync-grade-futura-cg',
     'sync-grade-futura-cg-sabado',
     'sync-agenda-professor-emusys-u1',
     'sync-presenca-dia-recreio',
     'sync-presenca-catchup-manha',
     'sync-presenca-backlog'
   );

  if v_encontrados <> 6 then
    raise exception 'jobs de presenca ausentes: esperados 6, encontrados %', v_encontrados;
  end if;

  for v_job in
    select j.jobid, configuracao.schedule
      from (values
        ('sync-grade-futura-cg', '3 0 * * 2-6'),
        ('sync-grade-futura-cg-sabado', '3 18 * * 6'),
        ('sync-agenda-professor-emusys-u1', '23 9 * * *'),
        ('sync-presenca-dia-recreio', '43 3 * * 0,2-6'),
        ('sync-presenca-catchup-manha', '33 10 * * *'),
        ('sync-presenca-backlog', '12 6 * * *')
      ) as configuracao(jobname, schedule)
      join cron.job j using (jobname)
  loop
    perform cron.alter_job(
      job_id := v_job.jobid,
      schedule := v_job.schedule
    );
  end loop;
end;
$do$;

commit;
