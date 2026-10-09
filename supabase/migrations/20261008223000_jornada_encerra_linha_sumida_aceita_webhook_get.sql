-- 08/10/2026 -- complemento de 20261008220000: a leitura `webhook:<evento>:get` também conta.
--
-- `processar-matricula-emusys` grava fonte `webhook:<evento>:get` quando, ao receber
-- o webhook, busca o estado ATUAL da matrícula em GET /matriculas
-- (`buildJornadaInputFromMatriculaApi`) -- é a mesma fonte do sync, com o
-- `contrato_atual` inteiro. A 1ª versão só aceitava `sync-matriculas-emusys` e
-- deixou 2 linhas `ativa` de alunas que já saíram (matrículas 1256 e 1884/REC e CG):
-- o contrato novo delas foi finalizado pelo webhook `matricula_finalizacao:get`, e
-- o sync diário (escopo operacional) não lê matrícula inativa, então nunca
-- passaria por elas.
--
-- Webhook SEM `:get` continua de fora: ele monta a jornada pelo payload do evento,
-- que não é garantidamente o contrato atual completo.

create or replace function public.fn_jornada_encerra_linha_sumida()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.emusys_matricula_id is null
     or new.ultima_sincronizacao_emusys is null
     or not (coalesce(new.fonte_ultima_atualizacao, '') = 'sync-matriculas-emusys'
             or coalesce(new.fonte_ultima_atualizacao, '') like 'webhook:%:get') then
    return null;
  end if;

  for r in
    update public.aluno_jornada_matricula_disciplina v
       set status_matricula = 'finalizada',
           fonte_ultima_atualizacao = 'regra:sumiu_do_emusys'
     where v.unidade_id = new.unidade_id
       and v.emusys_matricula_id = new.emusys_matricula_id
       and v.id <> new.id
       and v.status_matricula in ('ativa', 'trancada')
       and v.ultima_sincronizacao_emusys < new.ultima_sincronizacao_emusys - interval '12 hours'
    returning v.id, v.aluno_id, v.unidade_id, v.emusys_matricula_disciplina_id,
              v.professor_nome_emusys, v.curso_nome_emusys, v.ultima_sincronizacao_emusys
  loop
    insert into public.automacao_log (aluno_nome, aluno_id, unidade_nome, evento, acao, status, detalhes)
    select coalesce(a.nome, '(sem aluno)'), r.aluno_id, u.nome,
           'jornada_matricula', 'linha_sumiu_do_emusys', 'ok',
           jsonb_build_object(
             'jornada_id', r.id,
             'emusys_matricula_id', new.emusys_matricula_id,
             'md_encerrada', r.emusys_matricula_disciplina_id,
             'md_que_veio', new.emusys_matricula_disciplina_id,
             'fonte_que_veio', new.fonte_ultima_atualizacao,
             'curso', r.curso_nome_emusys,
             'professor', r.professor_nome_emusys,
             'ultima_vez_vista', r.ultima_sincronizacao_emusys,
             'origem', 'gatilho')
      from (select 1) x
      left join public.alunos a on a.id = r.aluno_id
      left join public.unidades u on u.id = r.unidade_id;
  end loop;

  return null;

exception when others then
  begin
    insert into public.automacao_log (aluno_nome, aluno_id, evento, acao, status, detalhes)
    values ('(jornada)', new.aluno_id, 'jornada_matricula', 'linha_sumiu_do_emusys_erro', 'erro',
            jsonb_build_object('jornada_id', new.id,
                               'emusys_matricula_id', new.emusys_matricula_id,
                               'sqlstate', sqlstate, 'erro', sqlerrm));
  exception when others then
    raise warning 'JORNADA_ENCERRA_LINHA_SUMIDA_FALHOU jornada=% matricula=% sqlstate=% erro=%',
      new.id, new.emusys_matricula_id, sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.fn_jornada_encerra_linha_sumida() from public, anon, authenticated;

do $$
declare
  v_qtd int;
begin
  with ref as (
    select unidade_id, emusys_matricula_id, max(ultima_sincronizacao_emusys) as s_max
      from public.aluno_jornada_matricula_disciplina
     where emusys_matricula_id is not null
       and (fonte_ultima_atualizacao = 'sync-matriculas-emusys'
            or fonte_ultima_atualizacao like 'webhook:%:get')
     group by 1, 2
  ), enc as (
    update public.aluno_jornada_matricula_disciplina v
       set status_matricula = 'finalizada',
           fonte_ultima_atualizacao = 'regra:sumiu_do_emusys'
      from ref
     where ref.unidade_id = v.unidade_id
       and ref.emusys_matricula_id = v.emusys_matricula_id
       and v.status_matricula in ('ativa', 'trancada')
       and v.ultima_sincronizacao_emusys < ref.s_max - interval '12 hours'
    returning v.id, v.aluno_id, v.unidade_id, v.emusys_matricula_id,
              v.emusys_matricula_disciplina_id, v.curso_nome_emusys,
              v.professor_nome_emusys, v.ultima_sincronizacao_emusys
  ), log as (
    insert into public.automacao_log (aluno_nome, aluno_id, unidade_nome, evento, acao, status, detalhes)
    select coalesce(a.nome, '(sem aluno)'), e.aluno_id, u.nome,
           'jornada_matricula', 'linha_sumiu_do_emusys', 'ok',
           jsonb_build_object(
             'jornada_id', e.id,
             'emusys_matricula_id', e.emusys_matricula_id,
             'md_encerrada', e.emusys_matricula_disciplina_id,
             'curso', e.curso_nome_emusys,
             'professor', e.professor_nome_emusys,
             'ultima_vez_vista', e.ultima_sincronizacao_emusys,
             'origem', 'retroativo_20261008223000')
      from enc e
      left join public.alunos a on a.id = e.aluno_id
      left join public.unidades u on u.id = e.unidade_id
    returning 1
  )
  select count(*) into v_qtd from log;

  -- Medido em 08/10: exatamente as 2 linhas das matrículas 1256 e 1884.
  if v_qtd > 5 then
    raise exception 'RETROATIVO_FORA_DO_ESPERADO: % linhas (esperado 2)', v_qtd;
  end if;
  raise notice 'linhas encerradas no retroativo: %', v_qtd;
end $$;
