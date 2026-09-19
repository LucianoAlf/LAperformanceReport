-- =============================================================================
-- MODULO EVENTOS — gestao de recital (LAPE-39)
-- 100% ADITIVO (prefixo evento_*). Nenhum objeto existente do LA Report e alterado.
--
-- POR QUE: o recital das 3 unidades e organizado hoje fora do sistema. Na reuniao de
-- 17/09/2026 (Luciano, Hugo, Arthur Cortes), o Arthur apresentou um prototipo standalone
-- (localStorage + importacao de CSV com 259 alunos) que resolve a montagem da grade mas
-- nao conhece a base do LA Report e morre a cada recital. Decisao: trazer para dentro.
--
-- ESCOPO: UM EVENTO POR UNIDADE, com data propria e independente (as unidades nao fazem
-- recital no mesmo periodo). So recital por ora — sem abstracao para workshop/masterclass.
--
-- 🔴 O GRAO DA APRESENTACAO E (pessoa, curso), e isso e uma RESTRICAO, nao codigo:
--   unique (evento_id, pessoa_chave, curso_id) em evento_apresentacao.
--   Regra confirmada pelo Hugo: quem faz 2 cursos DIFERENTES se apresenta 2 vezes; quem
--   tem 2 matriculas do MESMO curso se apresenta 1 vez. Como `alunos` e MATRICULA e nao
--   pessoa, sem essa chave os casos reais que o Arthur levantou na ata (Juliana Meinar,
--   Jeremias/Ame — duas matriculas de teclado) virariam duas apresentacoes e dois
--   certificados. A chave resolve sem nenhum `if` no codigo, e vale para TODO caminho de
--   escrita (front, RPC, correcao manual por SQL).
--
-- IDENTIDADE: o par (unidade_id, pessoa_chave), como na anamnese (LAPE-19). `aluno_id`
-- guarda a PROCEDENCIA (em qual matricula foi lancado) e `pessoa_chave` vem por trigger de
-- fn_pessoa_chave_aluno. `emusys_student_id` SOZINHO nao identifica pessoa: 91 ids
-- aparecem em 2+ unidades com nomes diferentes.
--
-- 🔴 MODULO ESTANQUE (decisao do Hugo): isto e parte pedagogica separada. Nada aqui
-- escreve em aluno_presenca, movimentacoes_admin, KPIs, carteira ou score do professor.
-- O check-in do recital (fase 6) e presenca de EVENTO e mora aqui — se fosse para
-- aluno_presenca viraria frequencia do aluno, entraria em vw_presenca_slot_canonica_v1,
-- contaminaria o score do professor e faria a Sol cobrar chamada de um recital.
--
-- ⚠️ BANDA NAO ENTRA NA GRADE (confirmado pelo Arthur). O dominio banda_* (banda_evento,
-- com shows e ensaios) e outra coisa e fica intocado.
--
-- ACESSO: enquanto em teste, o modulo e visivel so para hugo@gmail.com por um gate de
-- e-mail no frontend — codigo descartavel. As permissoes RBAC ja nascem aqui (secao 6)
-- para que a virada para producao seja trocar o corpo de UMA funcao no front e marcar a
-- permissao na tela de Permissoes, sem migration e sem deploy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) TABELAS
-- -----------------------------------------------------------------------------

