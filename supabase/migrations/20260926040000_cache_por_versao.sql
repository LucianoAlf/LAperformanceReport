-- CACHE POR VERSAO (LAPE-42) -- o cache so e reusado enquanto NADA do que ele le mudou.
--
-- Os 12 caches de servidor criados em 23-25/09 expiravam por TEMPO (5 min a 1 dia) e nada os
-- avisava de uma gravacao: "cliquei e nao aparece". Pegou a presenca na Chamada (Arthur,
-- 24/09 ~19h40; a Agenda ja saiu do cache em 20260926030000) e valia igual para
-- inadimplencia e faturas (10 min). Regra do Hugo: dado que o usuario muda so usa cache
-- por VERSAO, ou nenhum.
--
-- Como funciona:
-- 1. cache_versao_log: cada COMANDO que grava numa das tabelas lidas pelos caches deixa uma
--    linha (gatilho de statement), NA MESMA TRANSACAO da gravacao. Linha e dado entram
--    juntos -- nao existe janela em que o dado mudou e a versao nao.
-- 2. cache_versao_v1(funcao) = count:max:sum dos ids VISIVEIS das tabelas daquela funcao
--    (cache_dependencias) + escopo do usuario. Vai para dentro da chave de cada cache:
--    gravou, a proxima leitura ja tem outra chave e recalcula.
--    Por que nao um contador numa linha: todo escritor esperaria o lock dessa linha.
--    Por que nao sequencia: nextval e visivel ANTES do commit (versao nova, dado velho).
--    Por que count+sum e nao so max: transacao longa que pega id menor e commita depois
--    nao muda o max; muda count e sum.
--    Por que nao pg_stat_user_tables (impressao digital): o contador atrasa de 1 s a 60 s.
-- 3. O escopo do usuario (paginas_rpc_cache_escopo_v1) passa a estar em TODA chave: a de
--    inadimplencia e a de faturas Emusys nao tinham -- um usuario de unidade podia receber o
--    payload consolidado montado por um admin.
-- 4. cache_versao_podar_v1 (cron a cada 10 min) apaga log com mais de 1 h (preservando o
--    ultimo de cada tabela e qualquer linha mais nova que a transacao ativa mais antiga) e
--    cache com mais de 3 h; carimba cada rodada em automacao_log (evento cache_versao).
--
-- Dependencias: fecho das funcoes publicas chamadas por cada cache (65 funcoes) + views
-- expandidas por pg_rewrite; unico schema externo e auth. sync_run_items fica FORA de
-- proposito: so e lida pelo run publicado, e publicar grava sync_runs (que esta na lista).
-- Tabela nova lida por um cache TEM de entrar em cache_dependencias e ganhar o gatilho --
-- cache_versao_v1 recusa funcao sem dependencias registradas (nunca vira TTL em silencio).

-- PARTE A -- estruturas e funcoes (nenhum lock em tabela movimentada).
set local lock_timeout = '10s';

create table if not exists public.cache_versao_log (
  id bigint generated always as identity primary key,
  tabela text not null,
  em timestamptz not null default now()
);
create index if not exists cache_versao_log_tabela_id_idx on public.cache_versao_log (tabela, id);
alter table public.cache_versao_log enable row level security;
revoke all on public.cache_versao_log from public, anon, authenticated;
comment on table public.cache_versao_log is
  'LAPE-42: uma linha por comando de escrita nas tabelas lidas pelos caches de servidor. Versao de cache = count:max:sum dos ids visiveis. Podado por cache_versao_podar_v1.';

create table if not exists public.cache_dependencias (
  funcao text primary key,
  tabelas text[] not null,
  atualizado_em timestamptz not null default now()
);
alter table public.cache_dependencias enable row level security;
revoke all on public.cache_dependencias from public, anon, authenticated;
comment on table public.cache_dependencias is
  'LAPE-42: tabelas que cada funcao cacheada le (fecho de funcoes + views). Tabela fora desta lista NAO invalida o cache.';

