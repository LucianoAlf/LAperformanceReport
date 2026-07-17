-- Health Score Professor V3 - reconstrucao historica particionada em sombra.
-- A particao e por pessoa canonica, preservando juntas todas as matriculas e
-- disciplinas da mesma pessoa. Nenhum consumidor produtivo recebe acesso.

create table public.professor_periodos_reconstrucao_particoes_v1 (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  data_inicio date not null,
  data_fim date not null,
  versao_reconstrucao text not null,
  execucao_backfill_id uuid not null
    references public.emusys_historico_backfill_execucoes_v1(id) on delete restrict,
  total_particoes integer not null check (total_particoes between 2 and 128),
  particao_indice integer not null check (particao_indice >= 0),
  entrada_hash text not null check (entrada_hash ~ '^[0-9a-f]{64}$'),
  total_eventos integer not null default 0 check (total_eventos >= 0),
  total_particoes_logicas integer not null default 0
    check (total_particoes_logicas >= 0),
  total_periodos integer not null default 0 check (total_periodos >= 0),
  total_diagnosticos integer not null default 0 check (total_diagnosticos >= 0),
  periodos jsonb not null default '[]'::jsonb,
  diagnosticos jsonb not null default '[]'::jsonb,
  parametros jsonb not null default '{}'::jsonb,
  status text not null default 'concluido' check (status = 'concluido'),
  concluido_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    execucao_backfill_id,
    total_particoes,
    particao_indice
  ),
  check (data_fim >= data_inicio),
  check (particao_indice < total_particoes),
  check (jsonb_typeof(periodos) = 'array'),
  check (jsonb_typeof(diagnosticos) = 'array'),
  check (jsonb_typeof(parametros) = 'object')
);

comment on table public.professor_periodos_reconstrucao_particoes_v1 is
  'Resultados intermediarios, idempotentes e privados da reconstrucao V3. '
  'O detalhe diagnostico fica aqui; a camada final so nasce apos todas as particoes.';

create index idx_professor_periodos_reconstrucao_particoes_escopo
  on public.professor_periodos_reconstrucao_particoes_v1 (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    execucao_backfill_id,
    total_particoes,
    particao_indice
  );

