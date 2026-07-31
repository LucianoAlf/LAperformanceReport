-- Snapshot vigente das aulas experimentais do Emusys.
--
-- Grao operacional:
--   unidade_id + emusys_aula_id + participante_chave
--
-- O historico permanece append-only entre execucoes: somente uma linha da
-- business key pode estar vigente, enquanto linhas inativadas continuam
-- disponiveis para auditoria.

alter table public.emusys_experimentais_raw
  add column if not exists emusys_lead_id integer,
  add column if not exists emusys_aluno_id integer,
  add column if not exists participante_chave text,
  add column if not exists snapshot_ativo boolean not null default false,
  add column if not exists snapshot_execucao_id uuid,
  add column if not exists snapshot_visto_em timestamptz,
  add column if not exists snapshot_inativado_em timestamptz;

alter table public.emusys_experimentais_raw
  drop constraint if exists emusys_experimentais_raw_situacao_check;

alter table public.emusys_experimentais_raw
  add constraint emusys_experimentais_raw_situacao_check
  check (
    situacao_operacional in (
      'agendada',
      'presente',
      'matriculado',
      'faltou',
      'cancelada',
      'sem_status',
      'desconhecida'
    )
  );

create table public.emusys_experimentais_snapshot_execucoes (
  id uuid primary key,
  unidade_id uuid not null references public.unidades(id),
  data_inicio date not null,
  data_fim date not null,
  status text not null check (status = 'completo'),
  linhas_recebidas integer not null,
  linhas_ativas integer not null,
  linhas_inativadas integer not null,
  iniciado_em timestamptz not null,
  concluido_em timestamptz not null,
  constraint intervalo_valido check (data_fim >= data_inicio)
);

create index emusys_experimentais_snapshot_execucoes_unidade_periodo_idx
  on public.emusys_experimentais_snapshot_execucoes (
    unidade_id,
    data_inicio,
    data_fim,
    concluido_em desc
  );

-- O raw legado apareceu em mais de um formato. A extracao abaixo aceita os
-- formatos historicos conhecidos sem transformar nome/telefone em identidade.
with payload_ids as (
  select
    r.id,
    coalesce(
      r.payload #>> '{participante,id_lead}',
      r.payload #>> '{aluno,id_lead}',
      r.payload ->> 'id_lead',
      r.payload #>> '{aula,alunos,0,id_lead}',
      r.payload #>> '{alunos,0,id_lead}'
    ) as emusys_lead_id_texto,
    coalesce(
      r.payload #>> '{participante,id_aluno}',
      r.payload #>> '{aluno,id_aluno}',
      r.payload ->> 'id_aluno',
      r.payload #>> '{aula,alunos,0,id_aluno}',
      r.payload #>> '{alunos,0,id_aluno}'
    ) as emusys_aluno_id_texto
  from public.emusys_experimentais_raw r
),
ids_validos as (
  select
    p.id,
    case
      when p.emusys_lead_id_texto ~ '^[1-9][0-9]*$'
       and p.emusys_lead_id_texto::numeric <= 2147483647
        then p.emusys_lead_id_texto::integer
      else null
    end as emusys_lead_id,
    case
      when p.emusys_aluno_id_texto ~ '^[1-9][0-9]*$'
       and p.emusys_aluno_id_texto::numeric <= 2147483647
        then p.emusys_aluno_id_texto::integer
      else null
    end as emusys_aluno_id
  from payload_ids p
)
update public.emusys_experimentais_raw r
set
  emusys_lead_id = i.emusys_lead_id,
  emusys_aluno_id = i.emusys_aluno_id,
  participante_chave = case
    when i.emusys_lead_id is not null
      then 'lead:' || i.emusys_lead_id::text
    when i.emusys_aluno_id is not null
      then 'aluno:' || i.emusys_aluno_id::text
    else 'fallback:raw:' || md5(r.raw_key)
  end,
  snapshot_visto_em = coalesce(r.updated_at, r.created_at, now())
from ids_validos i
where i.id = r.id;

