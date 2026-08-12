-- 2026-08-12 — RPC: simular_emenda
--
-- Simula o impacto de uma emenda ANTES de confirmar. Retorna o antes/depois
-- do banco de cada dia da semana e os contratos afetados.

create or replace function public.simular_emenda(
  p_unidade_id uuid,
  p_data date,
  p_ano integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dia_semana_num integer;
  v_dia_semana_texto text;
  v_feriados date[];
  v_recessos record;
  v_banco_antes record;
  v_banco_depois record;
  v_contratos_afetados integer := 0;
  v_resultado jsonb;
begin
  -- Dia da semana da emenda
  v_dia_semana_num := extract(isodow from p_data);
  v_dia_semana_texto := case v_dia_semana_num
    when 1 then 'Segunda' when 2 then 'Terça' when 3 then 'Quarta'
    when 4 then 'Quinta' when 5 then 'Sexta' when 6 then 'Sábado'
    else 'Domingo'
  end;

  -- Banco ANTES: conta os dias com aula no ano para o dia da semana
  select
    count(*) filter (where extract(isodow from d.data) = v_dia_semana_num) as total_dias,
    count(*) filter (
      where extract(isodow from d.data) = v_dia_semana_num
        and not exists (select 1 from feriados f where f.data = d.data and f.ativo)
        and not exists (
          select 1 from calendario_escolar ce
          where ce.unidade_id = p_unidade_id
            and ce.tipo = 'recesso'
            and ce.status = 'confirmado'
            and d.data between ce.data_inicio and ce.data_fim
        )
        and not exists (
          select 1 from calendario_escolar ce
          where ce.unidade_id = p_unidade_id
            and ce.tipo = 'emenda'
            and ce.status = 'confirmado'
            and d.data between ce.data_inicio and ce.data_fim
        )
    ) as dias_com_aula
  into v_banco_antes
  from generate_series(make_date(p_ano, 1, 1), make_date(p_ano, 12, 31), interval '1 day') as d(data)
  where extract(isodow from d.data) = v_dia_semana_num;

  -- Banco DEPOIS: a emenda remove 1 dia com aula
  v_banco_depois := v_banco_antes;
  v_banco_depois.dias_com_aula := v_banco_antes.dias_com_aula - 1;

  -- Contratos afetados: contratos da unidade que têm aula nesse dia da semana
  select count(*) into v_contratos_afetados
  from projecao_aulas pa
  join aluno_jornada_matricula_disciplina j
    on j.aluno_id = pa.aluno_id and j.emusys_matricula_disciplina_id = pa.matricula_disciplina_id
  where pa.unidade_id = p_unidade_id
    and pa.status = 'projetada'
    and extract(isodow from pa.data_projetada) = v_dia_semana_num
    and pa.data_projetada >= current_date
    and j.status_matricula = 'ativa';

  -- Monta o resultado
  v_resultado := jsonb_build_object(
    'data', p_data,
    'dia_semana', v_dia_semana_texto,
    'banco_antes', jsonb_build_object(
      'total_dias', v_banco_antes.total_dias,
      'dias_com_aula', v_banco_antes.dias_com_aula,
      'banco', v_banco_antes.dias_com_aula - 40
    ),
    'banco_depois', jsonb_build_object(
      'total_dias', v_banco_depois.total_dias,
      'dias_com_aula', v_banco_depois.dias_com_aula,
      'banco', v_banco_depois.dias_com_aula - 40
    ),
    'contratos_afetados', v_contratos_afetados,
    'quebra_promessa', (v_banco_depois.dias_com_aula - 40) < 0
  );

  return v_resultado;
end;
$function$;

revoke all on function public.simular_emenda(uuid, date, integer) from public;
revoke all on function public.simular_emenda(uuid, date, integer) from anon;
grant execute on function public.simular_emenda(uuid, date, integer) to authenticated;
