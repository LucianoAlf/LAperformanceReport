alter table public.evento_apresentacao
  add column if not exists tipo text not null default 'aluno'
    check (tipo in ('aluno', 'abertura', 'encerramento', 'intervalo', 'professores', 'outro')),
  add column if not exists titulo text,
  add column if not exists unidade_origem_id uuid references public.unidades(id);

comment on column public.evento_apresentacao.tipo is
  'aluno = apresentacao de (pessoa, curso) — certificado e canal do LA Teacher. Os demais sao '
  'numeros do programa sem aluno (abertura, banda de professores, intervalo), com titulo livre.';
comment on column public.evento_apresentacao.unidade_origem_id is
  'Unidade ONDE o aluno estuda — so informativa, para a tela sinalizar "aluno de fora". '
  'A identidade ja e unica: pessoa_chave vem prefixada ext:<unidade>| pela '
  'fn_evento_pessoa_chave.';

-- solta NOT NULL so para quem nao e aluno; o CHECK amarra os dois lados
alter table public.evento_apresentacao
  alter column aluno_id     drop not null,
  alter column pessoa_chave drop not null,
  alter column curso_id     drop not null;

alter table public.evento_apresentacao
  add constraint evento_apresentacao_aluno_coerente check (
    (tipo = 'aluno'  and aluno_id is not null and pessoa_chave is not null and curso_id is not null)
    or
    (tipo <> 'aluno' and aluno_id is null and pessoa_chave is null and curso_id is null
                     and titulo is not null)
  );

-- deriva: MESMO prosrc de producao + duas linhas novas (guarda de tipo e selo de origem).
-- fn_evento_pessoa_chave ja devolve 'ext:<unidade>|...' para aluno de fora — a UNIQUE atual
-- continua correta e nao e tocada.
create or replace function public.fn_evento_apresentacao_deriva()
returns trigger language plpgsql
as $$
begin
  select b.evento_id, e.unidade_id
    into new.evento_id, new.unidade_id
    from public.evento_bloco b
    join public.evento e on e.id = b.evento_id
   where b.id = new.bloco_id;
  if new.evento_id is null then
    raise exception 'evento_apresentacao: bloco % nao existe', new.bloco_id;
  end if;

  -- numero sem aluno: evento_id/unidade_id (do bloco) seguem derivados — sem eles a linha
  -- fica fora da RLS por unidade — mas nao ha pessoa/curso/origem a resolver.
  if new.tipo is distinct from 'aluno' then
    return new;
  end if;

  new.pessoa_chave := public.fn_evento_pessoa_chave(new.aluno_id, new.evento_id);
  select a.unidade_id into new.unidade_origem_id
    from public.alunos a where a.id = new.aluno_id;
  if new.pessoa_chave is null then
    raise exception 'evento_apresentacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$$;

-- backfill do selo
update public.evento_apresentacao ap
   set unidade_origem_id = a.unidade_id
  from public.alunos a
 where a.id = ap.aluno_id
   and ap.unidade_origem_id is null;

-- mesmo selo na participacao (a aba Alunos tambem sinaliza "de fora")
alter table public.evento_participacao
  add column if not exists unidade_origem_id uuid references public.unidades(id);
update public.evento_participacao p
   set unidade_origem_id = a.unidade_id
  from public.alunos a
 where a.id = p.aluno_id
   and p.unidade_origem_id is null;

-- MESMO prosrc de producao + o selo de origem
create or replace function public.fn_evento_participacao_deriva()
returns trigger language plpgsql
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  new.pessoa_chave := public.fn_evento_pessoa_chave(new.aluno_id, new.evento_id);
  select a.unidade_id into new.unidade_origem_id
    from public.alunos a where a.id = new.aluno_id;
  if new.pessoa_chave is null then
    raise exception 'evento_participacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$$;
