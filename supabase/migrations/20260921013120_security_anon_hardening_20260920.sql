-- Auditoria de acesso anon (20/09/2026).
-- Escopo: fechar ACLs herdadas por PUBLIC sem alterar contratos de dados.
-- O estado anterior de ACL de anon/PUBLIC e preservado em private para o
-- roteiro versionado scripts/rollback/20260921012032_security_anon_hardening_20260920.sql.

create table if not exists private.security_anon_hardening_20260920_acl_backup (
  object_kind text not null check (object_kind in ('table', 'function')),
  object_identity text not null,
  grantee text not null,
  privilege_type text not null,
  is_grantable boolean not null,
  captured_at timestamptz not null default now(),
  primary key (object_kind, object_identity, grantee, privilege_type)
);

revoke all on table private.security_anon_hardening_20260920_acl_backup
  from public, anon, authenticated;

insert into private.security_anon_hardening_20260920_acl_backup
  (object_kind, object_identity, grantee, privilege_type, is_grantable)
select
  'table',
  format('public.%I', c.relname),
  case when a.grantee = 0 then 'PUBLIC' else role.rolname end,
  a.privilege_type,
  a.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
left join pg_roles role on role.oid = a.grantee
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and (a.grantee = 0 or role.rolname = 'anon')
on conflict do nothing;

insert into private.security_anon_hardening_20260920_acl_backup
  (object_kind, object_identity, grantee, privilege_type, is_grantable)
select
  'function',
  p.oid::regprocedure::text,
  case when a.grantee = 0 then 'PUBLIC' else role.rolname end,
  a.privilege_type,
  a.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
left join pg_roles role on role.oid = a.grantee
where n.nspname = 'public'
  and (a.grantee = 0 or role.rolname = 'anon')
on conflict do nothing;

-- P0: historico de campanhas segue a mesma fronteira de unidade do lead.
drop policy if exists rls_leads_campanhas_roles_internos on public.leads_campanhas;
drop policy if exists leads_campanhas_select_authenticated on public.leads_campanhas;
drop policy if exists leads_campanhas_insert_authenticated on public.leads_campanhas;
drop policy if exists leads_campanhas_update_authenticated on public.leads_campanhas;
drop policy if exists leads_campanhas_delete_authenticated on public.leads_campanhas;

revoke all on table public.leads_campanhas from anon, public;
grant select, insert, update, delete on table public.leads_campanhas to authenticated;
grant all on table public.leads_campanhas to service_role;

create policy leads_campanhas_select_authenticated
on public.leads_campanhas
for select
to authenticated
using (
  exists (
    select 1
    from public.leads l
    where l.id = leads_campanhas.lead_id
      and (
        (select public.is_admin())
        or l.unidade_id in (select public.get_user_unidade_ids())
      )
  )
);

create policy leads_campanhas_insert_authenticated
on public.leads_campanhas
for insert
to authenticated
with check (
  exists (
    select 1
    from public.leads l
    where l.id = leads_campanhas.lead_id
      and (
        (select public.is_admin())
        or l.unidade_id in (select public.get_user_unidade_ids())
      )
  )
);

create policy leads_campanhas_update_authenticated
on public.leads_campanhas
for update
to authenticated
using (
  exists (
    select 1
    from public.leads l
    where l.id = leads_campanhas.lead_id
      and (
        (select public.is_admin())
        or l.unidade_id in (select public.get_user_unidade_ids())
      )
  )
)
with check (
  exists (
    select 1
    from public.leads l
    where l.id = leads_campanhas.lead_id
      and (
        (select public.is_admin())
        or l.unidade_id in (select public.get_user_unidade_ids())
      )
  )
);

create policy leads_campanhas_delete_authenticated
on public.leads_campanhas
for delete
to authenticated
using (
  exists (
    select 1
    from public.leads l
    where l.id = leads_campanhas.lead_id
      and (
        (select public.is_admin())
        or l.unidade_id in (select public.get_user_unidade_ids())
      )
  )
);

