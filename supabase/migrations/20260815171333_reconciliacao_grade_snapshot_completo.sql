-- Reconciliação de grade por fotografia COMPLETA do Emusys.
--
-- A ausência de uma linha em GET /aulas só é significativa depois de a Edge
-- paginar a janela inteira. Esta função não recebe payload bruto nem nomes: a
-- fotografia já vem agrupada por emusys_id e aluno_chave.
--
-- Grãos independentes:
--   (a) aula ausente da fotografia -> soft-cancel da aula local;
--   (b) participante ausente de aula viva -> remove somente o vínculo.
--
-- Nenhum dos dois caminhos apaga aluno_presenca, justificativa ou retificação.
-- Evidência que fecha a chamada bloqueia a alteração automática.

create or replace function public.reconciliar_grade_snapshot_emusys_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_snapshot_aulas integer := 0;
  v_detalhe jsonb := '[]'::jsonb;
  v_aulas_cancelar integer[] := array[]::integer[];
  v_vinculos_remover bigint[] := array[]::bigint[];
  v_aulas_canceladas_aplicadas integer := 0;
  v_vinculos_removidos_aplicados integer := 0;
begin
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'janela_ou_unidade_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  -- Esta rotina é proteção operacional de hoje em diante. O webhook individual
  -- v2 continua responsável pela pequena janela de ontem, evitando reescrever
  -- história antiga com uma fotografia corrente.
  if p_data_inicio < v_hoje or p_data_fim > v_hoje + 60 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'janela_fora_do_limite_operacional',
      'hoje', v_hoje,
      'alteracoes_aplicadas', 0
    );
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) = 0 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_vazia_ou_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  -- Falhar fechado em vez de inferir que uma forma nova/incompleta do provedor
  -- significa que toda a grade deixou de existir.
  if exists (
    select 1
    from jsonb_array_elements(p_snapshot) as item(valor)
    where jsonb_typeof(item.valor) <> 'object'
       or coalesce(item.valor ->> 'emusys_id', '') !~ '^[1-9][0-9]*$'
       or jsonb_typeof(item.valor -> 'aluno_chaves') <> 'array'
  ) then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_com_estrutura_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  select count(distinct (item.valor ->> 'emusys_id')::integer)
    into v_snapshot_aulas
  from jsonb_array_elements(p_snapshot) as item(valor);

  if v_snapshot_aulas = 0 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_sem_aulas_normais',
      'alteracoes_aplicadas', 0
    );
  end if;

  with
  snapshot_bruto as (
    select
      (item.valor ->> 'emusys_id')::integer as emusys_id,
      item.valor -> 'aluno_chaves' as aluno_chaves_json
    from jsonb_array_elements(p_snapshot) as item(valor)
  ),
  snapshot as (
    select
      sb.emusys_id,
      coalesce(
        array_agg(distinct chaves.valor order by chaves.valor)
          filter (where chaves.valor is not null and chaves.valor <> ''),
        array[]::text[]
      ) as aluno_chaves
    from snapshot_bruto sb
    left join lateral jsonb_array_elements_text(sb.aluno_chaves_json) as chaves(valor)
      on true
    group by sb.emusys_id
  ),
  -- Trava os fatos locais antes de julgar a ausencia. Se uma sincronizacao mais
  -- nova chegar em paralelo, seu upsert espera esta decisao e depois reativa a
  -- aula com a fotografia mais recente, em vez de ser sobrescrito pela antiga.
  aulas_locais as (
    select a.id, a.emusys_id, a.data_aula
    from public.aulas_emusys a
    where a.unidade_id = p_unidade_id
      -- Categoria desconhecida nao e prova de aula normal: preservar para
      -- revisao em vez de cancelar uma linha legada/ambigua automaticamente.
      and a.categoria = 'normal'
      and coalesce(a.cancelada, false) = false
      and a.data_aula between p_data_inicio and p_data_fim
    for update of a
  ),
  aulas_ausentes as (
    select
      a.id as aula_local_id,
      a.emusys_id,
      null::bigint as vinculo_id,
      case
        when exists (
          select 1
          from public.aluno_presenca ap
          where ap.aula_emusys_id = a.id
            and public.fn_presenca_fecha_chamada(
              coalesce(
                ap.status_presenca,
                case ap.status
                  when 'presente' then 'presente'
                  when 'ausente' then 'falta'
                  else null
                end
              ),
              ap.respondido_por
            )
        ) then 'preservar_marcacao_fechada'
        else 'cancelar_aula_ausente'
      end as acao
    from aulas_locais a
    where not exists (
      select 1
      from snapshot s
      where s.emusys_id = a.emusys_id
    )
  ),
  vinculos_ausentes as (
    select
      a.id as aula_local_id,
      a.emusys_id,
      aa.id as vinculo_id,
      case
        -- Linhas legadas podem trazer aluno_chave=local:<id> embora já tenham
        -- aluno_emusys_id. A comparação abaixo reconhece esse caso. Sem uma
        -- identidade local e externa completa, não há como provar que uma
        -- decisão humana não ficaria órfã: preservar e deixar para revisão.
        when aa.aluno_id is null or aa.aluno_emusys_id is null
          then 'preservar_identidade_ambigua'
        when exists (
          select 1
          from public.aluno_presenca ap
          where ap.aula_emusys_id = aa.aula_emusys_id
            and ap.aluno_id = aa.aluno_id
            and public.fn_presenca_fecha_chamada(
              coalesce(
                ap.status_presenca,
                case ap.status
                  when 'presente' then 'presente'
                  when 'ausente' then 'falta'
                  else null
                end
              ),
              ap.respondido_por
            )
        ) then 'preservar_marcacao_fechada'
        else 'remover_vinculo_ausente'
      end as acao
    from aulas_locais a
    join snapshot s
      on s.emusys_id = a.emusys_id
    join public.aula_alunos_emusys aa
      on aa.aula_emusys_id = a.id
     and aa.unidade_id = p_unidade_id
    where not (
      aa.aluno_chave = any(s.aluno_chaves)
      or (
        aa.aluno_emusys_id is not null
        and ('emusys:' || aa.aluno_emusys_id::text) = any(s.aluno_chaves)
      )
    )
    for update of aa
  ),
  julgadas as (
    select * from aulas_ausentes
    union all
    select * from vinculos_ausentes
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'acao', j.acao,
          'aula_local_id', j.aula_local_id,
          'emusys_aula_id', j.emusys_id,
          'vinculo_id', j.vinculo_id
        )
        order by j.aula_local_id, j.vinculo_id nulls first, j.acao
      ),
      '[]'::jsonb
    ),
    coalesce(
      array_agg(j.aula_local_id) filter (where j.acao = 'cancelar_aula_ausente'),
      array[]::integer[]
    ),
    coalesce(
      array_agg(j.vinculo_id) filter (where j.acao = 'remover_vinculo_ausente'),
      array[]::bigint[]
    )
  into v_detalhe, v_aulas_cancelar, v_vinculos_remover
  from julgadas j;

  if not p_dry_run then
    if cardinality(v_aulas_cancelar) > 0 then
      update public.aulas_emusys a
         set cancelada = true,
             cancelada_origem = 'sync_ausente_emusys'
       where a.id = any(v_aulas_cancelar)
         and a.unidade_id = p_unidade_id
         and coalesce(a.cancelada, false) = false
         and not exists (
          select 1
          from public.aluno_presenca ap
          where ap.aula_emusys_id = a.id
            and public.fn_presenca_fecha_chamada(
              coalesce(
                ap.status_presenca,
                case ap.status
                  when 'presente' then 'presente'
                  when 'ausente' then 'falta'
                  else null
                end
              ),
              ap.respondido_por
            )
         );
      get diagnostics v_aulas_canceladas_aplicadas = row_count;
    end if;

    if cardinality(v_vinculos_remover) > 0 then
      delete from public.aula_alunos_emusys aa
       where aa.id = any(v_vinculos_remover)
         and aa.unidade_id = p_unidade_id
         and aa.aluno_id is not null
         and not exists (
           select 1
          from public.aluno_presenca ap
          where ap.aula_emusys_id = aa.aula_emusys_id
            and ap.aluno_id = aa.aluno_id
            and public.fn_presenca_fecha_chamada(
              coalesce(
                ap.status_presenca,
                case ap.status
                  when 'presente' then 'presente'
                  when 'ausente' then 'falta'
                  else null
                end
              ),
              ap.respondido_por
            )
         );
      get diagnostics v_vinculos_removidos_aplicados = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'dry_run', p_dry_run,
    'unidade_id', p_unidade_id,
    'janela', jsonb_build_object('inicio', p_data_inicio, 'fim', p_data_fim),
    'fotografia_aulas', v_snapshot_aulas,
    'aulas_canceladas', cardinality(v_aulas_cancelar),
    'vinculos_removidos', cardinality(v_vinculos_remover),
    'aulas_canceladas_aplicadas', v_aulas_canceladas_aplicadas,
    'vinculos_removidos_aplicados', v_vinculos_removidos_aplicados,
    'alteracoes_aplicadas', v_aulas_canceladas_aplicadas + v_vinculos_removidos_aplicados,
    'detalhe', v_detalhe
  );
end;
$function$;

revoke all on function public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)
  from public, anon, authenticated;
grant execute on function public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)
  to service_role;

comment on function public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean) is
  'Compara a fotografia completa e agrupada do Emusys com a grade normal de hoje/futuro. Cancela logicamente aulas ausentes e remove somente vínculo ausente, sempre preservando presença que fecha chamada.';