with ranqueadas as (
  select
    r.id,
    row_number() over (
      partition by r.unidade_id, r.emusys_aula_id, r.participante_chave
      order by r.updated_at desc, r.id desc
    ) as ordem,
    max(r.aula_emusys_id) over (
      partition by r.unidade_id, r.emusys_aula_id, r.participante_chave
    ) as aula_emusys_id_conhecido,
    max(r.professor_id) over (
      partition by r.unidade_id, r.emusys_aula_id, r.participante_chave
    ) as professor_id_conhecido,
    max(r.curso_id) over (
      partition by r.unidade_id, r.emusys_aula_id, r.participante_chave
    ) as curso_id_conhecido,
    max(r.lead_id) over (
      partition by r.unidade_id, r.emusys_aula_id, r.participante_chave
    ) as lead_id_conhecido,
    max(r.aluno_id) over (
      partition by r.unidade_id, r.emusys_aula_id, r.participante_chave
    ) as aluno_id_conhecido,
    max(r.lead_experimental_id) over (
      partition by r.unidade_id, r.emusys_aula_id, r.participante_chave
    ) as lead_experimental_id_conhecido
  from public.emusys_experimentais_raw r
)
update public.emusys_experimentais_raw r
set
  snapshot_ativo = (q.ordem = 1),
  aula_emusys_id = coalesce(r.aula_emusys_id, q.aula_emusys_id_conhecido),
  professor_id = coalesce(r.professor_id, q.professor_id_conhecido),
  curso_id = coalesce(r.curso_id, q.curso_id_conhecido),
  lead_id = coalesce(r.lead_id, q.lead_id_conhecido),
  aluno_id = coalesce(r.aluno_id, q.aluno_id_conhecido),
  lead_experimental_id = coalesce(
    r.lead_experimental_id,
    q.lead_experimental_id_conhecido
  ),
  snapshot_inativado_em = case
    when q.ordem = 1 then null
    else coalesce(r.snapshot_inativado_em, r.updated_at, r.created_at, now())
  end
from ranqueadas q
where q.id = r.id;

alter table public.emusys_experimentais_raw
  alter column participante_chave set not null;

alter table public.emusys_experimentais_raw
  add constraint emusys_experimentais_raw_snapshot_execucao_fk
  foreign key (snapshot_execucao_id)
  references public.emusys_experimentais_snapshot_execucoes(id)
  on delete restrict
  deferrable initially deferred;

create unique index emusys_experimentais_raw_snapshot_ativo_key_idx
  on public.emusys_experimentais_raw (
    unidade_id,
    emusys_aula_id,
    participante_chave
  )
  where snapshot_ativo is true;

create index emusys_experimentais_raw_snapshot_periodo_idx
  on public.emusys_experimentais_raw (
    unidade_id,
    data_aula,
    snapshot_ativo
  );

revoke all on table public.emusys_experimentais_snapshot_execucoes
  from public, anon, authenticated;
grant select on table public.emusys_experimentais_snapshot_execucoes
  to service_role;