-- P1: todas as tabelas publicas restantes sem RLS passam a negar por padrao.
alter table public._auditoria_chave_natural_20260809 enable row level security;
alter table public._auditoria_reconstrucao_20260809 enable row level security;
alter table public.calendario_escolar enable row level security;
alter table public.emusys_experimentais_snapshot_execucoes enable row level security;
alter table public.fabio_memoria_janela enable row level security;
alter table public.fabio_memoria_proposta enable row level security;
alter table public.fabio_participacao_ocorrencia_eventos enable row level security;
alter table public.fabio_participacao_ocorrencias enable row level security;
alter table public.fabio_professor_memoria enable row level security;
alter table public.fechamento_snapshots_backup_20260808 enable row level security;
alter table public.health_score_professor_v3_materializacao_execucoes enable row level security;
alter table public.hermes_patch_status enable row level security;
alter table public.lead_experimentais_arquivadas enable row level security;
alter table public.lead_experimental_aulas_arquivadas enable row level security;
alter table public.migrations_audit_data_nascimento enable row level security;
alter table public.programa_matriculador_estrelas_config enable row level security;
alter table public.projecao_aulas enable row level security;
alter table public.projecao_recaculo_log enable row level security;
alter table public.sol_grants_revogados_fatia0 enable row level security;
alter table public.unidade_contato_comercial enable row level security;

-- calendario_escolar e a unica dessas tabelas usada diretamente pelo front.
-- A permissao antiga era anon ALL; permanece somente equipe autenticada da unidade.
drop policy if exists calendario_escolar_select_authenticated on public.calendario_escolar;
drop policy if exists calendario_escolar_insert_authenticated on public.calendario_escolar;
drop policy if exists calendario_escolar_update_authenticated on public.calendario_escolar;
drop policy if exists calendario_escolar_delete_authenticated on public.calendario_escolar;
revoke all on table public.calendario_escolar from anon, public;

create policy calendario_escolar_select_authenticated
on public.calendario_escolar for select to authenticated
using (
  (select public.is_admin())
  or unidade_id in (select public.get_user_unidade_ids())
);

create policy calendario_escolar_insert_authenticated
on public.calendario_escolar for insert to authenticated
with check (
  (select public.is_admin())
  or unidade_id in (select public.get_user_unidade_ids())
);

create policy calendario_escolar_update_authenticated
on public.calendario_escolar for update to authenticated
using (
  (select public.is_admin())
  or unidade_id in (select public.get_user_unidade_ids())
)
with check (
  (select public.is_admin())
  or unidade_id in (select public.get_user_unidade_ids())
);

create policy calendario_escolar_delete_authenticated
on public.calendario_escolar for delete to authenticated
using (
  (select public.is_admin())
  or unidade_id in (select public.get_user_unidade_ids())
);

-- projecao_aulas e leitura da Timeline de contratos, nunca escrita do navegador.
drop policy if exists projecao_aulas_select_authenticated on public.projecao_aulas;
revoke all on table public.projecao_aulas from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on table public.projecao_aulas from authenticated;
grant select on table public.projecao_aulas to authenticated;
grant all on table public.projecao_aulas to service_role;

create policy projecao_aulas_select_authenticated
on public.projecao_aulas for select to authenticated
using (
  (select public.is_admin())
  or unidade_id in (select public.get_user_unidade_ids())
);

-- Demais tabelas P1 nao tem chamador anon/authenticated no inventario.
-- Preserva apenas SELECT dos papeis internos que ja o tinham explicitamente.
do $$
declare
  r record;
  v_policy text;
