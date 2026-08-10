-- Dispara a propagacao do professor da experimental para `alunos.professor_experimental_id`
-- no momento em que a linha e promovida a realizada/convertida.
--
-- POR QUE TRIGGER E NAO EDGE: cinco caminhos promovem o status -- a reconciliacao do
-- sync-presenca-emusys (linha ~845), o confirmarExperimentais da mesma edge (~1351),
-- fn_reconciliar_experimental_aulas, registrar_experimental e a edicao manual pela tela.
-- A regra e um invariante da relacao lead_experimentais <-> alunos, nao um passo do sync;
-- posta dentro de um dos cinco escritores, ficaria furada nos outros quatro.
-- Mesmo padrao ja usado em fn_experimental_recebe_id_da_aula e trg_usuarios_sincroniza_rbac.
--
-- Ganho colateral: dispensa redeploy do sync-presenca-emusys, que e o passo de risco
-- desta frente (essa funcao foi derrubada em 02/08/2026 por deploy que resetou verify_jwt).
--
-- NUNCA BLOQUEIA A PROMOCAO: qualquer erro na propagacao vira warning. A promocao da
-- experimental e mais importante que o preenchimento do campo derivado.
--
-- Deixa rastro em leads_automacao_log (workflow_id='trg_propagar_professor_experimental')
-- somente quando de fato preenche -- e o que permite observar se a correcao esta agindo.
--
-- Custo medido: 7,9 ms / 1.951 buffers por lead. (A varredura sem argumento custa
-- 823 ms / 22.324 buffers e serve so ao backfill.)
--
-- Teste end-to-end antes de aplicar (10/08/2026), em transacao com ROLLBACK:
-- reconstituido o estado do dia da Amelie (#1925 com campo null, experimental 1347 de
-- volta a 'experimental_agendada'), a promocao disparou o trigger, o campo voltou a 62 e
-- o log registrou alunos_preenchidos=1. Rollback sem residuo.

create or replace function public.fn_propagar_professor_experimental()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if new.emusys_lead_id is null then return new; end if;
  if new.professor_experimental_id is null then return new; end if;
  if new.status not in ('experimental_realizada', 'convertido') then return new; end if;
  -- em UPDATE, so age quando o status de fato mudou (o `UPDATE OF status` dispara mesmo
  -- quando a coluna e reescrita com o mesmo valor)
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;

  begin
    v_n := public.propagar_professor_experimental(new.emusys_lead_id);

    if coalesce(v_n, 0) > 0 then
      insert into public.leads_automacao_log
        (lead_id, lead_nome, evento, acao, detalhes, workflow_id, execution_id)
      values (
        new.lead_id,
        coalesce(nullif(btrim(new.nome_aluno), ''), 'Sem nome'),
        'professor_experimental_propagado',
        'preenchido',
        jsonb_build_object(
          'emusys_lead_id', new.emusys_lead_id,
          'lead_experimental_id', new.id,
          'professor_experimental_id', new.professor_experimental_id,
          'alunos_preenchidos', v_n,
          'status_novo', new.status,
          'origem', tg_op
        ),
        'trg_propagar_professor_experimental',
        now()::text
      );
    end if;
  exception when others then
    raise warning '[trg_propagar_professor_experimental] falhou p/ emusys_lead_id %: %',
      new.emusys_lead_id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.fn_propagar_professor_experimental() from public, anon, authenticated;

drop trigger if exists trg_propagar_professor_experimental on public.lead_experimentais;

create trigger trg_propagar_professor_experimental
  after insert or update of status on public.lead_experimentais
  for each row execute function public.fn_propagar_professor_experimental();
