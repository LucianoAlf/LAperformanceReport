-- Subprojeto C: classificacao analitica, acoes e desfechos da pesquisa de evasao.
-- Migration somente estrutural: nao reclassifica nem altera pesquisas existentes.

create table if not exists public.pesquisa_evasao_classificacoes (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  versao integer not null check (versao > 0),
  analise_id uuid not null references public.pesquisa_evasao_analises(id),
  analise_versao_max integer not null check (analise_versao_max > 0),
  relacao_motivo text not null check (relacao_motivo in (
    'confirmou', 'confirmou_parcialmente', 'complementou', 'divergiu',
    'sem_motivo_anterior', 'inconclusivo', 'invalido'
  )),
  justificativa text not null default '' check (char_length(justificativa) <= 1000),
  sucede_classificacao_id uuid references public.pesquisa_evasao_classificacoes(id),
  revisor_usuario_id integer not null references public.usuarios(id),
  revisor_auth_user_id uuid not null,
  revisado_em timestamptz not null default clock_timestamp(),
  unique (pesquisa_id, versao)
);

create table if not exists public.pesquisa_evasao_classificacao_categorias (
  classificacao_id uuid not null
    references public.pesquisa_evasao_classificacoes(id),
  categoria text not null check (categoria in (
    'financeiro', 'tempo_horario', 'saude', 'desanimo',
    'pedagogico_professor', 'atendimento_experiencia', 'mudanca_endereco',
    'familia_estudos_trabalho', 'outro', 'inconclusivo', 'resposta_invalida'
  )),
  primary key (classificacao_id, categoria)
);

create table if not exists public.pesquisa_evasao_desfechos (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  classificacao_id uuid not null
    references public.pesquisa_evasao_classificacoes(id),
  desfecho text not null check (desfecho in (
    'recuperou', 'prometeu_voltar', 'confirmou_saida'
  )),
  observacao text not null default '' check (char_length(observacao) <= 1000),
  sucede_desfecho_id uuid references public.pesquisa_evasao_desfechos(id),
  registrado_por_usuario_id integer not null references public.usuarios(id),
  registrado_por_auth_user_id uuid not null,
  registrado_em timestamptz not null default clock_timestamp()
);

alter table public.aluno_acoes
  add column if not exists pesquisa_evasao_id uuid
    references public.pesquisa_evasao(id),
  add column if not exists classificacao_evasao_id uuid
    references public.pesquisa_evasao_classificacoes(id),
  add column if not exists professor_id integer references public.professores(id),
  add column if not exists estado text not null default 'pendente',
  add column if not exists prazo_em timestamptz,
  add column if not exists criado_por_usuario_id integer references public.usuarios(id),
  add column if not exists concluida_por_usuario_id integer references public.usuarios(id),
  add column if not exists concluida_por_auth_user_id uuid,
  add column if not exists concluida_em timestamptz;

alter table public.aluno_acoes drop constraint if exists aluno_acoes_tipo_check;
alter table public.aluno_acoes add constraint aluno_acoes_tipo_check check (tipo in (
  'ligacao', 'whatsapp', 'reuniao', 'observacao', 'plano_ia', 'email',
  'visita', 'retorno_familia', 'encaminhar_coordenacao',
  'encaminhar_financeiro', 'vincular_professor', 'tentativa_retencao',
  'solucao_oferecida', 'outro'
));

alter table public.aluno_acoes drop constraint if exists aluno_acoes_estado_check;
alter table public.aluno_acoes add constraint aluno_acoes_estado_check
  check (estado in ('pendente', 'realizada', 'cancelada')) not valid;
alter table public.aluno_acoes validate constraint aluno_acoes_estado_check;

alter table public.aluno_acoes drop constraint if exists aluno_acoes_professor_coerente_check;
alter table public.aluno_acoes add constraint aluno_acoes_professor_coerente_check check (
  pesquisa_evasao_id is null
  or (tipo = 'vincular_professor' and professor_id is not null)
  or (tipo <> 'vincular_professor' and professor_id is null)
) not valid;
alter table public.aluno_acoes validate constraint aluno_acoes_professor_coerente_check;

create or replace function public.fn_pesquisa_evasao_c_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'PESQUISA_EVASAO_C_APPEND_ONLY: % nao permite %',
    tg_table_name, tg_op using errcode = '55000';
end
$$;

drop trigger if exists trg_pesquisa_evasao_classificacoes_append_only
  on public.pesquisa_evasao_classificacoes;
