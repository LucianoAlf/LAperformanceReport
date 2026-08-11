-- 2026-08-12 — Trigger: aluno_reposicoes → projecao_aulas
--
-- Quando uma reposição é agendada, marca a aula original como falta_justificada
-- e cria a nova data como reposta.

create or replace function public.trg_atualiza_projecao_por_reposicao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_aula_origem record;
  v_aluno_id integer;
  v_unidade_id uuid;
  v_matricula_disciplina_id bigint;
  v_ultima_sequencia integer;
  v_dia_semana text;
  v_versao_atual integer;
begin
  -- Só processa quando a reposição é agendada (status muda para 'agendada')
  if NEW.status != 'agendada' or OLD.status = 'agendada' then
    return NEW;
  end if;

  -- Busca a aula original
  select ae.aluno_id, ae.unidade_id, ae.matricula_disciplina_id
  into v_aula_origem
  from aulas_emusys ae
  where ae.id = NEW.aula_origem_id;

  if not found then
    return NEW;
  end if;

  v_aluno_id := v_aula_origem.aluno_id;
  v_unidade_id := v_aula_origem.unidade_id;
  v_matricula_disciplina_id := v_aula_origem.matricula_disciplina_id;

  -- Marca a aula original como falta_justificada
  update projecao_aulas
  set status = 'falta_justificada', updated_at = now()
  where aluno_id = v_aluno_id
    and matricula_disciplina_id = v_matricula_disciplina_id
    and data_projetada = (select data_aula from aulas_emusys where id = NEW.aula_origem_id)
    and status = 'projetada';

  -- Busca a última sequência e o dia da semana
  select coalesce(max(sequencia), 0), max(dia_semana), coalesce(max(versao), 1)
  into v_ultima_sequencia, v_dia_semana, v_versao_atual
  from projecao_aulas
  where aluno_id = v_aluno_id and matricula_disciplina_id = v_matricula_disciplina_id;

  -- Cria a nova data como reposta
  insert into projecao_aulas (
    aluno_id, matricula_disciplina_id, unidade_id,
    sequencia, data_projetada, dia_semana, status, versao
  ) values (
    v_aluno_id, v_matricula_disciplina_id, v_unidade_id,
    v_ultima_sequencia + 1,
    NEW.data_reposicao,
    coalesce(v_dia_semana, 'desconhecido'),
    'reposta',
    v_versao_atual + 1
  )
  on conflict (aluno_id, matricula_disciplina_id, sequencia) do update
  set data_projetada = excluded.data_projetada,
      status = 'reposta',
      versao = v_versao_atual + 1,
      updated_at = now();

  return NEW;
end;
$function$;

drop trigger if exists trg_atualiza_projecao_por_reposicao on aluno_reposicoes;
create trigger trg_atualiza_projecao_por_reposicao
  after insert or update of status on aluno_reposicoes
  for each row
  execute function trg_atualiza_projecao_por_reposicao();

comment on function public.trg_atualiza_projecao_por_reposicao() is
  'Quando uma reposição é agendada, marca a aula original como falta_justificada e cria a nova data como reposta.';
