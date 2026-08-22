-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 013 Fase 3: fonte única operacional "alunos sem presença FORTE por aula/unidade/dia".
-- Roster-gap-aware + source-aware (fn_presenca_e_forte). Fábio (professor), Sol/Hugo (unidade), coordenação (dias>=3).

create or replace view public.vw_presenca_pendencia as
select
  ae.unidade_id, u.nome as unidade_nome, ae.professor_id, p.nome as professor_nome,
  ae.id as aula_id, ae.tipo, ae.data_aula, ae.data_hora_inicio, ae.data_hora_fim,
  to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI') as hora,
  ae.curso_nome, ae.turma_nome, r.aluno_id, al.nome as aluno_nome,
  split_part(btrim(al.nome), ' ', 1) as aluno_primeiro_nome,
  coalesce(adm.justificada, false) as justificada,
  floor(extract(epoch from now() - ae.data_hora_fim) / 86400)::int as dias_em_atraso
from public.aulas_emusys ae
join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id and r.aluno_id is not null
join public.alunos al on al.id = r.aluno_id
join public.unidades u on u.id = ae.unidade_id
left join public.professores p on p.id = ae.professor_id
left join public.aluno_presenca_administrativo adm on adm.aula_emusys_id = ae.id and adm.aluno_id = r.aluno_id
where coalesce(ae.cancelada, false) = false and ae.professor_id is not null
  and ae.data_hora_fim < now() and ae.data_aula >= current_date - 45
  and (ae.tipo = 'turma' or not exists (
        select 1 from public.aulas_emusys t where t.tipo = 'turma' and t.unidade_id = ae.unidade_id
          and t.data_hora_inicio = ae.data_hora_inicio and t.professor_id is not distinct from ae.professor_id
          and coalesce(t.cancelada, false) = false))
  and not exists (
        select 1 from public.aluno_presenca ap where ap.aula_emusys_id = ae.id and ap.aluno_id = r.aluno_id
          and public.fn_presenca_e_forte(ap.respondido_por));

comment on view public.vw_presenca_pendencia is
  'Governanca operacional (Fase 3): alunos sem presenca FORTE por aula/unidade/dia (fn_presenca_e_forte), roster-gap-aware, janela 45d. Fonte unica p/ Fabio (professor), Sol/Hugo (unidade), coordenacao (dias>=3). Nao e o canon analitico.';

revoke all on public.vw_presenca_pendencia from anon, authenticated;
