create or replace function public.get_saude_cobertura_presenca_v1(
  p_data date default (current_date - 1)
)
returns table (
  unidade_id uuid,
  unidade_nome text,
  data_coberta date,
  status text,
  publicavel boolean,
  ultima_conclusao timestamptz,
  heartbeat_em timestamptz,
  lease_expirada boolean,
  tentativas_deduplicadas bigint,
  relatorio_bloqueado boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '')
     not in ('authenticated', 'service_role') then
    raise insufficient_privilege using message = 'usuario autenticado obrigatorio';
  end if;
  if p_data is null or p_data > current_date then
    raise exception using errcode = '22023', message = 'data de cobertura invalida';
  end if;

  return query
  select
    u.id,
    u.nome,
    p_data,
    coalesce(c.status, 'sem_cobertura'),
    coalesce(c.status = 'concluida' and c.snapshot_hash is not null, false),
    (
      select max(x.finalizada_em)
        from public.presenca_sync_execucoes x
       where x.unidade_id = u.id
         and x.modo = 'presenca'
         and x.data_alvo = p_data
         and x.status = 'concluida'
    ),
    c.heartbeat_em,
    coalesce(c.status = 'iniciada' and c.lease_ate <= clock_timestamp(), false),
    coalesce((
      select count(*)
        from public.presenca_sync_eventos e
        join public.presenca_sync_execucoes x on x.id = e.run_id
       where x.unidade_id = u.id
         and x.modo = 'presenca'
         and x.data_alvo = p_data
         and e.tipo = 'deduplicada'
    ), 0),
    exists (
      select 1
        from public.aulas_emusys ae
       where ae.unidade_id = u.id
         and ae.data_aula = p_data
         and ae.data_hora_fim < now()
         and not coalesce(ae.cancelada, false)
    ) and not coalesce(
      c.status = 'concluida' and c.snapshot_hash is not null,
      false
    )
  from public.unidades u
  left join public.presenca_sync_cobertura c
    on c.unidade_id = u.id
   and c.modo = 'presenca'
   and c.data_alvo = p_data
  order by u.nome;
end;
$$;

revoke all on function public.get_saude_cobertura_presenca_v1(date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_saude_cobertura_presenca_v1(date)
  to authenticated, service_role;

comment on function public.get_saude_cobertura_presenca_v1(date) is
  'Saude operacional sanitizada por unidade/data; nao expoe alunos nem payload do Emusys.';
