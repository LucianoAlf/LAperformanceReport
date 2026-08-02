\set ON_ERROR_STOP on

\ir pesquisa_evasao_multipartes_worker_pg17.sql

create or replace function auth.uid()
returns uuid language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.usuarios (
  id integer primary key,
  auth_user_id uuid not null unique,
  ativo boolean not null default true
);

insert into public.usuarios (id, auth_user_id)
values (99, '99000000-0000-4000-8000-000000000099');

create or replace function public.fn_pesquisa_evasao_usuario_interno_ativo()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.ativo = true
  )
$$;

alter table public.pesquisa_evasao
  add column evasao_id integer,
  add column unidade_id uuid,
  add column aluno_nome text;

\ir ../../supabase/migrations/20260802213000_pesquisa_evasao_rodadas_revisao.sql

insert into public.pesquisa_evasao (
  id,
  caixa_id,
  telefone_destino_snapshot,
  resposta_ingestao_versao,
  aluno_nome,
  unidade_id
) values (
  '20000000-0000-4000-8000-000000000001',
  3,
  '5521999991001',
  'multipartes_v2',
  'Rodada Revisada',
  '22000000-0000-4000-8000-000000000001'
), (
  '20000000-0000-4000-8000-000000000002',
  3,
  '5521999991002',
  'multipartes_v2',
  'Rodada por Silencio',
  '22000000-0000-4000-8000-000000000001'
), (
  '20000000-0000-4000-8000-000000000003',
  3,
  '5521999991003',
  'legado_v1',
  'Pesquisa Legada',
  '22000000-0000-4000-8000-000000000001'
);

insert into public.pesquisa_evasao_mensagens (
  pesquisa_id,
  caixa_id,
  direcao,
  provider_message_id,
  telefone_normalizado,
  tipo,
  texto,
  provider_created_at,
  recebido_em,
  resolution_status,
  substantividade
) values (
  '20000000-0000-4000-8000-000000000001', 3, 'entrada',
  'rodada-revisada-1', '5521999991001', 'texto', 'primeiro trecho',
  '2026-08-02 10:00:00+00', '2026-08-02 10:00:00+00',
  'resolvida', 'conteudo_substantivo'
), (
  '20000000-0000-4000-8000-000000000001', 3, 'entrada',
  'rodada-revisada-2', '5521999991001', 'texto', 'segundo trecho',
  '2026-08-02 10:05:00+00', '2026-08-02 10:05:00+00',
  'resolvida', 'conteudo_substantivo'
);

