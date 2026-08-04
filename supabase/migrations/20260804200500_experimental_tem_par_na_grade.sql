-- experimental_tem_par_na_grade
--
-- Responde: "esta linha agendada de lead_experimentais ainda corresponde a uma aula de
-- verdade no Emusys?". Serve ao observador para encerrar as linhas que um reagendamento
-- substituiu.
--
-- POR QUE PRECISA DISSO: o webhook `aula_experimental_reagendada` traz o estado NOVO e
-- nenhuma referencia ao antigo (sem id de aula, sem a data anterior — conferido nas 20
-- entregas ja observadas). Como a chave de dedup da registrar_experimental e
-- (lead, data, horario, curso), qualquer um desses que mude faz nascer linha nova e deixa
-- a antiga viva e agendada. A grade (`aulas_emusys` + `aula_alunos_emusys`, sincronizada
-- da API) sabe a resposta: se a aula sumiu de la, ela nao existe mais no Emusys. E
-- verificacao contra a fonte, nao palpite.
--
-- ⚠️ O PROFESSOR FICOU DE FORA DO CASAMENTO, DE PROPOSITO. A primeira versao incluia, para
-- separar as duas linhas da Beatriz Romero (mesmo dia e horario, so o professor difere).
-- Mas ao testar contra as 18 agendadas futuras isso acusou o Felipe Salgado como fantasma
-- quando a aula dele existe: `lead_experimentais` diz professor 57 e a grade diz 46. Ou
-- seja, divergencia de professor no NOSSO cadastro viraria cancelamento de aula real.
-- Quem desempata o caso Beatriz e o chamador, comparando o slot com o da linha nova —
-- ver `encerrarExperimentaisSubstituidas` no observador.
--
-- Permissiva no resto, porque um falso "nao tem par" CANCELA uma aula que vai acontecer:
--   - nao filtra categoria (se o lead matriculou, a aula pode ter virado regular);
--   - aula cancelada na grade nao conta como par.
create or replace function public.experimental_tem_par_na_grade(
  p_unidade_id uuid,
  p_nome_aluno text,
  p_data date,
  p_horario time
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from aulas_emusys ae
    join aula_alunos_emusys aae on aae.aula_emusys_id = ae.id
    where ae.unidade_id = p_unidade_id
      and coalesce(ae.cancelada, false) = false
      and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date = p_data
      and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time = p_horario
      and lower(unaccent(btrim(aae.aluno_nome))) = lower(unaccent(btrim(p_nome_aluno)))
  );
$$;

drop function if exists public.experimental_tem_par_na_grade(uuid, text, date, time, integer);

-- O schema public tem ALTER DEFAULT PRIVILEGES concedendo EXECUTE a `anon` em funcao
-- nova, entao `revoke from public` nao basta: precisa tirar de anon nominalmente.
revoke all on function public.experimental_tem_par_na_grade(uuid, text, date, time) from public, anon;
grant execute on function public.experimental_tem_par_na_grade(uuid, text, date, time) to authenticated, service_role;