create trigger trg_pesquisa_evasao_classificacoes_append_only
before update or delete on public.pesquisa_evasao_classificacoes
for each row execute function public.fn_pesquisa_evasao_c_append_only();

drop trigger if exists trg_pesquisa_evasao_classificacao_categorias_append_only
  on public.pesquisa_evasao_classificacao_categorias;
create trigger trg_pesquisa_evasao_classificacao_categorias_append_only
before update or delete on public.pesquisa_evasao_classificacao_categorias
for each row execute function public.fn_pesquisa_evasao_c_append_only();

drop trigger if exists trg_pesquisa_evasao_desfechos_append_only
  on public.pesquisa_evasao_desfechos;
create trigger trg_pesquisa_evasao_desfechos_append_only
before update or delete on public.pesquisa_evasao_desfechos
for each row execute function public.fn_pesquisa_evasao_c_append_only();

create index if not exists idx_pesquisa_evasao_classificacoes_pesquisa_versao
  on public.pesquisa_evasao_classificacoes (pesquisa_id, versao desc);
create index if not exists idx_pesquisa_evasao_desfechos_pesquisa_data
  on public.pesquisa_evasao_desfechos (pesquisa_id, registrado_em desc);
create index if not exists idx_aluno_acoes_evasao_estado_prazo
  on public.aluno_acoes (pesquisa_evasao_id, estado, prazo_em)
  where pesquisa_evasao_id is not null;

comment on column public.pesquisa_evasao.categoria_resposta is
  'LEGADO: vazio no baseline de 04/08/2026; substituido pela classificacao versionada do Subprojeto C.';
comment on column public.pesquisa_evasao.sentimento is
  'LEGADO: vazio no baseline de 04/08/2026; sem escritor no Subprojeto C.';

alter table public.pesquisa_evasao_classificacoes enable row level security;
alter table public.pesquisa_evasao_classificacao_categorias enable row level security;
alter table public.pesquisa_evasao_desfechos enable row level security;
alter table public.aluno_acoes enable row level security;

drop policy if exists pesquisa_evasao_classificacoes_leitura_interna
  on public.pesquisa_evasao_classificacoes;
create policy pesquisa_evasao_classificacoes_leitura_interna
on public.pesquisa_evasao_classificacoes for select to authenticated
using (public.fn_pesquisa_evasao_usuario_interno_ativo());

drop policy if exists pesquisa_evasao_classificacao_categorias_leitura_interna
  on public.pesquisa_evasao_classificacao_categorias;
create policy pesquisa_evasao_classificacao_categorias_leitura_interna
on public.pesquisa_evasao_classificacao_categorias for select to authenticated
using (public.fn_pesquisa_evasao_usuario_interno_ativo());

drop policy if exists pesquisa_evasao_desfechos_leitura_interna
  on public.pesquisa_evasao_desfechos;
create policy pesquisa_evasao_desfechos_leitura_interna
on public.pesquisa_evasao_desfechos for select to authenticated
using (public.fn_pesquisa_evasao_usuario_interno_ativo());

drop policy if exists "Authenticated users can manage actions"
  on public.aluno_acoes;
drop policy if exists aluno_acoes_leitura_interna on public.aluno_acoes;
create policy aluno_acoes_leitura_interna
on public.aluno_acoes for select to authenticated
using (public.fn_pesquisa_evasao_usuario_interno_ativo());

revoke all on public.pesquisa_evasao_classificacoes,
  public.pesquisa_evasao_classificacao_categorias,
  public.pesquisa_evasao_desfechos from public, anon, authenticated,
  mila_acesso_restrito, sol_acesso_restrito, fabio_agent,
  lia_acesso_restrito;
grant select on public.pesquisa_evasao_classificacoes,
  public.pesquisa_evasao_classificacao_categorias,
  public.pesquisa_evasao_desfechos to authenticated;
grant select, insert on public.pesquisa_evasao_classificacoes,
  public.pesquisa_evasao_classificacao_categorias,
  public.pesquisa_evasao_desfechos to service_role;

revoke insert, update, delete on public.aluno_acoes from authenticated,
  anon, mila_acesso_restrito, sol_acesso_restrito, fabio_agent,
  lia_acesso_restrito;
grant select on public.aluno_acoes to authenticated, service_role;
grant insert, update on public.aluno_acoes to service_role;

revoke all on function public.fn_pesquisa_evasao_c_append_only()
  from public, anon, authenticated;
grant execute on function public.fn_pesquisa_evasao_c_append_only()
  to service_role;
