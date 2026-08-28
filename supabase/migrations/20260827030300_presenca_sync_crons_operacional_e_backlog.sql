begin;

-- O relatorio so pode publicar o dia quando todas as unidades que tiveram aula
-- possuem uma execucao de presenca concluida e identificada por snapshot.
create or replace function public.fn_enfileirar_relatorio_presenca_se_coberto_v1(
  p_data date default (current_date - 1)
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_incompletas jsonb;
begin
  if p_data is null or p_data > current_date then
    raise exception using errcode = '22023', message = 'data de relatorio invalida';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'unidade_id', u.id,
             'unidade', u.nome,
             'status', coalesce(c.status, 'sem_cobertura')
           ) order by u.nome
         )
    into v_incompletas
    from public.unidades u
    left join public.presenca_sync_cobertura c
      on c.unidade_id = u.id
     and c.modo = 'presenca'
     and c.data_alvo = p_data
   where exists (
     select 1
       from public.aulas_emusys ae
      where ae.unidade_id = u.id
        and ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and not coalesce(ae.cancelada, false)
   )
     and not (
       c.status = 'concluida'
       and c.snapshot_hash is not null
       and c.finalizada_em is not null
     );

  if v_incompletas is not null then
    return jsonb_build_object(
      'ok', false,
      'bloqueado', 'cobertura_presenca_incompleta',
      'data', p_data,
      'unidades', v_incompletas
    );
  end if;

  return public.fn_enfileirar_relatorio_presenca(p_data, false);
end;
$$;

revoke all on function public.fn_enfileirar_relatorio_presenca_se_coberto_v1(date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_enfileirar_relatorio_presenca_se_coberto_v1(date)
  to service_role;

-- Aposenta as janelas sobrepostas e torna a migration reaplicavel em ambientes
-- que possam ter recebido parte do agendamento por operacao manual.
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
      from cron.job
     where jobname in (
       'sync-presenca-cg',
       'sync-presenca-cg-sabado',
       'sync-presenca-barra',
       'sync-presenca-barra-sabado',
       'sync-presenca-recreio',
       'sync-presenca-recreio-sabado',
       'sync-presenca-dia-barra',
       'sync-presenca-dia-campo-grande',
       'sync-presenca-dia-recreio',
       'sync-presenca-catchup-manha',
       'sync-presenca-backlog',
       'relatorio-presenca-pendencias-9h'
     )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

-- Seg-Sab, depois da ultima aula local (a grade observada chega a 23:50 BRT).
-- Como os jobs rodam apos meia-noite, fecham explicitamente o dia BRT anterior
-- e processam exatamente uma unidade/data.
select cron.schedule(
  'sync-presenca-dia-campo-grande',
  '10 3 * * 0,2-6',
  $cron$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-presenca-emusys',
      headers := jsonb_build_object(
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_presenca_edge_token' limit 1),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'modo', 'presenca', 'dias', 1,
        'data', (((now() at time zone 'America/Sao_Paulo')::date) - 1)::text,
        'unidade_index', 0, 'tipo_execucao', 'dia_operacional'
      ),
      timeout_milliseconds := 180000
    );
  $cron$
);

select cron.schedule(
  'sync-presenca-dia-barra',
  '25 3 * * 0,2-6',
  $cron$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-presenca-emusys',
      headers := jsonb_build_object(
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_presenca_edge_token' limit 1),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'modo', 'presenca', 'dias', 1,
        'data', (((now() at time zone 'America/Sao_Paulo')::date) - 1)::text,
        'unidade_index', 1, 'tipo_execucao', 'dia_operacional'
      ),
      timeout_milliseconds := 180000
    );
  $cron$
);

select cron.schedule(
  'sync-presenca-dia-recreio',
  '40 3 * * 0,2-6',
  $cron$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-presenca-emusys',
      headers := jsonb_build_object(
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_presenca_edge_token' limit 1),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'modo', 'presenca', 'dias', 1,
        'data', (((now() at time zone 'America/Sao_Paulo')::date) - 1)::text,
        'unidade_index', 2, 'tipo_execucao', 'dia_operacional'
      ),
      timeout_milliseconds := 180000
    );
  $cron$
);

-- 07:30 BRT: dispara somente a unidade de ontem que teve aula e ainda nao
-- possui cobertura publicavel. A propria lease deduplica corrida com retry.
select cron.schedule(
  'sync-presenca-catchup-manha',
  '30 10 * * *',
  $cron$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-presenca-emusys',
      headers := jsonb_build_object(
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_presenca_edge_token' limit 1),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'modo', 'presenca', 'dias', 1,
        'data', (((now() at time zone 'America/Sao_Paulo')::date) - 1)::text,
        'unidade_index', alvo.unidade_index, 'tipo_execucao', 'catchup'
      ),
      timeout_milliseconds := 180000
    )
    from (
      values
        ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 0),
        ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 1),
        ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 2)
    ) as alvo(unidade_id, unidade_index)
    where exists (
      select 1 from public.aulas_emusys ae
       where ae.unidade_id = alvo.unidade_id
         and ae.data_aula = ((now() at time zone 'America/Sao_Paulo')::date - 1)
         and not coalesce(ae.cancelada, false)
    )
      and not exists (
        select 1 from public.presenca_sync_cobertura c
         where c.unidade_id = alvo.unidade_id
           and c.modo = 'presenca'
           and c.data_alvo = ((now() at time zone 'America/Sao_Paulo')::date - 1)
           and c.status = 'concluida'
           and c.snapshot_hash is not null
      );
  $cron$
);

-- 03:15 BRT: reparacao historica isolada do fechamento diario. Termina em
-- ontem para nao disputar o slot operacional do dia corrente.
select cron.schedule(
  'sync-presenca-backlog',
  '15 6 * * *',
  $cron$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-presenca-emusys',
      headers := jsonb_build_object(
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_presenca_edge_token' limit 1),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'modo', 'presenca', 'dias', 14,
        'data', (((now() at time zone 'America/Sao_Paulo')::date) - 1)::text,
        'tipo_execucao', 'backlog'
      ),
      timeout_milliseconds := 180000
    );
  $cron$
);

-- 09:00 BRT: o wrapper nao enfileira nenhuma mensagem enquanto uma unidade
-- com aula estiver sem cobertura concluida.
select cron.schedule(
  'relatorio-presenca-pendencias-9h',
  '0 12 * * *',
  $cron$
    select public.fn_enfileirar_relatorio_presenca_se_coberto_v1(
      ((now() at time zone 'America/Sao_Paulo')::date) - 1
    );
  $cron$
);

commit;
