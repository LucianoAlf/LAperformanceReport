-- Pesquisa de evasao - fundacao segura.
--
-- Escopo desta migration:
--   * catalogo e perfil operacional do dominio;
--   * autorizacao estrita por usuario + unidade concreta;
--   * snapshots de configuracao, preview e auditoria;
--   * persistencia privada preparada para a conversa multipartes;
--   * evolucao aditiva do cabecalho legado;
--   * RLS, privileges e RPCs legadas endurecidas.
--
-- A atribuicao nominal de Fabi/Jessica, assinaturas e templates ativos pertence
-- ao rollout governado. Esta migration nao cria vinculos em usuario_perfis.

-- ---------------------------------------------------------------------------
-- 0. Snapshot de contato somente no nascimento de novas saidas
-- ---------------------------------------------------------------------------

-- Registros historicos sem snapshot permanecem bloqueados: o telefone atual do
-- aluno nao prova qual era o destino correto na data da saida. Para novos
-- eventos, o snapshot e capturado no INSERT ou na primeira transicao de outro
-- tipo para evasao/nao_renovacao. Atualizar uma saida ja existente nunca puxa
-- silenciosamente o contato atual.
create or replace function public.capturar_telefone_snapshot_movimentacao_retencao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.tipo not in ('evasao', 'nao_renovacao')
     or nullif(btrim(new.telefone_snapshot), '') is not null
     or new.aluno_id is null then
    return new;
  end if;

  if not (
    tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and old.tipo not in ('evasao', 'nao_renovacao')
    )
  ) then
    return new;
  end if;

  select coalesce(
           nullif(btrim(a.whatsapp), ''),
           nullif(btrim(a.telefone), '')
         )
    into new.telefone_snapshot
  from public.alunos a
  where a.id = new.aluno_id;

  return new;
end;
$function$;

revoke all on function public.capturar_telefone_snapshot_movimentacao_retencao()
from public, anon, authenticated;
grant execute on function public.capturar_telefone_snapshot_movimentacao_retencao()
to postgres, service_role;

drop trigger if exists trg_capturar_telefone_snapshot_movimentacao_retencao
on public.movimentacoes_admin;

create trigger trg_capturar_telefone_snapshot_movimentacao_retencao
before insert or update of tipo, aluno_id
on public.movimentacoes_admin
for each row
execute function public.capturar_telefone_snapshot_movimentacao_retencao();

-- ---------------------------------------------------------------------------
-- 1. Catalogo de permissoes e perfil dedicado
-- ---------------------------------------------------------------------------

insert into public.permissoes (
  codigo,
  modulo,
  acao,
  descricao,
  categoria,
  ordem,
  ativo
)
values
  (
    'sucesso_aluno.evasao.ver',
    'sucesso_aluno',
    'evasao.ver',
    'Consultar pesquisas e conversas de evasao nas unidades autorizadas',
    'OPERACIONAL',
    410,
    true
  ),
  (
    'sucesso_aluno.evasao.enviar',
    'sucesso_aluno',
    'evasao.enviar',
    'Gerar preview e confirmar pesquisa de evasao nas unidades autorizadas',
    'OPERACIONAL',
    420,
    true
  ),
  (
    'sucesso_aluno.evasao.revisar',
    'sucesso_aluno',
    'evasao.revisar',
    'Revisar respostas de pesquisa de evasao nas unidades autorizadas',
    'OPERACIONAL',
    430,
    true
  ),
  (
    'sucesso_aluno.evasao.gerir_acoes',
    'sucesso_aluno',
    'evasao.gerir_acoes',
    'Gerir acoes decorrentes de pesquisas de evasao nas unidades autorizadas',
    'OPERACIONAL',
    440,
    true
  ),
  (
    'sucesso_aluno.evasao.relatorios',
    'sucesso_aluno',
    'evasao.relatorios',
    'Consultar read models agregados de pesquisa de evasao',
    'RELATORIO',
    450,
    true
  ),
  (
    'sucesso_aluno.evasao.modo_teste',
    'sucesso_aluno',
    'evasao.modo_teste',
    'Executar pesquisa de evasao em telefone de teste autorizado',
    'OPERACIONAL',
    460,
    true
  )
on conflict (codigo) do update
set modulo = excluded.modulo,
    acao = excluded.acao,
    descricao = excluded.descricao,
    categoria = excluded.categoria,
    ordem = excluded.ordem,
    ativo = excluded.ativo;

insert into public.perfis (
  nome,
  descricao,
  nivel,
  icone,
  cor,
  sistema,
  ativo
)
values (
  'Sucesso do Aluno - Evasao',
  'Operacao da pesquisa de evasao com escopo explicito por unidade',
  30,
  'shield',
  '#7c3aed',
  true,
  true
)
on conflict (nome) do update
set descricao = excluded.descricao,
    nivel = excluded.nivel,
    icone = excluded.icone,
    cor = excluded.cor,
    sistema = excluded.sistema,
    ativo = excluded.ativo,
    updated_at = now();

-- O perfil e dedicado: uma reaplicacao tambem remove concessoes que tenham sido
-- acrescentadas fora deste contrato, antes de repor somente as cinco operacionais.
delete from public.perfil_permissoes pp
using public.perfis pf
where pp.perfil_id = pf.id
  and pf.nome = 'Sucesso do Aluno - Evasao';

insert into public.perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from public.perfis pf
join public.permissoes p
  on p.codigo in (
    'sucesso_aluno.evasao.ver',
    'sucesso_aluno.evasao.enviar',
    'sucesso_aluno.evasao.revisar',
    'sucesso_aluno.evasao.gerir_acoes',
    'sucesso_aluno.evasao.modo_teste'
  )
