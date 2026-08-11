-- 2026-08-12 — Trigger: jornada → materializar projeção automaticamente
--
-- Quando a jornada é sincronizada (webhook de matrícula ou sync), materializa
-- a projeção automaticamente. Não precisa de intervenção manual.

create or replace function public.trg_materializar_projecao_jornada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Só materializa se a jornada tem os campos necessários
  if NEW.nr_aulas_contratadas is not null
     and NEW.data_primeira_aula is not null
     and NEW.dia_semana is not null
     and NEW.status_matricula = 'ativa' then
    perform materializar_projecao_contrato(NEW.aluno_id, NEW.emusys_matricula_disciplina_id);
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_materializar_projecao_jornada on aluno_jornada_matricula_disciplina;
create trigger trg_materializar_projecao_jornada
  after insert or update of data_primeira_aula, data_ultima_aula, nr_aulas_contratadas, dia_semana
  on aluno_jornada_matricula_disciplina
  for each row
  execute function trg_materializar_projecao_jornada();

comment on function public.trg_materializar_projecao_jornada() is
  'Quando a jornada é sincronizada (webhook ou sync), materializa a projeção automaticamente.';