create or replace function public.listar_eventos_staging_particao_professor_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_total_particoes integer,
  p_particao_indice integer
)
returns table (
  aula_staging_id bigint,
  unidade_id uuid,
  emusys_aula_id bigint,
  data_hora_inicio timestamptz,
  cancelada boolean,
  categoria text,
  sem_acompanhamento boolean,
  emusys_disciplina_id bigint,
  emusys_professor_id bigint,
  payload_hash text,
  emusys_aluno_id bigint,
  aluno_id integer,
  pessoa_chave text,
  emusys_matricula_id bigint,
  emusys_matricula_disciplina_id bigint,
  linha_hash text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_data_fim < p_data_inicio then
    raise exception 'PARTICAO_RECORTE_INVALIDO' using errcode = '22023';
  end if;
  if p_total_particoes < 2 or p_total_particoes > 128 then
    raise exception 'PARTICAO_TOTAL_INVALIDO' using errcode = '22023';
  end if;
  if p_particao_indice < 0 or p_particao_indice >= p_total_particoes then
    raise exception 'PARTICAO_INDICE_INVALIDO' using errcode = '22023';
  end if;

  return query
  with base as (
    select
      a.id as aula_staging_id,
      a.unidade_id,
      a.emusys_aula_id,
      a.data_hora_inicio,
      a.cancelada,
      a.categoria,
      a.sem_acompanhamento,
      a.emusys_disciplina_id,
      a.emusys_professor_id,
      a.payload_hash,
      r.id as roster_staging_id,
      r.emusys_aluno_id,
      coalesce(i.aluno_id_canonico, r.aluno_id) as aluno_id,
      coalesce(
        i.pessoa_chave,
        case
          when r.emusys_aluno_id is not null then 'emusys:' || r.emusys_aluno_id::text
          when r.aluno_id is not null then 'local:' || r.aluno_id::text
          else null
        end
      ) as pessoa_chave,
      coalesce(
        i.pessoa_chave,
        case
          when r.emusys_aluno_id is not null then 'emusys:' || r.emusys_aluno_id::text
          when r.aluno_id is not null then 'local:' || r.aluno_id::text
          else 'sem-identidade-roster:' || r.id::text
        end
      ) as particao_pessoa_chave,
      r.emusys_matricula_id,
      r.emusys_matricula_disciplina_id,
      r.linha_hash
    from public.emusys_aulas_historico_staging_v1 a
    join public.emusys_aula_alunos_historico_staging_v1 r
      on r.aula_staging_id = a.id
     and r.unidade_id = a.unidade_id
    left join lateral (
      select
        identidade.pessoa_chave,
        identidade.aluno_id_canonico
      from public.vw_aluno_identidade_unidade_canonica identidade
      where identidade.unidade_id = r.unidade_id
        and (
          (
            r.emusys_aluno_id is not null
            and identidade.emusys_aluno_id = r.emusys_aluno_id
          )
          or (
            r.emusys_aluno_id is null
            and r.aluno_id is not null
            and identidade.aluno_id_canonico = r.aluno_id
          )
        )
      order by
        (identidade.emusys_aluno_id is not distinct from r.emusys_aluno_id) desc,
        identidade.aluno_id_canonico
      limit 1
    ) i on true
    where a.unidade_id = p_unidade_id
      and a.data_hora_inicio >= (
        p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
      )
      and a.data_hora_inicio < (
        (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
      )
  ), particionada as (
    select
      base.*,
      mod(
        ('x' || substr(md5(base.particao_pessoa_chave), 1, 8))::bit(32)::bigint,
        p_total_particoes
      )::integer as particao_calculada
    from base
  )
  select
    p.aula_staging_id,
    p.unidade_id,
    p.emusys_aula_id,
    p.data_hora_inicio,
    p.cancelada,
    p.categoria,
    p.sem_acompanhamento,
    p.emusys_disciplina_id,
    p.emusys_professor_id,
    p.payload_hash,
    p.emusys_aluno_id,
    p.aluno_id,
    p.pessoa_chave,
    p.emusys_matricula_id,
    p.emusys_matricula_disciplina_id,
    p.linha_hash
  from particionada p
  where p.particao_calculada = p_particao_indice
  order by p.data_hora_inicio, p.emusys_aula_id, p.roster_staging_id;
end;
$$;

comment on function public.listar_eventos_staging_particao_professor_v1(
  uuid, date, date, integer, integer
) is
  'Leitura privada e paginavel do staging. A pessoa canonica inteira permanece na mesma particao.';

create or replace function public.registrar_particao_periodos_professor_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_versao_reconstrucao text,
  p_execucao_backfill_id uuid,
  p_total_particoes integer,
  p_particao_indice integer,
  p_entrada_hash text,
  p_periodos jsonb,
  p_diagnosticos jsonb default '[]'::jsonb,
  p_total_eventos integer default 0,
  p_total_particoes_logicas integer default 0,
  p_parametros jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execucao public.emusys_historico_backfill_execucoes_v1%rowtype;
  v_particao public.professor_periodos_reconstrucao_particoes_v1%rowtype;
begin
  if p_data_fim < p_data_inicio then
    raise exception 'PARTICAO_RECORTE_INVALIDO' using errcode = '22023';
  end if;
  if p_total_particoes < 2 or p_total_particoes > 128 then
    raise exception 'PARTICAO_TOTAL_INVALIDO' using errcode = '22023';
  end if;
  if p_particao_indice < 0 or p_particao_indice >= p_total_particoes then
    raise exception 'PARTICAO_INDICE_INVALIDO' using errcode = '22023';
  end if;
  if lower(coalesce(p_entrada_hash, '')) !~ '^[0-9a-f]{64}$' then
    raise exception 'PARTICAO_ENTRADA_HASH_INVALIDO' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_periodos, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_diagnosticos, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_parametros, '{}'::jsonb)) <> 'object' then
    raise exception 'PARTICAO_PAYLOAD_INVALIDO' using errcode = '22023';
  end if;

  select *
    into v_execucao
    from public.emusys_historico_backfill_execucoes_v1
   where id = p_execucao_backfill_id;

  if v_execucao.id is null
     or v_execucao.unidade_id <> p_unidade_id
     or v_execucao.data_inicio > p_data_inicio
     or v_execucao.data_fim < p_data_fim
     or not (
       v_execucao.status = 'concluido'
       or (
         v_execucao.status = 'pausado'
         and v_execucao.cursor_atual is null
         and v_execucao.janela_inicio_atual > p_data_fim
       )
     ) then
    raise exception 'PARTICAO_BACKFILL_INCOMPATIVEL' using errcode = '22023';
  end if;

  insert into public.professor_periodos_reconstrucao_particoes_v1 (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    execucao_backfill_id,
    total_particoes,
    particao_indice,
    entrada_hash,
    total_eventos,
    total_particoes_logicas,
    total_periodos,
    total_diagnosticos,
    periodos,
    diagnosticos,
    parametros,
    status,
    concluido_em
  ) values (
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_versao_reconstrucao,
    p_execucao_backfill_id,
    p_total_particoes,
    p_particao_indice,
    lower(p_entrada_hash),
    greatest(coalesce(p_total_eventos, 0), 0),
    greatest(coalesce(p_total_particoes_logicas, 0), 0),
    jsonb_array_length(coalesce(p_periodos, '[]'::jsonb)),
    jsonb_array_length(coalesce(p_diagnosticos, '[]'::jsonb)),
    coalesce(p_periodos, '[]'::jsonb),
    coalesce(p_diagnosticos, '[]'::jsonb),
    coalesce(p_parametros, '{}'::jsonb),
    'concluido',
    now()
  )
  on conflict (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    execucao_backfill_id,
    total_particoes,
    particao_indice
  ) do update
    set entrada_hash = excluded.entrada_hash,
        total_eventos = excluded.total_eventos,
        total_particoes_logicas = excluded.total_particoes_logicas,
        total_periodos = excluded.total_periodos,
        total_diagnosticos = excluded.total_diagnosticos,
        periodos = excluded.periodos,
        diagnosticos = excluded.diagnosticos,
        parametros = excluded.parametros,
        status = 'concluido',
        concluido_em = now(),
        updated_at = now()
  returning * into v_particao;

  return jsonb_build_object(
    'particao_id', v_particao.id,
    'status', v_particao.status,
    'particao_indice', v_particao.particao_indice,
    'total_particoes', v_particao.total_particoes,
    'total_eventos', v_particao.total_eventos,
    'total_periodos', v_particao.total_periodos,
    'total_diagnosticos', v_particao.total_diagnosticos
  );
