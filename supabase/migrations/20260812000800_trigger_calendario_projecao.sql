-- 2026-08-12 — Trigger: calendario_escolar → recálculo em massa
--
-- Quando um recesso ou emenda é confirmado, marca os contratos afetados
-- para recálculo. O recálculo real é feito por uma função agendada ou manual.

create or replace function public.trg_marcar_contratos_para_recalculo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_contratos_afetados integer := 0;
begin
  -- Só processa quando o status muda para 'confirmado'
  if NEW.status != 'confirmado' or OLD.status = 'confirmado' then
    return NEW;
  end if;

  -- Marca contratos da unidade afetados pelo recesso/emenda
  -- Um contrato é afetado se o dia da semana dele cai dentro do período
  update projecao_aulas pa
  set versao = pa.versao + 1,
      updated_at = now()
  from aluno_jornada_matricula_disciplina j
  where pa.aluno_id = j.aluno_id
    and pa.matricula_disciplina_id = j.emusys_matricula_disciplina_id
    and pa.unidade_id = NEW.unidade_id
    and pa.status = 'projetada'
    and pa.data_projetada between NEW.data_inicio and NEW.data_fim
    and j.status_matricula = 'ativa';

  get diagnostics v_contratos_afetados = row_count;

  -- Log
  insert into projecao_recaculo_log (
    aluno_id, matricula_disciplina_id, trigger_evento,
    versao_anterior, versao_nova, detalhes
  )
  select
    pa.aluno_id, pa.matricula_disciplina_id,
    case when NEW.tipo = 'recesso' then 'recesso_confirmado' else 'emenda_confirmada' end,
    pa.versao - 1, pa.versao,
    jsonb_build_object('calendario_id', NEW.id, 'nome', NEW.nome, 'data_inicio', NEW.data_inicio, 'data_fim', NEW.data_fim)
  from projecao_aulas pa
  join aluno_jornada_matricula_disciplina j
    on j.aluno_id = pa.aluno_id and j.emusys_matricula_disciplina_id = pa.matricula_disciplina_id
  where pa.unidade_id = NEW.unidade_id
    and pa.status = 'projetada'
    and pa.data_projetada between NEW.data_inicio and NEW.data_fim
    and j.status_matricula = 'ativa';

  return NEW;
end;
$function$;

drop trigger if exists trg_marcar_contratos_para_recalculo on calendario_escolar;
create trigger trg_marcar_contratos_para_recalculo
  after insert or update of status on calendario_escolar
  for each row
  execute function trg_marcar_contratos_para_recalculo();

comment on function public.trg_marcar_contratos_para_recalculo() is
  'Quando um recesso/emenda é confirmado, marca os contratos afetados para recálculo.';
