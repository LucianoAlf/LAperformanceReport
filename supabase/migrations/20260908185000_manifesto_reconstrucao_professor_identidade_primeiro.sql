-- A primeira rodada de cada particao ainda calculava o hash de pessoa em todas
-- as linhas historicas da unidade. Sob carga, ate um lote pequeno podia vencer
-- o statement_timeout antes do primeiro commit.
--
-- Esta versao escolhe primeiro os poucos alunos pertencentes a particao e usa
-- indices para buscar somente o historico deles. Linhas sem identificador ficam
-- em um ramo explicito, preservando exatamente a regra de hash anterior.

create index if not exists idx_aula_alunos_historico_manifesto_emusys_cover
  on public.emusys_aula_alunos_historico_staging_v1 (
    unidade_id,
    emusys_aluno_id,
    id
  )
  include (aula_staging_id, aluno_id)
  where emusys_aluno_id is not null;

create index if not exists idx_aula_alunos_historico_manifesto_local_cover
  on public.emusys_aula_alunos_historico_staging_v1 (
    unidade_id,
    aluno_id,
    id
  )
  include (aula_staging_id)
  where emusys_aluno_id is null and aluno_id is not null;

create index if not exists idx_aula_alunos_historico_manifesto_sem_id_cover
  on public.emusys_aula_alunos_historico_staging_v1 (
    unidade_id,
    id
  )
  include (aula_staging_id)
  where emusys_aluno_id is null and aluno_id is null;

analyze public.emusys_aula_alunos_historico_staging_v1;

create or replace function public.preparar_manifesto_reconstrucao_professor_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_versao_reconstrucao text,
  p_execucao_backfill_id uuid,
  p_total_particoes integer,
  p_particao_indice integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_execucao public.emusys_historico_backfill_execucoes_v1%rowtype;
  v_total integer := 0;
  v_inseridos integer := 0;
  v_tamanho_lote constant integer := 250;
  v_ultimo_roster_id bigint := 0;