end;
$$;

create or replace function public.finalizar_reconstrucao_particionada_professor_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_versao_reconstrucao text,
  p_execucao_backfill_id uuid,
  p_total_particoes integer,
  p_inicio_completo boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_particoes_concluidas integer := 0;
  v_total_eventos integer := 0;
  v_total_diagnosticos integer := 0;
  v_entrada_hash text;
  v_periodos jsonb := '[]'::jsonb;
  v_diagnosticos_resumo jsonb := '[]'::jsonb;
  v_resultado jsonb;
  v_reconstrucao_id uuid;
begin
  if p_total_particoes < 2 or p_total_particoes > 128 then
    raise exception 'PARTICAO_TOTAL_INVALIDO' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      p_unidade_id::text || ':' || p_data_inicio::text || ':' || p_data_fim::text || ':' ||
      p_versao_reconstrucao || ':' || p_execucao_backfill_id::text || ':' || p_total_particoes::text
    )
  );

  select
    count(distinct particao_indice)::integer,
    coalesce(sum(total_eventos), 0)::integer,
    coalesce(sum(total_diagnosticos), 0)::integer
  into v_particoes_concluidas, v_total_eventos, v_total_diagnosticos
  from public.professor_periodos_reconstrucao_particoes_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes
    and status = 'concluido';

  if v_particoes_concluidas < p_total_particoes then
    return jsonb_build_object(
      'status', 'aguardando_particoes',
      'particoes_concluidas', v_particoes_concluidas,
      'total_particoes', p_total_particoes
    );
  end if;

  select encode(
    extensions.digest(
      convert_to(string_agg(entrada_hash, '' order by particao_indice), 'UTF8'),
      'sha256'::text
    ),
    'hex'
  )
  into v_entrada_hash
  from public.professor_periodos_reconstrucao_particoes_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes;

  select coalesce(
    jsonb_agg(
      (elemento.value - 'entrada_hash') || jsonb_build_object('entrada_hash', v_entrada_hash)
      order by particao.particao_indice, elemento.ordinalidade
    ),
    '[]'::jsonb
  )
  into v_periodos
  from public.professor_periodos_reconstrucao_particoes_v1 particao
  cross join lateral jsonb_array_elements(particao.periodos)
    with ordinality as elemento(value, ordinalidade)
  where particao.unidade_id = p_unidade_id
    and particao.data_inicio = p_data_inicio
    and particao.data_fim = p_data_fim
    and particao.versao_reconstrucao = p_versao_reconstrucao
    and particao.execucao_backfill_id = p_execucao_backfill_id
    and particao.total_particoes = p_total_particoes;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'particao_indice', particao_indice,
        'entrada_hash', entrada_hash,
        'total_eventos', total_eventos,
        'total_periodos', total_periodos,
        'total_diagnosticos', total_diagnosticos
      ) order by particao_indice
    ),
    '[]'::jsonb
  )
  into v_diagnosticos_resumo
  from public.professor_periodos_reconstrucao_particoes_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes;

  v_resultado := public.materializar_periodos_professor_v1(
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_versao_reconstrucao,
    v_entrada_hash,
    v_periodos,
    v_diagnosticos_resumo,
    p_execucao_backfill_id,
    v_total_eventos,
    jsonb_build_object(
      'inicio_completo', coalesce(p_inicio_completo, false),
      'processamento_particionado', true,
      'total_particoes_execucao', p_total_particoes,
      'diagnosticos_detalhados_em', 'professor_periodos_reconstrucao_particoes_v1',
      'identidade_particao', 'pessoa_chave_canonica',
      'identidade_professor', 'professores_unidades.emusys_id+unidade_id',
      'identidade_aluno', 'vw_aluno_identidade_unidade_canonica'
    )
  );

  v_reconstrucao_id := nullif(v_resultado->>'reconstrucao_id', '')::uuid;
  if v_reconstrucao_id is not null then
    update public.professor_periodos_reconstrucoes_v1
       set total_diagnosticos = v_total_diagnosticos,
           updated_at = now()
     where id = v_reconstrucao_id;
  end if;

  return v_resultado || jsonb_build_object(
    'processamento_particionado', true,
    'particoes_concluidas', v_particoes_concluidas,
    'total_particoes_execucao', p_total_particoes,
    'total_eventos', v_total_eventos,
    'total_diagnosticos_detalhados', v_total_diagnosticos,
    'entrada_hash_agregada', v_entrada_hash
  );
