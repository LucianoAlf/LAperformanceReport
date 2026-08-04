\set ON_ERROR_STOP on
begin;

do $$
declare
  v_role text;
begin
  foreach v_role in array array[
    'anon', 'authenticated', 'service_role', 'mila_acesso_restrito',
    'sol_acesso_restrito', 'fabio_agent', 'lia_acesso_restrito'
  ] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      execute format('create role %I nologin', v_role);
    end if;
  end loop;
end
$$;

create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create table public.usuarios (
  id integer primary key,
  nome text not null,
  auth_user_id uuid unique,
  ativo boolean not null default true
);
create table public.unidades (
  id uuid primary key,
  nome text not null
);
create table public.alunos (id integer primary key);
create table public.professores (
  id integer primary key,
  ativo boolean not null default true
);
create table public.motivos_saida (
  nome_normalizado text primary key,
  categoria text,
  conta_score_professor boolean not null default false
);
create table public.pesquisa_evasao (
  id uuid primary key default gen_random_uuid(),
  aluno_id integer references public.alunos(id),
  aluno_nome text,
  aluno_curso text,
  aluno_professor text,
  unidade_id uuid references public.unidades(id),
  data_evasao date,
  tempo_permanencia_meses integer,
  motivo_cadastrado text,
  modo_teste boolean not null default false,
  resposta_status text not null default 'sem_resposta',
  resposta_texto text,
  resposta_tipo text,
  respondido_em timestamptz,
  enviado_em timestamptz,
  categoria_resposta text,
  sentimento text
);
create table public.pesquisa_evasao_analises (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  versao integer not null,
  texto_consolidado text,
  status text not null,
  revisado_em timestamptz,
  unique (pesquisa_id, versao)
);
create table public.pesquisa_evasao_mensagens (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid references public.pesquisa_evasao(id),
  direcao text not null,
  audio_storage_path text
);
create table public.pesquisa_evasao_transcricoes (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid references public.pesquisa_evasao_mensagens(id),
  status text not null
);
create table public.aluno_acoes (
  id uuid primary key default gen_random_uuid(),
  aluno_id integer not null references public.alunos(id),
  unidade_id uuid not null references public.unidades(id),
  tipo text not null,
  descricao text not null,
  resultado text,
  realizado_por uuid,
  realizado_por_nome text,
  created_at timestamptz not null default now(),
  constraint aluno_acoes_tipo_check check (
    tipo in ('ligacao', 'whatsapp', 'reuniao', 'observacao', 'plano_ia', 'email', 'visita')
  )
);

create function public.fn_pesquisa_evasao_usuario_interno_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios
    where auth_user_id = auth.uid() and ativo = true
  )
$$;

insert into public.usuarios (id, nome, auth_user_id) values
  (2, 'Luciano', '00000000-0000-0000-0000-000000000002'),
  (29, 'Jessica', '00000000-0000-0000-0000-000000000029');
insert into public.unidades (id, nome)
values ('10000000-0000-0000-0000-000000000001', 'Barra');
insert into public.alunos (id) values (1001), (1002), (1003);
insert into public.professores (id, ativo) values (501, true), (502, false);
insert into public.motivos_saida (nome_normalizado, categoria)
values ('DIFICULDADE FINANCEIRA', 'financeiro');

insert into public.pesquisa_evasao (
  id, aluno_id, aluno_nome, unidade_id, data_evasao, motivo_cadastrado,
  modo_teste, resposta_status, resposta_texto, resposta_tipo, respondido_em, enviado_em
) values
  ('20000000-0000-0000-0000-000000000001', 1001, 'Aluno Producao',
    '10000000-0000-0000-0000-000000000001', current_date, 'Dificuldade financeira',
    false, 'revisada', 'Resposta produtiva', 'texto', now(), now()),
  ('20000000-0000-0000-0000-000000000002', 1002, 'Aluno Teste',
    '10000000-0000-0000-0000-000000000001', current_date, 'Dificuldade financeira',
    true, 'revisada', 'Resposta de teste', 'texto', now(), now()),
  ('20000000-0000-0000-0000-000000000003', 1003, 'Aluno Sem Revisao',
    '10000000-0000-0000-0000-000000000001', current_date, null,
    false, 'pronta_para_revisao', 'Resposta ainda nao revisada', 'texto', now(), now());

