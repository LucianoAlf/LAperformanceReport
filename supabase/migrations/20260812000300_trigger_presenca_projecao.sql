-- 2026-08-12 — Trigger: aluno_presenca → projecao_aulas
--
-- Quando uma presença é registrada, marca a aula projetada como
-- realizada/falta/falta_justificada. Match por aluno + data + unidade.

create or replace function public.trg_atualiza_projecao_por_presenca()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status_projecao text;
begin
  -- Mapeia status_presenca para status da projeção
  v_status_projecao := case NEW.status_presenca
    when 'presente' then 'realizada'
    when 'falta' then 'falta'
    when 'falta_justificada' then 'falta_justificada'
    else null
  end;

  if v_status_projecao is null then
    return NEW;
  end if;

  -- Atualiza a aula projetada que corresponde à data e ao aluno
  update projecao_aulas
  set status = v_status_projecao,
      updated_at = now()
  where aluno_id = NEW.aluno_id
    and data_projetada = NEW.data_aula
    and unidade_id = NEW.unidade_id
    and status = 'projetada'; -- só atualiza se ainda está projetada

  return NEW;
end;
$function$;

drop trigger if exists trg_atualiza_projecao_por_presenca on aluno_presenca;
create trigger trg_atualiza_projecao_por_presenca
  after insert or update of status_presenca on aluno_presenca
  for each row
  execute function trg_atualiza_projecao_por_presenca();

comment on function public.trg_atualiza_projecao_por_presenca() is
  'Quando uma presença é registrada, marca a aula projetada como realizada/falta/falta_justificada.';