begin
  for r in
    select c.relname, role.rolname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    join pg_roles role on role.oid = a.grantee
    where n.nspname = 'public'
      and c.relname = any (array[
        '_auditoria_chave_natural_20260809',
        '_auditoria_reconstrucao_20260809',
        'calendario_escolar',
        'emusys_experimentais_snapshot_execucoes',
        'fabio_memoria_janela',
        'fabio_memoria_proposta',
        'fabio_participacao_ocorrencia_eventos',
        'fabio_participacao_ocorrencias',
        'fabio_professor_memoria',
        'fechamento_snapshots_backup_20260808',
        'health_score_professor_v3_materializacao_execucoes',
        'hermes_patch_status',
        'lead_experimentais_arquivadas',
        'lead_experimental_aulas_arquivadas',
        'migrations_audit_data_nascimento',
        'programa_matriculador_estrelas_config',
        'projecao_aulas',
        'projecao_recaculo_log',
        'sol_grants_revogados_fatia0',
        'unidade_contato_comercial'
      ])
      and a.privilege_type = 'SELECT'
      and role.rolname not in ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
  loop
    v_policy := 'p1_acl_' || substr(md5(r.relname), 1, 8) || '_' ||
      regexp_replace(r.rolname, '[^a-zA-Z0-9_]', '_', 'g') || '_select';
    execute format('drop policy if exists %I on public.%I', v_policy, r.relname);
    execute format(
      'create policy %I on public.%I for select to %I using (true)',
      v_policy, r.relname, r.rolname
    );
  end loop;
end
$$;

-- P2: SECURITY DEFINER sem caminho fixo recebe caminho deterministico.
do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) c
        where c like 'search_path=%'
      )
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, pg_temp',
      v_fn
    );
  end loop;
end
$$;

-- O rate limit publico guarda somente hash de origem + janela; nunca token,
-- respostas, CPF ou qualquer dado clinico.
create table if not exists private.anamnese_publica_rate_limit (
  rota text not null check (rota in ('convite', 'perfil', 'salvar')),
  origem_hash text not null,
  janela_inicio timestamptz not null,
  tentativas integer not null check (tentativas > 0),
  primary key (rota, origem_hash, janela_inicio)
);
alter table private.anamnese_publica_rate_limit enable row level security;
revoke all on table private.anamnese_publica_rate_limit from public, anon, authenticated;

