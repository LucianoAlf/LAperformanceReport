-- O manifesto historico era montado inteiro (2018 -> hoje) na primeira
-- particao. A insercao ultrapassava o statement_timeout do PostgREST e o
-- orquestrador repetia a mesma tentativa nas tres unidades a cada rodada.
--
-- Esta RPC preserva a mesma chave e a mesma regra de distribuicao, mas grava
-- somente a particao que a Edge vai consumir naquela chamada. Ao final das 32
-- chamadas, o manifesto resultante e identico ao integral.

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

  -- Serializa somente a mesma unidade/recorte/particao. Particoes e unidades
  -- diferentes continuam independentes, sem duplicar a mesma fatia.
  perform pg_advisory_xact_lock(
    hashtext(
      p_unidade_id::text || ':' || p_data_inicio::text || ':' || p_data_fim::text || ':' ||
      p_versao_reconstrucao || ':' || p_execucao_backfill_id::text || ':' ||
      p_total_particoes::text || ':' || p_particao_indice::text
    )
  );

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

  if v_total > 0 then
    return jsonb_build_object(
      'status', 'concluido',
      'idempotente', true,
      'particao_indice', p_particao_indice,
      'total_eventos_particao', v_total,
      'total_particoes', p_total_particoes
    );
  end if;

  with identidades as materialized (
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
  ), particionadas as (
    select
      identidades.*,
      mod(
        ('x' || substr(md5(particao_pessoa_chave), 1, 8))::bit(32)::bigint,
        p_total_particoes
      )::integer as particao_indice
    from identidades
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
    particionadas.particao_indice,
    particionadas.roster_staging_id,
    particionadas.aula_staging_id,
    particionadas.pessoa_chave,
    particionadas.aluno_id
  from particionadas
  where particionadas.particao_indice = p_particao_indice
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
    'status', 'concluido',
    'idempotente', v_inseridos = 0,
    'particao_indice', p_particao_indice,
    'eventos_inseridos', v_inseridos,
    'total_eventos_particao', v_total,
    'total_particoes', p_total_particoes
  );
end;
$function$;

comment on function public.preparar_manifesto_reconstrucao_professor_v2(
  uuid, date, date, text, uuid, integer, integer
) is
  'Prepara somente uma particao do manifesto historico, preservando a distribuicao e a chave do contrato V1.';

revoke all on function public.preparar_manifesto_reconstrucao_professor_v2(
  uuid, date, date, text, uuid, integer, integer
) from public, anon, authenticated;

grant execute on function public.preparar_manifesto_reconstrucao_professor_v2(
  uuid, date, date, text, uuid, integer, integer
) to service_role;
