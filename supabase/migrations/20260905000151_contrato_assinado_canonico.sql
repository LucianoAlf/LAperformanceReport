begin;

-- Verdade observada no Emusys. Nao e uma data juridica de assinatura.
create table public.aluno_contratos_emusys (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  emusys_matricula_id text not null,
  emusys_aluno_id text,
  aluno_id integer references public.alunos(id) on delete set null,
  contrato_emusys_id text,
  contrato_assinado boolean,
  contrato_status_observado_em timestamptz not null,
  origem text not null,
  payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aluno_contratos_emusys_origem_check
    check (origem in ('snapshot_backfill', 'api_reconciliacao')),
  constraint aluno_contratos_emusys_estado_check check (
    (contrato_emusys_id is null and contrato_assinado is null)
    or (contrato_emusys_id is not null and contrato_assinado is not null)
  )
);

create unique index aluno_contratos_emusys_contrato_uidx
  on public.aluno_contratos_emusys
  (unidade_id, emusys_matricula_id, contrato_emusys_id)
  where contrato_emusys_id is not null;

create unique index aluno_contratos_emusys_sem_contrato_uidx
  on public.aluno_contratos_emusys (unidade_id, emusys_matricula_id)
  where contrato_emusys_id is null;

create index aluno_contratos_emusys_aluno_idx
  on public.aluno_contratos_emusys (aluno_id, contrato_status_observado_em desc)
  where aluno_id is not null;

create index aluno_contratos_emusys_matricula_observacao_idx
  on public.aluno_contratos_emusys
  (unidade_id, emusys_matricula_id, contrato_status_observado_em desc);

alter table public.aluno_contratos_emusys enable row level security;
create policy aluno_contratos_emusys_service_role_all
  on public.aluno_contratos_emusys for all to service_role
  using (true) with check (true);
revoke all on table public.aluno_contratos_emusys from public, anon, authenticated;
grant select, insert, update on table public.aluno_contratos_emusys to service_role;

create table public.contrato_assinatura_sync_execucoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  unidade_slug text not null,
  status text not null default 'running',
  paginas integer not null default 0,
  matriculas_recebidas integer not null default 0,
  com_contrato integer not null default 0,
  assinadas integer not null default 0,
  nao_assinadas integer not null default 0,
  sem_contrato integer not null default 0,
  erro text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contrato_assinatura_sync_status_check
    check (status in ('running', 'succeeded', 'failed')),
  constraint contrato_assinatura_sync_contagens_check check (
    paginas >= 0 and matriculas_recebidas >= 0 and com_contrato >= 0
    and assinadas >= 0 and nao_assinadas >= 0 and sem_contrato >= 0
  )
);

create index contrato_assinatura_sync_unidade_frescor_idx
  on public.contrato_assinatura_sync_execucoes
  (unidade_id, completed_at desc)
  where status = 'succeeded';

alter table public.contrato_assinatura_sync_execucoes enable row level security;
create policy contrato_assinatura_sync_service_role_all
  on public.contrato_assinatura_sync_execucoes for all to service_role
  using (true) with check (true);
revoke all on table public.contrato_assinatura_sync_execucoes from public, anon, authenticated;
grant select, insert, update on table public.contrato_assinatura_sync_execucoes to service_role;

comment on column public.aluno_contratos_emusys.contrato_status_observado_em is
  'Quando o LA Report observou o estado no Emusys. Nao e data de assinatura.';
comment on column public.aluno_contratos_emusys.contrato_assinado is
  'Booleano contrato_atual.contrato_assinado do GET /matriculas; false nao informa a etapa pendente.';

