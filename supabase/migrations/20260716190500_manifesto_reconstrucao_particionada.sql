-- Fotografia privada da distribuicao por pessoa para evitar recalcular a
-- identidade canonica em cada pagina de cada particao.

create table public.professor_periodos_reconstrucao_manifesto_v1 (
  id bigint generated always as identity primary key,
  unidade_id uuid not null references public.unidades(id),
  data_inicio date not null,
  data_fim date not null,
  versao_reconstrucao text not null,
  execucao_backfill_id uuid not null
    references public.emusys_historico_backfill_execucoes_v1(id) on delete restrict,
  total_particoes integer not null check (total_particoes between 2 and 128),
  particao_indice integer not null check (particao_indice >= 0),
  roster_staging_id bigint not null
    references public.emusys_aula_alunos_historico_staging_v1(id) on delete restrict,
  aula_staging_id bigint not null
    references public.emusys_aulas_historico_staging_v1(id) on delete restrict,
  pessoa_chave text,
  aluno_id integer references public.alunos(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    execucao_backfill_id,
    total_particoes,
    roster_staging_id
  ),
  check (data_fim >= data_inicio),
  check (particao_indice < total_particoes)
);

comment on table public.professor_periodos_reconstrucao_manifesto_v1 is
  'Manifesto privado e imutavel por versao do recorte. Calcula uma vez a particao da pessoa canonica.';

create index idx_professor_periodos_manifesto_particao
  on public.professor_periodos_reconstrucao_manifesto_v1 (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    execucao_backfill_id,
    total_particoes,
    particao_indice,
    roster_staging_id
  );

create or replace function public.preparar_manifesto_reconstrucao_professor_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_versao_reconstrucao text,
  p_execucao_backfill_id uuid,
  p_total_particoes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_execucao public.emusys_historico_backfill_execucoes_v1%rowtype;
  v_total integer := 0;
  v_particoes integer := 0;
  v_existente boolean := false;