create table if not exists public.evento (
  id bigserial primary key,
  unidade_id uuid not null references public.unidades(id),
  tipo text not null default 'recital' check (tipo in ('recital')),
  titulo text not null,
  data_evento date not null,
  horario_inicio time not null default '09:00',
  local text,
  status text not null default 'rascunho'
    check (status in ('rascunho','publicado','realizado','cancelado')),
  -- Usada quando a apresentacao ainda nao tem duracao real informada pelo professor.
  -- O prototipo do Arthur usava 5 min fixos para todas; a ata pede a media real das
  -- musicas + margem, entao a duracao real manda e este valor e so o piso.
  duracao_padrao_segundos integer not null default 300 check (duracao_padrao_segundos > 0),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evento_participacao (
  id bigserial primary key,
  evento_id bigint not null references public.evento(id) on delete cascade,
  -- Derivados por trigger a partir de evento_id/aluno_id. Nunca escrever a mao.
  unidade_id uuid,
  pessoa_chave text,
  aluno_id integer not null references public.alunos(id) on delete cascade,
  status text not null default 'indefinido'
    check (status in ('participa','indefinido','nao')),
  -- Fase 6 (check-in mobile e certificado). Ficam aqui, por PESSOA, e nao na
  -- apresentacao: quem toca em 2 cursos faz UM check-in. Quantos certificados um aluno
  -- de 2 cursos recebe e decisao ainda em aberto — manter na pessoa deixa as duas
  -- escolhas possiveis sem migration de estrutura.
  checkin_em timestamptz,
  certificado_status text check (certificado_status is null
    or certificado_status in ('pendente','gerado','entregue')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evento_participacao_pessoa_unica unique (evento_id, pessoa_chave)
);

create table if not exists public.evento_bloco (
  id bigserial primary key,
  evento_id bigint not null references public.evento(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  horario_inicial time,
  -- Quando false, o inicio do bloco e calculado em cascata a partir do anterior.
  inicio_manual boolean not null default false,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evento_apresentacao (
  id bigserial primary key,
  bloco_id bigint not null references public.evento_bloco(id) on delete cascade,
  -- Derivados por trigger. evento_id e denormalizado do bloco porque a UNIQUE que
  -- implementa a regra de negocio precisa dele: a duplicata a impedir e no EVENTO
  -- inteiro, nao dentro de um bloco (a mesma pessoa no mesmo curso em dois blocos
  -- diferentes tambem e duplicata).
  evento_id bigint,
  unidade_id uuid,
  pessoa_chave text,
  aluno_id integer not null references public.alunos(id) on delete cascade,
  curso_id integer not null references public.cursos(id),
  professor_id integer references public.professores(id),
  ordem integer not null default 0,
  musica text,
  duracao_segundos integer check (duracao_segundos is null or duracao_segundos > 0),
  tem_playback boolean not null default false,
  observacao_mapa text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evento_apresentacao_pessoa_curso_unica
    unique (evento_id, pessoa_chave, curso_id)
);

create table if not exists public.evento_apresentacao_item (
  id bigserial primary key,
  apresentacao_id bigint not null
    references public.evento_apresentacao(id) on delete cascade,
  tipo text not null check (tipo in ('instrumento','equipamento')),
  nome text not null,
  quantidade integer not null default 1 check (quantidade > 0),
  observacao text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2) DERIVACAO DE PESSOA E ESCOPO (triggers)
--    Mesma forma de trg_anamnese_pessoa_chave (LAPE-19): a chave da pessoa nunca e
--    escrita a mao, e derivada da matricula de procedencia.
-- -----------------------------------------------------------------------------

create or replace function public.fn_evento_participacao_deriva()
returns trigger
language plpgsql
as $function$
begin
  new.pessoa_chave := public.fn_pessoa_chave_aluno(new.aluno_id);
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  -- Sem chave de pessoa a UNIQUE nao protege nada e a linha entraria orfa de identidade.
  if new.pessoa_chave is null then
    raise exception 'evento_participacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_evento_participacao_deriva on public.evento_participacao;
create trigger trg_evento_participacao_deriva
  before insert or update of aluno_id, evento_id on public.evento_participacao
  for each row execute function public.fn_evento_participacao_deriva();

create or replace function public.fn_evento_apresentacao_deriva()
returns trigger
language plpgsql
as $function$
begin
  new.pessoa_chave := public.fn_pessoa_chave_aluno(new.aluno_id);
  select b.evento_id, e.unidade_id
    into new.evento_id, new.unidade_id
    from public.evento_bloco b
    join public.evento e on e.id = b.evento_id
   where b.id = new.bloco_id;
  if new.pessoa_chave is null then
    raise exception 'evento_apresentacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  if new.evento_id is null then
    raise exception 'evento_apresentacao: bloco % nao existe', new.bloco_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_evento_apresentacao_deriva on public.evento_apresentacao;
create trigger trg_evento_apresentacao_deriva
  before insert or update of aluno_id, bloco_id on public.evento_apresentacao
  for each row execute function public.fn_evento_apresentacao_deriva();

-- updated_at: uma funcao para as 4 tabelas que a tem (as colunas tem o mesmo nome).
create or replace function public.fn_evento_touch()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists trg_evento_touch on public.evento;
create trigger trg_evento_touch before update on public.evento
  for each row execute function public.fn_evento_touch();

drop trigger if exists trg_evento_participacao_touch on public.evento_participacao;
create trigger trg_evento_participacao_touch before update on public.evento_participacao
  for each row execute function public.fn_evento_touch();

drop trigger if exists trg_evento_bloco_touch on public.evento_bloco;
create trigger trg_evento_bloco_touch before update on public.evento_bloco
  for each row execute function public.fn_evento_touch();

drop trigger if exists trg_evento_apresentacao_touch on public.evento_apresentacao;
create trigger trg_evento_apresentacao_touch before update on public.evento_apresentacao
  for each row execute function public.fn_evento_touch();

-- -----------------------------------------------------------------------------
-- 3) INDICES
-- -----------------------------------------------------------------------------
create index if not exists idx_evento_unidade_data
  on public.evento (unidade_id, data_evento desc);

create index if not exists idx_evento_participacao_evento
  on public.evento_participacao (evento_id, status);
create index if not exists idx_evento_participacao_pessoa
  on public.evento_participacao (unidade_id, pessoa_chave)
  where pessoa_chave is not null;
create index if not exists idx_evento_participacao_aluno
  on public.evento_participacao (aluno_id);

create index if not exists idx_evento_bloco_evento
  on public.evento_bloco (evento_id, ordem);

create index if not exists idx_evento_apresentacao_bloco
  on public.evento_apresentacao (bloco_id, ordem);
create index if not exists idx_evento_apresentacao_evento
  on public.evento_apresentacao (evento_id);
create index if not exists idx_evento_apresentacao_pessoa
  on public.evento_apresentacao (unidade_id, pessoa_chave)
  where pessoa_chave is not null;

create index if not exists idx_evento_apresentacao_item_apresentacao
  on public.evento_apresentacao_item (apresentacao_id, tipo);

-- -----------------------------------------------------------------------------
-- 4) RLS
--    ⚠️ ALTER DEFAULT PRIVILEGES deste schema da `authenticated=arwdDxtm` a toda relacao
--    nova: `grant` depois NAO tira o resto, por isso o `revoke all` nominal vem antes.
--    ⚠️ RLS sem GRANT e letra morta (RLS so restringe quem ja tem privilegio), e GRANT
--    sem policy le zero linhas em silencio — os dois sao necessarios.
--    O ramo is_admin() vem PRIMEIRO: os admins tem vinculo global (unidade_id NULL) e
--    get_user_unidade_ids() devolve vazio para eles. As chamadas vao dentro de
--    `(select ...)` para virarem InitPlan (avaliado uma vez, nao por linha).
-- -----------------------------------------------------------------------------

alter table public.evento                   enable row level security;
alter table public.evento_participacao      enable row level security;
alter table public.evento_bloco             enable row level security;
alter table public.evento_apresentacao      enable row level security;
alter table public.evento_apresentacao_item enable row level security;

revoke all on table public.evento                   from public, anon, authenticated;
revoke all on table public.evento_participacao      from public, anon, authenticated;
revoke all on table public.evento_bloco             from public, anon, authenticated;
revoke all on table public.evento_apresentacao      from public, anon, authenticated;
revoke all on table public.evento_apresentacao_item from public, anon, authenticated;

grant select, insert, update, delete on table public.evento                   to authenticated;
grant select, insert, update, delete on table public.evento_participacao      to authenticated;
grant select, insert, update, delete on table public.evento_bloco             to authenticated;
grant select, insert, update, delete on table public.evento_apresentacao      to authenticated;
grant select, insert, update, delete on table public.evento_apresentacao_item to authenticated;

grant all on table public.evento                   to service_role;
grant all on table public.evento_participacao      to service_role;
grant all on table public.evento_bloco             to service_role;
grant all on table public.evento_apresentacao      to service_role;
grant all on table public.evento_apresentacao_item to service_role;

-- Sequences: o mesmo ALTER DEFAULT PRIVILEGES as entrega a anon.
revoke all on sequence public.evento_id_seq                   from public, anon;
revoke all on sequence public.evento_participacao_id_seq      from public, anon;
revoke all on sequence public.evento_bloco_id_seq             from public, anon;
revoke all on sequence public.evento_apresentacao_id_seq      from public, anon;
revoke all on sequence public.evento_apresentacao_item_id_seq from public, anon;
grant usage, select on sequence public.evento_id_seq                   to authenticated, service_role;
grant usage, select on sequence public.evento_participacao_id_seq      to authenticated, service_role;
grant usage, select on sequence public.evento_bloco_id_seq             to authenticated, service_role;
grant usage, select on sequence public.evento_apresentacao_id_seq      to authenticated, service_role;
grant usage, select on sequence public.evento_apresentacao_item_id_seq to authenticated, service_role;

drop policy if exists evento_escopada on public.evento;
create policy evento_escopada on public.evento
  for all to authenticated
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()))
  with check ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

