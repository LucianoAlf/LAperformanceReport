-- Reagendar a aula anula a chamada da ocorrência ANTIGA — do professor e dos alunos.
--
-- CASO (Mayra/CG, 25/08/2026 10h): a tela mostrava o professor Caio Tenório de Araújo
-- como PRESENTE num dia cujas aulas começam às 14h e ainda não tinham começado. Não foi
-- ela que marcou.
--
-- O QUE ACONTECEU: a aula 232129 era de **13/08 às 15:00**. Naquele dia a secretaria fez
-- a chamada — marcou o Caio presente e o aluno Levi de Freitas Simões como falta (18:42
-- de 13/08). Depois o Emusys **reagendou a aula para 25/08 às 14:00**, e o upsert move a
-- linha preservando o `emusys_id`. A marcação viajou junto com ela.
--
-- ⚠️ E a trava que criamos em 12/08 para o sync não apagar decisão humana
-- (`trg_proteger_decisao_humana_aula`) era justamente o que segurava a mentira de pé:
-- ela restaura `professor_presenca` em qualquer UPDATE sem a flag de escrita humana,
-- inclusive no UPDATE que muda a data. Proteção boa aplicada a um caso que ela não previu.
--
-- A REGRA: decisão de presença é sobre uma OCORRÊNCIA, não sobre um contrato. Se a
-- ocorrência mudou de dia, a chamada daquele dia deixa de valer — e tem de ser refeita.
-- Preservá-la é afirmar que alguém esteve numa aula que ainda não aconteceu.
--
-- Medido antes do fix: 3 aulas futuras com decisão humana de professor (uma por unidade),
-- TODAS reagendadas, 2 afirmando "presente"; e 8 linhas de presença de aluno respondidas
-- em data anterior à da aula (Barra 3, CG 3, Recreio 2).
--
-- ⚠️ `emusys_presenca_bruta` NÃO é apagada: é o que o Emusys diz, e continua sendo fato.
-- O que morre é a camada de DECISÃO (status_presenca/respondido_por), que é nossa.
-- ⚠️ Cancelamento humano (`cancelada_origem`) fica intocado de propósito: não medi nenhum
-- caso e a semântica é outra — quem cancelou pode ter cancelado a série, não a ocorrência.

create or replace function public.fn_proteger_decisao_humana_aula()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('app.escrita_humana_aula', true), '') = 'on' then
    return new;
  end if;

  -- REAGENDAMENTO: a decisao era sobre a ocorrencia antiga e morre com ela.
  -- Vem ANTES da protecao de proposito — senao a protecao restaura a marcacao velha
  -- na data nova, que e' exatamente o defeito do caso Caio/25-08.
  if new.data_hora_inicio is distinct from old.data_hora_inicio then
    new.professor_presenca := 'ausente';
    new.professor_presenca_origem := null;
    return new;
  end if;

  if old.professor_presenca_origem is not null then
    new.professor_presenca := old.professor_presenca;
    new.professor_presenca_origem := old.professor_presenca_origem;
  end if;

  if coalesce(old.cancelada, false) and old.cancelada_origem is not null then
    new.cancelada := true;
    new.cancelada_origem := old.cancelada_origem;
  end if;

  return new;
end;
$function$;

-- A chamada dos ALUNOS daquela ocorrencia tambem volta a ser pendente.
create or replace function public.fn_reagendamento_limpa_chamada_alunos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_qtd integer;
begin
  if new.data_hora_inicio is not distinct from old.data_hora_inicio then
    return new;
  end if;

  -- Toda linha existente e' necessariamente anterior a este UPDATE, entao qualquer
  -- decisao forte aqui foi tomada sobre a ocorrencia antiga.
  update public.aluno_presenca ap
     set status = case when ap.emusys_presenca_bruta = 'presente' then 'presente' else 'ausente' end,
         status_presenca = case when ap.emusys_presenca_bruta = 'presente' then 'presente' else null end,
         respondido_por = 'emusys',
         respondido_em = null,
         espelhado_de_presenca_id = null,
         data_aula = new.data_aula,
         horario_aula = (new.data_hora_inicio at time zone 'America/Sao_Paulo')::time
   where ap.aula_emusys_id = new.id
     and public.fn_presenca_e_forte(ap.respondido_por);
  get diagnostics v_qtd = row_count;

  if v_qtd > 0 then
    insert into public.automacao_log(acao, status, detalhes)
    values ('presenca_limpa_por_reagendamento', 'warn',
      jsonb_build_object('aula_id', new.id, 'emusys_id', new.emusys_id,
        'de', old.data_hora_inicio, 'para', new.data_hora_inicio, 'linhas', v_qtd));
  end if;

  return new;
exception when others then
  -- nunca derrubar o sync por causa do log/limpeza
  return new;
end;
$function$;

drop trigger if exists trg_reagendamento_limpa_chamada_alunos on public.aulas_emusys;
create trigger trg_reagendamento_limpa_chamada_alunos
  after update of data_hora_inicio on public.aulas_emusys
  for each row execute function public.fn_reagendamento_limpa_chamada_alunos();

-- BACKFILL do que ja esta pendurado.
-- ⚠️ Precisa da flag `app.escrita_humana_aula`: sem ela a propria protecao restauraria
-- o valor que estamos limpando.
do $bf$
declare v_prof integer; v_alu integer;
begin
  perform set_config('app.escrita_humana_aula', 'on', true);

  update public.aulas_emusys ae
     set professor_presenca = 'ausente', professor_presenca_origem = null
   where ae.reagendada
     and ae.professor_presenca_origem is not null
     and ae.data_hora_inicio > now();
  get diagnostics v_prof = row_count;

  update public.aluno_presenca ap
     set status = case when ap.emusys_presenca_bruta = 'presente' then 'presente' else 'ausente' end,
         status_presenca = case when ap.emusys_presenca_bruta = 'presente' then 'presente' else null end,
         respondido_por = 'emusys', respondido_em = null, espelhado_de_presenca_id = null
    from public.aulas_emusys ae
   where ae.id = ap.aula_emusys_id
     and ae.reagendada
     and ap.respondido_em is not null
     and ap.respondido_em::date < ae.data_aula
     and public.fn_presenca_e_forte(ap.respondido_por);
  get diagnostics v_alu = row_count;

  raise notice 'backfill: % aulas de professor, % linhas de aluno', v_prof, v_alu;
end $bf$;;
