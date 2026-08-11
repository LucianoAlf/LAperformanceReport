-- Anota a sucessao de ciclo assim que o ciclo NOVO entra na jornada.
--
-- Vai no BANCO, e nao numa edge, porque ha DOIS caminhos de escrita nesta tabela:
-- `sync-matriculas-emusys` (cron diario) e `processar-matricula-emusys` (webhook).
-- Enganchar em um cobriria metade e ainda cobraria redeploy. Mesmo precedente de
-- fn_experimental_recebe_id_da_aula e trg_usuarios_sincroniza_rbac.
--
-- Deteccao por SUCESSAO (evento positivo: chegou o ciclo novo), nao por ausencia
-- ("a linha sumiu da varredura"). A deteccao por ausencia exigiria uma guarda de
-- paginacao completa -- uma varredura truncada encerraria a unidade inteira.
--
-- Tres guardas obrigatorias:
--   1. pg_trigger_depth(): o UPDATE abaixo mexe na propria tabela.
--   2. exception when others: NUNCA bloquear o sync/webhook por causa de uma
--      anotacao. Se falhar, a linha so fica sem marcar e a proxima passada resolve.
--   3. saida cedo: o sync toca ~4.900 linhas por rodada; o caso comum tem que sair
--      antes de qualquer I/O.
--
-- ⚠️ Aceita sucessora com status 'desconhecido'. Linha criada pelo WEBHOOK nasce
-- assim -- o payload de renovacao nao traz o status da matricula (17 linhas nesse
-- estado em 10/08/2026). Exigir 'ativa' deixaria 6 casos de fora (medido: Recreio 4,
-- CG 2), e foi exatamente o furo da primeira versao desta regra.

create or replace function public.fn_jornada_marca_ciclo_sucedido()
returns trigger
language plpgsql
as $$
begin
  -- (1) o UPDATE abaixo redispara este mesmo trigger
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- (3) saida cedo no caso comum
  if new.emusys_matricula_id is null
     or new.emusys_disciplina_id is null
     or new.data_ultima_aula is null
     or coalesce(new.status_matricula, '') = 'finalizada' then
    return null;
  end if;

  update public.aluno_jornada_matricula_disciplina velha
     set sucedida_por = new.emusys_matricula_disciplina_id,
         sucedida_em  = now()
   where velha.unidade_id            = new.unidade_id
     and velha.emusys_matricula_id   = new.emusys_matricula_id
     and velha.emusys_disciplina_id  = new.emusys_disciplina_id
     -- id menor E fim anterior: as duas juntas evitam marcar por engano um vinculo
     -- paralelo (uma matricula pode ter mais de uma disciplina de verdade)
     and velha.emusys_matricula_disciplina_id < new.emusys_matricula_disciplina_id
     and velha.data_ultima_aula               < new.data_ultima_aula
     and velha.sucedida_por is null;

  return null;

-- (2) anotacao nunca derruba a transacao de quem escreveu
exception when others then
  return null;
end;
$$;

revoke all on function public.fn_jornada_marca_ciclo_sucedido() from public, anon;

drop trigger if exists trg_jornada_ciclo_sucedido on public.aluno_jornada_matricula_disciplina;

create trigger trg_jornada_ciclo_sucedido
  after insert or update of data_ultima_aula, status_matricula, emusys_disciplina_id
  on public.aluno_jornada_matricula_disciplina
  for each row
  execute function public.fn_jornada_marca_ciclo_sucedido();