create or replace function private.consumir_rate_limit_anamnese(p_rota text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  v_origem text;
  v_origem_hash text;
  v_janela timestamptz;
  v_tentativas integer;
begin
  if p_rota not in ('convite', 'perfil', 'salvar') then
    raise exception 'rota de limite invalida' using errcode = '22023';
  end if;

  v_origem := nullif(
    btrim(
      split_part(
        coalesce(
          v_headers ->> 'cf-connecting-ip',
          v_headers ->> 'x-forwarded-for',
          'sem-origem'
        ),
        ',',
        1
      )
    ),
    ''
  );
  v_origem_hash := encode(
    extensions.digest(coalesce(v_origem, 'sem-origem'), 'sha256'),
    'hex'
  );
  v_janela := date_trunc('hour', clock_timestamp())
    + floor(extract(minute from clock_timestamp()) / 10) * interval '10 minutes';

  insert into private.anamnese_publica_rate_limit
    (rota, origem_hash, janela_inicio, tentativas)
  values (p_rota, v_origem_hash, v_janela, 1)
  on conflict (rota, origem_hash, janela_inicio)
  do update set tentativas = private.anamnese_publica_rate_limit.tentativas + 1
  returning tentativas into v_tentativas;

  if random() < 0.02 then
    delete from private.anamnese_publica_rate_limit
    where janela_inicio < clock_timestamp() - interval '48 hours';
  end if;

  if v_tentativas > 30 then
    raise sqlstate 'PT429'
      using message = 'Muitas tentativas. Tente novamente.';
  end if;
end;
$$;

revoke all on function private.consumir_rate_limit_anamnese(text)
  from public, anon, authenticated;

-- P3: os tres RPCs de anamnese continuam publicos, mas validam token de
-- 128 bits, corpo limitado/estruturado e tentativas por origem.
create or replace function public.get_convite_anamnese(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_convite public.anamnese_convites%rowtype;
  v_unidade text;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{32}$' then
    return null;
  end if;

  perform private.consumir_rate_limit_anamnese('convite');

  select * into v_convite
    from public.anamnese_convites
   where token = lower(p_token)
     and usado_em is null
     and revogado_em is null
     and expira_em > now()
   limit 1;

  if not found then
    return null;
  end if;

  select nome into v_unidade from public.unidades where id = v_convite.unidade_id;

  return jsonb_build_object(
    'nome_aluno', v_convite.nome_aluno,
    'tipo_formulario', v_convite.tipo_formulario,
    'unidade_nome', v_unidade,
    'data_nascimento', v_convite.data_nascimento,
    'expira_em', v_convite.expira_em
  );
end;
$$;

create or replace function public.get_anamnese_publica(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_anam public.anamneses%rowtype;
  v_unidade_nome text;
  v_aluno_nome text;
  v_aluno_data_nascimento date;
  v_respostas jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{32}$' then
    return null;
  end if;

  perform private.consumir_rate_limit_anamnese('perfil');

  select *
    into v_anam
    from public.anamneses
   where share_token = lower(p_token)
     and status = 'completa'
   limit 1;

  if not found then
    return null;
  end if;

  select nome into v_unidade_nome from public.unidades where id = v_anam.unidade_id;

  if v_anam.aluno_id is not null then
    select a.nome, a.data_nascimento
      into v_aluno_nome, v_aluno_data_nascimento
      from public.alunos a
     where a.id = v_anam.aluno_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pergunta_numero', pergunta_numero,
        'resposta_posicao', resposta_posicao
      ) order by pergunta_numero
    ),
    '[]'::jsonb
  )
  into v_respostas
  from public.anamnese_respostas_perfil
  where anamnese_id = v_anam.id;

  return jsonb_build_object(
    'id', v_anam.id,
    'tipo_formulario', v_anam.tipo_formulario,
    'created_at', v_anam.created_at,
    'modo_resposta', v_anam.modo_resposta,
    'nome_aluno', v_anam.nome_aluno,
    'data_nascimento', v_aluno_data_nascimento,
    'genero', v_anam.genero,
    'telefone_aluno', v_anam.telefone_aluno,
    'aluno_nome_oficial', v_aluno_nome,
    'professor_nome', null,
    'unidade_nome', v_unidade_nome,
    'cursos_escolhidos', v_anam.cursos_escolhidos,
    'possui_instrumento', v_anam.possui_instrumento,
    'objetivos', v_anam.objetivos,
    'tempo_para_metas', v_anam.tempo_para_metas,
    'tempo_disponivel_estudo', v_anam.tempo_disponivel_estudo,
    'generos_musicais', v_anam.generos_musicais,
    'instrumentos_toca', v_anam.instrumentos_toca,
    'experiencia_anterior', v_anam.experiencia_anterior,
    'nivel_conhecimento_musical', v_anam.nivel_conhecimento_musical,
    'nivel_habilidade_instrumento', v_anam.nivel_habilidade_instrumento,
    'interesse_bandas', v_anam.interesse_bandas,
    'motivo_procura_pais', v_anam.motivo_procura_pais,
    'metas_pais', v_anam.metas_pais,
    'fonte_exposicao_musical', v_anam.fonte_exposicao_musical,
    'musicos_na_familia', v_anam.musicos_na_familia,
    'interesse_instrumento_cantar', v_anam.interesse_instrumento_cantar,
    'exposicao_telas', v_anam.exposicao_telas,
    'comunicacao_crianca', v_anam.comunicacao_crianca,
    'sono_crianca', v_anam.sono_crianca,
    'estereotipias', v_anam.estereotipias,
    'situacao_responsaveis', v_anam.situacao_responsaveis,
    'filiacao', v_anam.filiacao,
    'quem_traz_crianca', v_anam.quem_traz_crianca,
    'diagnosticos', v_anam.diagnosticos,
    'diagnosticos_outro', v_anam.diagnosticos_outro,
    'cuidado_medico', v_anam.cuidado_medico,
    'medicacao_continua', v_anam.medicacao_continua,
    'necessidade_apoio', v_anam.necessidade_apoio,
    'perfil_baby', v_anam.perfil_baby,
    'temperamento_primario', v_anam.temperamento_primario,
    'temperamento_secundario', v_anam.temperamento_secundario,
    'temperamento_codinome', v_anam.temperamento_codinome,
    'respostas_perfil', v_respostas,
    'observacoes_entrevistador', v_anam.observacoes_entrevistador
  );