drop policy if exists evento_participacao_escopada on public.evento_participacao;
create policy evento_participacao_escopada on public.evento_participacao
  for all to authenticated
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()))
  -- unidade_id so existe DEPOIS do trigger BEFORE INSERT, que roda antes do WITH CHECK;
  -- por isso da para checar a coluna derivada aqui.
  with check ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

drop policy if exists evento_apresentacao_escopada on public.evento_apresentacao;
create policy evento_apresentacao_escopada on public.evento_apresentacao
  for all to authenticated
  using ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()))
  with check ((select public.is_admin()) or unidade_id in (select public.get_user_unidade_ids()));

-- Bloco e item nao tem unidade_id proprio: o escopo vem do pai. Denormalizar aqui
-- exigiria manter mais uma copia consistente para ganhar pouco — o exists resolve por
-- PK, que e barato.
drop policy if exists evento_bloco_escopada on public.evento_bloco;
create policy evento_bloco_escopada on public.evento_bloco
  for all to authenticated
  using (exists (select 1 from public.evento e where e.id = evento_bloco.evento_id))
  with check (exists (select 1 from public.evento e where e.id = evento_bloco.evento_id));

drop policy if exists evento_apresentacao_item_escopada on public.evento_apresentacao_item;
create policy evento_apresentacao_item_escopada on public.evento_apresentacao_item
  for all to authenticated
  using (exists (select 1 from public.evento_apresentacao a
                  where a.id = evento_apresentacao_item.apresentacao_id))
  with check (exists (select 1 from public.evento_apresentacao a
                  where a.id = evento_apresentacao_item.apresentacao_id));