begin
  if p_data_fim < p_data_inicio then
    raise exception 'MANIFESTO_RECORTE_INVALIDO' using errcode = '22023';
  end if;
  if p_total_particoes < 2 or p_total_particoes > 128 then
    raise exception 'PARTICAO_TOTAL_INVALIDO' using errcode = '22023';
  end if;
  if p_particao_indice < 0 or p_particao_indice >= p_total_particoes then
    raise exception 'PARTICAO_INDICE_INVALIDO' using errcode = '22023';
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
      p_versao_reconstrucao || ':' || p_execucao_backfill_id::text || ':' ||
      p_total_particoes::text || ':' || p_particao_indice::text
    )
  );

  select coalesce(max(roster_staging_id), 0)
    into v_ultimo_roster_id
  from public.professor_periodos_reconstrucao_manifesto_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes
    and particao_indice = p_particao_indice;

  with identidades_emusys as materialized (
    select
      i.emusys_aluno_id,
      min(i.pessoa_chave) as pessoa_chave,
      min(i.aluno_id_canonico) as aluno_id
    from public.vw_aluno_identidade_unidade_canonica i
    where i.unidade_id = p_unidade_id
      and i.emusys_aluno_id is not null
    group by i.emusys_aluno_id
  ), emusys_ids as materialized (
    select distinct r.emusys_aluno_id
    from public.emusys_aula_alunos_historico_staging_v1 r
    where r.unidade_id = p_unidade_id
      and r.emusys_aluno_id is not null
  ), emusys_particao as materialized (
    select
      ids.emusys_aluno_id,
      identidade.aluno_id,
      coalesce(
        identidade.pessoa_chave,
        'emusys:' || ids.emusys_aluno_id::text
      ) as pessoa_chave
    from emusys_ids ids
    left join identidades_emusys identidade
      on identidade.emusys_aluno_id = ids.emusys_aluno_id
    where mod(
      (
        'x' || substr(
          md5(coalesce(
            identidade.pessoa_chave,
            'emusys:' || ids.emusys_aluno_id::text
          )),
          1,
          8
        )
      )::bit(32)::bigint,
      p_total_particoes
    )::integer = p_particao_indice
  ), identidades_locais as materialized (
    select
      i.aluno_id_canonico,
      min(i.pessoa_chave) as pessoa_chave
    from public.vw_aluno_identidade_unidade_canonica i
    where i.unidade_id = p_unidade_id
    group by i.aluno_id_canonico
  ), local_ids as materialized (
    select distinct r.aluno_id
    from public.emusys_aula_alunos_historico_staging_v1 r
    where r.unidade_id = p_unidade_id
      and r.emusys_aluno_id is null
      and r.aluno_id is not null
  ), local_particao as materialized (
    select
      ids.aluno_id,
      coalesce(
        identidade.pessoa_chave,
        'local:' || ids.aluno_id::text
      ) as pessoa_chave
    from local_ids ids
    left join identidades_locais identidade
      on identidade.aluno_id_canonico = ids.aluno_id
    where mod(
      (
        'x' || substr(
          md5(coalesce(
            identidade.pessoa_chave,
            'local:' || ids.aluno_id::text
          )),
          1,
          8
        )
      )::bit(32)::bigint,
      p_total_particoes
    )::integer = p_particao_indice
  ), candidatos as (
    select
      r.id as roster_staging_id,
      r.aula_staging_id,
      p.pessoa_chave,
      p.aluno_id
    from emusys_particao p
    join public.emusys_aula_alunos_historico_staging_v1 r
      on r.unidade_id = p_unidade_id
     and r.emusys_aluno_id = p.emusys_aluno_id
    join public.emusys_aulas_historico_staging_v1 a
      on a.unidade_id = r.unidade_id
     and a.id = r.aula_staging_id
    where r.id > v_ultimo_roster_id
      and a.data_hora_inicio >= (
        p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
      )
      and a.data_hora_inicio < (
        (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
      )

    union all

    select
      r.id as roster_staging_id,
      r.aula_staging_id,
      p.pessoa_chave,
      p.aluno_id
    from local_particao p
    join public.emusys_aula_alunos_historico_staging_v1 r
      on r.unidade_id = p_unidade_id
     and r.emusys_aluno_id is null
     and r.aluno_id = p.aluno_id
    join public.emusys_aulas_historico_staging_v1 a
      on a.unidade_id = r.unidade_id
     and a.id = r.aula_staging_id
    where r.id > v_ultimo_roster_id
      and a.data_hora_inicio >= (
        p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
      )
      and a.data_hora_inicio < (
        (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
      )

    union all

    select
      r.id as roster_staging_id,
      r.aula_staging_id,
      null::text as pessoa_chave,
      null::integer as aluno_id
    from public.emusys_aula_alunos_historico_staging_v1 r
    join public.emusys_aulas_historico_staging_v1 a
      on a.unidade_id = r.unidade_id
     and a.id = r.aula_staging_id
    where r.unidade_id = p_unidade_id
      and r.id > v_ultimo_roster_id
      and r.emusys_aluno_id is null
      and r.aluno_id is null
      and mod(
        (
          'x' || substr(md5('sem-identidade-roster:' || r.id::text), 1, 8)
        )::bit(32)::bigint,
        p_total_particoes
      )::integer = p_particao_indice
      and a.data_hora_inicio >= (
        p_data_inicio::timestamp at time zone 'America/Sao_Paulo'
      )
      and a.data_hora_inicio < (
        (p_data_fim + 1)::timestamp at time zone 'America/Sao_Paulo'
      )
  ), lote as (
    select candidatos.*
    from candidatos
    where not exists (
      select 1
      from public.professor_periodos_reconstrucao_manifesto_v1 existente
      where existente.unidade_id = p_unidade_id
        and existente.data_inicio = p_data_inicio
        and existente.data_fim = p_data_fim
        and existente.versao_reconstrucao = p_versao_reconstrucao
        and existente.execucao_backfill_id = p_execucao_backfill_id
        and existente.total_particoes = p_total_particoes
        and existente.roster_staging_id = candidatos.roster_staging_id
    )
    order by candidatos.roster_staging_id
    limit v_tamanho_lote
  )
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
    p_particao_indice,
    lote.roster_staging_id,
    lote.aula_staging_id,
    lote.pessoa_chave,
    lote.aluno_id
  from lote
  on conflict (
    unidade_id,
    data_inicio,
    data_fim,
    versao_reconstrucao,
    execucao_backfill_id,
    total_particoes,
    roster_staging_id
  ) do nothing;

  get diagnostics v_inseridos = row_count;

  select count(*)::integer
    into v_total
  from public.professor_periodos_reconstrucao_manifesto_v1
  where unidade_id = p_unidade_id
    and data_inicio = p_data_inicio
    and data_fim = p_data_fim
    and versao_reconstrucao = p_versao_reconstrucao
    and execucao_backfill_id = p_execucao_backfill_id
    and total_particoes = p_total_particoes
    and particao_indice = p_particao_indice;

  return jsonb_build_object(
    'status', case
      when v_inseridos < v_tamanho_lote then 'concluido'
      else 'em_andamento'
    end,
    'idempotente', v_inseridos = 0,
    'particao_indice', p_particao_indice,
    'eventos_inseridos_lote', v_inseridos,
    'tamanho_lote', v_tamanho_lote,
    'cursor_roster_anterior', v_ultimo_roster_id,
    'total_eventos_particao', v_total,
    'total_particoes', p_total_particoes
  );
end;
$function$;

comment on function public.preparar_manifesto_reconstrucao_professor_v2(
  uuid, date, date, text, uuid, integer, integer
) is
  'Prepara a particao por identidade primeiro, em lotes retomaveis de 250 linhas.';

revoke all on function public.preparar_manifesto_reconstrucao_professor_v2(
  uuid, date, date, text, uuid, integer, integer
) from public, anon, authenticated;

grant execute on function public.preparar_manifesto_reconstrucao_professor_v2(
  uuid, date, date, text, uuid, integer, integer
) to service_role;
