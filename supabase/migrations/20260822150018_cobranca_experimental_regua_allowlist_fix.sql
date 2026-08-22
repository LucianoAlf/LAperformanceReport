-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Fix round 1 (Achado 1): fecha por ALLOWLIST, nao denylist.
-- status tem DEFAULT 'rascunho' NOT NULL; denylist tratava rascunho (o
-- default de todo INSERT que omite status) como "tem devolutiva" e fechava
-- a pendencia sem o comercial nunca ter recebido nada.
create or replace view public.vw_experimental_pendencia as
select
  v.id                                   as vinculo_id,
  le.id                                  as lead_id,
  le.nome_aluno,
  a.id                                   as aula_id,
  a.professor_id,
  u.nome                                 as professor_nome,
  a.unidade_id,
  un.nome                                as unidade_nome,
  a.curso_nome,
  a.data_hora_fim,
  floor(extract(epoch from now() - a.data_hora_fim) / 3600)::integer  as horas_em_atraso,
  floor(extract(epoch from now() - a.data_hora_fim) / 86400)::integer as dias_em_atraso,
  'experimental'::text                   as tipo_alvo
from public.lead_experimentais le
join public.lead_experimental_aulas v
  on v.lead_experimental_id = le.id
 and v.substituido_em is null
 and v.cancelado_em is null
join public.aulas_emusys a on a.id = v.aula_local_id
left join public.professores pr on pr.id = a.professor_id
left join public.usuarios u on u.id = pr.usuario_id
left join public.unidades un on un.id = a.unidade_id
where
  le.status in ('experimental_realizada', 'convertido')
  and a.id = public.fn_aula_operacional_id(a.id)
  and coalesce(a.cancelada, false) = false
  and a.data_hora_fim < now()
  and (a.data_hora_fim at time zone 'America/Sao_Paulo')::date >= public.fn_data_corte_experimental()
  and public.fn_professor_usa_app(a.professor_id)
  and not exists (
    select 1 from public.lead_experimental_registros r
     where r.vinculo_id = v.id
       and r.status = 'confirmado'
  );

comment on view public.vw_experimental_pendencia is
  'Experimental realizada, do corte pra frente, cujo professor tem o app e ainda nao CONFIRMOU a devolutiva. Fecha por ALLOWLIST (so status=confirmado fecha) de proposito: rascunho e o DEFAULT da tabela, e um denylist trataria omissao de status como devolutiva feita. Regua propria: a de aluno (vw_registro_pendencia) nao e tocada.';