-- Um lote so e publicado depois de todas as paginas terem sido baixadas e validadas.
create function public.registrar_contrato_assinatura_lote_v1(
  p_execucao_id uuid,
  p_unidade_id uuid,
  p_observado_em timestamptz,
  p_linhas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_com_contrato integer;
  v_assinadas integer;
  v_nao_assinadas integer;
  v_sem_contrato integer;
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'registrar_contrato_assinatura_lote_v1 restrita ao service_role'
      using errcode = '42501';
  end if;

  if p_execucao_id is null or p_unidade_id is null or p_observado_em is null
     or jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'lote_contrato_assinatura_invalido';
  end if;

  if not exists (
    select 1 from public.contrato_assinatura_sync_execucoes e
    where e.id = p_execucao_id and e.unidade_id = p_unidade_id and e.status = 'running'
  ) then
    raise exception 'execucao_contrato_assinatura_invalida';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_linhas) x(item)
    where coalesce(x.item->>'unidade_id', '') <> p_unidade_id::text
       or coalesce(x.item->>'emusys_matricula_id', '') !~ '^[1-9][0-9]*$'
       or (
         x.item->>'contrato_emusys_id' is not null
         and coalesce(x.item->>'contrato_emusys_id', '') !~ '^[1-9][0-9]*$'
       )
       or (
         x.item->>'contrato_emusys_id' is null
         and jsonb_typeof(x.item->'contrato_assinado') <> 'null'
       )
       or (
         x.item->>'contrato_emusys_id' is not null
         and jsonb_typeof(x.item->'contrato_assinado') <> 'boolean'
       )
  ) then
    raise exception 'linha_contrato_assinatura_invalida';
  end if;

  with linhas as (
    select x.item,
           x.item->>'emusys_matricula_id' as emusys_matricula_id,
           nullif(x.item->>'emusys_aluno_id', '') as emusys_aluno_id,
           nullif(x.item->>'contrato_emusys_id', '') as contrato_emusys_id,
           case when jsonb_typeof(x.item->'contrato_assinado') = 'boolean'
                then (x.item->>'contrato_assinado')::boolean end as contrato_assinado
    from jsonb_array_elements(p_linhas) x(item)
  ), vinculadas as (
    select l.*,
           coalesce(e.aluno_id, a.id) as aluno_id
    from linhas l
    left join public.emusys_matriculas_estado_atual e
      on e.unidade_id = p_unidade_id
     and e.emusys_matricula_id::text = l.emusys_matricula_id
    left join lateral (
      select al.id
      from public.alunos al
      where al.unidade_id = p_unidade_id
        and al.emusys_matricula_id::text = l.emusys_matricula_id
      order by (al.arquivado_em is null) desc, al.id
      limit 1
    ) a on true
  ), contratos as (
    insert into public.aluno_contratos_emusys (
      unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id,
      contrato_emusys_id, contrato_assinado, contrato_status_observado_em,
      origem, payload_hash, updated_at
    )
    select p_unidade_id, v.emusys_matricula_id, v.emusys_aluno_id, v.aluno_id,
           v.contrato_emusys_id, v.contrato_assinado, p_observado_em,
           'api_reconciliacao', md5(v.item::text), now()
    from vinculadas v
    where v.contrato_emusys_id is not null
    on conflict (unidade_id, emusys_matricula_id, contrato_emusys_id)
      where contrato_emusys_id is not null
    do update set
      emusys_aluno_id = excluded.emusys_aluno_id,
      aluno_id = coalesce(excluded.aluno_id, aluno_contratos_emusys.aluno_id),
      contrato_assinado = excluded.contrato_assinado,
      contrato_status_observado_em = excluded.contrato_status_observado_em,
      origem = excluded.origem,
      payload_hash = excluded.payload_hash,
      updated_at = now()
    returning 1
  ), sem_contrato as (
    insert into public.aluno_contratos_emusys (
      unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id,
      contrato_emusys_id, contrato_assinado, contrato_status_observado_em,
      origem, payload_hash, updated_at
    )
    select p_unidade_id, v.emusys_matricula_id, v.emusys_aluno_id, v.aluno_id,
           null, null, p_observado_em, 'api_reconciliacao', md5(v.item::text), now()
    from vinculadas v
    where v.contrato_emusys_id is null
    on conflict (unidade_id, emusys_matricula_id)
      where contrato_emusys_id is null
    do update set
      emusys_aluno_id = excluded.emusys_aluno_id,
      aluno_id = coalesce(excluded.aluno_id, aluno_contratos_emusys.aluno_id),
      contrato_status_observado_em = excluded.contrato_status_observado_em,
      origem = excluded.origem,
      payload_hash = excluded.payload_hash,
      updated_at = now()
    returning 1
  )
  select jsonb_array_length(p_linhas),
         count(*) filter (where item->>'contrato_emusys_id' is not null),
         count(*) filter (where item->>'contrato_assinado' = 'true'),
         count(*) filter (where item->>'contrato_assinado' = 'false'),
         count(*) filter (where item->>'contrato_emusys_id' is null)
  into v_total, v_com_contrato, v_assinadas, v_nao_assinadas, v_sem_contrato
  from jsonb_array_elements(p_linhas) x(item);

  update public.contrato_assinatura_sync_execucoes
  set status = 'succeeded',
      matriculas_recebidas = v_total,
      com_contrato = v_com_contrato,
      assinadas = v_assinadas,
      nao_assinadas = v_nao_assinadas,
      sem_contrato = v_sem_contrato,
      completed_at = now(),
      erro = null
  where id = p_execucao_id and unidade_id = p_unidade_id and status = 'running';

  return jsonb_build_object(
    'matriculas_recebidas', v_total,
    'com_contrato', v_com_contrato,
    'assinadas', v_assinadas,
    'nao_assinadas', v_nao_assinadas,
    'sem_contrato', v_sem_contrato
  );
