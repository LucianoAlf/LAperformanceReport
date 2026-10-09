-- 08/10/2026 -- a apresentação do recital acompanha a troca de professor do aluno.
--
-- Reunião do recital (08/10), item de integração: `evento_apresentacao.professor_id`
-- é COPIADO de `alunos.professor_atual_id` uma vez, quando o aluno entra no bloco
-- (evento_apresentacao_adicionar_v1), e nada o atualiza depois. Se a escola troca o
-- professor no Emusys, o cadastro muda (webhook matricula_alterada / sync), mas a
-- grade, a programação e o app do professor (LA Teacher lê o professor da
-- apresentação) seguem com o antigo.
--
-- Regra: quando `alunos.professor_atual_id` muda, as apresentações DAQUELA PESSOA
-- (unidade + pessoa_chave -- 2 cursos = 2 linhas em `alunos`) e DAQUELE CURSO, em
-- evento que ainda não terminou, passam para o professor novo -- mas SÓ as que
-- estavam com o professor ANTIGO. Apresentação com outro professor foi escolha de
-- alguém (ex.: Jairo/Barra, grade com Erick e cadastro com Gabriel) e não é tocada.
-- `professor_palco_id` / `professor_apoio_id` nunca são tocados.
--
-- Medido em 08/10: 249 apresentações, 29 divergem do cadastro e NENHUMA é troca
-- perdida (26 = 2º curso, 2 = curso encerrado, 1 = escolha na grade). Por isso não
-- há retroativo: a regra vale daqui para frente.
--
-- Custo: gatilho só em UPDATE OF professor_atual_id com valor diferente (raro);
-- falha não derruba a gravação do aluno e fica em automacao_log.
--
-- Checagem:
--   select created_at, aluno_nome, unidade_nome, status, detalhes from automacao_log
--    where evento = 'evento_recital' and acao like 'apresentacao_professor%'
--    order by id desc limit 20;

create or replace function public.fn_evento_apresentacao_segue_professor()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_pessoa text;
begin
  if new.professor_atual_id is null or new.curso_id is null then
    return null;
  end if;

  v_pessoa := public.fn_pessoa_chave_aluno(new.id);
  if v_pessoa is null then
    return null;
  end if;

  for r in
    update public.evento_apresentacao ea
       set professor_id = new.professor_atual_id
      from public.alunos x, public.evento e
     where x.id = ea.aluno_id
       and e.id = ea.evento_id
       and ea.tipo = 'aluno'
       and ea.curso_id = new.curso_id
       and x.unidade_id = new.unidade_id
       and public.fn_pessoa_chave_aluno(x.id) = v_pessoa
       and ea.professor_id is not distinct from old.professor_atual_id
       and coalesce(e.data_fim, e.data_evento, v_hoje) >= v_hoje
    returning ea.id, ea.evento_id, ea.bloco_id
  loop
    insert into public.automacao_log (aluno_nome, aluno_id, unidade_nome, evento, acao, status, detalhes)
    select coalesce(new.nome, '(sem nome)'), new.id, u.nome,
           'evento_recital', 'apresentacao_professor_trocado', 'ok',
           jsonb_build_object('apresentacao_id', r.id, 'evento_id', r.evento_id, 'bloco_id', r.bloco_id,
                              'curso_id', new.curso_id,
                              'professor_antes', old.professor_atual_id,
                              'professor_depois', new.professor_atual_id)
      from (select 1) z left join public.unidades u on u.id = new.unidade_id;
  end loop;

  return null;

exception when others then
  begin
    insert into public.automacao_log (aluno_nome, aluno_id, evento, acao, status, detalhes)
    values (coalesce(new.nome, '(sem nome)'), new.id, 'evento_recital', 'apresentacao_professor_erro', 'erro',
            jsonb_build_object('professor_antes', old.professor_atual_id,
                               'professor_depois', new.professor_atual_id,
                               'sqlstate', sqlstate, 'erro', sqlerrm));
  exception when others then
    raise warning 'EVENTO_APRESENTACAO_SEGUE_PROFESSOR_FALHOU aluno=% sqlstate=% erro=%', new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.fn_evento_apresentacao_segue_professor() from public, anon, authenticated;

drop trigger if exists trg_evento_apresentacao_segue_professor on public.alunos;
create trigger trg_evento_apresentacao_segue_professor
  after update of professor_atual_id on public.alunos
  for each row
  when (old.professor_atual_id is distinct from new.professor_atual_id)
  execute function public.fn_evento_apresentacao_segue_professor();
