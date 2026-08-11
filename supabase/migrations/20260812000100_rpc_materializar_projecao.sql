-- 2026-08-12 — RPC: materializar_projecao_contrato
--
-- Pega a primeira e última aula do Emusys (da jornada) e materializa as N
-- datas do meio, pulando feriados e recessos confirmados. Compara a última
-- projetada com a última do Emusys para o semáforo.

create or replace function public.materializar_projecao_contrato(
  p_aluno_id integer,
  p_matricula_disciplina_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_jornada record;
  v_data_atual date;
  v_data_fim date;
  v_dia_semana_num integer;
  v_dia_semana_texto text;
  v_sequencia integer := 0;
  v_ultima_projetada date;
  v_ultima_emusys date;
  v_delta_dias integer;
  v_semaforo text;
  v_aulas_geradas integer := 0;
  v_feriados date[];
  v_recessos record;
  v_emendas record;
begin
  -- Busca a jornada do aluno
  select
    j.aluno_id,
    j.unidade_id,
    j.emusys_matricula_disciplina_id,
    j.nr_aulas_contratadas,
    j.data_primeira_aula::date,
    j.data_ultima_aula::date,
    j.dia_semana,
    j.horario
  into v_jornada
  from aluno_jornada_matricula_disciplina j
  where j.aluno_id = p_aluno_id
    and j.emusys_matricula_disciplina_id = p_matricula_disciplina_id
    and j.status_matricula = 'ativa'
  limit 1;

  if not found then
    return jsonb_build_object('erro', 'jornada_nao_encontrada', 'aluno_id', p_aluno_id);
  end if;

  if v_jornada.nr_aulas_contratadas is null or v_jornada.data_primeira_aula is null then
    return jsonb_build_object('erro', 'jornada_incompleta', 'aluno_id', p_aluno_id);
  end if;

  -- Mapeia dia da semana para número (1=segunda, 7=domingo)
  v_dia_semana_num := case lower(v_jornada.dia_semana)
    when 'segunda' then 1 when 'terça' then 2 when 'terca' then 2
    when 'quarta' then 3 when 'quinta' then 4 when 'sexta' then 5
    when 'sábado' then 6 when 'sabado' then 6 when 'domingo' then 7
    else null
  end;

  v_dia_semana_texto := coalesce(v_jornada.dia_semana, 'desconhecido');

  if v_dia_semana_num is null then
    return jsonb_build_object('erro', 'dia_semana_invalido', 'dia_semana', v_jornada.dia_semana);
  end if;

  -- Busca feriados globais ativos
  select array_agg(data) into v_feriados
  from feriados
  where ativo = true
    and data >= v_jornada.data_primeira_aula
    and data <= coalesce(v_jornada.data_ultima_aula, v_jornada.data_primeira_aula + interval '18 months');

  -- Busca recessos confirmados da unidade
  for v_recessos in
    select data_inicio, data_fim
    from calendario_escolar
    where unidade_id = v_jornada.unidade_id
      and tipo = 'recesso'
      and status = 'confirmado'
      and data_fim >= v_jornada.data_primeira_aula
      and data_inicio <= coalesce(v_jornada.data_ultima_aula, v_jornada.data_primeira_aula + interval '18 months')
  loop
    -- Recesso: todos os dias entre data_inicio e data_fim são sem aula
    -- Adiciona cada dia como "feriado" para o cálculo
    declare
      v_dia date;
    begin
      for v_dia in select generate_series(v_recessos.data_inicio, v_recessos.data_fim, interval '1 day')::date
      loop
        v_feriados := array_append(v_feriados, v_dia);
      end loop;
    end;
  end loop;

  -- Busca emendas confirmadas da unidade
  for v_emendas in
    select data_inicio, data_fim
    from calendario_escolar
    where unidade_id = v_jornada.unidade_id
      and tipo = 'emenda'
      and status = 'confirmado'
      and data_fim >= v_jornada.data_primeira_aula
      and data_inicio <= coalesce(v_jornada.data_ultima_aula, v_jornada.data_primeira_aula + interval '18 months')
  loop
    declare
      v_dia date;
    begin
      for v_dia in select generate_series(v_emendas.data_inicio, v_emendas.data_fim, interval '1 day')::date
      loop
        v_feriados := array_append(v_feriados, v_dia);
      end loop;
    end;
  end loop;

  -- Remove duplicatas e ordena
  select array_agg(distinct f order by f) into v_feriados from unnest(v_feriados) as f;

  -- Gera as N datas: próximo dia da semana a partir de data_primeira_aula
  v_data_atual := v_jornada.data_primeira_aula;
  v_data_fim := coalesce(v_jornada.data_ultima_aula, v_jornada.data_primeira_aula + interval '18 months');

  -- Se a data de início não é o dia da semana correto, avança para o próximo
  while extract(isodow from v_data_atual) != v_dia_semana_num loop
    v_data_atual := v_data_atual + 1;
  end loop;

  -- Gera as datas pulando feriados/recessos
  while v_sequencia < v_jornada.nr_aulas_contratadas and v_data_atual <= v_data_fim loop
    -- Se não é feriado/recesso, conta como aula
    if not (v_data_atual = any(v_feriados)) then
      v_sequencia := v_sequencia + 1;

      insert into projecao_aulas (
        aluno_id, matricula_disciplina_id, unidade_id,
        sequencia, data_projetada, dia_semana, status, versao
      ) values (
        p_aluno_id, p_matricula_disciplina_id, v_jornada.unidade_id,
        v_sequencia, v_data_atual, v_dia_semana_texto, 'projetada', 1
      )
      on conflict (aluno_id, matricula_disciplina_id, sequencia) do update
      set data_projetada = excluded.data_projetada,
          dia_semana = excluded.dia_semana,
          updated_at = now();

      v_aulas_geradas := v_aulas_geradas + 1;
    end if;

    -- Próxima semana
    v_data_atual := v_data_atual + 7;
  end loop;

  v_ultima_projetada := v_data_atual - 7;
  v_ultima_emusys := v_jornada.data_ultima_aula;

  -- Calcula o delta em dias
  v_delta_dias := v_ultima_projetada - v_ultima_emusys;

  -- Semáforo: alvo é 39-42 semanas (273-294 dias)
  -- Verde: delta entre -21 e +21 dias (dentro de 39-42 semanas)
  -- Amarelo: delta entre -35 e +35 dias (37-44 semanas)
  -- Vermelho: fora disso
  if abs(v_delta_dias) <= 21 then
    v_semaforo := 'verde';
  elsif abs(v_delta_dias) <= 35 then
    v_semaforo := 'amarelo';
  else
    v_semaforo := 'vermelho';
  end if;

  return jsonb_build_object(
    'aluno_id', p_aluno_id,
    'matricula_disciplina_id', p_matricula_disciplina_id,
    'aulas_geradas', v_aulas_geradas,
    'primeira_aula', v_jornada.data_primeira_aula,
    'ultima_aula_projetada', v_ultima_projetada,
    'ultima_aula_emusys', v_ultima_emusys,
    'delta_dias', v_delta_dias,
    'semaforo', v_semaforo,
    'dia_semana', v_dia_semana_texto,
    'horario', v_jornada.horario
  );
end;
$function$;

revoke all on function public.materializar_projecao_contrato(integer, bigint) from public;
revoke all on function public.materializar_projecao_contrato(integer, bigint) from anon;
grant execute on function public.materializar_projecao_contrato(integer, bigint) to authenticated;
grant execute on function public.materializar_projecao_contrato(integer, bigint) to service_role;