end;
$$;

revoke all on function public.registrar_contrato_assinatura_lote_v1(uuid, uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.registrar_contrato_assinatura_lote_v1(uuid, uuid, timestamptz, jsonb)
  to service_role;

-- Backfill idempotente: usa somente snapshots ja armazenados.
with fonte as (
  select e.unidade_id,
         e.emusys_matricula_id::text as emusys_matricula_id,
         e.emusys_aluno_id::text as emusys_aluno_id,
         e.aluno_id,
         case
           when jsonb_typeof(e.payload_snapshot->'contrato_atual') = 'object'
             then coalesce(e.emusys_contrato_id::text,
                           nullif(e.payload_snapshot #>> '{contrato_atual,id}', ''))
         end as contrato_emusys_id,
         (jsonb_typeof(e.payload_snapshot->'contrato_atual') = 'object') as contrato_objeto,
         case
           when e.payload_snapshot #>> '{contrato_atual,contrato_assinado}' in ('true', 'false')
             then (e.payload_snapshot #>> '{contrato_atual,contrato_assinado}')::boolean
         end as contrato_assinado,
         e.sincronizado_em,
         e.payload_hash
  from public.emusys_matriculas_estado_atual e
  where e.status_emusys = 'ativa'
), contratos as (
  insert into public.aluno_contratos_emusys (
    unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id,
    contrato_emusys_id, contrato_assinado, contrato_status_observado_em,
    origem, payload_hash
  )
  select unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id,
         contrato_emusys_id, contrato_assinado, sincronizado_em,
         'snapshot_backfill', payload_hash
  from fonte
  where contrato_emusys_id is not null and contrato_assinado is not null
  on conflict (unidade_id, emusys_matricula_id, contrato_emusys_id)
    where contrato_emusys_id is not null
  do update set
    emusys_aluno_id = excluded.emusys_aluno_id,
    aluno_id = coalesce(excluded.aluno_id, aluno_contratos_emusys.aluno_id),
    contrato_assinado = excluded.contrato_assinado,
    contrato_status_observado_em = greatest(
      aluno_contratos_emusys.contrato_status_observado_em,
      excluded.contrato_status_observado_em
    ),
    payload_hash = excluded.payload_hash,
    updated_at = now()
  returning 1
)
insert into public.aluno_contratos_emusys (
  unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id,
  contrato_emusys_id, contrato_assinado, contrato_status_observado_em,
  origem, payload_hash
)
select unidade_id, emusys_matricula_id, emusys_aluno_id, aluno_id,
       null, null, sincronizado_em, 'snapshot_backfill', payload_hash
from fonte
where contrato_emusys_id is null
  and not coalesce(contrato_objeto, false)
on conflict (unidade_id, emusys_matricula_id)
  where contrato_emusys_id is null
do update set
  emusys_aluno_id = excluded.emusys_aluno_id,
  aluno_id = coalesce(excluded.aluno_id, aluno_contratos_emusys.aluno_id),
  contrato_status_observado_em = greatest(
    aluno_contratos_emusys.contrato_status_observado_em,
    excluded.contrato_status_observado_em
  ),
  payload_hash = excluded.payload_hash,
  updated_at = now();

-- Preserva integralmente o contrato anterior e envolve-o com campos aditivos.
alter function public.get_situacao_alunos_v1(uuid, date, boolean)
  rename to get_situacao_alunos_sem_contrato_assinado_v1;
revoke all on function public.get_situacao_alunos_sem_contrato_assinado_v1(uuid, date, boolean)
  from public, anon, authenticated, sol_acesso_restrito;

create function public.get_situacao_alunos_v1(
  p_unidade_id uuid,
  p_referencia date default current_date,
  p_apenas_pendentes boolean default false
)
returns table (
  pessoa_chave text, aluno_id_canonico integer, aluno_ids_locais integer[], nome text,
  unidade_id uuid, classificacao text, status_operacional text, matriculas_ativas integer,
  cursos text[], entrou_em date, matricula_recente_em date, responsavel_nome text,
  professores text[], aulas_resumo text[], anamnese_preenchida boolean, anamnese_em date,
  anamnese_tipo text, anamnese_flag_sem_registro boolean, anamnese_orfa_candidata_id integer,
  anamnese_orfa_match text, tem_instagram boolean, instagram_nao_possui boolean,
  tem_telefone boolean, tem_responsavel boolean, tem_foto boolean, tem_data_contrato boolean,
  contrato_vencido boolean, cadastro_completo boolean, cadastro_faltando text[],
  presenca_confirmadas integer, faltas_confirmadas integer, faltas_provaveis integer,
  chamadas_indeterminadas integer, presenca_taxa_geral numeric, presenca_confianca text,
  presenca_regra_versao text, ultima_aula_em date, dias_desde_ultima_aula integer,
  inadimplente boolean, faturas_vencidas_abertas integer, em_aviso_previo boolean,
  aviso_previo_mes_saida date, proxima_renovacao_em date, vence_em_30d boolean,
  na_comunidade_wa boolean, comunidade_status text, comunidade_capturado_em timestamptz,
  pendencias text[], fonte text, regra_versao text,
  contrato_assinatura_status text, contratos_assinados_todos boolean,
  contratos_relevantes integer, contratos_assinados integer,
  contratos_nao_assinados integer, contratos_sem_contrato integer,
  contratos_nao_verificados integer, contrato_status_observado_em timestamptz,
  contrato_reconciliado_em timestamptz, contrato_dado_fresco boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with antigos as materialized (
    select *
    from public.get_situacao_alunos_sem_contrato_assinado_v1(
      p_unidade_id, p_referencia, p_apenas_pendentes
    )
  ),
  sync_fresco as (
    select max(e.completed_at) as reconciliado_em
    from public.contrato_assinatura_sync_execucoes e
    where e.unidade_id = p_unidade_id
      and e.status = 'succeeded'
      and (e.completed_at at time zone 'America/Sao_Paulo')::date = p_referencia
  ),
  matriculas_relevantes as (
    select o.pessoa_chave,
           a.id as aluno_id,
           nullif(btrim(a.emusys_matricula_id::text), '') as emusys_matricula_id,
           obs.id as observacao_id,
           obs.contrato_emusys_id,
           obs.contrato_assinado,
           obs.contrato_status_observado_em
    from antigos o
    cross join lateral unnest(o.aluno_ids_locais) aid(aluno_id)
    join public.alunos a on a.id = aid.aluno_id and a.arquivado_em is null
    join public.vw_alunos_estado_operacional_v131 eo
      on eo.aluno_id = a.id and eo.entra_base_ativa = true
    left join public.cursos c on c.id = a.curso_id
    left join lateral (
      select ace.id, ace.contrato_emusys_id, ace.contrato_assinado,
             ace.contrato_status_observado_em
      from public.aluno_contratos_emusys ace
      where ace.unidade_id = p_unidade_id
        and ace.emusys_matricula_id = a.emusys_matricula_id::text
      order by ace.contrato_status_observado_em desc, ace.updated_at desc, ace.id desc
      limit 1
    ) obs on a.emusys_matricula_id is not null
    where not coalesce(c.is_projeto_banda, false)
  ),
  stats as (
    select o.pessoa_chave,
           count(m.aluno_id)::integer as contratos_relevantes,
           count(*) filter (where m.contrato_assinado is true)::integer as contratos_assinados,
           bool_and(m.contrato_assinado is true)
             filter (where m.aluno_id is not null) as todas_assinadas,
           count(*) filter (where m.contrato_assinado is false)::integer as contratos_nao_assinados,
           count(*) filter (
             where m.observacao_id is not null and m.contrato_emusys_id is null
           )::integer as contratos_sem_contrato,
           count(*) filter (
             where m.aluno_id is not null and (
               m.emusys_matricula_id is null or m.observacao_id is null
             )
           )::integer as contratos_nao_verificados,
           min(m.contrato_status_observado_em) as observado_em,
           sf.reconciliado_em
    from antigos o
    left join matriculas_relevantes m on m.pessoa_chave = o.pessoa_chave
    cross join sync_fresco sf
    group by o.pessoa_chave, sf.reconciliado_em
  ),
  classificados as (
    select s.*,
      case
        when s.contratos_relevantes = 0 then 'dispensado'
        when s.reconciliado_em is null or s.contratos_nao_verificados > 0 then 'nao_verificado'
        when s.contratos_sem_contrato > 0 then 'sem_contrato'
        when s.contratos_nao_assinados > 0 then 'nao_assinado'
        when s.contratos_assinados = s.contratos_relevantes then 'assinado'
        else 'nao_verificado'
      end as status,
      case
        when s.contratos_relevantes = 0 then null
        when s.reconciliado_em is null or s.contratos_nao_verificados > 0 then null
        else coalesce(s.todas_assinadas, false)
             and s.contratos_assinados = s.contratos_relevantes
      end as assinados_todos
    from stats s
  )
  select o.*,
         c.status,
         c.assinados_todos,
         c.contratos_relevantes,
         c.contratos_assinados,
         c.contratos_nao_assinados,
         c.contratos_sem_contrato,
         c.contratos_nao_verificados,
         c.observado_em,
         c.reconciliado_em,
         (c.reconciliado_em is not null and c.contratos_nao_verificados = 0)
  from antigos o
  join classificados c on c.pessoa_chave = o.pessoa_chave
  order by o.nome;
$$;

revoke all on function public.get_situacao_alunos_v1(uuid, date, boolean) from public, anon;
grant execute on function public.get_situacao_alunos_v1(uuid, date, boolean)
  to authenticated, service_role, sol_acesso_restrito;

create function public.get_contrato_assinatura_aluno_v1(p_aluno_id integer)
returns table (
  contrato_assinatura_status text,
  contratos_assinados_todos boolean,
  contratos_relevantes integer,
  contratos_assinados integer,
  contratos_nao_assinados integer,
  contratos_sem_contrato integer,
  contratos_nao_verificados integer,
  contrato_status_observado_em timestamptz,
  contrato_reconciliado_em timestamptz,
  contrato_dado_fresco boolean,
  matricula_contrato_status text,
  matricula_contrato_emusys_id text,
  matricula_contrato_assinado boolean,
  matricula_status_observado_em timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_aluno public.alunos%rowtype;
  v_curso_banda boolean;
  v_sync_em timestamptz;
  v_obs public.aluno_contratos_emusys%rowtype;
begin
  select a.* into v_aluno
  from public.alunos a
  where a.id = p_aluno_id and a.arquivado_em is null;

  if v_aluno.id is null then
    raise exception 'aluno_nao_encontrado' using errcode = 'P0002';
  end if;

  select coalesce(c.is_projeto_banda, false) into v_curso_banda
  from public.cursos c
  where c.id = v_aluno.curso_id;
  v_curso_banda := coalesce(v_curso_banda, false);

  if current_user not in ('service_role', 'sol_acesso_restrito', 'postgres')
     and coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(public.fn_usuario_atual_tem_permissao('alunos.ver', v_aluno.unidade_id), false) then
    raise exception 'papel nao autorizado para consultar contrato do aluno'
      using errcode = '42501';
  end if;

  select e.completed_at into v_sync_em
  from public.contrato_assinatura_sync_execucoes e
  where e.unidade_id = v_aluno.unidade_id
    and e.status = 'succeeded'
    and (e.completed_at at time zone 'America/Sao_Paulo')::date =
        (now() at time zone 'America/Sao_Paulo')::date
  order by e.completed_at desc
  limit 1;

  if v_aluno.emusys_matricula_id is not null then
    select ace.* into v_obs
    from public.aluno_contratos_emusys ace
    where ace.unidade_id = v_aluno.unidade_id
      and ace.emusys_matricula_id = v_aluno.emusys_matricula_id::text
    order by ace.contrato_status_observado_em desc, ace.updated_at desc, ace.id desc
    limit 1;
  end if;

  return query
  with pessoa as (
    select s.*
    from public.get_situacao_alunos_v1(
      v_aluno.unidade_id,
      (now() at time zone 'America/Sao_Paulo')::date,
      false
    ) s
    where p_aluno_id = any(s.aluno_ids_locais)
    limit 1
  )
  select p.contrato_assinatura_status,
         p.contratos_assinados_todos,
         p.contratos_relevantes,
         p.contratos_assinados,
         p.contratos_nao_assinados,
         p.contratos_sem_contrato,
         p.contratos_nao_verificados,
         p.contrato_status_observado_em,
         p.contrato_reconciliado_em,
         p.contrato_dado_fresco,
         case
           when v_curso_banda then 'dispensado'
           when v_sync_em is null or v_aluno.emusys_matricula_id is null or v_obs.id is null
             then 'nao_verificado'
           when v_obs.contrato_emusys_id is null then 'sem_contrato'
           when v_obs.contrato_assinado is true then 'assinado'
           when v_obs.contrato_assinado is false then 'nao_assinado'
           else 'nao_verificado'
         end,
         v_obs.contrato_emusys_id,
         v_obs.contrato_assinado,
         v_obs.contrato_status_observado_em
  from pessoa p;
end;
$$;

revoke all on function public.get_contrato_assinatura_aluno_v1(integer) from public, anon;
grant execute on function public.get_contrato_assinatura_aluno_v1(integer)
  to authenticated, service_role, sol_acesso_restrito;

-- Duas janelas: principal e retry. A Edge pula o retry se ja houver sucesso no dia BRT.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname like 'sync-contrato-assinatura-%'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule('sync-contrato-assinatura-cg-principal', '0 8 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-contratos-assinatura-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-contrato-assinatura-recreio-principal', '10 8 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-contratos-assinatura-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-contrato-assinatura-barra-principal', '20 8 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-contratos-assinatura-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-contrato-assinatura-cg-retry', '30 8 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-contratos-assinatura-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-contrato-assinatura-recreio-retry', '40 8 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-contratos-assinatura-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-contrato-assinatura-barra-retry', '50 8 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-contratos-assinatura-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);

commit;