insert into public.cache_dependencias (funcao, tabelas) values
  ('get_conciliacao_experimentais_v2(uuid,integer,integer,text,date)', array['aluno_presenca', 'alunos', 'aulas_emusys', 'banda', 'cursos', 'emusys_experimentais_raw', 'evento', 'lead_experimentais', 'lead_experimentais_decisoes_humanas', 'leads', 'perfil_permissoes', 'permissoes', 'professores', 'tipos_matricula', 'unidades', 'usuario_perfis', 'usuarios']),
  ('get_dashboard_professores_resumo_canonico_v1(integer,integer,uuid,date,date)', array['aluno_jornada_matricula_disciplina', 'aluno_presenca', 'alunos', 'aula_alunos_emusys', 'aulas_emusys', 'banda', 'curso_emusys_depara', 'cursos', 'evento', 'movimentacoes_admin', 'perfil_permissoes', 'permissoes', 'professor_carteira_mensal_canonica', 'professores', 'professores_unidades', 'tipos_matricula', 'usuario_perfis', 'usuarios']),
  ('get_faturas_alunos_financeiro_v1(uuid,integer,integer,text,text,date)', array['alunos', 'alunos_arquivados', 'caixa_movimentacao_faturas', 'caixa_movimentacoes', 'cursos', 'emusys_faturas', 'emusys_matriculas_estado_atual', 'evento', 'financeiro_emusys_lancamentos', 'financeiro_fatura_reconciliacao_decisoes', 'formas_pagamento', 'professores', 'rbac_piloto_usuarios', 'sync_runs', 'unidades', 'usuario_perfis', 'usuarios']),
  ('get_financeiro_faturas_emusys(uuid,integer,integer)', array['alunos', 'banda', 'cursos', 'emusys_matriculas_estado_atual', 'fechamento_mensal_snapshots', 'movimentacoes_admin', 'rbac_piloto_usuarios', 'sync_runs', 'tipos_matricula', 'unidades', 'usuario_perfis', 'usuarios']),
  ('get_health_score_professor_v3_performance_snapshot_v3(date,uuid,text)', array['health_score_professor_v3_config_metas_curso_modalidade', 'health_score_professor_v3_config_metricas', 'health_score_professor_v3_config_versoes', 'health_score_professor_v3_snapshot_metricas', 'health_score_professor_v3_snapshots', 'professores', 'professores_unidades']),
  ('get_inadimplencia_canonica(uuid,date)', array['alunos', 'emusys_matriculas_estado_atual', 'rbac_piloto_usuarios', 'sync_runs', 'unidades', 'usuario_perfis', 'usuarios']),
  ('get_kpis_alunos_admin_operacional(uuid,integer,integer)', array['aluno_jornada_matricula_disciplina', 'alunos', 'alunos_historico', 'banda', 'competencias_mensais', 'cursos', 'dados_mensais', 'emusys_matriculas_estado_atual', 'fechamento_mensal_snapshots', 'movimentacoes', 'movimentacoes_admin', 'perfil_permissoes', 'permissoes', 'rbac_piloto_usuarios', 'tipos_matricula', 'unidades', 'usuario_perfis', 'usuarios']),
  ('get_kpis_alunos_canonicos(uuid,integer,integer)', array['aluno_jornada_matricula_disciplina', 'alunos', 'alunos_historico', 'banda', 'competencias_mensais', 'cursos', 'dados_mensais', 'emusys_matriculas_estado_atual', 'fechamento_mensal_snapshots', 'movimentacoes', 'movimentacoes_admin', 'perfil_permissoes', 'permissoes', 'rbac_piloto_usuarios', 'tipos_matricula', 'unidades', 'usuario_perfis', 'usuarios']),
  ('get_kpis_comercial_canonicos_v2(uuid,integer,integer,text,date)', array['aluno_presenca', 'alunos', 'aulas_emusys', 'banda', 'canais_origem', 'cursos', 'lead_experimentais', 'leads', 'tipos_matricula', 'unidades', 'visitas']),
  ('get_kpis_professores_cadastro_canonicos_v1(integer,integer,uuid,date,date)', array['aluno_jornada_matricula_disciplina', 'aluno_presenca', 'alunos', 'aula_alunos_emusys', 'aulas_emusys', 'curso_emusys_depara', 'cursos', 'evento', 'perfil_permissoes', 'permissoes', 'professor_carteira_mensal_canonica', 'professores', 'rbac_piloto_usuarios', 'unidades', 'usuario_perfis', 'usuarios']),
  ('get_kpis_turmas_canonicos_v2(integer,integer,uuid,date,date)', array['aluno_jornada_matricula_disciplina', 'aluno_presenca', 'alunos', 'aula_alunos_emusys', 'aulas_emusys', 'competencias_mensais', 'curso_emusys_depara', 'cursos', 'evento', 'perfil_permissoes', 'permissoes', 'professor_carteira_mensal_canonica', 'professores', 'rbac_piloto_usuarios', 'turmas', 'unidades', 'usuario_perfis', 'usuarios']),
  ('get_tempo_permanencia(uuid,integer,integer)', array['alunos', 'alunos_historico', 'banda', 'tipos_matricula', 'unidades'])
on conflict (funcao) do update set tabelas = excluded.tabelas, atualizado_em = now();

create or replace function public.cache_versao_registrar_trg()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $fn$
begin
  insert into public.cache_versao_log (tabela) values (tg_table_name);
  return null;
end;
$fn$;
revoke all on function public.cache_versao_registrar_trg() from public, anon, authenticated;

create or replace function public.cache_versao_v1(p_funcao text)
 returns text
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_tabelas text[];
  v_versao text;