where pf.nome = 'Sucesso do Aluno - Evasao'
on conflict (perfil_id, permissao_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Helpers estritos: sem admin legado, perfil global ou unidade nula
-- ---------------------------------------------------------------------------

create or replace function public.usuario_tem_permissao_estrita(
  p_usuario_id integer,
  p_codigo_permissao varchar,
  p_unidade_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    p_unidade_id is not null
    and exists (
      select 1
      from public.usuario_perfis up
      join public.perfis pf
        on pf.id = up.perfil_id
       and pf.ativo = true
      join public.perfil_permissoes pp
        on pp.perfil_id = pf.id
      join public.permissoes p
        on p.id = pp.permissao_id
       and p.ativo = true
      where up.usuario_id = p_usuario_id
        and up.ativo = true
        and up.unidade_id = p_unidade_id
        and p.codigo = p_codigo_permissao
    );
$function$;

create or replace function public.fn_usuario_atual_tem_permissao_estrita(
  p_codigo_permissao varchar,
  p_unidade_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    p_unidade_id is not null
    and exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and u.ativo = true
        and public.usuario_tem_permissao_estrita(
          u.id,
          p_codigo_permissao,
          p_unidade_id
        )
    );
$function$;

revoke all on function public.usuario_tem_permissao_estrita(integer, varchar, uuid)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.usuario_tem_permissao_estrita(integer, varchar, uuid)
  to service_role;

revoke all on function public.fn_usuario_atual_tem_permissao_estrita(varchar, uuid)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.fn_usuario_atual_tem_permissao_estrita(varchar, uuid)
  to authenticated, service_role;

comment on function public.usuario_tem_permissao_estrita(integer, varchar, uuid) is
  'Autoriza somente perfil e permissao ativos em usuario_perfis ativo da unidade concreta; nao aceita admin legado, perfil global ou unidade nula.';

comment on function public.fn_usuario_atual_tem_permissao_estrita(varchar, uuid) is
  'Resolve o usuario autenticado ativo e delega ao helper estrito por unidade concreta.';

-- ---------------------------------------------------------------------------
-- 3. Configuracao, preview e auditoria service-only
-- ---------------------------------------------------------------------------

create table if not exists public.pesquisa_evasao_assinaturas (
  id uuid primary key default gen_random_uuid(),
  usuario_id integer not null references public.usuarios(id),
  nome_assinatura text not null,
  cargo_assinatura text not null default 'Sucesso do Aluno',
  ativo boolean not null default true,
  valido_desde timestamptz not null default now(),
  valido_ate timestamptz,
  criado_em timestamptz not null default now(),
  constraint pesquisa_evasao_assinaturas_validade_check
    check (valido_ate is null or valido_ate > valido_desde)
);

create unique index if not exists pesquisa_evasao_assinaturas_usuario_ativa_uidx
  on public.pesquisa_evasao_assinaturas (usuario_id)
  where ativo;

create table if not exists public.pesquisa_evasao_templates (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  versao integer not null check (versao > 0),
  publico text not null check (publico in ('direto', 'responsavel')),
  corpo text not null,
  ativo boolean not null default false,
  criado_por_usuario_id integer references public.usuarios(id),
  criado_em timestamptz not null default now(),
  unique (chave, versao, publico)
);

create table if not exists public.pesquisa_evasao_previews (
  id uuid primary key default gen_random_uuid(),
  evasao_id integer not null references public.movimentacoes_admin(id),
  unidade_id uuid not null references public.unidades(id),
  usuario_id integer not null references public.usuarios(id),
  auth_user_id uuid not null,
  assinatura_id uuid not null
    references public.pesquisa_evasao_assinaturas(id),
  template_id uuid not null
    references public.pesquisa_evasao_templates(id),
  caixa_id integer not null references public.whatsapp_caixas(id),
  modo_teste boolean not null,
  destinatario_tipo text not null
    check (destinatario_tipo in ('aluno', 'responsavel', 'teste')),
  telefone_destino text not null,
  mensagem_renderizada text not null,
  payload_hash text not null,
  idempotency_key uuid not null unique default gen_random_uuid(),
  expira_em timestamptz not null,
  consumido_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (id, idempotency_key),
  constraint pesquisa_evasao_previews_expiracao_check
    check (expira_em > criado_em),
  constraint pesquisa_evasao_previews_destino_check
    check (nullif(btrim(telefone_destino), '') is not null),
  constraint pesquisa_evasao_previews_hash_check
    check (nullif(btrim(payload_hash), '') is not null)
);

create table if not exists public.pesquisa_evasao_publicos_internos (
  aluno_id integer primary key
    references public.alunos(id) on delete restrict,
  tipo text not null
    check (tipo in ('professor', 'colaborador', 'outro')),
  ativo boolean not null default true,
  fonte text not null,
  confirmado_por_usuario_id integer not null
    references public.usuarios(id),
  confirmado_em timestamptz not null,
  audit_metadata jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pesquisa_evasao_publicos_internos_fonte_check
    check (nullif(btrim(fonte), '') is not null),
  constraint pesquisa_evasao_publicos_internos_audit_check
    check (jsonb_typeof(audit_metadata) = 'object')
);

comment on table public.pesquisa_evasao_publicos_internos is
  'Fonte service-only e auditavel de publico interno. tipo_aluno e financeiro e nunca classifica este vinculo.';

-- Gate de rollout para pesquisa_evasao_publicos_internos: popular somente em
-- runbook posterior, com IDs confirmados individualmente e evidencia em
-- fonte/audit_metadata. Nunca inferir por nome, telefone ou tipo_aluno.

-- ---------------------------------------------------------------------------
-- 4. Persistencia privada antecipada para a conversa multipartes
-- ---------------------------------------------------------------------------

create table if not exists public.pesquisa_evasao_mensagens (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid references public.pesquisa_evasao(id),
  caixa_id integer not null references public.whatsapp_caixas(id),
  direcao text not null,
  provider_message_id text,
  telefone_normalizado text not null,
  tipo text not null,
  texto text,
  audio_storage_path text,
  provider_created_at timestamptz,
  recebido_em timestamptz not null default now(),
  resolution_status text not null default 'pendente',
  substantividade text not null default 'pendente',
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key uuid not null unique default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  constraint pesquisa_evasao_mensagens_telefone_check
    check (nullif(btrim(telefone_normalizado), '') is not null)
);

create unique index if not exists pesquisa_evasao_mensagens_provider_uidx
  on public.pesquisa_evasao_mensagens (caixa_id, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.pesquisa_evasao_transcricoes (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null
    references public.pesquisa_evasao_mensagens(id),
  versao integer not null check (versao > 0),
  status text not null default 'pendente',
  texto text,
  erro_codigo text,
  modelo text,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unique (mensagem_id, versao)
);

create table if not exists public.pesquisa_evasao_analises (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  versao integer not null check (versao > 0),
  texto_consolidado text,
  status text not null default 'rascunho',
  revisor_usuario_id integer references public.usuarios(id),
  revisado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (pesquisa_id, versao),
  constraint pesquisa_evasao_analises_revisao_check
    check (
      (status = 'revisada' and revisor_usuario_id is not null and revisado_em is not null)
      or status <> 'revisada'
    )
);

-- ---------------------------------------------------------------------------
-- 5. Evolucao aditiva do cabecalho legado
-- ---------------------------------------------------------------------------

alter table public.pesquisa_evasao
  add column if not exists envio_status text not null default 'nao_enviado',
  add column if not exists resposta_status text not null default 'sem_resposta',
  add column if not exists modo_teste boolean not null default false,
  add column if not exists telefone_destino_snapshot text,
  add column if not exists caixa_id integer,
  add column if not exists executado_por_usuario_id integer,
  add column if not exists executado_por_auth_user_id uuid,
  add column if not exists assinatura_id uuid,
  add column if not exists assinatura_nome_snapshot text,
  add column if not exists template_id uuid,
  add column if not exists template_versao integer,
  add column if not exists mensagem_renderizada text,
  add column if not exists provider_message_id text,
  add column if not exists preview_id uuid,
  add column if not exists idempotency_key uuid,
  add column if not exists envio_iniciado_em timestamptz,
  add column if not exists primeira_interacao_em timestamptz,
  add column if not exists ultima_interacao_em timestamptz,
  add column if not exists pronta_para_revisao_em timestamptz;

alter table public.pesquisa_evasao
  drop constraint if exists pesquisa_evasao_envio_status_check,
  drop constraint if exists pesquisa_evasao_resposta_status_check,
  drop constraint if exists pesquisa_evasao_caixa_id_fkey,
  drop constraint if exists pesquisa_evasao_executado_por_usuario_id_fkey,
  drop constraint if exists pesquisa_evasao_assinatura_id_fkey,
  drop constraint if exists pesquisa_evasao_template_id_fkey,
  drop constraint if exists pesquisa_evasao_preview_id_fkey,
  drop constraint if exists pesquisa_evasao_idempotency_key_fkey,
  drop constraint if exists pesquisa_evasao_preview_idempotency_fkey,
  drop constraint if exists pesquisa_evasao_preview_idempotency_check,
  drop constraint if exists pesquisa_evasao_teste_destino_check;

alter table public.pesquisa_evasao
  add constraint pesquisa_evasao_envio_status_check
    check (
      envio_status in (
        'nao_enviado',
        'enviando',
        'incerto',
        'enviado',
        'falhou',
        'entregue',
        'lido'
      )
    ),
  add constraint pesquisa_evasao_resposta_status_check
    check (
      resposta_status in (
        'sem_resposta',
        'coletando',
        'pronta_para_revisao',
        'em_revisao',
        'revisada',
        'expirada',
        'invalidada',
        'recusada_opt_out'
      )
    ),
  add constraint pesquisa_evasao_caixa_id_fkey
    foreign key (caixa_id) references public.whatsapp_caixas(id),
  add constraint pesquisa_evasao_executado_por_usuario_id_fkey
    foreign key (executado_por_usuario_id) references public.usuarios(id),
  add constraint pesquisa_evasao_assinatura_id_fkey
    foreign key (assinatura_id)
    references public.pesquisa_evasao_assinaturas(id),
  add constraint pesquisa_evasao_template_id_fkey
    foreign key (template_id)
    references public.pesquisa_evasao_templates(id),
  add constraint pesquisa_evasao_preview_id_fkey
    foreign key (preview_id)
    references public.pesquisa_evasao_previews(id),
  add constraint pesquisa_evasao_idempotency_key_fkey
    foreign key (idempotency_key)
    references public.pesquisa_evasao_previews(idempotency_key),
  add constraint pesquisa_evasao_preview_idempotency_fkey
    foreign key (preview_id, idempotency_key)
    references public.pesquisa_evasao_previews(id, idempotency_key),
  add constraint pesquisa_evasao_preview_idempotency_check
    check (
      (preview_id is null and idempotency_key is null)
      or (preview_id is not null and idempotency_key is not null)
    ),
  add constraint pesquisa_evasao_teste_destino_check
    check (
      modo_teste = false
      or envio_status not in ('enviando', 'incerto')
      or nullif(btrim(telefone_destino_snapshot), '') is not null
    );

-- Compatibilidade documentada dos seis cabecalhos legados.
update public.pesquisa_evasao
set envio_status = case status
      when 'respondido' then 'enviado'
      when 'enviado' then 'enviado'
      when 'falha_envio' then 'falhou'
      when 'sem_whatsapp' then 'falhou'
      else 'nao_enviado'
    end,
    resposta_status = case status
      when 'respondido' then 'pronta_para_revisao'
      when 'ignorado' then 'invalidada'
      else 'sem_resposta'
    end,
    telefone_destino_snapshot = coalesce(
      telefone_destino_snapshot,
      aluno_telefone
    ),
    provider_message_id = coalesce(
      provider_message_id,
      mensagem_uazapi_id
    )
where envio_status = 'nao_enviado'
  and resposta_status = 'sem_resposta';

-- Governanca do backfill:
-- Em 2026-07-30, Alf confirmou que exatamente os seis IDs abaixo eram envios
-- pre-producao para o mesmo numero interno. O telefone nao e versionado aqui.
-- A verificacao falha fechada antes de classificar qualquer linha. Esses seis
-- registros permanecem visiveis como TESTE, mas ficam fora de analytics,
-- acoes, causas, baselines e indicadores de professor.
do $backfill_modo_teste$
declare
  v_ids uuid[] := array[
    '5edc499f-4a91-4ebb-a291-0f052bc16351',
    '416624a9-2d74-4c26-a083-c6aadba21bf2',
    '718fa72e-ca51-4995-960f-575bb00c2b0e',
    '1b918f39-c528-431d-9d7d-3d9160982e6a',
    '61ebbbd0-a8e8-4e77-99ee-d4ff9bcc6f03',
    '147a6632-fccb-4089-9ae0-13db822d7bf9'
  ]::uuid[];
  v_tabela_total integer;
  v_total integer;
  v_telefones integer;
  v_telefones_vazios integer;
begin
  select count(*)
  into v_tabela_total
  from public.pesquisa_evasao;

  if v_tabela_total = 0 then
    raise notice 'backfill ignorado: pesquisa_evasao vazia';
    return;
  end if;

  select
    count(*),
    count(
      distinct nullif(
        regexp_replace(coalesce(aluno_telefone, ''), '\D', '', 'g'),
        ''
      )
    ),
    count(*) filter (
      where nullif(
        regexp_replace(coalesce(aluno_telefone, ''), '\D', '', 'g'),
        ''
      ) is null
    )
  into v_total, v_telefones, v_telefones_vazios
  from public.pesquisa_evasao
  where id = any(v_ids);

  if cardinality(v_ids) <> 6
     or v_total <> 6
     or v_telefones <> 1
     or v_telefones_vazios <> 0 then
    raise exception
      'Backfill legado de modo_teste abortado: esperados 6 registros, 1 telefone e nenhum telefone vazio';
  end if;

  update public.pesquisa_evasao pe
  set modo_teste = true,
      updated_at = now()
  where pe.id = any(v_ids);
end;
$backfill_modo_teste$;

comment on column public.pesquisa_evasao.modo_teste is
  'Os 6 registros anteriores a producao foram confirmados por Alf em 2026-07-30 como testes no numero interno; ficam fora de analytics, acoes e indicadores.';

comment on column public.pesquisa_evasao.telefone_destino_snapshot is
  'Destino efetivamente usado no envio; modo teste nunca altera cadastro ou movimentacao.';

comment on column public.pesquisa_evasao.mensagem_renderizada is
  'Snapshot imutavel da mensagem aprovada na preview e usada no dispatch.';

-- A unicidade global impediria tentativas de teste independentes.
alter table public.pesquisa_evasao
  drop constraint if exists pesquisa_evasao_evasao_id_unique;

drop index if exists public.pesquisa_evasao_evasao_id_unique;

create unique index if not exists pesquisa_evasao_evasao_id_producao_uidx
  on public.pesquisa_evasao (evasao_id)
  where modo_teste = false;

create unique index if not exists pesquisa_evasao_teste_slot_ativo_uidx
  on public.pesquisa_evasao (evasao_id, telefone_destino_snapshot)
  where modo_teste = true
    and envio_status in ('enviando', 'incerto');

create unique index if not exists pesquisa_evasao_preview_id_uidx
  on public.pesquisa_evasao (preview_id);

create unique index if not exists pesquisa_evasao_idempotency_key_uidx
  on public.pesquisa_evasao (idempotency_key);

create index if not exists pesquisa_evasao_envio_status_idx
  on public.pesquisa_evasao (envio_status);

create index if not exists pesquisa_evasao_resposta_status_idx
  on public.pesquisa_evasao (resposta_status);

-- ---------------------------------------------------------------------------
-- 6. RLS e privileges finais
-- ---------------------------------------------------------------------------

alter table public.pesquisa_evasao enable row level security;
alter table public.pesquisa_evasao_templates enable row level security;
alter table public.pesquisa_evasao_assinaturas enable row level security;
alter table public.pesquisa_evasao_previews enable row level security;
alter table public.pesquisa_evasao_publicos_internos enable row level security;
alter table public.pesquisa_evasao_mensagens enable row level security;
alter table public.pesquisa_evasao_transcricoes enable row level security;
alter table public.pesquisa_evasao_analises enable row level security;

drop policy if exists pesquisa_evasao_all
  on public.pesquisa_evasao;
drop policy if exists pesquisa_evasao_leitura_estrita
  on public.pesquisa_evasao;
drop policy if exists pesquisa_evasao_mensagens_leitura_estrita
  on public.pesquisa_evasao_mensagens;
drop policy if exists pesquisa_evasao_transcricoes_leitura_estrita
  on public.pesquisa_evasao_transcricoes;
drop policy if exists pesquisa_evasao_analises_leitura_estrita
  on public.pesquisa_evasao_analises;

create policy pesquisa_evasao_leitura_estrita
on public.pesquisa_evasao
for select
to authenticated
using (
  public.fn_usuario_atual_tem_permissao_estrita(
    'sucesso_aluno.evasao.ver'::varchar,
    pesquisa_evasao.unidade_id
  )
);

create policy pesquisa_evasao_mensagens_leitura_estrita
on public.pesquisa_evasao_mensagens
for select
to authenticated
using (
  exists (
    select 1
    from public.pesquisa_evasao pe
    where pe.id = pesquisa_evasao_mensagens.pesquisa_id
      and public.fn_usuario_atual_tem_permissao_estrita(
        'sucesso_aluno.evasao.ver'::varchar,
        pe.unidade_id
      )
  )
);

create policy pesquisa_evasao_transcricoes_leitura_estrita
on public.pesquisa_evasao_transcricoes
for select
to authenticated
using (
  exists (
    select 1
    from public.pesquisa_evasao pe
    join public.pesquisa_evasao_mensagens pem
      on pem.pesquisa_id = pe.id
    where pem.id = pesquisa_evasao_transcricoes.mensagem_id
      and public.fn_usuario_atual_tem_permissao_estrita(
        'sucesso_aluno.evasao.ver'::varchar,
        pe.unidade_id
      )
  )
);

create policy pesquisa_evasao_analises_leitura_estrita
on public.pesquisa_evasao_analises
for select
to authenticated
using (
  exists (
    select 1
    from public.pesquisa_evasao pe
    where pe.id = pesquisa_evasao_analises.pesquisa_id
      and public.fn_usuario_atual_tem_permissao_estrita(
        'sucesso_aluno.evasao.ver'::varchar,
        pe.unidade_id
      )
  )
);

revoke all on table public.pesquisa_evasao
  from public, anon, authenticated, service_role,
       mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
revoke all on table public.pesquisa_evasao_templates
  from public, anon, authenticated, service_role,
       mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
revoke all on table public.pesquisa_evasao_assinaturas
  from public, anon, authenticated, service_role,
       mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
revoke all on table public.pesquisa_evasao_previews
  from public, anon, authenticated, service_role,
       mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
revoke all on table public.pesquisa_evasao_publicos_internos
  from public, anon, authenticated, service_role,
       mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
revoke all on table public.pesquisa_evasao_mensagens
  from public, anon, authenticated, service_role,
       mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
revoke all on table public.pesquisa_evasao_transcricoes
  from public, anon, authenticated, service_role,
       mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
revoke all on table public.pesquisa_evasao_analises
  from public, anon, authenticated, service_role,
       mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;

grant select on table public.pesquisa_evasao to authenticated;
grant select on table public.pesquisa_evasao_mensagens to authenticated;
grant select on table public.pesquisa_evasao_transcricoes to authenticated;
grant select on table public.pesquisa_evasao_analises to authenticated;

grant select, insert, update on table public.pesquisa_evasao
  to service_role;
grant select on table public.pesquisa_evasao_templates
  to service_role;
grant select on table public.pesquisa_evasao_assinaturas
  to service_role;
grant select, insert on table public.pesquisa_evasao_previews
  to service_role;
grant select, insert, update on table public.pesquisa_evasao_publicos_internos
  to service_role;
grant select, insert on table public.pesquisa_evasao_mensagens
  to service_role;
grant update (
  pesquisa_id,
  audio_storage_path,
  resolution_status,
  substantividade
) on table public.pesquisa_evasao_mensagens
  to service_role;
grant select, insert, update on table public.pesquisa_evasao_transcricoes
  to service_role;
grant select, insert, update on table public.pesquisa_evasao_analises
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. RPCs legadas endurecidas, com RETURNS preservados
-- ---------------------------------------------------------------------------

create or replace function public.listar_evadidos_para_pesquisa(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_status varchar
)
returns table (
  evasao_id integer,
  aluno_id integer,
  nome text,
  telefone text,
  curso text,
  professor text,
  tempo_meses integer,
  data_evasao date,
  motivo_cadastrado text,
  pesquisa_status text,
  pesquisa_id uuid,
  resposta_texto text,
  respondido_em timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  return query
  select
    m.id as evasao_id,
    m.aluno_id,
    coalesce(m.aluno_nome, a.nome)::text as nome,
    nullif(btrim(m.telefone_snapshot), '')::text as telefone,
    c.nome::text as curso,
    pr.nome::text as professor,
    greatest(
      0,
      coalesce(m.tempo_permanencia_meses, a.tempo_permanencia_meses, 0)
    )::integer as tempo_meses,
    m.data as data_evasao,
    coalesce(ms.nome, m.motivo)::text as motivo_cadastrado,
    case
      when pe.modo_teste = true
        then ('TESTE:' || coalesce(pe.status, 'pendente'))::text
      else coalesce(pe.status, 'pendente')::text
    end as pesquisa_status,
    pe.id as pesquisa_id,
    pe.resposta_texto,
    pe.respondido_em
  from public.movimentacoes_admin m
  left join public.alunos a
    on a.id = m.aluno_id
  left join public.cursos c
    on c.id = coalesce(m.curso_id, a.curso_id)
  left join public.professores pr
    on pr.id = coalesce(m.professor_id, a.professor_atual_id)
  left join public.motivos_saida ms
    on ms.id = m.motivo_saida_id
  left join lateral (
    select pe0.*
    from public.pesquisa_evasao pe0
    where pe0.evasao_id = m.id
    order by pe0.modo_teste asc, pe0.created_at desc, pe0.id desc
    limit 1
  ) pe
    on pe.evasao_id = m.id
  where m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id)
    and (
      p_unidade_id is null
      or m.unidade_id = p_unidade_id
    )
    and public.fn_usuario_atual_tem_permissao_estrita(
      'sucesso_aluno.evasao.ver'::varchar,
      m.unidade_id
    )
    and nullif(btrim(m.telefone_snapshot), '') is not null
    and (
      p_status is null
      or coalesce(pe.status, 'pendente') = p_status
    )
  order by
    case coalesce(pe.status, 'pendente')
      when 'pendente' then 1
      when 'enviado' then 2
      when 'respondido' then 3
      else 4
    end,
    m.data desc
  limit p_limite
  offset p_offset;
end;
$function$;

create or replace function public.listar_evadidos_para_pesquisa(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_status varchar,
  p_ano integer,
  p_mes integer
)
returns table (
  evasao_id integer,
  aluno_id integer,
  nome text,
  telefone text,
  curso text,
  professor text,
  tempo_meses integer,
  data_evasao date,
  motivo_cadastrado text,
  pesquisa_status text,
  pesquisa_id uuid,
  resposta_texto text,
  resposta_audio_url text,
  resposta_tipo text,
  respondido_em timestamp with time zone,
  is_menor boolean,
  responsavel_nome text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  return query
  select
    m.id as evasao_id,
    m.aluno_id,
    coalesce(m.aluno_nome, a.nome)::text as nome,
    nullif(btrim(m.telefone_snapshot), '')::text as telefone,
    c.nome::text as curso,
    pr.nome::text as professor,
    greatest(
      0,
      coalesce(m.tempo_permanencia_meses, a.tempo_permanencia_meses, 0)
    )::integer as tempo_meses,
    m.data as data_evasao,
    coalesce(ms.nome, m.motivo)::text as motivo_cadastrado,
    case
      when pe.modo_teste = true
        then ('TESTE:' || coalesce(pe.status, 'pendente'))::text
      else coalesce(pe.status, 'pendente')::text
    end as pesquisa_status,
    pe.id as pesquisa_id,
    pe.resposta_texto,
    pe.resposta_audio_url::text,
    pe.resposta_tipo::text,
    pe.respondido_em,
    (
      a.data_nascimento is not null
      and extract(year from age(current_date, a.data_nascimento))::integer < 18
    ) as is_menor,
    coalesce(a.responsavel_nome, '—')::text as responsavel_nome
  from public.movimentacoes_admin m
  left join public.alunos a
    on a.id = m.aluno_id
  left join public.cursos c
    on c.id = coalesce(m.curso_id, a.curso_id)
  left join public.professores pr
    on pr.id = coalesce(m.professor_id, a.professor_atual_id)
  left join public.motivos_saida ms
    on ms.id = m.motivo_saida_id
  left join lateral (
    select pe0.*
    from public.pesquisa_evasao pe0
    where pe0.evasao_id = m.id
    order by pe0.modo_teste asc, pe0.created_at desc, pe0.id desc
    limit 1
  ) pe
    on pe.evasao_id = m.id
  where m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id)
    and (
      p_unidade_id is null
      or m.unidade_id = p_unidade_id
    )
    and public.fn_usuario_atual_tem_permissao_estrita(
      'sucesso_aluno.evasao.ver'::varchar,
      m.unidade_id
    )
    and nullif(btrim(m.telefone_snapshot), '') is not null
    and (
      p_status is null
      or coalesce(pe.status, 'pendente') = p_status
    )
    and (
      p_ano is null
      or extract(year from m.data)::integer = p_ano
    )
    and (
      p_mes is null
      or extract(month from m.data)::integer = p_mes
    )
  order by
    case coalesce(pe.status, 'pendente')
      when 'pendente' then 1
      when 'enviado' then 2
      when 'respondido' then 3
      else 4
    end,
    m.data desc
  limit p_limite
  offset p_offset;
end;
$function$;

create or replace function public.stats_pesquisa_evasao(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns table (
  total_evadidos bigint,
  total_com_telefone bigint,
  total_pendentes bigint,
  total_enviados bigint,
  total_respondidos bigint,
  total_falhas bigint,
  taxa_resposta numeric,
  respondidos_texto bigint,
  respondidos_audio bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  return query
  with evadidos_mes as (
    select
      m.id,
      nullif(btrim(m.telefone_snapshot), '') as tel
    from public.movimentacoes_admin m
    left join public.alunos a
      on a.id = m.aluno_id
    where m.tipo in ('evasao', 'nao_renovacao')
      and public.is_movimentacao_admin_retencao_valida(m.id)
      and extract(year from m.data)::integer = p_ano
      and extract(month from m.data)::integer = p_mes
      and (
        p_unidade_id is null
        or m.unidade_id = p_unidade_id
      )
      and public.fn_usuario_atual_tem_permissao_estrita(
        'sucesso_aluno.evasao.ver'::varchar,
        m.unidade_id
      )
  ),
  stats as (
    select
      count(*) as total,
      count(*) filter (where em.tel is not null) as com_telefone,
      count(*) filter (
        where pe.id is null
           or pe.envio_status = 'nao_enviado'
      ) as pendentes,
      count(*) filter (
        where pe.envio_status in ('enviado', 'entregue', 'lido')
          and pe.resposta_status not in (
            'pronta_para_revisao',
            'em_revisao',
            'revisada'
          )
      ) as enviados,
      count(*) filter (
        where pe.resposta_status in (
          'pronta_para_revisao',
          'em_revisao',
          'revisada'
        )
      ) as respondidos,
      count(*) filter (
        where pe.envio_status = 'falhou'
      ) as falhas,
      count(*) filter (
        where pe.resposta_status in (
          'pronta_para_revisao',
          'em_revisao',
          'revisada'
        )
          and pe.resposta_tipo = 'texto'
      ) as resp_texto,
      count(*) filter (
        where pe.resposta_status in (
          'pronta_para_revisao',
          'em_revisao',
          'revisada'
        )
          and pe.resposta_tipo = 'audio'
      ) as resp_audio
    from evadidos_mes em
    left join public.pesquisa_evasao pe
      on pe.evasao_id = em.id
     and pe.modo_teste = false
  )
  select
    s.total as total_evadidos,
    s.com_telefone as total_com_telefone,
    s.pendentes as total_pendentes,
    s.enviados as total_enviados,
    s.respondidos as total_respondidos,
    s.falhas as total_falhas,
    case
      when (s.enviados + s.respondidos) > 0
        then round(
          s.respondidos::numeric
          / (s.enviados + s.respondidos)
          * 100,
          1
        )
      else 0
    end as taxa_resposta,
    s.resp_texto as respondidos_texto,
    s.resp_audio as respondidos_audio
  from stats s;
end;
$function$;

create or replace function public.criar_pesquisa_evasao(
  p_evasao_id integer,
  p_criado_por text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pesquisa_id uuid;
  v_evasao record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PESQUISA_EVASAO_ACESSO_NEGADO'
      using errcode = '42501';
  end if;

  select
    m.id,
    m.aluno_id,
    m.unidade_id,
    m.aluno_nome,
    m.telefone_snapshot,
    m.data as data_evasao,
    coalesce(ms.nome, m.motivo) as motivo,
    c.nome as curso,
    pr.nome as professor,
    greatest(
      0,
      coalesce(m.tempo_permanencia_meses, a.tempo_permanencia_meses, 0)
    ) as tempo_meses
  into v_evasao
  from public.movimentacoes_admin m
  left join public.alunos a
    on a.id = m.aluno_id
  left join public.cursos c
    on c.id = coalesce(m.curso_id, a.curso_id)
  left join public.professores pr
    on pr.id = coalesce(m.professor_id, a.professor_atual_id)
  left join public.motivos_saida ms
    on ms.id = m.motivo_saida_id
  where m.id = p_evasao_id
    and m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id);

  if v_evasao.id is null then
    raise exception
      'Evasao nao encontrada ou atividade extra fora da retencao: %',
      p_evasao_id;
  end if;

  if nullif(btrim(v_evasao.telefone_snapshot), '') is null then
    raise exception 'Evasao sem telefone: %', p_evasao_id;
  end if;

  insert into public.pesquisa_evasao (
    evasao_id,
    aluno_id,
    unidade_id,
    aluno_nome,
    aluno_telefone,
    aluno_curso,
    aluno_professor,
    tempo_permanencia_meses,
    data_evasao,
    motivo_cadastrado,
    status,
    envio_status,
    resposta_status,
    modo_teste,
    telefone_destino_snapshot
  )
  values (
    v_evasao.id,
    v_evasao.aluno_id,
    v_evasao.unidade_id,
    v_evasao.aluno_nome,
    v_evasao.telefone_snapshot,
    v_evasao.curso,
    v_evasao.professor,
    v_evasao.tempo_meses,
    v_evasao.data_evasao,
    v_evasao.motivo,
    'pendente',
    'nao_enviado',
    'sem_resposta',
    false,
    v_evasao.telefone_snapshot
  )
  on conflict (evasao_id) where modo_teste = false
  do update
  set evasao_id = excluded.evasao_id
  returning id into v_pesquisa_id;

  -- Parametro preservado por compatibilidade de assinatura. A identidade de
  -- envio so e registrada depois do provider, nunca durante esta criacao.
  perform p_criado_por;

  return v_pesquisa_id;
end;
$function$;

create or replace function public.pode_enviar_pesquisa_evasao(
  p_evasao_id integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_unidade_id uuid;
begin
  select m.unidade_id
  into v_unidade_id
  from public.movimentacoes_admin m
  where m.id = p_evasao_id
    and m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id);

  if v_unidade_id is null then
    return false;
  end if;

  return (
    auth.role() = 'service_role'
    or public.fn_usuario_atual_tem_permissao_estrita(
      'sucesso_aluno.evasao.enviar'::varchar,
      v_unidade_id
    )
  );
end;
$function$;

revoke all on function public.listar_evadidos_para_pesquisa(
  uuid,
  integer,
  integer,
  varchar
) from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.listar_evadidos_para_pesquisa(
  uuid,
  integer,
  integer,
  varchar
) to authenticated, service_role;

revoke all on function public.listar_evadidos_para_pesquisa(
  uuid,
  integer,
  integer,
  varchar,
  integer,
  integer
) from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.listar_evadidos_para_pesquisa(
  uuid,
  integer,
  integer,
  varchar,
  integer,
  integer
) to authenticated, service_role;

revoke all on function public.stats_pesquisa_evasao(uuid, integer, integer)
  from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.stats_pesquisa_evasao(uuid, integer, integer)
  to authenticated, service_role;

revoke all on function public.criar_pesquisa_evasao(integer, text)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.criar_pesquisa_evasao(integer, text)
  to service_role;

revoke all on function public.pode_enviar_pesquisa_evasao(integer)
  from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.pode_enviar_pesquisa_evasao(integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Listagem operacional v2: grao da movimentacao, producao e teste separados
-- ---------------------------------------------------------------------------

create or replace function public.listar_evadidos_para_pesquisa_v2(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_status varchar,
  p_ano integer,
  p_mes integer,
  p_busca text
)
returns table (
  total_count bigint,
  evasao_id integer,
  aluno_id integer,
  nome text,
  telefone text,
  curso text,
  professor text,
  tempo_meses integer,
  data_evasao date,
  motivo_catalogado text,
  motivo_legado text,
  pesquisa_producao_status text,
  pesquisa_producao_id uuid,
  resposta_producao_texto text,
  resposta_producao_audio_url text,
  resposta_producao_tipo text,
  respondido_producao_em timestamptz,
  is_menor boolean,
  responsavel_nome text,
  publico_tipo text,
  bloqueio_codigo text,
  elegivel_envio boolean,
  elegibilidade_regra text,
  possui_historico_teste boolean,
  quantidade_testes bigint,
  ultimo_teste_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with base_autorizada as (
  select
    m.id as evasao_id,
    m.aluno_id,
    a.id as aluno_registro_id,
    coalesce(m.aluno_nome, a.nome)::text as nome,
    nullif(btrim(m.telefone_snapshot), '')::text as telefone,
    c.nome::text as curso,
    pr.nome::text as professor,
    greatest(
      0,
      coalesce(m.tempo_permanencia_meses, a.tempo_permanencia_meses, 0)
    )::integer as tempo_meses,
    m.data as data_evasao,
    ms.nome::text as motivo_catalogado,
    m.motivo::text as motivo_legado,
    coalesce(producao.status, 'pendente')::text
      as pesquisa_producao_status,
    producao.id as pesquisa_producao_id,
    producao.resposta_texto::text as resposta_producao_texto,
    producao.resposta_audio_url::text as resposta_producao_audio_url,
    producao.resposta_tipo::text as resposta_producao_tipo,
    producao.respondido_em as respondido_producao_em,
    (
      a.data_nascimento is not null
      and extract(year from age(current_date, a.data_nascimento))::integer < 18
    ) as is_menor,
    a.responsavel_nome::text as responsavel_nome,
    publico_interno.aluno_id as publico_interno_aluno_id,
    case
      when publico_interno.aluno_id is not null
        then publico_interno.tipo
      when (
        a.data_nascimento is not null
        and extract(year from age(current_date, a.data_nascimento))::integer < 18
      )
        then 'responsavel'
      else 'aluno'
    end::text as publico_tipo,
    coalesce(testes.quantidade_testes, 0)::bigint as quantidade_testes,
    testes.ultimo_teste_em
  from public.movimentacoes_admin m
  left join public.alunos a
    on a.id = m.aluno_id
  left join public.pesquisa_evasao_publicos_internos publico_interno
    on publico_interno.aluno_id = m.aluno_id
   and publico_interno.ativo = true
  left join public.cursos c
    on c.id = coalesce(m.curso_id, a.curso_id)
  left join public.professores pr
    on pr.id = coalesce(m.professor_id, a.professor_atual_id)
  left join public.motivos_saida ms
    on ms.id = m.motivo_saida_id
  left join lateral (
    select pe0.*
    from public.pesquisa_evasao pe0
    where pe0.evasao_id = m.id
      and pe0.modo_teste = false
    order by pe0.created_at desc, pe0.id desc
    limit 1
  ) producao
    on true
  left join lateral (
    select
      count(*) filter (where pe_t.modo_teste = true)::bigint
        as quantidade_testes,
      max(coalesce(pe_t.enviado_em, pe_t.created_at))
        filter (where pe_t.modo_teste = true) as ultimo_teste_em
    from public.pesquisa_evasao pe_t
    where pe_t.evasao_id = m.id
  ) testes
    on true
  where m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id)
    and (
      p_unidade_id is null
      or m.unidade_id = p_unidade_id
    )
    and (
      auth.role() = 'service_role'
      or public.fn_usuario_atual_tem_permissao_estrita(
        'sucesso_aluno.evasao.ver'::varchar,
        m.unidade_id
      )
    )
    and (
      p_status is null
      or coalesce(producao.status, 'pendente') = p_status
    )
    and (
      p_ano is null
      or extract(year from m.data)::integer = p_ano
    )
    and (
      p_mes is null
      or extract(month from m.data)::integer = p_mes
    )
    and (
      nullif(btrim(p_busca), '') is null
      or coalesce(m.aluno_nome, a.nome, '')
        ilike ('%' || btrim(p_busca) || '%')
      or coalesce(c.nome, '')
        ilike ('%' || btrim(p_busca) || '%')
      or coalesce(pr.nome, '')
        ilike ('%' || btrim(p_busca) || '%')
      or coalesce(ms.nome, m.motivo, '')
        ilike ('%' || btrim(p_busca) || '%')
      or coalesce(m.telefone_snapshot, '')
        ilike ('%' || btrim(p_busca) || '%')
    )
),
telefone_extraida as (
  select
    base_autorizada.*,
    nullif(regexp_replace(telefone, '[^0-9]', '', 'g'), '')
      as telefone_digitos
  from base_autorizada
),
classificada as (
  select
    telefone_extraida.*,
    case
      when telefone_digitos ~ '^[0-9]{10,11}$'
        then '55' || telefone_digitos
      when telefone_digitos ~ '^55[0-9]{10,11}$'
        then telefone_digitos
      else telefone_digitos
    end as telefone_normalizado
  from telefone_extraida
),
bloqueada as (
  select
    classificada.*,
    case
      when aluno_id is null or aluno_registro_id is null
        then 'sem_aluno'
      when publico_interno_aluno_id is not null
        then 'publico_interno'
      when telefone_normalizado is null
        then 'sem_telefone'
      when telefone_normalizado !~ '^55[0-9]{10,11}$'
        then 'telefone_invalido'
      when motivo_catalogado is null
        then 'motivo_nao_catalogado'
      when exists (
        select 1
        from public.pesquisa_evasao pe_aberta
        cross join lateral (
          select nullif(
            regexp_replace(
              pe_aberta.telefone_destino_snapshot,
              '[^0-9]',
              '',
              'g'
            ),
            ''
          ) as telefone_aberta_digitos
        ) telefone_aberta
        cross join lateral (
          select case
            when telefone_aberta_digitos ~ '^[0-9]{10,11}$'
              then '55' || telefone_aberta_digitos
            when telefone_aberta_digitos ~ '^55[0-9]{10,11}$'
              then telefone_aberta_digitos
            else telefone_aberta_digitos
          end as telefone_aberta_normalizado
        ) telefone_aberta_canonica
        where pe_aberta.modo_teste = false
          and pe_aberta.evasao_id <> classificada.evasao_id
          and telefone_aberta_normalizado =
            classificada.telefone_normalizado
          and pe_aberta.envio_status in (
            'enviando',
            'incerto',
            'enviado',
            'entregue',
            'lido'
          )
          and pe_aberta.resposta_status in ('sem_resposta', 'coletando')
      )
        then 'pesquisa_aberta_no_mesmo_numero'
      else null
    end::text as bloqueio_codigo
  from classificada
),
elegibilidade as (
  select
    bloqueada.*,
    (
      bloqueio_codigo is null
      and pesquisa_producao_status in (
        'pendente',
        'falha_envio',
        'sem_whatsapp'
      )
    ) as elegivel_envio,
    case
      when bloqueio_codigo is not null
        then bloqueio_codigo
      when pesquisa_producao_status not in (
        'pendente',
        'falha_envio',
        'sem_whatsapp'
      )
        then 'status_producao_nao_enviavel'
      else 'elegivel'
    end::text as elegibilidade_regra
  from bloqueada
)
select
  count(*) over () as total_count,
  evasao_id,
  aluno_id,
  nome,
  telefone,
  curso,
  professor,
  tempo_meses,
  data_evasao,
  motivo_catalogado,
  motivo_legado,
  pesquisa_producao_status,
  pesquisa_producao_id,
  resposta_producao_texto,
  resposta_producao_audio_url,
  resposta_producao_tipo,
  respondido_producao_em,
  is_menor,
  responsavel_nome,
  publico_tipo,
  bloqueio_codigo,
  elegivel_envio,
  elegibilidade_regra,
  quantidade_testes > 0 as possui_historico_teste,
  quantidade_testes,
  ultimo_teste_em
from elegibilidade
order by
  case pesquisa_producao_status
    when 'pendente' then 1
    when 'falha_envio' then 2
    when 'sem_whatsapp' then 3
    when 'enviado' then 4
    when 'respondido' then 5
    else 6
  end,
  data_evasao desc,
  evasao_id desc
limit least(greatest(coalesce(p_limite, 50), 1), 100)
offset greatest(coalesce(p_offset, 0), 0);
$function$;

create or replace function public.listar_pesquisas_evasao_teste_v1(
  p_evasao_id integer
)
returns table (
  pesquisa_id uuid,
  modo_teste boolean,
  envio_status text,
  resposta_status text,
  enviado_em timestamptz,
  respondido_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
select
  pe.id as pesquisa_id,
  pe.modo_teste,
  pe.envio_status::text,
  pe.resposta_status::text,
  pe.enviado_em,
  pe.respondido_em
from public.movimentacoes_admin m
join public.pesquisa_evasao pe
  on pe.evasao_id = m.id
where m.id = p_evasao_id
  and pe.modo_teste = true
  and (
    auth.role() = 'service_role'
    or public.fn_usuario_atual_tem_permissao_estrita(
      'sucesso_aluno.evasao.ver'::varchar,
      m.unidade_id
    )
  )
order by coalesce(pe.enviado_em, pe.created_at) desc, pe.id desc;
$function$;

revoke all on function public.listar_evadidos_para_pesquisa_v2(
  uuid,
  integer,
  integer,
  varchar,
  integer,
  integer,
  text
) from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.listar_evadidos_para_pesquisa_v2(
  uuid,
  integer,
  integer,
  varchar,
  integer,
  integer,
  text
) to authenticated, service_role;

revoke all on function public.listar_pesquisas_evasao_teste_v1(integer)
  from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.listar_pesquisas_evasao_teste_v1(integer)
  to authenticated, service_role;
