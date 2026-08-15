-- A fotografia atual do Emusys define a existencia operacional da aula.
-- Aulas marcadas como ausentes nessa fotografia continuam no banco para
-- auditoria, mas nao devem voltar pela leitura operacional da Agenda.

do $migration$
begin
  if to_regprocedure('public.get_agenda_dia_historico_sync_v1(date, uuid)') is null then
    if to_regprocedure('public.get_agenda_dia(date, uuid)') is null then
      raise exception
        'get_agenda_dia(date, uuid) nao existe para preservar como historico';
    end if;

    alter function public.get_agenda_dia(date, uuid)
      rename to get_agenda_dia_historico_sync_v1;
  end if;
end
$migration$;

create or replace function public.get_agenda_dia(
  p_data date,
  p_unidade_id uuid default null::uuid
)
returns table(
  chave text,
  unidade_id uuid,
  unidade_nome text,
  professor_nome text,
  professor_id integer,
  professor_foto_url text,
  sala_nome text,
  curso_nome text,
  turma_nome text,
  hora_inicio text,
  hora_fim text,
  duracao_minutos integer,
  categoria text,
  tipo text,
  cancelada boolean,
  justificada boolean,
  reagendada boolean,
  hora_original text,
  nr_da_aula integer,
  qtd_aulas_contrato integer,
  qtd_alunos integer,
  anotacoes text,
  anotacoes_fabio text,
  professor_presenca text,
  alunos jsonb,
  aula_ids integer[],
  cancelada_motivo text,
  cancelada_origem text,
  experimental_leads jsonb
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
  select
    historico.chave,
    historico.unidade_id,
    historico.unidade_nome,
    historico.professor_nome,
    historico.professor_id,
    historico.professor_foto_url,
    historico.sala_nome,
    historico.curso_nome,
    historico.turma_nome,
    historico.hora_inicio,
    historico.hora_fim,
    historico.duracao_minutos,
    historico.categoria,
    historico.tipo,
    historico.cancelada,
    historico.justificada,
    historico.reagendada,
    historico.hora_original,
    historico.nr_da_aula,
    historico.qtd_aulas_contrato,
    historico.qtd_alunos,
    historico.anotacoes,
    historico.anotacoes_fabio,
    historico.professor_presenca,
    historico.alunos,
    historico.aula_ids,
    historico.cancelada_motivo,
    historico.cancelada_origem,
    historico.experimental_leads
  from public.get_agenda_dia_historico_sync_v1(p_data, p_unidade_id) as historico
  where historico.cancelada_origem is distinct from 'sync_ausente_emusys';
$function$;

revoke all on function public.get_agenda_dia_historico_sync_v1(date, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.get_agenda_dia(date, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_agenda_dia(date, uuid)
  to authenticated, service_role;