begin
  select d.tabelas into v_tabelas from public.cache_dependencias d where d.funcao = p_funcao;
  if v_tabelas is null then
    -- Sem dependencias o cache viraria TTL puro sem ninguem saber: recusa.
    raise exception 'CACHE_SEM_DEPENDENCIAS: % nao esta em cache_dependencias', p_funcao
      using errcode = '22023';
  end if;

  select concat_ws(':', count(*), coalesce(max(l.id), 0), coalesce(sum(l.id), 0))
    into v_versao
  from public.cache_versao_log l
  where l.tabela = any(v_tabelas);

  return v_versao || '|' || public.paginas_rpc_cache_escopo_v1();
end;
$fn$;
revoke all on function public.cache_versao_v1(text) from public, anon, authenticated;

create or replace function public.cache_versao_podar_v1()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_inicio timestamptz := clock_timestamp();
  v_limite timestamptz;
  v_log int;
  v_cache int := 0;
  v_n int;
  v_tabela text;
  v_resultado jsonb;
begin
  -- Nunca apagar linha que uma transacao ainda aberta poderia deixar de ver: a mais antiga
  -- manda no limite. Menos que 1 h nunca.
  v_limite := least(
    now() - interval '1 hour',
    coalesce((select min(a.xact_start) from pg_stat_activity a
              where a.xact_start is not null and a.pid <> pg_backend_pid()), now())
  );

  delete from public.cache_versao_log l
  where l.em < v_limite
    and l.id < (select max(m.id) from public.cache_versao_log m where m.tabela = l.tabela);
  get diagnostics v_log = row_count;

  foreach v_tabela in array array['paginas_rpc_cache', 'faturas_leitura_cache', 'kpis_alunos_cache',
      'dash_prof_resumo_cache', 'health_score_v3_reader_cache', 'kpis_comercial_v2_cache',
      'conciliacao_experimentais_v2_cache'] loop
    execute format('delete from public.%I where built_at < now() - interval ''3 hours''', v_tabela);
    get diagnostics v_n = row_count;
    v_cache := v_cache + v_n;
  end loop;

  v_resultado := jsonb_build_object(
    'log_apagado', v_log, 'cache_apagado', v_cache,
    'log_restante', (select count(*) from public.cache_versao_log),
    'limite', v_limite, 'inicio', v_inicio, 'fim', clock_timestamp());
  insert into public.automacao_log (aluno_nome, evento, acao, status, detalhes)
  values ('(cache de servidor)', 'cache_versao', 'podar', 'ok', v_resultado);
  return v_resultado;
end;
$fn$;
revoke all on function public.cache_versao_podar_v1() from public, anon, authenticated;

-- PARTE B -- Gatilhos: um por tabela, por COMANDO (nao por linha), cada um na SUA transacao.
-- Criar os 46 numa transacao so segurou lock em todas ao mesmo tempo e deu deadlock com o sync
-- no ensaio (24/09): aplicado tabela a tabela com lock_timeout curto e nova tentativa. Sem
-- drop trigger (pede AccessExclusive). A PARTE C so roda depois de os 46 existirem -- senao
-- haveria cache com versao que nao muda quando a tabela sem gatilho muda.
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.aluno_jornada_matricula_disciplina'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.aluno_jornada_matricula_disciplina for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.aluno_presenca'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.aluno_presenca for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.alunos'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.alunos for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.alunos_arquivados'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.alunos_arquivados for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.alunos_historico'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.alunos_historico for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.aula_alunos_emusys'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.aula_alunos_emusys for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.aulas_emusys'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.aulas_emusys for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.banda'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.banda for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.caixa_movimentacao_faturas'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.caixa_movimentacao_faturas for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.caixa_movimentacoes'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.caixa_movimentacoes for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.canais_origem'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.canais_origem for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.competencias_mensais'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.competencias_mensais for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.curso_emusys_depara'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.curso_emusys_depara for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.cursos'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.cursos for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.dados_mensais'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.dados_mensais for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.emusys_experimentais_raw'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.emusys_experimentais_raw for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.emusys_faturas'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.emusys_faturas for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.emusys_matriculas_estado_atual'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.emusys_matriculas_estado_atual for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.evento'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.evento for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.fechamento_mensal_snapshots'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.fechamento_mensal_snapshots for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.financeiro_emusys_lancamentos'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.financeiro_emusys_lancamentos for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.financeiro_fatura_reconciliacao_decisoes'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.financeiro_fatura_reconciliacao_decisoes for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.formas_pagamento'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.formas_pagamento for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.health_score_professor_v3_config_metas_curso_modalidade'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.health_score_professor_v3_config_metas_curso_modalidade for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.health_score_professor_v3_config_metricas'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.health_score_professor_v3_config_metricas for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.health_score_professor_v3_config_versoes'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.health_score_professor_v3_config_versoes for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.health_score_professor_v3_snapshot_metricas'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.health_score_professor_v3_snapshot_metricas for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.health_score_professor_v3_snapshots'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.health_score_professor_v3_snapshots for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.lead_experimentais'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.lead_experimentais for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.lead_experimentais_decisoes_humanas'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.lead_experimentais_decisoes_humanas for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.leads'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.leads for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.movimentacoes'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.movimentacoes for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.movimentacoes_admin'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.movimentacoes_admin for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.perfil_permissoes'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.perfil_permissoes for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.permissoes'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.permissoes for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.professor_carteira_mensal_canonica'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.professor_carteira_mensal_canonica for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.professores'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.professores for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.professores_unidades'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.professores_unidades for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.rbac_piloto_usuarios'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.rbac_piloto_usuarios for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.sync_runs'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.sync_runs for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.tipos_matricula'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.tipos_matricula for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.turmas'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.turmas for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.unidades'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.unidades for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.usuario_perfis'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.usuario_perfis for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.usuarios'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.usuarios for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;
do $g$ begin if not exists (select 1 from pg_trigger where tgname = 'trg_cache_versao' and tgrelid = 'public.visitas'::regclass) then create trigger trg_cache_versao after insert or update or delete or truncate on public.visitas for each statement execute function public.cache_versao_registrar_trg(); end if; end $g$;