begin
  if p_data_fim < p_data_inicio then
    raise exception 'MANIFESTO_RECORTE_INVALIDO' using errcode = '22023';
  end if;
  if p_total_particoes < 2 or p_total_particoes > 128 then
    raise exception 'PARTICAO_TOTAL_INVALIDO' using errcode = '22023';
  end if;
  if nullif(btrim(p_versao_reconstrucao), '') is null then
    raise exception 'MANIFESTO_VERSAO_OBRIGATORIA' using errcode = '22023';
  end if;

  select * into v_execucao
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
    raise exception 'MANIFESTO_BACKFILL_INCOMPATIVEL' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      p_unidade_id::text || ':' || p_data_inicio::text || ':' || p_data_fim::text || ':' ||
      p_versao_reconstrucao || ':' || p_execucao_backfill_id::text || ':' || p_total_particoes::text
    )
  );

  select count(*)::integer, count(distinct particao_indice)::integer
    into v_total, v_particoes
  from public.professor_periodos_reconstrucao_manifesto_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes;

  if v_total > 0 then
    return jsonb_build_object(
      'status', 'concluido',
      'idempotente', true,
      'total_eventos', v_total,
      'particoes_com_dados', v_particoes,
      'total_particoes', p_total_particoes
    );
  end if;

  insert into public.professor_periodos_reconstrucao_manifesto_v1 (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    execucao_backfill_id,
    total_particoes,
    particao_indice,
    roster_staging_id,
    aula_staging_id,
    pessoa_chave,
    aluno_id
  )
  select
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_versao_reconstrucao,
    p_execucao_backfill_id,
    p_total_particoes,
    mod(
      ('x' || substr(md5(base.particao_pessoa_chave), 1, 8))::bit(32)::bigint,
      p_total_particoes
    )::integer,
    base.roster_staging_id,
    base.aula_staging_id,
    base.pessoa_chave,
    base.aluno_id
  from (
    select
      r.id as roster_staging_id,
      a.id as aula_staging_id,
      coalesce(i_emusys.aluno_id_canonico, i_local.aluno_id_canonico, r.aluno_id) as aluno_id,
      coalesce(
        i_emusys.pessoa_chave,
        i_local.pessoa_chave,
        case
          when r.emusys_aluno_id is not null then 'emusys:' || r.emusys_aluno_id::text
          when r.aluno_id is not null then 'local:' || r.aluno_id::text
          else null
        end
      ) as pessoa_chave,
      coalesce(
        i_emusys.pessoa_chave,
        i_local.pessoa_chave,
        case
          when r.emusys_aluno_id is not null then 'emusys:' || r.emusys_aluno_id::text
          when r.aluno_id is not null then 'local:' || r.aluno_id::text
          else 'sem-identidade-roster:' || r.id::text
        end
      ) as particao_pessoa_chave
    from public.emusys_aulas_historico_staging_v1 a
    join public.emusys_aula_alunos_historico_staging_v1 r
      on r.aula_staging_id = a.id
     and r.unidade_id = a.unidade_id
    left join public.vw_aluno_identidade_unidade_canonica i_emusys
      on r.emusys_aluno_id is not null
     and i_emusys.unidade_id = r.unidade_id
     and i_emusys.emusys_aluno_id = r.emusys_aluno_id
    left join public.vw_aluno_identidade_unidade_canonica i_local
      on r.emusys_aluno_id is null
     and r.aluno_id is not null
     and i_local.unidade_id = r.unidade_id
     and i_local.aluno_id_canonico = r.aluno_id
    where a.unidade_id = p_unidade_id
      and a.data_hora_inicio >= (
        p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
      )
      and a.data_hora_inicio < (
        (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
      )
  ) base;

  select count(*)::integer, count(distinct particao_indice)::integer
    into v_total, v_particoes
  from public.professor_periodos_reconstrucao_manifesto_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes;

  return jsonb_build_object(
    'status', 'concluido',
    'idempotente', v_existente,
    'total_eventos', v_total,
    'particoes_com_dados', v_particoes,
    'total_particoes', p_total_particoes
  );
end;
$$;

drop function public.listar_eventos_staging_particao_professor_v1(
  uuid, date, date, integer, integer
);

create function public.listar_eventos_staging_particao_professor_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_versao_reconstrucao text,
  p_execucao_backfill_id uuid,
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
  if p_particao_indice < 0 or p_particao_indice >= p_total_particoes then
    raise exception 'PARTICAO_INDICE_INVALIDO' using errcode = '22023';
  end if;

  return query
  select
    a.id,
    a.unidade_id,
    a.emusys_aula_id,
    a.data_hora_inicio,
    a.cancelada,
    a.categoria,
    a.sem_acompanhamento,
    a.emusys_disciplina_id,
    a.emusys_professor_id,
    a.payload_hash,
    r.emusys_aluno_id,
    m.aluno_id,
    m.pessoa_chave,
    r.emusys_matricula_id,
    r.emusys_matricula_disciplina_id,
    r.linha_hash
  from public.professor_periodos_reconstrucao_manifesto_v1 m
  join public.emusys_aula_alunos_historico_staging_v1 r
    on r.id = m.roster_staging_id
  join public.emusys_aulas_historico_staging_v1 a
    on a.id = m.aula_staging_id
  where m.unidade_id = p_unidade_id
    and m.data_inicio = p_data_inicio
    and m.data_fim = p_data_fim
    and m.versao_reconstrucao = p_versao_reconstrucao
    and m.execucao_backfill_id = p_execucao_backfill_id
    and m.total_particoes = p_total_particoes
    and m.particao_indice = p_particao_indice
  order by a.data_hora_inicio, a.emusys_aula_id, r.id;
end;
$$;

alter table public.professor_periodos_reconstrucao_manifesto_v1 enable row level security;

revoke all on public.professor_periodos_reconstrucao_manifesto_v1
  from public, anon, authenticated;
revoke all on function public.preparar_manifesto_reconstrucao_professor_v1(
  uuid, date, date, text, uuid, integer
) from public, anon, authenticated;
revoke all on function public.listar_eventos_staging_particao_professor_v1(
  uuid, date, date, text, uuid, integer, integer
) from public, anon, authenticated;

grant select, insert, update, delete
  on public.professor_periodos_reconstrucao_manifesto_v1 to service_role;
grant execute on function public.preparar_manifesto_reconstrucao_professor_v1(
  uuid, date, date, text, uuid, integer
) to service_role;
grant execute on function public.listar_eventos_staging_particao_professor_v1(
  uuid, date, date, text, uuid, integer, integer
) to service_role;