create or replace function public.aplicar_snapshot_experimentais_emusys_v1(
  p_execucao_id uuid,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_agora timestamptz := clock_timestamp();
  v_recebidas integer := 0;
  v_inseridas integer := 0;
  v_atualizadas integer := 0;
  v_inativadas integer := 0;
begin
  if p_execucao_id is null then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_EXECUCAO_OBRIGATORIA'
      using errcode = '22023';
  end if;

  if p_unidade_id is null
     or not exists (
       select 1
       from public.unidades u
       where u.id = p_unidade_id
     ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_UNIDADE_INVALIDA'
      using errcode = '22023';
  end if;

  if p_data_inicio is null
     or p_data_fim is null
     or p_data_fim < p_data_inicio
     or p_data_fim - p_data_inicio > 45 then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_INTERVALO_INVALIDO_MAX_45_DIAS'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.emusys_experimentais_snapshot_execucoes e
    where e.id = p_execucao_id
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_EXECUCAO_REPETIDA'
      using errcode = '23505';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_PAYLOAD_DEVE_SER_ARRAY'
      using errcode = '22023';
  end if;

  if to_regclass('pg_temp.snapshot_experimentais_lote') is null then
    create temporary table pg_temp.snapshot_experimentais_lote (
      raw_key text,
      unidade_id uuid,
      execucao_id uuid,
      emusys_aula_id integer,
      participante_chave text,
      emusys_lead_id integer,
      emusys_aluno_id integer,
      payload_emusys_lead_id_texto text,
      payload_emusys_aluno_id_texto text,
      aluno_nome text,
      aluno_telefone text,
      data_aula date,
      horario_aula time without time zone,
      cancelada boolean,
      presenca_emusys text,
      situacao_operacional text,
      payload_bruto jsonb
    ) on commit drop;
  else
    truncate table pg_temp.snapshot_experimentais_lote;
  end if;

  insert into pg_temp.snapshot_experimentais_lote (
    raw_key,
    unidade_id,
    execucao_id,
    emusys_aula_id,
    participante_chave,
    emusys_lead_id,
    emusys_aluno_id,
    payload_emusys_lead_id_texto,
    payload_emusys_aluno_id_texto,
    aluno_nome,
    aluno_telefone,
    data_aula,
    horario_aula,
    cancelada,
    presenca_emusys,
    situacao_operacional,
    payload_bruto
  )
  select
    x.raw_key,
    x.unidade_id,
    x.execucao_id,
    x.emusys_aula_id,
    x.participante_chave,
    x.emusys_lead_id,
    x.emusys_aluno_id,
    btrim(x.payload_bruto #>> '{participante,id_lead}'),
    btrim(x.payload_bruto #>> '{participante,id_aluno}'),
    x.aluno_nome,
    coalesce(
      nullif(btrim(x.aluno_telefone), ''),
      nullif(
        btrim(x.payload_bruto #>> '{participante,telefone_aluno}'),
        ''
      )
    ),
    x.data_aula,
    x.horario_aula,
    x.cancelada,
    x.presenca_emusys,
    x.situacao_operacional,
    x.payload_bruto
  from jsonb_to_recordset(p_itens) as x(
    raw_key text,
    unidade_id uuid,
    execucao_id uuid,
    emusys_aula_id integer,
    participante_chave text,
    emusys_lead_id integer,
    emusys_aluno_id integer,
    aluno_nome text,
    aluno_telefone text,
    data_aula date,
    horario_aula time without time zone,
    cancelada boolean,
    presenca_emusys text,
    situacao_operacional text,
    payload_bruto jsonb
  );

  get diagnostics v_recebidas = row_count;

  if exists (
    select 1
    from pg_temp.snapshot_experimentais_lote l
    where case
      when l.payload_emusys_lead_id_texto is null then false
      when l.payload_emusys_lead_id_texto !~ '^[0-9]+$' then true
      when l.payload_emusys_lead_id_texto ~ '^0+$' then true
      when length(ltrim(l.payload_emusys_lead_id_texto, '0')) > 10 then true
      when length(ltrim(l.payload_emusys_lead_id_texto, '0')) = 10
        then ltrim(l.payload_emusys_lead_id_texto, '0') > '2147483647'
      else false
    end
    or case
      when l.payload_emusys_aluno_id_texto is null then false
      when l.payload_emusys_aluno_id_texto !~ '^[0-9]+$' then true
      when l.payload_emusys_aluno_id_texto ~ '^0+$' then true
      when length(ltrim(l.payload_emusys_aluno_id_texto, '0')) > 10 then true
      when length(ltrim(l.payload_emusys_aluno_id_texto, '0')) = 10
        then ltrim(l.payload_emusys_aluno_id_texto, '0') > '2147483647'
      else false
    end
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_IDENTIDADE_PAYLOAD_INVALIDA'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.snapshot_experimentais_lote l
    where nullif(btrim(l.raw_key), '') is null
       or nullif(btrim(l.participante_chave), '') is null
       or nullif(btrim(l.aluno_nome), '') is null
       or l.unidade_id is distinct from p_unidade_id
       or l.execucao_id is distinct from p_execucao_id
       or l.emusys_aula_id is null
       or l.emusys_aula_id <= 0
       or l.data_aula is null
       or l.data_aula < p_data_inicio
       or l.data_aula > p_data_fim
       or l.emusys_lead_id <= 0
       or l.emusys_aluno_id <= 0
       or nullif(btrim(l.situacao_operacional), '') is null
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_ITEM_INVALIDO'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.snapshot_experimentais_lote l
    where l.participante_chave is distinct from case
      when l.emusys_lead_id is not null
        then 'lead:' || l.emusys_lead_id::text
      when l.emusys_aluno_id is not null
        then 'aluno:' || l.emusys_aluno_id::text
      else l.participante_chave
    end
       or (
         l.emusys_lead_id is null
         and l.emusys_aluno_id is null
         and l.participante_chave not like 'fallback:%'
       )
       or l.raw_key is distinct from concat_ws(
         ':',
         p_unidade_id::text,
         l.emusys_aula_id::text,
         l.participante_chave,
         p_execucao_id::text
       )
       or (
         l.payload_emusys_lead_id_texto is not null
         and l.emusys_lead_id is distinct from
           ltrim(l.payload_emusys_lead_id_texto, '0')::integer
       )
       or (
         l.payload_emusys_aluno_id_texto is not null
         and l.emusys_aluno_id is distinct from
           ltrim(l.payload_emusys_aluno_id_texto, '0')::integer
       )
       or (
         l.payload_bruto #>> '{aula,id}' is not null
         and l.payload_bruto #>> '{aula,id}' <> l.emusys_aula_id::text
       )
       or (
         l.emusys_lead_id is not null
         and l.payload_bruto #>> '{participante,id_lead}' is not null
         and l.payload_bruto #>> '{participante,id_lead}'
           <> l.emusys_lead_id::text
       )
       or (
         l.emusys_aluno_id is not null
         and l.payload_bruto #>> '{participante,id_aluno}' is not null
         and l.payload_bruto #>> '{participante,id_aluno}'
           <> l.emusys_aluno_id::text
       )
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_IDENTIDADE_DIVERGENTE'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_temp.snapshot_experimentais_lote l
    group by l.unidade_id, l.emusys_aula_id, l.participante_chave
    having count(*) > 1
  ) then
    raise exception 'SNAPSHOT_EXPERIMENTAIS_BUSINESS_KEY_DUPLICADA'
      using errcode = '23505';
  end if;

  select count(*)::integer
    into v_atualizadas
  from pg_temp.snapshot_experimentais_lote l
  join public.emusys_experimentais_raw r
    on r.unidade_id = l.unidade_id
   and r.emusys_aula_id = l.emusys_aula_id
   and r.participante_chave = l.participante_chave
   and r.snapshot_ativo is true;

  v_inseridas := v_recebidas - v_atualizadas;

  insert into public.emusys_experimentais_raw as r (
    raw_key,
    emusys_aula_id,
    aula_emusys_id,
    unidade_id,
    data_aula,
    horario_aula,
    aluno_nome,
    aluno_nome_normalizado,
    aluno_telefone,
    professor_id,
    curso_id,
    presenca_emusys,
    situacao_operacional,
    lead_id,
    aluno_id,
    lead_experimental_id,
    payload,
    emusys_lead_id,
    emusys_aluno_id,
    participante_chave,
    snapshot_ativo,
    snapshot_execucao_id,
    snapshot_visto_em,
    snapshot_inativado_em
  )
  select
    l.raw_key,
    l.emusys_aula_id,
    h.aula_emusys_id,
    l.unidade_id,
    l.data_aula,
    l.horario_aula,
    btrim(l.aluno_nome),
    lower(regexp_replace(btrim(l.aluno_nome), '\s+', ' ', 'g')),
    coalesce(l.aluno_telefone, ''),
    h.professor_id,
    h.curso_id,
    l.presenca_emusys,
    l.situacao_operacional,
    h.lead_id,
    h.aluno_id,
    h.lead_experimental_id,
    coalesce(l.payload_bruto, '{}'::jsonb),
    l.emusys_lead_id,
    l.emusys_aluno_id,
    l.participante_chave,
    true,
    p_execucao_id,
    v_agora,
    null
  from pg_temp.snapshot_experimentais_lote l
  left join lateral (
    select
      antigo.aula_emusys_id,
      antigo.professor_id,
      antigo.curso_id,
      antigo.lead_id,
      antigo.aluno_id,
      antigo.lead_experimental_id
    from public.emusys_experimentais_raw antigo
    where antigo.unidade_id = l.unidade_id
      and antigo.emusys_aula_id = l.emusys_aula_id
      and antigo.participante_chave = l.participante_chave
    order by antigo.snapshot_ativo desc, antigo.updated_at desc, antigo.id desc
    limit 1
  ) h on true
  on conflict (unidade_id, emusys_aula_id, participante_chave)
    where snapshot_ativo is true
  do update
  set
    raw_key = excluded.raw_key,
    aula_emusys_id = coalesce(excluded.aula_emusys_id, r.aula_emusys_id),
    data_aula = excluded.data_aula,
    horario_aula = excluded.horario_aula,
    aluno_nome = excluded.aluno_nome,
    aluno_nome_normalizado = excluded.aluno_nome_normalizado,
    aluno_telefone = coalesce(
      nullif(excluded.aluno_telefone, ''),
      r.aluno_telefone
    ),
    responsavel_nome = coalesce(
      excluded.responsavel_nome,
      r.responsavel_nome
    ),
    responsavel_telefone = coalesce(
      excluded.responsavel_telefone,
      r.responsavel_telefone
    ),
    professor_nome = coalesce(excluded.professor_nome, r.professor_nome),
    professor_id = coalesce(excluded.professor_id, r.professor_id),
    curso_nome = coalesce(excluded.curso_nome, r.curso_nome),
    curso_id = coalesce(excluded.curso_id, r.curso_id),
    presenca_emusys = excluded.presenca_emusys,
    situacao_operacional = excluded.situacao_operacional,
    lead_id = coalesce(excluded.lead_id, r.lead_id),
    aluno_id = coalesce(excluded.aluno_id, r.aluno_id),
    lead_experimental_id = coalesce(
      excluded.lead_experimental_id,
      r.lead_experimental_id
    ),
    payload = excluded.payload,
    emusys_lead_id = excluded.emusys_lead_id,
    emusys_aluno_id = excluded.emusys_aluno_id,
    snapshot_ativo = true,
    snapshot_execucao_id = p_execucao_id,
    snapshot_visto_em = v_agora,
    snapshot_inativado_em = null,
    updated_at = v_agora;

  update public.emusys_experimentais_raw r
  set
    snapshot_ativo = false,
    snapshot_inativado_em = v_agora,
    updated_at = v_agora
  where r.unidade_id = p_unidade_id
    and r.data_aula between p_data_inicio and p_data_fim
    and r.snapshot_ativo is true
    and not exists (
      select 1
      from pg_temp.snapshot_experimentais_lote l
      where l.unidade_id = r.unidade_id
        and l.emusys_aula_id = r.emusys_aula_id
        and l.participante_chave = r.participante_chave
    );

  get diagnostics v_inativadas = row_count;

  insert into public.emusys_experimentais_snapshot_execucoes (
    id,
    unidade_id,
    data_inicio,
    data_fim,
    status,
    linhas_recebidas,
    linhas_ativas,
    linhas_inativadas,
    iniciado_em,
    concluido_em
  ) values (
    p_execucao_id,
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    'completo',
    v_recebidas,
    v_recebidas,
    v_inativadas,
    v_agora,
    clock_timestamp()
  );

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'status', 'completo',
    'linhas_recebidas', v_recebidas,
    'linhas_ativas', v_recebidas,
    'linhas_inseridas', v_inseridas,
    'linhas_atualizadas', v_atualizadas,
    'linhas_inativadas', v_inativadas
  );
end;
$function$;

revoke all on function public.aplicar_snapshot_experimentais_emusys_v1(
  uuid,
  uuid,
  date,
  date,
  jsonb
) from public, anon, authenticated;
grant execute on function public.aplicar_snapshot_experimentais_emusys_v1(
  uuid,
  uuid,
  date,
  date,
  jsonb
) to service_role;

comment on function public.aplicar_snapshot_experimentais_emusys_v1(
  uuid,
  uuid,
  date,
  date,
  jsonb
) is
  'Aplica atomicamente um snapshot completo de experimentais por unidade e intervalo. Inativa ausentes sem apagar historico.';

create or replace function public.pode_gerar_relatorio_comercial_v1(
  p_unidade_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
begin
  if p_unidade_id is null
     or not exists (
       select 1
       from public.unidades u
       where u.id = p_unidade_id
     ) then
    return false;
  end if;

  select u.id, u.perfil, u.unidade_id
    into v_usuario_id, v_perfil, v_unidade_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and coalesce(u.ativo, true)
  limit 1;

  if v_usuario_id is null then
    return false;
  end if;

  if v_perfil = 'unidade' then
    return v_unidade_usuario is not null
      and v_unidade_usuario = p_unidade_id;
  end if;

  return public.usuario_tem_permissao(
    v_usuario_id,
    'comercial.ver',
    p_unidade_id
  );
end;
$function$;

revoke all on function public.pode_gerar_relatorio_comercial_v1(uuid)
  from public, anon;
grant execute on function public.pode_gerar_relatorio_comercial_v1(uuid)
  to authenticated;

comment on function public.pode_gerar_relatorio_comercial_v1(uuid) is
  'Guard booleano do relatorio comercial: perfil unidade somente na propria unidade; demais perfis exigem comercial.ver.';

create or replace function public.get_experimentais_emusys_operacional_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal',
  p_data date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with periodo as (
    select
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
          then coalesce(p_data, make_date(p_ano, p_mes, 1))
        else make_date(p_ano, p_mes, 1)
      end::date as data_inicio,
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
          then coalesce(p_data, make_date(p_ano, p_mes, 1)) + 1
        else (make_date(p_ano, p_mes, 1) + interval '1 month')::date
      end::date as data_fim_exclusivo,
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
          then coalesce(p_data, make_date(p_ano, p_mes, 1))
        else greatest(
          make_date(p_ano, p_mes, 1),
          coalesce(p_data, current_date)
        ) + 7
      end::date as data_cobertura_fim
  ),
  base as (
    select r.*
    from public.emusys_experimentais_raw r
    cross join periodo p
    where r.data_aula >= p.data_inicio
      and r.data_aula < p.data_fim_exclusivo
      and r.snapshot_ativo is true
      and (p_unidade_id is null or r.unidade_id = p_unidade_id)
  ),
  por_unidade as (
    select
      u.id as unidade_id,
      u.nome as unidade_nome,
      count(b.*)::integer as linhas_raw,
      count(b.*) filter (
        where b.situacao_operacional = 'presente'
      )::integer as presentes,
      count(b.*) filter (
        where b.situacao_operacional = 'matriculado'
      )::integer as matriculados,
      count(b.*) filter (
        where b.situacao_operacional in ('presente', 'matriculado')
      )::integer as realizadas_emusys,
      count(b.*) filter (
        where b.situacao_operacional = 'faltou'
      )::integer as faltas,
      count(b.*) filter (
        where b.situacao_operacional = 'cancelada'
      )::integer as canceladas,
      count(b.*) filter (where b.aluno_id is null)::integer as sem_aluno_id,
      count(b.*) filter (where b.lead_id is null)::integer as sem_lead_id
    from public.unidades u
    left join base b on b.unidade_id = u.id
    where p_unidade_id is null or u.id = p_unidade_id
    group by u.id, u.nome
  ),
  total as (
    select
      count(*)::integer as linhas_raw,
      count(*) filter (
        where situacao_operacional = 'presente'
      )::integer as presentes,
      count(*) filter (
        where situacao_operacional = 'matriculado'
      )::integer as matriculados,
      count(*) filter (
        where situacao_operacional in ('presente', 'matriculado')
      )::integer as realizadas_emusys,
      count(*) filter (
        where situacao_operacional = 'faltou'
      )::integer as faltas,
      count(*) filter (
        where situacao_operacional = 'cancelada'
      )::integer as canceladas,
      count(*) filter (where aluno_id is null)::integer as sem_aluno_id,
      count(*) filter (where lead_id is null)::integer as sem_lead_id
    from base
  ),
  ultima_execucao as (
    select e.*
    from public.emusys_experimentais_snapshot_execucoes e
    cross join periodo p
    where e.status = 'completo'
      and (p_unidade_id is null or e.unidade_id = p_unidade_id)
      and e.data_inicio <= p.data_inicio
      and e.data_fim >= p.data_cobertura_fim
    order by e.concluido_em desc, e.id desc
    limit 1
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'tipo', lower(coalesce(p_periodo, 'mensal')),
      'data', p_data
    ),
    'resumo', jsonb_build_object(
      'linhas_raw', total.linhas_raw,
      'presentes', total.presentes,
      'matriculados', total.matriculados,
      'realizadas_emusys', total.realizadas_emusys,
      'faltas', total.faltas,
      'canceladas', total.canceladas,
      'sem_aluno_id', total.sem_aluno_id,
      'sem_lead_id', total.sem_lead_id,
      'snapshot_atualizado_em', e.concluido_em,
      'snapshot_execucao_id', e.id,
      'snapshot_linhas_inativas', e.linhas_inativadas,
      'snapshot_status', e.status
    ),
    'por_unidade', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'unidade_id', unidade_id,
            'unidade_nome', unidade_nome,
            'linhas_raw', linhas_raw,
            'presentes', presentes,
            'matriculados', matriculados,
            'realizadas_emusys', realizadas_emusys,
            'faltas', faltas,
            'canceladas', canceladas,
            'sem_aluno_id', sem_aluno_id,
            'sem_lead_id', sem_lead_id
          )
          order by unidade_nome
        )
        from por_unidade
      ),
      '[]'::jsonb
    )
  )
  from total
  left join ultima_execucao e on true;
$function$;

revoke all on function public.get_experimentais_emusys_operacional_v1(
  uuid,
  integer,
  integer,
  text,
  date
) from public, anon;
grant execute on function public.get_experimentais_emusys_operacional_v1(
  uuid,
  integer,
  integer,
  text,
  date
) to authenticated, service_role;

comment on function public.get_experimentais_emusys_operacional_v1(
  uuid,
  integer,
  integer,
  text,
  date
) is
  'Resumo operacional SELECT-only do snapshot vigente de experimentais do Emusys, incluindo frescor da execucao completa.';
