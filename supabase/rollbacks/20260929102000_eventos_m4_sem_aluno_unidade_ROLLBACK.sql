-- REVERSAO da migration 20260929102000_eventos_m4_sem_aluno_unidade.sql
-- Restaura o estado anterior: sem tipo/titulo/unidade_origem_id, NOT NULL de volta
-- em aluno_id/pessoa_chave/curso_id, e as funcoes de deriva com o prosrc original
-- de producao (capturado em 29/09/2026 antes de aplicar a M4).
--
-- ORDEM IMPORTA: primeiro as funcoes originais (a nova recusa linha sem tipo='aluno'
-- mas a antiga aceita tudo com aluno), depois derruba CHECK/colunas, e por ultimo o
-- NOT NULL — que FALHA de proposito se ainda existir numero sem aluno
-- (tipo<>'aluno' tem aluno_id null). Nesse caso, apague ou converta essas linhas
-- antes de rodar de novo.

-- 1) funcoes originais de producao (palavra por palavra)
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
  new.pessoa_chave := public.fn_evento_pessoa_chave(new.aluno_id, new.evento_id);
  if new.pessoa_chave is null then
    raise exception 'evento_apresentacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$$;

create or replace function public.fn_evento_participacao_deriva()
returns trigger language plpgsql
as $$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  new.pessoa_chave := public.fn_evento_pessoa_chave(new.aluno_id, new.evento_id);
  -- Sem chave de pessoa a UNIQUE nao protege nada e a linha entraria orfa de identidade.
  if new.pessoa_chave is null then
    raise exception 'evento_participacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$$;

-- 2) CHECK de coerencia sai antes de restaurar NOT NULL
alter table public.evento_apresentacao
  drop constraint if exists evento_apresentacao_aluno_coerente;

-- 3) NOT NULL de volta (falha se sobrar numero sem aluno — e o certo)
alter table public.evento_apresentacao
  alter column aluno_id     set not null,
  alter column pessoa_chave set not null,
  alter column curso_id     set not null;

-- 4) colunas novas fora
alter table public.evento_apresentacao
  drop column if exists unidade_origem_id,
  drop column if exists titulo,
  drop column if exists tipo;

alter table public.evento_participacao
  drop column if exists unidade_origem_id;