-- -----------------------------------------------------------------------------
-- 5) COMENTARIOS
-- -----------------------------------------------------------------------------
comment on table public.evento is
  'Recital de UMA unidade, com data propria. Modulo estanque: nao alimenta frequencia, '
  'KPI, carteira nem score do professor. NAO confundir com banda_evento (shows/ensaios '
  'de banda) nem com eventos_operacionais (log de sistema).';
comment on column public.evento.duracao_padrao_segundos is
  'Piso usado quando a apresentacao ainda nao tem duracao real do professor.';

comment on table public.evento_participacao is
  'Quem entra no evento, por PESSOA (nao por matricula). Check-in e certificado moram '
  'aqui: quem toca em 2 cursos faz UM check-in.';
comment on column public.evento_participacao.aluno_id is
  'Matricula de PROCEDENCIA. Nao e o dono do dado: a participacao pertence a pessoa, '
  'identificada por (unidade_id, pessoa_chave).';
comment on column public.evento_participacao.pessoa_chave is
  'Derivada por trg_evento_participacao_deriva. Nunca escrever a mao.';

comment on table public.evento_bloco is
  'Bloco de apresentacoes. Na pratica dura de 1h a 1h30 (ata de 17/09/2026).';
comment on column public.evento_bloco.inicio_manual is
  'false = horario calculado em cascata a partir do bloco anterior.';

comment on table public.evento_apresentacao is
  'Uma apresentacao por (pessoa, curso). A UNIQUE evento_apresentacao_pessoa_curso_unica '
  'e quem garante que 2 matriculas do MESMO curso viram 1 apresentacao e 2 cursos '
  'DIFERENTES viram 2 — sem nenhum `if` no codigo.';
comment on column public.evento_apresentacao.evento_id is
  'Denormalizado do bloco por trigger. Existe para a UNIQUE alcancar o evento inteiro: '
  'a mesma pessoa no mesmo curso em DOIS blocos tambem e duplicata.';
comment on column public.evento_apresentacao.duracao_segundos is
  'Duracao real informada pelo professor. NULL cai em evento.duracao_padrao_segundos.';

comment on table public.evento_apresentacao_item is
  'Instrumentos e equipamentos que a apresentacao precisa no palco.';

-- -----------------------------------------------------------------------------
-- 6) PERMISSOES RBAC
--    Ja nascem aqui para que liberar o modulo depois seja marcar a permissao na tela de
--    Permissoes — sem migration e sem deploy. Enquanto isso o gate no frontend e por
--    e-mail (codigo descartavel, um unico ponto de corte).
-- -----------------------------------------------------------------------------
insert into public.permissoes (codigo, modulo, acao, descricao, categoria, ordem, ativo)
values
  ('eventos.ver',    'eventos', 'ver',    'Ver o modulo de Eventos e a programacao dos recitais', 'OPERACIONAL', 1, true),
  ('eventos.editar', 'eventos', 'editar', 'Criar evento, marcar participacao e montar a grade',  'OPERACIONAL', 2, true)
on conflict (codigo) do nothing;
