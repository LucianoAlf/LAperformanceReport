-- 2026-08-12 — RPC: prever_projecao_contrato (simulação sem gravar)
--
-- Usada no modal de nova matrícula para mostrar o semáforo ANTES de confirmar.
-- Não grava em projecao_aulas — só calcula e retorna.

create or replace function public.prever_projecao_contrato(
  p_unidade_id uuid,
  p_dia_semana text, -- 'Segunda', 'Terça', ...
  p_data_inicio date,
  p_qtd_aulas integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dia_semana_num integer;
  v_dia_semana_norm text;
  v_data_atual date;
  v_sequencia integer := 0;
  v_ultima_projetada date;
  v_feriados date[];
  v_recessos record;
  v_emendas record;
  v_delta_dias integer;
  v_semaforo text;
  v_ultima_parcela date;
begin
  -- Normaliza dia da semana
  v_dia_semana_norm := lower(regexp_replace(p_dia_semana, '-feira', '', 'g'));
  v_dia_semana_norm := translate(v_dia_semana_norm, 'áàâãéèêíìîóòôõúùûç', 'aaaaeeeiioooouuuc');

  v_dia_semana_num := case v_dia_semana_norm
    when 'segunda' then 1 when 'terca' then 2 when 'quarta' then 3
    when 'quinta' then 4 when 'sexta' then 5 when 'sabado' then 6 when 'domingo' then 7
    else null
  end;

  if v_dia_semana_num is null then
    return jsonb_build_object('erro', 'dia_semana_invalido', 'dia_semana', p_dia_semana);
  end if;

  -- Busca feriados globais ativos no período
  select array_agg(data) into v_feriados
  from feriados
  where ativo = true
    and data >= p_data_inicio
    and data <= p_data_inicio + interval '18 months';

  -- Busca recessos confirmados da unidade
  for v_recessos in
    select data_inicio, data_fim
    from calendario_escolar
    where unidade_id = p_unidade_id
      and tipo = 'recesso'
      and status = 'confirmado'
      and data_fim >= p_data_inicio
      and data_inicio <= p_data_inicio + interval '18 months'
  loop
    declare v_dia date;
    begin
      for v_dia in select generate_series(v_recessos.data_inicio, v_recessos.data_fim, interval '1 day')::date loop
        v_feriados := array_append(v_feriados, v_dia);
      end loop;
    end;
  end loop;

  -- Busca emendas confirmadas da unidade
  for v_emendas in
    select data_inicio, data_fim
    from calendario_escolar
    where unidade_id = p_unidade_id
      and tipo = 'emenda'
      and status = 'confirmado'
      and data_fim >= p_data_inicio
      and data_inicio <= p_data_inicio + interval '18 months'
  loop
    declare v_dia date;
    begin
      for v_dia in select generate_series(v_emendas.data_inicio, v_emendas.data_fim, interval '1 day')::date loop
        v_feriados := array_append(v_feriados, v_dia);
      end loop;
    end;
  end loop;

  -- Remove duplicatas
  select array_agg(distinct f order by f) into v_feriados from unnest(v_feriados) as f;

  -- Gera as N datas
  v_data_atual := p_data_inicio;
  while extract(isodow from v_data_atual) != v_dia_semana_num loop
    v_data_atual := v_data_atual + 1;
  end loop;

  while v_sequencia < p_qtd_aulas loop
    if not (v_data_atual = any(v_feriados)) then
      v_sequencia := v_sequencia + 1;
    end if;
    v_data_atual := v_data_atual + 7;
  end loop;

  v_ultima_projetada := v_data_atual - 7;

  -- Última parcela: 12 meses após a data de início (ciclo anual)
  v_ultima_parcela := p_data_inicio + interval '12 months' - interval '1 day';

  -- Delta: diferença entre a última aula projetada e a última parcela
  v_delta_dias := v_ultima_projetada - v_ultima_parcela;

  -- Semáforo: alvo é 39-42 semanas (273-294 dias)
  if abs(v_delta_dias) <= 21 then
    v_semaforo := 'verde';
  elsif abs(v_delta_dias) <= 35 then
    v_semaforo := 'amarelo';
  else
    v_semaforo := 'vermelho';
  end if;

  return jsonb_build_object(
    'ultima_aula_projetada', v_ultima_projetada,
    'ultima_parcela', v_ultima_parcela,
    'delta_dias', v_delta_dias,
    'semaforo', v_semaforo,
    'aulas_projetadas', v_sequencia,
    'dia_semana', p_dia_semana
  );
end;
$function$;

revoke all on function public.prever_projecao_contrato(uuid, text, date, integer) from public;
revoke all on function public.prever_projecao_contrato(uuid, text, date, integer) from anon;
grant execute on function public.prever_projecao_contrato(uuid, text, date, integer) to authenticated;