insert into public.pesquisa_evasao_analises (
  id, pesquisa_id, versao, texto_consolidado, status, revisado_em
) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    1, 'Financeiro e falta de tempo', 'revisada', now()),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
    1, 'Teste', 'revisada', now()),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003',
    1, 'Ainda pendente', 'pronta_para_revisao', null);

\ir ../../supabase/migrations/20260804220000_pesquisa_evasao_subprojeto_c_schema.sql
\ir ../../supabase/migrations/20260804223000_pesquisa_evasao_subprojeto_c_rpcs.sql

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    perform public.registrar_classificacao_pesquisa_evasao_v1(
      '20000000-0000-0000-0000-000000000002',
      '30000000-0000-0000-0000-000000000002',
      array['financeiro'], 'confirmou', ''
    );
    raise exception 'teste deveria ter sido rejeitado';
  exception when sqlstate '22023' then
    if sqlerrm not like '%PESQUISA_EVASAO_C_TESTE_PROIBIDO%' then raise; end if;
  end;

  begin
    perform public.registrar_classificacao_pesquisa_evasao_v1(
      '20000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000003',
      array['inconclusivo'], 'inconclusivo', ''
    );
    raise exception 'analise nao revisada deveria ter sido rejeitada';
  exception when sqlstate '40001' then
    if sqlerrm not like '%PESQUISA_EVASAO_C_CONVERSA_ATUALIZADA%' then raise; end if;
  end;

  begin
    perform public.registrar_classificacao_pesquisa_evasao_v1(
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      array['outro'], 'complementou', ''
    );
    raise exception 'outro sem justificativa deveria ter sido rejeitado';
  exception when sqlstate '22023' then
    if sqlerrm not like '%PESQUISA_EVASAO_C_JUSTIFICATIVA_OBRIGATORIA%' then raise; end if;
  end;

  begin
    perform public.registrar_classificacao_pesquisa_evasao_v1(
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      array['inconclusivo', 'financeiro'], 'inconclusivo', ''
    );
    raise exception 'categoria exclusiva combinada deveria ter sido rejeitada';
  exception when sqlstate '22023' then
    if sqlerrm not like '%PESQUISA_EVASAO_C_CATEGORIA_EXCLUSIVA%' then raise; end if;
  end;
end
$$;

select public.registrar_classificacao_pesquisa_evasao_v1(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  array['financeiro', 'tempo_horario'], 'complementou', ''
);
select public.registrar_classificacao_pesquisa_evasao_v1(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  array['financeiro'], 'confirmou', ''
);

