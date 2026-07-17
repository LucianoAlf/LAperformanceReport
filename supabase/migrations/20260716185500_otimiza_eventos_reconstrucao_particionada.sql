-- Evita executar a view de identidade uma vez por evento do roster.
-- A semantica permanece a mesma; a resolucao passa a ser feita em joins de conjunto.

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
      ) as particao_pessoa_chave,
      r.emusys_matricula_id,
      r.emusys_matricula_disciplina_id,
      r.linha_hash
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

revoke all on function public.listar_eventos_staging_particao_professor_v1(
  uuid, date, date, integer, integer
) from public, anon, authenticated;
grant execute on function public.listar_eventos_staging_particao_professor_v1(
  uuid, date, date, integer, integer
) to service_role;
