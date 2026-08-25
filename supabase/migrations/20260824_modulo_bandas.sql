-- =============================================================================
-- MÓDULO DE BANDAS — LA Report (projeto ouqwbbermlzqqvtqwlul)
-- Migration consolidada FINAL (estado de produção) para versionar em supabase/migrations/.
-- 100% ADITIVO (prefixo banda_*). Nenhum objeto existente é alterado.
--
-- Dois tipos de banda:
--   • turma_chave NOT NULL  => banda de TURMA (automática do Emusys). Roster VIVO derivado
--     de alunos (cursos de banda em banda_curso_depara). Mínimo 3 integrantes ativos.
--   • turma_chave IS NULL   => banda AVULSA (cadastro manual). Roster manual via
--     banda_integrante. Editável; aparece de qualquer tamanho.
--
-- Regras de segurança/qualidade embutidas:
--   • RLS ligada SEM policy (fail-closed). Acesso só via RPC SECURITY DEFINER.
--   • Grants: sem PUBLIC/anon; só authenticated + service_role (bloco no fim).
--   • Roster de turma considera status canônico ('ativo'), não só is_ex_aluno.
--   • CHECKs de domínio: banda.status, banda_evento.tipo/status, banda_repertorio.status,
--     banda.modelo_financeiro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) TABELAS
-- -----------------------------------------------------------------------------
create table if not exists public.banda_curso_depara (
  curso_id integer primary key,
  nome_curso text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.banda_curso_depara is 'De-para curado de quais cursos contam como banda de turma. Emusys nao tem conceito de banda.';

create table if not exists public.banda (
  id bigserial primary key,
  unidade_id uuid not null,
  curso_id integer,
  turma_chave text unique,
  dia_semana text,
  horario time,
  produtor_professor_id integer,
  nome text not null,
  genero text,
  descricao text,
  logo_url text,
  status text not null default 'ativa' check (status in ('ativa','inativa')),
  precisa_revisar_nome boolean not null default false,
  origem_nome text,
  observacoes text,
  horario_fim time,
  frequencia text,
  sala_id integer,
  modelo_financeiro text check (modelo_financeiro is null or modelo_financeiro in ('percentual','fixo_ensaio','fixo_mensal')),
  valor_mensal_aluno numeric,
  valor_repasse numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.banda is 'Banda. turma_chave NOT NULL = turma automatica (roster vivo). turma_chave NULL = avulsa (roster manual via banda_integrante).';
comment on column public.banda.turma_chave is 'unidade_id|curso_id|dia_normalizado(sem -feira)|horario|professor_atual_id. NULL para banda avulsa.';

create table if not exists public.banda_integrante (
  id bigserial primary key,
  banda_id bigint not null references public.banda(id) on delete cascade,
  aluno_id integer not null,
  instrumento_na_banda text,
  funcao text,
  data_entrada date,
  data_saida date,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (banda_id, aluno_id)
);
comment on table public.banda_integrante is 'Turma: overlay (instrumento/funcao) sobre o roster vivo. Avulsa: E o proprio roster (fonte). aluno_id -> public.alunos.id (sem FK rigida).';

create table if not exists public.banda_repertorio (
  id bigserial primary key,
  banda_id bigint not null references public.banda(id) on delete cascade,
  titulo text not null,
  artista text,
  tom text,
  bpm integer,
  status text not null default 'ensaiando' check (status in ('ensaiando','pronta','tocada')),
  letra text,
  cifra text,
  cifraclub_url text,
  duracao_min integer,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banda_evento (
  id bigserial primary key,
  unidade_id uuid not null,
  tipo text not null check (tipo in ('ensaio','show')),
  titulo text not null,
  data_inicio timestamptz not null,
  data_fim timestamptz,
  local text,
  sala_id integer,
  orcamento numeric,
  status text not null default 'agendado' check (status in ('agendado','realizado','cancelado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.banda_evento is 'Eventos de banda. orcamento e planejamento, NAO e ledger financeiro.';

create table if not exists public.banda_evento_participante (
  id bigserial primary key,
  evento_id bigint not null references public.banda_evento(id) on delete cascade,
  banda_id bigint not null references public.banda(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (evento_id, banda_id)
);

-- -----------------------------------------------------------------------------
-- 2) ÍNDICES
-- -----------------------------------------------------------------------------
create index if not exists idx_banda_unidade_curso        on public.banda(unidade_id, curso_id);
create index if not exists idx_banda_integrante_banda      on public.banda_integrante(banda_id);
create index if not exists idx_banda_integrante_aluno      on public.banda_integrante(aluno_id);
create index if not exists idx_banda_repertorio_banda      on public.banda_repertorio(banda_id);
create index if not exists idx_banda_evento_unidade_data   on public.banda_evento(unidade_id, data_inicio);
create index if not exists idx_banda_evento_part_evento    on public.banda_evento_participante(evento_id);
create index if not exists idx_banda_evento_part_banda     on public.banda_evento_participante(banda_id);

-- -----------------------------------------------------------------------------
-- 3) RLS (ligada, sem policy — acesso só via RPC security definer)
-- -----------------------------------------------------------------------------
alter table public.banda_curso_depara        enable row level security;
alter table public.banda                      enable row level security;
alter table public.banda_integrante           enable row level security;
alter table public.banda_repertorio           enable row level security;
alter table public.banda_evento               enable row level security;
alter table public.banda_evento_participante  enable row level security;

-- -----------------------------------------------------------------------------
-- 4) FUNÇÕES / RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.banda_aluno_ativo(p_status text, p_ex boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(p_ex,false)=false and coalesce(p_status,'')='ativo'
$function$;

CREATE OR REPLACE FUNCTION public.banda_chave_turma(p_unidade uuid, p_curso integer, p_dia text, p_horario time without time zone, p_prof integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p_unidade::text||'|'||p_curso::text||'|'||replace(lower(coalesce(p_dia,'')),'-feira','')||'|'||coalesce(p_horario::text,'')||'|'||coalesce(p_prof::text,'')
$function$;

CREATE OR REPLACE FUNCTION public.banda_alunos_da_unidade(p_unidade_id uuid, p_busca text DEFAULT NULL::text)
 RETURNS TABLE(aluno_id integer, nome text, foto_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select x.aluno_id, x.nome, x.foto_url
  from (
    select distinct on (coalesce(nullif(al.emusys_student_id,''),'id:'||al.id::text))
           al.id as aluno_id, al.nome, coalesce(al.foto_url, al.photo_url) as foto_url
    from public.alunos al
    where al.unidade_id = p_unidade_id
      and al.status='ativo' and coalesce(al.is_ex_aluno,false)=false
      and (p_busca is null or al.nome ilike '%'||p_busca||'%')
    order by coalesce(nullif(al.emusys_student_id,''),'id:'||al.id::text), al.id
  ) x
  order by x.nome
  limit 50;
$function$;

CREATE OR REPLACE FUNCTION public.banda_professores_da_unidade(p_unidade_id uuid)
 RETURNS TABLE(professor_id integer, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct p.id, p.nome
  from public.professores_unidades pu
  join public.professores p on p.id=pu.professor_id
  where pu.unidade_id = p_unidade_id
  order by p.nome;
$function$;

CREATE OR REPLACE FUNCTION public.banda_criar(p_unidade_id uuid, p_nome text, p_produtor_professor_id integer DEFAULT NULL::integer, p_genero text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_dia_semana text DEFAULT NULL::text, p_horario time without time zone DEFAULT NULL::time without time zone, p_horario_fim time without time zone DEFAULT NULL::time without time zone, p_frequencia text DEFAULT NULL::text, p_sala_id integer DEFAULT NULL::integer, p_modelo_financeiro text DEFAULT NULL::text, p_valor_mensal_aluno numeric DEFAULT NULL::numeric, p_valor_repasse numeric DEFAULT NULL::numeric)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  insert into public.banda(unidade_id, turma_chave, nome, produtor_professor_id, genero, descricao,
                    dia_semana, horario, horario_fim, frequencia, sala_id,
                    modelo_financeiro, valor_mensal_aluno, valor_repasse,
                    status, precisa_revisar_nome, origem_nome)
  values (p_unidade_id, null, p_nome, p_produtor_professor_id, p_genero, p_descricao,
          p_dia_semana, p_horario, p_horario_fim, p_frequencia, p_sala_id,
          p_modelo_financeiro, p_valor_mensal_aluno, p_valor_repasse,
          'ativa', false, 'manual')
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_atualizar_avulsa(p_banda_id bigint, p_nome text DEFAULT NULL::text, p_produtor_professor_id integer DEFAULT NULL::integer, p_genero text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_dia_semana text DEFAULT NULL::text, p_horario time without time zone DEFAULT NULL::time without time zone, p_horario_fim time without time zone DEFAULT NULL::time without time zone, p_frequencia text DEFAULT NULL::text, p_sala_id integer DEFAULT NULL::integer, p_modelo_financeiro text DEFAULT NULL::text, p_valor_mensal_aluno numeric DEFAULT NULL::numeric, p_valor_repasse numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.banda set
    nome=coalesce(p_nome,nome),
    produtor_professor_id=coalesce(p_produtor_professor_id,produtor_professor_id),
    genero=coalesce(p_genero,genero),
    descricao=coalesce(p_descricao,descricao),
    dia_semana=coalesce(p_dia_semana,dia_semana),
    horario=coalesce(p_horario,horario),
    horario_fim=coalesce(p_horario_fim,horario_fim),
    frequencia=coalesce(p_frequencia,frequencia),
    sala_id=coalesce(p_sala_id,sala_id),
    modelo_financeiro=coalesce(p_modelo_financeiro,modelo_financeiro),
    valor_mensal_aluno=coalesce(p_valor_mensal_aluno,valor_mensal_aluno),
    valor_repasse=coalesce(p_valor_repasse,valor_repasse),
    updated_at=now()
  where id=p_banda_id and turma_chave is null;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_atualizar_identidade(p_banda_id bigint, p_nome text DEFAULT NULL::text, p_genero text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.banda set
    nome=coalesce(p_nome,nome),
    genero=coalesce(p_genero,genero),
    descricao=coalesce(p_descricao,descricao),
    logo_url=coalesce(p_logo_url,logo_url),
    precisa_revisar_nome=case when p_nome is not null then false else precisa_revisar_nome end,
    origem_nome=case when p_nome is not null then 'manual' else origem_nome end,
    updated_at=now()
  where id=p_banda_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_definir_status(p_banda_id bigint, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.banda set status=p_status, updated_at=now() where id=p_banda_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_remover(p_banda_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.banda where id=p_banda_id and turma_chave is null;
end $function$;

CREATE OR REPLACE FUNCTION public.bandas_listar(p_unidade_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(banda_id bigint, nome text, unidade_id uuid, unidade_nome text, curso_id integer, curso_nome text, dia_semana text, horario time without time zone, produtor_nome text, integrantes integer, precisa_revisar_nome boolean, status text, proximo_evento timestamp with time zone, tipo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with rost as (
    select public.banda_chave_turma(al.unidade_id, al.curso_id, al.dia_aula, al.horario_aula, al.professor_atual_id) as tc, count(*)::int as n
    from public.alunos al
    where public.banda_aluno_ativo(al.status, al.is_ex_aluno) and al.curso_id in (select curso_id from public.banda_curso_depara where ativo)
    group by 1
  )
  select b.id, b.nome, b.unidade_id, u.nome, b.curso_id, c.nome, b.dia_semana, b.horario, p.nome,
         case when b.turma_chave is null
              then (select count(*)::int from public.banda_integrante i where i.banda_id=b.id and i.ativo)
              else coalesce(r.n,0) end,
         b.precisa_revisar_nome, b.status,
         (select min(e.data_inicio) from public.banda_evento e join public.banda_evento_participante ep on ep.evento_id=e.id where ep.banda_id=b.id and e.data_inicio>=now()),
         case when b.turma_chave is null then 'avulsa' else 'turma' end
  from public.banda b
  left join public.unidades u on u.id=b.unidade_id
  left join public.cursos c on c.id=b.curso_id
  left join public.professores p on p.id=b.produtor_professor_id
  left join rost r on r.tc=b.turma_chave
  where (p_unidade_id is null or b.unidade_id=p_unidade_id)
    and (p_status is null or b.status=p_status)
    and (b.turma_chave is null or coalesce(r.n,0) >= 3)
  order by u.nome, b.dia_semana, b.horario;
$function$;

CREATE OR REPLACE FUNCTION public.banda_detalhe(p_banda_id bigint)
 RETURNS TABLE(banda_id bigint, nome text, unidade_id uuid, unidade_nome text, curso_id integer, curso_nome text, dia_semana text, horario time without time zone, horario_fim time without time zone, frequencia text, sala_id integer, sala_nome text, produtor_professor_id integer, produtor_nome text, genero text, descricao text, logo_url text, status text, precisa_revisar_nome boolean, tipo text, modelo_financeiro text, valor_mensal_aluno numeric, valor_repasse numeric, integrantes integer, musicas integer, proximos_eventos integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.id, b.nome, b.unidade_id, u.nome, b.curso_id, c.nome,
    b.dia_semana, b.horario, b.horario_fim, b.frequencia, b.sala_id, s.nome,
    b.produtor_professor_id, p.nome, b.genero, b.descricao, b.logo_url,
    b.status, b.precisa_revisar_nome,
    case when b.turma_chave is null then 'avulsa' else 'turma' end,
    b.modelo_financeiro, b.valor_mensal_aluno, b.valor_repasse,
    case when b.turma_chave is null
         then (select count(*)::int from public.banda_integrante i where i.banda_id=b.id and i.ativo)
         else (select count(*)::int from public.alunos al where public.banda_aluno_ativo(al.status, al.is_ex_aluno) and public.banda_chave_turma(al.unidade_id,al.curso_id,al.dia_aula,al.horario_aula,al.professor_atual_id)=b.turma_chave) end,
    (select count(*)::int from public.banda_repertorio r where r.banda_id=b.id),
    (select count(*)::int from public.banda_evento e join public.banda_evento_participante ep on ep.evento_id=e.id where ep.banda_id=b.id and e.data_inicio>=now())
  from public.banda b
  left join public.unidades u on u.id=b.unidade_id
  left join public.cursos c on c.id=b.curso_id
  left join public.salas s on s.id=b.sala_id
  left join public.professores p on p.id=b.produtor_professor_id
  where b.id=p_banda_id;
$function$;

-- Permanência CANÔNICA: tempo de ESCOLA da pessoa desde a 1ª matrícula
-- (MIN(data_matricula) por pessoa, mesma chave de dedup do módulo).
-- alunos.tempo_permanencia_meses é POR CONTRATO e zera na renovação — não usar em Bandas.
CREATE OR REPLACE FUNCTION public.banda_permanencia_meses(p_aluno_id integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select round((current_date - min(a2.data_matricula))::numeric / 30.44)::int
  from public.alunos a2
  where a2.data_matricula is not null
    and coalesce(nullif(a2.emusys_student_id,''),'id:'||a2.id::text) = (
      select coalesce(nullif(al.emusys_student_id,''),'id:'||al.id::text)
      from public.alunos al where al.id = p_aluno_id
    )
$function$;

CREATE OR REPLACE FUNCTION public.banda_integrantes(p_banda_id bigint)
 RETURNS TABLE(aluno_id integer, nome text, foto_url text, instrumento text, funcao text, status_aluno text, tempo_permanencia_meses integer, saiu_da_escola boolean, responsavel_nome text, responsavel_telefone text, whatsapp text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select al.id, al.nome, coalesce(al.foto_url, al.photo_url), i.instrumento_na_banda, i.funcao, al.status, public.banda_permanencia_meses(al.id),
         coalesce(al.is_ex_aluno,false), al.responsavel_nome, al.responsavel_telefone, al.whatsapp
  from public.banda b
  join public.alunos al on public.banda_aluno_ativo(al.status, al.is_ex_aluno)
       and public.banda_chave_turma(al.unidade_id, al.curso_id, al.dia_aula, al.horario_aula, al.professor_atual_id) = b.turma_chave
  left join public.banda_integrante i on i.banda_id=b.id and i.aluno_id=al.id
  where b.id=p_banda_id and b.turma_chave is not null
  union all
  select al.id, al.nome, coalesce(al.foto_url, al.photo_url), i.instrumento_na_banda, i.funcao, al.status, public.banda_permanencia_meses(al.id),
         coalesce(al.is_ex_aluno,false), al.responsavel_nome, al.responsavel_telefone, al.whatsapp
  from public.banda b
  join public.banda_integrante i on i.banda_id=b.id and i.ativo
  join public.alunos al on al.id=i.aluno_id
  where b.id=p_banda_id and b.turma_chave is null
  order by 2;
$function$;

CREATE OR REPLACE FUNCTION public.banda_integrante_upsert(p_banda_id bigint, p_aluno_id integer, p_instrumento text DEFAULT NULL::text, p_funcao text DEFAULT NULL::text, p_data_entrada date DEFAULT NULL::date, p_observacoes text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  insert into public.banda_integrante(banda_id,aluno_id,instrumento_na_banda,funcao,data_entrada,observacoes)
  values (p_banda_id,p_aluno_id,p_instrumento,p_funcao,p_data_entrada,p_observacoes)
  on conflict (banda_id,aluno_id) do update
    set instrumento_na_banda=excluded.instrumento_na_banda,
        funcao=excluded.funcao,
        data_entrada=coalesce(excluded.data_entrada, banda_integrante.data_entrada),
        observacoes=excluded.observacoes,
        ativo=true, updated_at=now()
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_integrante_desativar(p_banda_id bigint, p_aluno_id integer, p_data_saida date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.banda_integrante
     set ativo=false, data_saida=coalesce(p_data_saida, current_date), updated_at=now()
   where banda_id=p_banda_id and aluno_id=p_aluno_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_integrante_remover(p_banda_id bigint, p_aluno_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.banda_integrante where banda_id=p_banda_id and aluno_id=p_aluno_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_repertorio_listar(p_banda_id bigint)
 RETURNS TABLE(id bigint, titulo text, artista text, tom text, bpm integer, status text, cifraclub_url text, duracao_min integer, tem_cifra boolean, tem_letra boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.titulo, r.artista, r.tom, r.bpm, r.status, r.cifraclub_url, r.duracao_min,
         (r.cifra is not null), (r.letra is not null)
  from public.banda_repertorio r
  where r.banda_id=p_banda_id
  order by r.titulo;
$function$;

CREATE OR REPLACE FUNCTION public.banda_repertorio_adicionar(p_banda_id bigint, p_titulo text, p_artista text DEFAULT NULL::text, p_tom text DEFAULT NULL::text, p_bpm integer DEFAULT NULL::integer, p_status text DEFAULT 'ensaiando'::text, p_letra text DEFAULT NULL::text, p_cifra text DEFAULT NULL::text, p_cifraclub_url text DEFAULT NULL::text, p_duracao_min integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  insert into public.banda_repertorio(banda_id,titulo,artista,tom,bpm,status,letra,cifra,cifraclub_url,duracao_min)
  values (p_banda_id,p_titulo,p_artista,p_tom,p_bpm,coalesce(p_status,'ensaiando'),p_letra,p_cifra,p_cifraclub_url,p_duracao_min)
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_repertorio_atualizar(p_id bigint, p_titulo text DEFAULT NULL::text, p_artista text DEFAULT NULL::text, p_tom text DEFAULT NULL::text, p_bpm integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_duracao_min integer DEFAULT NULL::integer, p_cifraclub_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.banda_repertorio set
    titulo=coalesce(p_titulo,titulo),
    artista=coalesce(p_artista,artista),
    tom=coalesce(p_tom,tom),
    bpm=coalesce(p_bpm,bpm),
    status=coalesce(p_status,status),
    duracao_min=coalesce(p_duracao_min,duracao_min),
    cifraclub_url=coalesce(p_cifraclub_url,cifraclub_url),
    updated_at=now()
  where id=p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_repertorio_remover(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.banda_repertorio where id=p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_evento_criar(p_unidade_id uuid, p_tipo text, p_titulo text, p_data_inicio timestamp with time zone, p_data_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_local text DEFAULT NULL::text, p_sala_id integer DEFAULT NULL::integer, p_orcamento numeric DEFAULT NULL::numeric, p_observacoes text DEFAULT NULL::text, p_bandas bigint[] DEFAULT '{}'::bigint[])
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  insert into public.banda_evento(unidade_id,tipo,titulo,data_inicio,data_fim,local,sala_id,orcamento,observacoes)
  values (p_unidade_id,p_tipo,p_titulo,p_data_inicio,p_data_fim,p_local,p_sala_id,p_orcamento,p_observacoes)
  returning id into v_id;
  if p_bandas is not null and array_length(p_bandas,1) is not null then
    insert into public.banda_evento_participante(evento_id,banda_id)
    select v_id, b from unnest(p_bandas) b
    on conflict do nothing;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_eventos_listar(p_unidade_id uuid DEFAULT NULL::uuid, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(evento_id bigint, titulo text, tipo text, data_inicio timestamp with time zone, data_fim timestamp with time zone, local text, sala_nome text, orcamento numeric, status text, bandas text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.titulo, e.tipo, e.data_inicio, e.data_fim, e.local, s.nome, e.orcamento, e.status,
    (select string_agg(b.nome, ', ' order by b.nome) from public.banda_evento_participante ep join public.banda b on b.id=ep.banda_id where ep.evento_id=e.id)
  from public.banda_evento e
  left join public.salas s on s.id=e.sala_id
  where (p_unidade_id is null or e.unidade_id=p_unidade_id) and (p_desde is null or e.data_inicio>=p_desde)
  order by e.data_inicio;
$function$;

CREATE OR REPLACE FUNCTION public.banda_evento_participantes(p_evento_id bigint)
 RETURNS TABLE(banda_id bigint, nome text, unidade_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.id, b.nome, u.nome
  from public.banda_evento_participante ep
  join public.banda b on b.id=ep.banda_id
  left join public.unidades u on u.id=b.unidade_id
  where ep.evento_id=p_evento_id
  order by b.nome;
$function$;

CREATE OR REPLACE FUNCTION public.banda_evento_atualizar(p_evento_id bigint, p_titulo text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_data_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_data_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_local text DEFAULT NULL::text, p_sala_id integer DEFAULT NULL::integer, p_orcamento numeric DEFAULT NULL::numeric, p_status text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.banda_evento set
    titulo=coalesce(p_titulo,titulo),
    tipo=coalesce(p_tipo,tipo),
    data_inicio=coalesce(p_data_inicio,data_inicio),
    data_fim=coalesce(p_data_fim,data_fim),
    local=coalesce(p_local,local),
    sala_id=coalesce(p_sala_id,sala_id),
    orcamento=coalesce(p_orcamento,orcamento),
    status=coalesce(p_status,status),
    observacoes=coalesce(p_observacoes,observacoes),
    updated_at=now()
  where id=p_evento_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_evento_cancelar(p_evento_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.banda_evento set status='cancelado', updated_at=now() where id=p_evento_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_evento_remover(p_evento_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.banda_evento where id=p_evento_id;
end $function$;

CREATE OR REPLACE FUNCTION public.banda_evento_definir_bandas(p_evento_id bigint, p_bandas bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_bandas is null or array_length(p_bandas,1) is null then
    delete from public.banda_evento_participante where evento_id=p_evento_id;
  else
    delete from public.banda_evento_participante where evento_id=p_evento_id and banda_id <> all(p_bandas);
    insert into public.banda_evento_participante(evento_id,banda_id)
    select p_evento_id, b from unnest(p_bandas) b
    on conflict do nothing;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.bandas_kpis(p_unidade_id uuid DEFAULT NULL::uuid, p_min_integrantes integer DEFAULT 4)
 RETURNS TABLE(unidade_id uuid, unidade_nome text, total_bandas integer, alunos_em_banda integer, permanencia_media numeric, bandas_com_vaga integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with alu as (
    select al.unidade_id, coalesce(nullif(al.emusys_student_id,''),'id:'||al.id::text) as pessoa, public.banda_permanencia_meses(al.id) as perm,
           public.banda_chave_turma(al.unidade_id, al.curso_id, al.dia_aula, al.horario_aula, al.professor_atual_id) as tc
    from public.alunos al
    where public.banda_aluno_ativo(al.status, al.is_ex_aluno) and al.curso_id in (select curso_id from public.banda_curso_depara where ativo)
  ),
  band_cnt as (select tc, count(*)::int n from alu group by tc),
  reais as (select tc, n from band_cnt where n >= 3),
  bt as (select b.unidade_id, r.n from public.banda b join reais r on r.tc=b.turma_chave where b.status='ativa' and b.turma_chave is not null),
  ba as (select b.unidade_id, (select count(*)::int from public.banda_integrante i where i.banda_id=b.id and i.ativo) as n from public.banda b where b.status='ativa' and b.turma_chave is null),
  mt as (select a.unidade_id, a.pessoa, a.perm from alu a join reais r on r.tc=a.tc),
  ma as (select b.unidade_id, coalesce(nullif(al.emusys_student_id,''),'id:'||al.id::text) pessoa, public.banda_permanencia_meses(al.id) perm
         from public.banda b join public.banda_integrante i on i.banda_id=b.id and i.ativo join public.alunos al on al.id=i.aluno_id
         where b.status='ativa' and b.turma_chave is null),
  -- Uma linha por PESSOA por unidade: aluno em 2 bandas conta uma vez só na média
  membros as (select distinct unidade_id, pessoa, perm from (select unidade_id, pessoa, perm from mt union all select unidade_id, pessoa, perm from ma) m),
  agg_turma as (select unidade_id, count(*)::int total, count(*) filter (where n < p_min_integrantes)::int com_vaga from bt group by unidade_id),
  agg_avulsa as (select unidade_id, count(*)::int total from ba group by unidade_id),
  -- Sem teto de 99 meses: era heranca do campo por-contrato (sentinela). Com a
  -- permanencia canonica (MIN(data_matricula)), veteranos REAIS ficavam de fora
  -- (Miguel e Lopa, 1a matricula mai/2018 = piso historico do Emusys, ~12 anos
  -- de escola). Mantido: excluir null (sem data_matricula) e negativos (data
  -- futura = erro de dado). Calouros (0 meses) contam, fiel a regra do usuario:
  -- soma de todos os meses / quantidade de alunos distintos.
  agg_membros as (select unidade_id, count(*)::int alunos, round(avg(perm) filter (where perm is not null and perm>=0),1) perm_media from membros group by unidade_id)
  select u.id, u.nome,
         (coalesce(at.total,0)+coalesce(aa.total,0))::int,
         coalesce(am.alunos,0),
         am.perm_media,
         coalesce(at.com_vaga,0)
  from public.unidades u
  left join agg_turma at on at.unidade_id=u.id
  left join agg_avulsa aa on aa.unidade_id=u.id
  left join agg_membros am on am.unidade_id=u.id
  where (p_unidade_id is null or u.id=p_unidade_id)
  order by u.nome;
$function$;

CREATE OR REPLACE FUNCTION public.bandas_para_garimpar(p_unidade_id uuid DEFAULT NULL::uuid, p_min_integrantes integer DEFAULT 4)
 RETURNS TABLE(banda_id bigint, nome text, unidade_nome text, curso_nome text, produtor_nome text, integrantes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with alu as (
    select public.banda_chave_turma(al.unidade_id, al.curso_id, al.dia_aula, al.horario_aula, al.professor_atual_id) as tc, count(*)::int n
    from public.alunos al
    where public.banda_aluno_ativo(al.status, al.is_ex_aluno) and al.curso_id in (select curso_id from public.banda_curso_depara where ativo)
    group by 1
  )
  select b.id, b.nome, u.nome, c.nome, p.nome, coalesce(a.n,0)
  from public.banda b
  left join alu a on a.tc=b.turma_chave
  left join public.unidades u on u.id=b.unidade_id
  left join public.cursos c on c.id=b.curso_id
  left join public.professores p on p.id=b.produtor_professor_id
  where b.turma_chave is not null
    and b.status='ativa'
    and coalesce(a.n,0) >= 3
    and coalesce(a.n,0) < p_min_integrantes
    and (p_unidade_id is null or b.unidade_id=p_unidade_id)
  order by coalesce(a.n,0), u.nome;
$function$;

CREATE OR REPLACE FUNCTION public.banda_conciliacao_roster(p_unidade_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(banda_id bigint, banda_nome text, aluno_id integer, aluno_nome text, problema text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.id, b.nome, i.aluno_id, al.nome,
    case when al.id is null then 'aluno inexistente'
         when coalesce(al.is_ex_aluno,false) then 'saiu da escola'
         else 'nao esta mais nesta turma' end
  from public.banda_integrante i
  join public.banda b on b.id=i.banda_id
  left join public.alunos al on al.id=i.aluno_id
  where i.ativo
    and (p_unidade_id is null or b.unidade_id=p_unidade_id)
    and b.turma_chave is not null
    and (al.id is null or coalesce(al.is_ex_aluno,false)
         or public.banda_chave_turma(al.unidade_id,al.curso_id,al.dia_aula,al.horario_aula,al.professor_atual_id) <> b.turma_chave)
  order by b.nome;
$function$;

CREATE OR REPLACE FUNCTION public.banda_reconciliar_turmas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
  with base as (
    select x.unidade_id, x.curso_id, replace(lower(coalesce(x.dia_aula,'')),'-feira','') as dia_norm, x.horario_aula, x.professor_atual_id, c.nome as curso_nome
    from public.alunos x
    join public.banda_curso_depara d on d.curso_id=x.curso_id and d.ativo
    join public.cursos c on c.id=x.curso_id
    where public.banda_aluno_ativo(x.status, x.is_ex_aluno) and x.horario_aula is not null and x.professor_atual_id is not null
  ),
  counted as (
    select unidade_id, curso_id, dia_norm, horario_aula, professor_atual_id, curso_nome, count(*) as n
    from base
    group by unidade_id, curso_id, dia_norm, horario_aula, professor_atual_id, curso_nome
  ),
  ins as (
    insert into public.banda(unidade_id, curso_id, turma_chave, dia_semana, horario, produtor_professor_id, nome, precisa_revisar_nome, origem_nome)
    select unidade_id, curso_id,
       unidade_id::text||'|'||curso_id::text||'|'||dia_norm||'|'||coalesce(horario_aula::text,'')||'|'||coalesce(professor_atual_id::text,''),
       initcap(dia_norm), horario_aula, professor_atual_id,
       curso_nome||' · '||initcap(dia_norm)||' '||to_char(horario_aula,'HH24"h"'), true, 'default'
    from counted
    where n >= 3
    on conflict (turma_chave) do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $function$;

-- -----------------------------------------------------------------------------
-- 5) GRANTS: sem PUBLIC/anon; só authenticated + service_role
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname like 'banda%'
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 6) SEED (idempotente) — de-para dos 3 cursos de banda + popular bandas de turma
-- -----------------------------------------------------------------------------
insert into public.banda_curso_depara(curso_id, nome_curso) values
  (25,'Power Kids'),
  (33,'Minha Banda Para Sempre'),
  (38,'GarageBand')
on conflict (curso_id) do nothing;

select public.banda_reconciliar_turmas();