do $$
begin
  if (select count(*) from public.pesquisa_evasao_classificacoes
      where pesquisa_id = '20000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'versoes de classificacao nao foram preservadas';
  end if;
  if (select array_agg(versao order by versao) from public.pesquisa_evasao_classificacoes
      where pesquisa_id = '20000000-0000-0000-0000-000000000001') <> array[1,2] then
    raise exception 'sequencia de versoes invalida';
  end if;
end
$$;

insert into public.pesquisa_evasao_analises (
  id, pesquisa_id, versao, texto_consolidado, status
) values (
  '30000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000001', 2, 'Conteudo novo', 'pronta_para_revisao'
);

do $$
declare
  v_classificacao uuid;
begin
  select id into v_classificacao from public.pesquisa_evasao_classificacoes
  where pesquisa_id = '20000000-0000-0000-0000-000000000001'
  order by versao desc limit 1;
  if public.fn_pesquisa_evasao_c_classificacao_vigente(
    '20000000-0000-0000-0000-000000000001', v_classificacao
  ) then
    raise exception 'nova rodada deveria tornar classificacao desatualizada';
  end if;
end
$$;

update public.pesquisa_evasao_analises
set status = 'revisada', revisado_em = now()
where id = '30000000-0000-0000-0000-000000000004';
select public.registrar_classificacao_pesquisa_evasao_v1(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000004',
  array['financeiro', 'tempo_horario'], 'complementou', ''
);

select public.registrar_acao_pesquisa_evasao_v1(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.pesquisa_evasao_classificacoes
   where pesquisa_id = '20000000-0000-0000-0000-000000000001'
   order by versao desc limit 1),
  'vincular_professor', 'Alinhar contexto com professor', now() + interval '1 day', 501
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000029', true);
select public.concluir_acao_pesquisa_evasao_v1(
  (select id from public.aluno_acoes where pesquisa_evasao_id = '20000000-0000-0000-0000-000000000001'),
  'realizada', 'Coordenacao avisada'
);

select public.registrar_desfecho_pesquisa_evasao_v1(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.pesquisa_evasao_classificacoes
   where pesquisa_id = '20000000-0000-0000-0000-000000000001'
   order by versao desc limit 1),
  'prometeu_voltar', 'Familia vai avaliar'
);
select public.registrar_desfecho_pesquisa_evasao_v1(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.pesquisa_evasao_classificacoes
   where pesquisa_id = '20000000-0000-0000-0000-000000000001'
   order by versao desc limit 1),
  'confirmou_saida', 'Saida confirmada'
);

do $$
declare
  v_primeiro uuid;
  v_segundo public.pesquisa_evasao_desfechos%rowtype;
begin
  if not exists (
    select 1 from public.aluno_acoes
    where pesquisa_evasao_id = '20000000-0000-0000-0000-000000000001'
      and aluno_id = 1001
      and unidade_id = '10000000-0000-0000-0000-000000000001'
      and criado_por_usuario_id = 2
      and concluida_por_usuario_id = 29
      and concluida_por_auth_user_id = '00000000-0000-0000-0000-000000000029'
      and estado = 'realizada'
  ) then
    raise exception 'auditoria da acao esta incorreta';
  end if;

  select id into v_primeiro from public.pesquisa_evasao_desfechos
  where pesquisa_id = '20000000-0000-0000-0000-000000000001'
  order by registrado_em, id limit 1;
  select * into strict v_segundo from public.pesquisa_evasao_desfechos
  where pesquisa_id = '20000000-0000-0000-0000-000000000001'
  order by registrado_em desc, id desc limit 1;
  if v_segundo.sucede_desfecho_id is distinct from v_primeiro then
    raise exception 'cadeia de desfechos nao foi preservada';
  end if;

  begin
    update public.pesquisa_evasao_classificacoes set justificativa = 'alterada'
    where pesquisa_id = '20000000-0000-0000-0000-000000000001';
    raise exception 'update append-only deveria falhar';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.pesquisa_evasao_desfechos
    where pesquisa_id = '20000000-0000-0000-0000-000000000001';
    raise exception 'delete append-only deveria falhar';
  exception when sqlstate '55000' then null;
  end;
end
$$;

set local role authenticated;
do $$
begin
  begin
    insert into public.aluno_acoes (
      aluno_id, unidade_id, tipo, descricao, realizado_por_nome
    ) values (
      1001, '10000000-0000-0000-0000-000000000001', 'observacao', 'direta', 'indevido'
    );
    raise exception 'authenticated nao deveria inserir diretamente';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

do $$
begin
  if exists (
    select 1 from public.pesquisa_evasao
    where categoria_resposta is not null or sentimento is not null
  ) then
    raise exception 'colunas legadas foram promovidas indevidamente';
  end if;
end
$$;

\echo PESQUISA_EVASAO_SUBPROJETO_C_PG17_OK
rollback;