end;
$$;

create or replace function public.salvar_anamnese_online(
  p_token text,
  p_respostas jsonb,
  p_perfil jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_convite public.anamnese_convites%rowtype;
  v_id integer;
  v_r jsonb := coalesce(p_respostas, '{}'::jsonb);
  v_counts integer[] := array[0, 0, 0, 0];
  v_n_validos integer := 0;
  v_rv record;
  v_perfil_baby boolean;
  v_pos_primario integer;
  v_pos_secundario integer;
  v_temp_primario varchar;
  v_temp_secundario varchar;
  v_temp_codinome varchar;
  v_temp_contagem jsonb;
  v_nomes constant varchar[] := array['colerico', 'sanguineo', 'fleumatico', 'melancolico'];
  v_codigos constant varchar[] := array['CAZUZA', 'SLASH', 'FRANK', 'AMY'];
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{32}$' then
    raise exception 'link invalido ou expirado' using errcode = '22023';
  end if;
  if jsonb_typeof(v_r) <> 'object'
     or jsonb_typeof(coalesce(p_perfil, '{}'::jsonb)) <> 'object'
     or octet_length(v_r::text) > 65536
     or octet_length(coalesce(p_perfil, '{}'::jsonb)::text) > 8192 then
    raise exception 'entrada invalida' using errcode = '22023';
  end if;

  perform private.consumir_rate_limit_anamnese('salvar');

  select * into v_convite
    from public.anamnese_convites
   where token = lower(p_token)
     and usado_em is null
     and revogado_em is null
     and expira_em > now()
   for update;

  if not found then
    raise exception 'link invalido ou expirado' using errcode = '22023';
  end if;

  for v_rv in
    select k::integer as pergunta_numero, v::integer as posicao
      from jsonb_each_text(coalesce(p_perfil, '{}'::jsonb)) as t(k, v)
     where k ~ '^([1-9]|1[01])$'
       and v ~ '^[1-4]$'
  loop
    v_counts[v_rv.posicao] := v_counts[v_rv.posicao] + 1;
    v_n_validos := v_n_validos + 1;
  end loop;

  if v_n_validos < 3 then
    v_perfil_baby := true;
  else
    v_perfil_baby := false;
    select posicao into v_pos_primario
      from unnest(array[1, 2, 3, 4]) as posicao
     order by v_counts[posicao] desc, posicao asc
     limit 1;
    select posicao into v_pos_secundario
      from unnest(array[1, 2, 3, 4]) as posicao
     order by v_counts[posicao] desc, posicao asc
     offset 1 limit 1;
    v_temp_primario := v_nomes[v_pos_primario];
    v_temp_secundario := v_nomes[v_pos_secundario];
    v_temp_codinome := v_codigos[v_pos_primario] || '/' || v_codigos[v_pos_secundario];
    v_temp_contagem := jsonb_build_object(
      'colerico', v_counts[1],
      'sanguineo', v_counts[2],
      'fleumatico', v_counts[3],
      'melancolico', v_counts[4]
    );
  end if;

  insert into public.anamneses (
    aluno_id, unidade_id, tipo_formulario, nome_aluno, telefone_aluno,
    share_token, entrevistador, modo_resposta, status, vinculo_status,
    duracao_segundos, created_by,
    genero, possui_instrumento, cursos_escolhidos, objetivos,
    tempo_para_metas, tempo_disponivel_estudo, experiencia_anterior,
    interesse_bandas, cuidado_medico, medicacao_continua, diagnosticos,
    necessidade_apoio, observacoes_entrevistador,
    generos_musicais, instrumentos_toca,
    nivel_conhecimento_musical, nivel_habilidade_instrumento,
    motivo_procura_pais, metas_pais, fonte_exposicao_musical,
    musicos_na_familia, interesse_instrumento_cantar, exposicao_telas,
    comunicacao_crianca, sono_crianca, estereotipias,
    situacao_responsaveis, filiacao, quem_traz_crianca,
    temperamento_primario, temperamento_secundario, temperamento_codinome,
    temperamento_contagem, perfil_baby
  ) values (
    v_convite.aluno_id,
    v_convite.unidade_id,
    v_convite.tipo_formulario,
    v_convite.nome_aluno,
    coalesce(nullif(btrim(v_r ->> 'telefone_aluno'), ''), v_convite.telefone_aluno),
    encode(extensions.gen_random_bytes(16), 'hex'),
    null,
    'online',
    'completa',
    case when v_convite.aluno_id is not null then 'vinculado' else 'pendente' end,
    case when v_r ->> 'duracao_segundos' ~ '^\d{1,9}$'
         then (v_r ->> 'duracao_segundos')::integer end,
    v_convite.criado_por,
    v_r ->> 'genero',
    v_r ->> 'possui_instrumento',
    v_r ->> 'cursos_escolhidos',
    coalesce(v_r -> 'objetivos', '[]'::jsonb),
    v_r ->> 'tempo_para_metas',
    v_r ->> 'tempo_disponivel_estudo',
    coalesce(v_r -> 'experiencia_anterior', '[]'::jsonb),
    v_r ->> 'interesse_bandas',
    v_r ->> 'cuidado_medico',
    v_r ->> 'medicacao_continua',
    coalesce(v_r -> 'diagnosticos', '[]'::jsonb),
    v_r ->> 'necessidade_apoio',
    v_r ->> 'observacoes_entrevistador',
    coalesce(v_r -> 'generos_musicais', '[]'::jsonb),
    coalesce(v_r -> 'instrumentos_toca', '[]'::jsonb),
    v_r ->> 'nivel_conhecimento_musical',
    v_r ->> 'nivel_habilidade_instrumento',
    coalesce(v_r -> 'motivo_procura_pais', '[]'::jsonb),
    coalesce(v_r -> 'metas_pais', '[]'::jsonb),
    coalesce(v_r -> 'fonte_exposicao_musical', '[]'::jsonb),
    case when v_r ->> 'musicos_na_familia' in ('true', 'false')
         then (v_r ->> 'musicos_na_familia')::boolean end,
    case when v_r ->> 'interesse_instrumento_cantar' in ('true', 'false')
         then (v_r ->> 'interesse_instrumento_cantar')::boolean end,
    v_r ->> 'exposicao_telas',
    v_r ->> 'comunicacao_crianca',
    coalesce(v_r -> 'sono_crianca', '[]'::jsonb),
    v_r ->> 'estereotipias',
    v_r ->> 'situacao_responsaveis',
    v_r ->> 'filiacao',
    coalesce(v_r -> 'quem_traz_crianca', '[]'::jsonb),
    v_temp_primario,
    v_temp_secundario,
    v_temp_codinome,
    v_temp_contagem,
    v_perfil_baby
  )
  returning id into v_id;

  insert into public.anamnese_respostas_perfil (anamnese_id, pergunta_numero, resposta_posicao)
  select v_id, k::integer, v::integer
    from jsonb_each_text(coalesce(p_perfil, '{}'::jsonb)) as t(k, v)
   where k ~ '^([1-9]|1[01])$'
     and v ~ '^[1-4]$';

  update public.anamnese_convites
     set usado_em = now(), anamnese_id = v_id
   where id = v_convite.id;

  return jsonb_build_object('anamnese_id', v_id);
end;
$$;

-- Funcoes publicas sao excecoes explicitas; PUBLIC deixa de conceder por heranca.
do $$
declare
  v_fn regprocedure;
  v_role text;
  v_roles text[] := array[
    'authenticated',
    'service_role',
    'fabio_agent',
    'fabio_motor_v2_snapshot_ro',
    'la_os_leitor',
    'la_os_triador',
    'lia_acesso_restrito',
    'maria_lareport_rpc',
    'mila_acesso_restrito',
    'ml_jobs',
    'monitor_coletor',
    'sol_acesso_restrito',
    'sol_atendimento_externo',
    'sol_caixa_readonly',
    'sol_estrategico',
    'sol_operacional',
    'sol_tatico'
  ];
begin
  -- P3: preserva as chamadas internas atuais, mas corta anon de todas as
  -- funcoes de aplicacao que nao fazem parte do fluxo publico abaixo.
  for v_fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
      and p.oid::regprocedure::text not in (
        'public.fn_porteiro_requisicao()',
        'public.get_anamnese_publica(text)',
        'public.get_convite_anamnese(text)',
        'public.salvar_anamnese_online(text,jsonb,jsonb)'
      )
  loop
    foreach v_role in array v_roles loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('grant execute on function %s to %I', v_fn, v_role);
      end if;
    end loop;
    execute format('revoke execute on function %s from public, anon', v_fn);
  end loop;

  -- O porteiro e chamado pelo PostgREST em toda requisicao, inclusive papeis
  -- internos. As tres RPCs de anamnese recebem anon de forma explicita.
  foreach v_fn in array array[
    'public.fn_porteiro_requisicao()'::regprocedure,
    'public.get_anamnese_publica(text)'::regprocedure,
    'public.get_convite_anamnese(text)'::regprocedure,
    'public.salvar_anamnese_online(text,jsonb,jsonb)'::regprocedure
  ] loop
    execute format('revoke execute on function %s from public', v_fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', v_fn);
  end loop;

  v_fn := 'public.fn_porteiro_requisicao()'::regprocedure;
  foreach v_role in array v_roles loop
    if v_role <> 'authenticated'
       and v_role <> 'service_role'
       and exists (select 1 from pg_roles where rolname = v_role) then
      execute format('grant execute on function %s to %I', v_fn, v_role);
    end if;
  end loop;
end
$$;

-- P4: toda escrita anon sem policy anon/PUBLIC equivalente perde o privilegio.
-- O catalogo e lido no momento da migration, por isso cobre os 247+ grants
-- herdados sem depender de uma lista manual e obsoleta.
do $$
declare
  r record;
begin
  for r in
    with comandos(comando) as (
      values ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)
    )
    select c.relname, comandos.comando
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join comandos
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and has_table_privilege('anon', c.oid, comandos.comando)
      and not exists (
        select 1
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.cmd in ('ALL', comandos.comando)
          and ('anon' = any (p.roles) or 'public' = any (p.roles))
      )
  loop
    execute format(
      'revoke %s on table public.%I from public, anon',
      r.comando,
      r.relname
    );
  end loop;
end
$$;

-- P5: objetos novos no schema exposto nao nascem com acesso anon/PUBLIC.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, public;

-- O executor de migrations gerenciado pela plataforma e postgres e nao e
-- membro de supabase_admin. Onde a plataforma delegar esse papel, endurece os
-- defaults dele tambem; onde nao delegar, a migration segue com P0--P4 e deixa
-- evidencia objetiva para a configuracao proprietaria do projeto.
do $$
begin
  if pg_has_role(current_user, 'supabase_admin', 'member') then
    execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, public';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from anon, public';
  else
    raise notice 'DEFAULT_PRIVILEGES_SUPABASE_ADMIN_PENDENTE: executor sem membership em supabase_admin';
  end if;
end
$$;

notify pgrst, 'reload schema';
