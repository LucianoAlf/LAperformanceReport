-- 08/10/2026 -- linha da jornada que o Emusys PAROU DE DEVOLVER deixa de ser vigente.
--
-- Reunião do recital (08/10): "o Arthur passou do Matheus para o Israel e o app
-- seguia no Matheus". Causa: o Emusys abre um contrato (matrícula-disciplina) novo
-- a cada renovação e `GET /matriculas` só devolve o contrato ATUAL. O sync faz
-- upsert do que veio e nunca encerra o que deixou de vir, então a linha antiga
-- ficava `status_matricula = 'ativa'` para sempre.
--
-- Medido em 08/10 (161 linhas `ativa` com `sucedida_por`):
--   * `vw_jornada_aluno_atual` mostrava o Arthur SÓ com o Matheus (a linha certa,
--     do Israel, está `trancada` e a view só lê `ativa`).
--   * 156 duplicavam o aluno no mesmo professor; 5 prendiam no professor antigo.
--   * 2 eram de aluno que JÁ SAIU (contrato novo finalizado, antigo seguia ativo).
--
-- Por que o critério NÃO é `sucedida_por` (o gatilho fn_jornada_marca_ciclo_sucedido):
--   * matrícula 2214/CG: o Emusys devolve HOJE o contrato 4082 como atual; o 4296,
--     que o gatilho marcou como sucessor, sumiu da API. Encerrar por `sucedida_por`
--     encerraria o vigente e manteria o fantasma.
--   * troca de CURSO na mesma matrícula não é marcada pelo gatilho (ele compara
--     o mesmo `emusys_disciplina_id`) -- 4 linhas sumidas da API sem `sucedida_por`,
--     conferidas uma a uma em GET /matriculas.
--
-- Critério (o Emusys é a fonte): quando o sync grava uma linha da matrícula M,
-- toda OUTRA linha `ativa`/`trancada` de M cuja última sincronização é mais de
-- 12 h anterior não veio nessa leitura -> o Emusys não a tem mais -> `finalizada`.
-- É sucessão por presença dentro da MESMA matrícula, não ausência na unidade:
-- uma varredura truncada nunca encerra nada, porque a matrícula que não veio
-- também não dispara o gatilho. As 12 h separam rodadas (o sync é diário) e
-- protegem as irmãs da mesma rodada, gravadas segundos depois.
-- Se a linha reaparecer na API, o próprio sync regrava o status -- autocorrige.
--
-- `fonte_ultima_atualizacao = 'regra:sumiu_do_emusys'` de propósito: os gatilhos
-- de "novidades" (trg_eventos_operacionais_*) só reagem a fonte `webhook:%`, então
-- o encerramento não gera aviso falso de "matrícula encerrada" a professor.
-- `sucedida_por` e os filtros do LA Teacher (20261008130000, repo la-teacher)
-- NÃO são tocados.
--
-- Efeito medido (BEGIN/ROLLBACK, 08/10, só com as 161): vw_jornada -161 linhas
-- (alunos distintos CG 451->449, REC 435->433); carteira: 19 professores, quase
-- tudo turma duplicada (Marcos Serafim sai de CG e REC, 1 aluno cada, que já é do
-- professor novo); radar de renovações -1/-2 em 4 meses de 2027. Sem mudança:
-- KPIs de alunos (admin operacional), retenção do professor, agenda do dia.
--
-- Custo: o gatilho roda por linha gravada pelo sync (~1,2 mil/unidade/noite),
-- com UPDATE indexado (idx_jornada_unidade_emusys_matricula) que quase sempre
-- não acha nada. Desprezível. Carimbo de cada encerramento em automacao_log
-- (evento='jornada_matricula', acao='linha_sumiu_do_emusys').
--
-- Checagem:
--   select created_at, aluno_nome, unidade_nome, status, detalhes
--     from automacao_log where evento = 'jornada_matricula'
--      and acao in ('linha_sumiu_do_emusys', 'linha_sumiu_do_emusys_erro')
--    order by id desc limit 20;

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
     or coalesce(new.fonte_ultima_atualizacao, '') <> 'sync-matriculas-emusys' then
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
  -- Não pode derrubar o sync, mas também não some: fica no automacao_log.
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

drop trigger if exists trg_jornada_encerra_linha_sumida on public.aluno_jornada_matricula_disciplina;
create trigger trg_jornada_encerra_linha_sumida
  after insert or update of ultima_sincronizacao_emusys
  on public.aluno_jornada_matricula_disciplina
  for each row execute function public.fn_jornada_encerra_linha_sumida();

-- Retroativo: mesma regra, contra a sincronização mais recente feita pelo sync
-- em qualquer outra linha da matrícula.
do $$
declare
  v_qtd int;
begin
  with ref as (
    select unidade_id, emusys_matricula_id, max(ultima_sincronizacao_emusys) as s_max
      from public.aluno_jornada_matricula_disciplina
     where emusys_matricula_id is not null
       and fonte_ultima_atualizacao = 'sync-matriculas-emusys'
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
             'origem', 'retroativo_20261008220000')
      from enc e
      left join public.alunos a on a.id = e.aluno_id
      left join public.unidades u on u.id = e.unidade_id
    returning 1
  )
  select count(*) into v_qtd from log;

  -- Medido em 08/10: 158 das 161 com `sucedida_por` + 4 sem (troca de curso /
  -- sucessor fantasma) + 2 de aluno que já saiu. Fora disso, algo mudou: parar.
  if v_qtd not between 150 and 180 then
    raise exception 'RETROATIVO_FORA_DO_ESPERADO: % linhas (esperado ~164)', v_qtd;
  end if;
  raise notice 'linhas encerradas no retroativo: %', v_qtd;
end $$;
