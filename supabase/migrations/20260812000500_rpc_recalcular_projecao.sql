-- 2026-08-12 — RPC: recalcular_projecao
--
-- Chamada quando algo muda (feriado novo, reposição agendada, mudança de dia).
-- Recalcula as datas restantes a partir de hoje e versiona.

create or replace function public.recalcular_projecao(
  p_aluno_id integer,
  p_matricula_disciplina_id bigint,
  p_trigger text,
  p_detalhes jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_jornada record;
  v_versao_atual integer;
  v_versao_nova integer;
  v_data_atual date;
  v_dia_semana_num integer;
  v_dia_semana_norm text;
  v_sequencia integer;
  v_aulas_realizadas integer := 0;
  v_aulas_restantes integer := 0;
  v_feriados date[];
  v_recessos record;
  v_emendas record;
  v_ultima_projetada date;
  v_ultima_emusys date;
  v_delta_dias integer;
  v_semaforo text;
begin
  -- Busca a jornada
  select
    j.aluno_id, j.unidade_id, j.emusys_matricula_disciplina_id,
    j.nr_aulas_contratadas, j.data_primeira_aula::date, j.data_ultima_aula::date,
    j.dia_semana, j.horario
  into v_jornada
  from aluno_jornada_matricula_disciplina j
  where j.aluno_id = p_aluno_id
    and j.emusys_matricula_disciplina_id = p_matricula_disciplina_id
    and j.status_matricula = 'ativa'
  limit 1;

  if not found then
    return jsonb_build_object('erro', 'jornada_nao_encontrada');
  end if;

  -- Versão atual
  select coalesce(max(versao), 0) into v_versao_atual
  from projecao_aulas
  where aluno_id = p_aluno_id and matricula_disciplina_id = p_matricula_disciplina_id;

  v_versao_nova := v_versao_atual + 1;

  -- Normaliza dia da semana
  v_dia_semana_norm := lower(regexp_replace(v_jornada.dia_semana, '-feira', '', 'g'));
  v_dia_semana_norm := translate(v_dia_semana_norm, 'áàâãéèêíìîóòôõúùûç', 'aaaaeeeiioooouuuc');

  v_dia_semana_num := case v_dia_semana_norm
    when 'segunda' then 1 when 'terca' then 2 when 'quarta' then 3
    when 'quinta' then 4 when 'sexta' then 5 when 'sabado' then 6 when 'domingo' then 7
    else null
  end;

  if v_dia_semana_num is null then
    return jsonb_build_object('erro', 'dia_semana_invalido');
  end if;

  -- Marca aulas passadas como realizada/falta (match com aluno_presenca)
  update projecao_aulas pa
  set status = case
    when ap.status_presenca = 'presente' then 'realizada'
    when ap.status_presenca = 'falta' then 'falta'
    when ap.status_presenca = 'falta_justificada' then 'falta_justificada'
    else pa.status
  end,
  updated_at = now()
  from aluno_presenca ap
  where pa.aluno_id = ap.aluno_id
    and pa.data_projetada = ap.data_aula
    and pa.unidade_id = ap.unidade_id
    and pa.aluno_id = p_aluno_id
    and pa.matricula_disciplina_id = p_matricula_disciplina_id
    and pa.status = 'projetada'
    and pa.data_projetada <= current_date;

  get diagnostics v_aulas_realizadas = row_count;

  -- Conta aulas restantes (projetadas para o futuro)
  select count(*) into v_aulas_restantes
  from projecao_aulas
  where aluno_id = p_aluno_id
    and matricula_disciplina_id = p_matricula_disciplina_id
    and status = 'projetada'
    and data_projetada > current_date;

  -- Se não tem aulas restantes, não precisa recalcular
  if v_aulas_restantes = 0 then
    return jsonb_build_object(
      'aluno_id', p_aluno_id,
      'matricula_disciplina_id', p_matricula_disciplina_id,
      'aulas_realizadas', v_aulas_realizadas,
      'aulas_restantes', 0,
      'recalculado', false,
      'motivo', 'sem_aulas_restantes'
    );
  end if;

  -- Busca feriados/recessos/emendas para o recálculo
  select array_agg(data) into v_feriados
  from feriados
  where ativo = true
    and data >= current_date
    and data <= coalesce(v_jornada.data_ultima_aula, current_date + interval '18 months');

  for v_recessos in
    select data_inicio, data_fim from calendario_escolar
    where unidade_id = v_jornada.unidade_id and tipo = 'recesso' and status = 'confirmado'
      and data_fim >= current_date and data_inicio <= coalesce(v_jornada.data_ultima_aula, current_date + interval '18 months')
  loop
    declare v_dia date;
    begin
      for v_dia in select generate_series(v_recessos.data_inicio, v_recessos.data_fim, interval '1 day')::date loop
        v_feriados := array_append(v_feriados, v_dia);
      end loop;
    end;
  end loop;

  for v_emendas in
    select data_inicio, data_fim from calendario_escolar
    where unidade_id = v_jornada.unidade_id and tipo = 'emenda' and status = 'confirmado'
      and data_fim >= current_date and data_inicio <= coalesce(v_jornada.data_ultima_aula, current_date + interval '18 months')
  loop
    declare v_dia date;
    begin
      for v_dia in select generate_series(v_emendas.data_inicio, v_emendas.data_fim, interval '1 day')::date loop
        v_feriados := array_append(v_feriados, v_dia);
      end loop;
    end;
  end loop;

  select array_agg(distinct f order by f) into v_feriados from unnest(v_feriados) as f;

  -- Recalcula as datas restantes a partir de hoje
  v_data_atual := current_date;
  while extract(isodow from v_data_atual) != v_dia_semana_num loop
    v_data_atual := v_data_atual + 1;
  end loop;

  -- Pega a última sequência existente
  select coalesce(max(sequencia), 0) into v_sequencia
  from projecao_aulas
  where aluno_id = p_aluno_id and matricula_disciplina_id = p_matricula_disciplina_id;

  -- Gera as novas datas para as aulas restantes
  while v_aulas_restantes > 0 loop
    if not (v_data_atual = any(v_feriados)) then
      v_sequencia := v_sequencia + 1;

      insert into projecao_aulas (
        aluno_id, matricula_disciplina_id, unidade_id,
        sequencia, data_projetada, dia_semana, status, versao
      ) values (
        p_aluno_id, p_matricula_disciplina_id, v_jornada.unidade_id,
        v_sequencia, v_data_atual, v_jornada.dia_semana, 'projetada', v_versao_nova
      )
      on conflict (aluno_id, matricula_disciplina_id, sequencia) do update
      set data_projetada = excluded.data_projetada,
          versao = v_versao_nova,
          updated_at = now();

      v_aulas_restantes := v_aulas_restantes - 1;
    end if;
    v_data_atual := v_data_atual + 7;
  end loop;

  -- Atualiza a última aula projetada
  v_ultima_projetada := v_data_atual - 7;
  v_ultima_emusys := v_jornada.data_ultima_aula;
  v_delta_dias := v_ultima_projetada - v_ultima_emusys;

  if abs(v_delta_dias) <= 21 then v_semaforo := 'verde';
  elsif abs(v_delta_dias) <= 35 then v_semaforo := 'amarelo';
  else v_semaforo := 'vermelho';
  end if;

  -- Log do recálculo
  insert into projecao_recaculo_log (
    aluno_id, matricula_disciplina_id, trigger_evento,
    versao_anterior, versao_nova, detalhes
  ) values (
    p_aluno_id, p_matricula_disciplina_id, p_trigger,
    v_versao_atual, v_versao_nova, p_detalhes
  );

  return jsonb_build_object(
    'aluno_id', p_aluno_id,
    'matricula_disciplina_id', p_matricula_disciplina_id,
    'aulas_realizadas', v_aulas_realizadas,
    'aulas_restantes', v_aulas_restantes,
    'recalculado', true,
    'versao_anterior', v_versao_atual,
    'versao_nova', v_versao_nova,
    'ultima_aula_projetada', v_ultima_projetada,
    'ultima_aula_emusys', v_ultima_emusys,
    'delta_dias', v_delta_dias,
    'semaforo', v_semaforo
  );
end;
$function$;

revoke all on function public.recalcular_projecao(integer, bigint, text, jsonb) from public;
revoke all on function public.recalcular_projecao(integer, bigint, text, jsonb) from anon;
grant execute on function public.recalcular_projecao(integer, bigint, text, jsonb) to authenticated;
grant execute on function public.recalcular_projecao(integer, bigint, text, jsonb) to service_role;