end;
$$;

comment on function public.registrar_particao_periodos_professor_v1(
  uuid, date, date, text, uuid, integer, integer, text, jsonb, jsonb, integer, integer, jsonb
) is 'Registra uma particao concluida da reconstrucao V3 sem publicar periodos parciais.';

comment on function public.finalizar_reconstrucao_particionada_professor_v1(
  uuid, date, date, text, uuid, integer, boolean
) is 'Materializa atomicamente a reconstrucao V3 apenas quando todas as particoes por pessoa concluirem.';

alter table public.professor_periodos_reconstrucao_particoes_v1 enable row level security;

revoke all on public.professor_periodos_reconstrucao_particoes_v1
  from public, anon, authenticated;
revoke all on function public.listar_eventos_staging_particao_professor_v1(
  uuid, date, date, integer, integer
) from public, anon, authenticated;
revoke all on function public.registrar_particao_periodos_professor_v1(
  uuid, date, date, text, uuid, integer, integer, text, jsonb, jsonb, integer, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.finalizar_reconstrucao_particionada_professor_v1(
  uuid, date, date, text, uuid, integer, boolean
) from public, anon, authenticated;

grant select, insert, update, delete
  on public.professor_periodos_reconstrucao_particoes_v1 to service_role;
grant execute on function public.listar_eventos_staging_particao_professor_v1(
  uuid, date, date, integer, integer
) to service_role;
grant execute on function public.registrar_particao_periodos_professor_v1(
  uuid, date, date, text, uuid, integer, integer, text, jsonb, jsonb, integer, integer, jsonb
) to service_role;
grant execute on function public.finalizar_reconstrucao_particionada_professor_v1(
  uuid, date, date, text, uuid, integer, boolean
) to service_role;

do $$
declare
  v_role text;
begin
  foreach v_role in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on public.professor_periodos_reconstrucao_particoes_v1 from %I',
        v_role
      );
      execute format(
        'revoke all on function public.listar_eventos_staging_particao_professor_v1(uuid,date,date,integer,integer) from %I',
        v_role
      );
      execute format(
        'revoke all on function public.registrar_particao_periodos_professor_v1(uuid,date,date,text,uuid,integer,integer,text,jsonb,jsonb,integer,integer,jsonb) from %I',
        v_role
      );
      execute format(
        'revoke all on function public.finalizar_reconstrucao_particionada_professor_v1(uuid,date,date,text,uuid,integer,boolean) from %I',
        v_role
      );
    end if;
  end loop;
end;
$$;