do $$
begin
  if (
    select count(distinct analise_versao)
    from public.pesquisa_evasao_mensagens
    where pesquisa_id = '20000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'mensagens dentro da janela nao ficaram na mesma rodada';
  end if;

  if not exists (
    select 1
    from public.pesquisa_evasao_analises
    where pesquisa_id = '20000000-0000-4000-8000-000000000001'
      and versao = 1
      and primeira_mensagem_id is not null
      and ultima_mensagem_id is not null
      and iniciada_em = '2026-08-02 10:00:00+00'
      and ultima_mensagem_em = '2026-08-02 10:05:00+00'
  ) then
    raise exception 'limites da primeira rodada incorretos';
  end if;
end;
$$;

update public.pesquisa_evasao_analises
set
  status = 'pronta_para_revisao',
  texto_consolidado = 'primeiro trecho\n\nsegundo trecho',
  encerrada_em = '2026-08-02 10:20:00+00'
where pesquisa_id = '20000000-0000-4000-8000-000000000001'
  and versao = 1;

set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '99000000-0000-4000-8000-000000000099';
select public.iniciar_revisao_pesquisa_evasao(
  (select id from public.pesquisa_evasao_analises
   where pesquisa_id = '20000000-0000-4000-8000-000000000001' and versao = 1)
);
select public.concluir_revisao_pesquisa_evasao(
  (select id from public.pesquisa_evasao_analises
   where pesquisa_id = '20000000-0000-4000-8000-000000000001' and versao = 1),
  'revisao humana imutavel'
);
reset request.jwt.claim.role;
reset request.jwt.claim.sub;

insert into public.pesquisa_evasao_mensagens (
  pesquisa_id,
  caixa_id,
  direcao,
  provider_message_id,
  telefone_normalizado,
  tipo,
  texto,
  provider_created_at,
  recebido_em,
  resolution_status,
  substantividade
) values (
  '20000000-0000-4000-8000-000000000001', 3, 'entrada',
  'rodada-revisada-3', '5521999991001', 'texto', 'conteudo novo apos revisao',
  '2026-08-02 11:00:00+00', '2026-08-02 11:00:00+00',
  'resolvida', 'conteudo_substantivo'
);

do $$
begin
  if not exists (
    select 1
    from public.pesquisa_evasao_analises
    where pesquisa_id = '20000000-0000-4000-8000-000000000001'
      and versao = 1
      and status = 'revisada'
      and texto_consolidado = 'revisao humana imutavel'
      and revisor_usuario_id = 99
      and revisado_em is not null
  ) then
    raise exception 'revisao anterior foi alterada';
  end if;

  if not exists (
    select 1
    from public.pesquisa_evasao_analises
    where pesquisa_id = '20000000-0000-4000-8000-000000000001'
      and versao = 2
      and status = 'rascunho'
  ) then
    raise exception 'conteudo posterior nao abriu rodada nova';
  end if;

  if not exists (
    select 1
    from public.pesquisa_evasao
    where id = '20000000-0000-4000-8000-000000000001'
      and resposta_status = 'coletando'
      and conteudo_novo_desde_revisao = true
  ) then
    raise exception 'pesquisa revisada nao voltou para a fila com sinal novo';
  end if;

  if not exists (
    select 1
    from public.pesquisa_evasao_mensagens
    where provider_message_id = 'rodada-revisada-3'
      and analise_versao = 2
  ) then
    raise exception 'mensagem posterior nao recebeu a nova versao';
  end if;
end;
$$;

do $$
begin
  begin
    update public.pesquisa_evasao_analises
    set texto_consolidado = 'nao pode mudar'
    where pesquisa_id = '20000000-0000-4000-8000-000000000001'
      and versao = 1;
    raise exception 'analise revisada aceitou alteracao';
  exception
    when others then
      if sqlerrm not like '%analise revisada de evasao e imutavel%' then
        raise;
      end if;
  end;
end;
$$;

insert into public.pesquisa_evasao_mensagens (
  pesquisa_id,
  caixa_id,
  direcao,
  provider_message_id,
  telefone_normalizado,
  tipo,
  texto,
  provider_created_at,
  recebido_em,
  resolution_status,
  substantividade
) values (
  '20000000-0000-4000-8000-000000000002', 3, 'entrada',
  'silencio-1', '5521999991002', 'texto', 'antes do silencio',
  '2026-08-02 12:00:00+00', '2026-08-02 12:00:00+00',
  'resolvida', 'conteudo_substantivo'
), (
  '20000000-0000-4000-8000-000000000002', 3, 'entrada',
  'silencio-2', '5521999991002', 'texto', 'depois do silencio',
  '2026-08-02 12:16:00+00', '2026-08-02 12:16:00+00',
  'resolvida', 'conteudo_substantivo'
), (
  '20000000-0000-4000-8000-000000000003', 3, 'entrada',
  'legado-sem-rodada', '5521999991003', 'texto', 'legado',
  '2026-08-02 13:00:00+00', '2026-08-02 13:00:00+00',
  'resolvida', 'conteudo_substantivo'
);

do $$
begin
  if (
    select count(distinct analise_versao)
    from public.pesquisa_evasao_mensagens
    where pesquisa_id = '20000000-0000-4000-8000-000000000002'
  ) <> 2 then
    raise exception 'silencio de 15 minutos nao abriu rodada nova';
  end if;

  if exists (
    select 1
    from public.pesquisa_evasao_mensagens
    where provider_message_id = 'legado-sem-rodada'
      and analise_versao is not null
  ) then
    raise exception 'fluxo legado recebeu rodada indevidamente';
  end if;
end;
$$;

select 'PESQUISA_EVASAO_RODADAS_PG17_OK';