do $confere_gatilhos$
declare v_faltando text;
begin
  select string_agg(t, ', ') into v_faltando
  from (select distinct unnest(tabelas) t from public.cache_dependencias) d
  where not exists (select 1 from pg_trigger g where g.tgname = 'trg_cache_versao'
                    and g.tgrelid = ('public.' || quote_ident(d.t))::regclass);
  if v_faltando is not null then
    raise exception 'CACHE_VERSAO_GATILHOS: faltam gatilhos em %', v_faltando;
  end if;
end;
$confere_gatilhos$;

-- PARTE C -- As 12 funcoes: a versao entra na chave, no unico ponto onde cada uma monta a chave.
do $chaves$
declare
  v_funcoes constant text[] := array[
    'get_conciliacao_experimentais_v2(uuid,integer,integer,text,date)',
    'get_dashboard_professores_resumo_canonico_v1(integer,integer,uuid,date,date)',
    'get_faturas_alunos_financeiro_v1(uuid,integer,integer,text,text,date)',
    'get_financeiro_faturas_emusys(uuid,integer,integer)',
    'get_health_score_professor_v3_performance_snapshot_v3(date,uuid,text)',
    'get_inadimplencia_canonica(uuid,date)',
    'get_kpis_alunos_admin_operacional(uuid,integer,integer)',
    'get_kpis_alunos_canonicos(uuid,integer,integer)',
    'get_kpis_comercial_canonicos_v2(uuid,integer,integer,text,date)',
    'get_kpis_professores_cadastro_canonicos_v1(integer,integer,uuid,date,date)',
    'get_kpis_turmas_canonicos_v2(integer,integer,uuid,date,date)',
    'get_tempo_permanencia(uuid,integer,integer)'];
  v_ancora constant text := 'md5(concat_ws(''|'',';
  v_funcao text;
  v_fn regprocedure;
  v_def text;
  v_acl_antes aclitem[];
  v_n int;
begin
  foreach v_funcao in array v_funcoes loop
    v_fn := v_funcao::regprocedure;
    v_def := pg_get_functiondef(v_fn);
    select p.proacl into v_acl_antes from pg_proc p where p.oid = v_fn;

    if v_def ~ 'cache_versao_v1' then
      raise exception 'CACHE_VERSAO_JA_APLICADA: %', v_funcao;
    end if;
    v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
    if v_n <> 1 then
      raise exception 'CACHE_VERSAO_ANCORA: % esperava 1 ocorrencia, achou %', v_funcao, v_n;
    end if;

    execute replace(v_def, v_ancora,
      v_ancora || format(E'\n    public.cache_versao_v1(%L),', v_funcao));

    v_def := pg_get_functiondef(v_fn);
    if strpos(v_def, format('public.cache_versao_v1(%L)', v_funcao)) = 0 then
      raise exception 'CACHE_VERSAO_VERIFY: % sem a versao na chave', v_funcao;
    end if;
    if (select p.proacl from pg_proc p where p.oid = v_fn) is distinct from v_acl_antes then
      raise exception 'CACHE_VERSAO_VERIFY: ACL de % mudou', v_funcao;
    end if;
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'CACHE_VERSAO_VERIFY: anon executa %', v_funcao;
    end if;
  end loop;
end;
$chaves$;

select cron.schedule('cache-versao-podar', '*/10 * * * *', 'select public.cache_versao_podar_v1()');
