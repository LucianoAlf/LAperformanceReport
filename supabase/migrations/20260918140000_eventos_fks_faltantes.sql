-- MODULO EVENTOS — FKs que faltaram na 20260918120000 (LAPE-39)
--
-- SINTOMA: a tela caiu com
--   "Could not find a relationship between 'evento' and 'evento_apresentacao' in the schema cache"
--
-- CAUSA: `evento_apresentacao.evento_id` e `unidade_id` sao preenchidos por trigger, e ao
-- escrever a tabela eu tratei "derivado" como se dispensasse integridade referencial —
-- declarei as colunas soltas, sem `references`. Duas consequencias:
--   1. o PostgREST nao enxerga o vinculo e recusa o embed (`evento_apresentacao(count)`);
--   2. pior que a tela: nada impedia uma apresentacao apontar para um evento inexistente.
-- Coluna derivada por trigger continua sendo chave estrangeira — o trigger decide o VALOR,
-- nao dispensa a RESTRICAO.
--
-- `evento_participacao.evento_id` ja tinha a FK e por isso o count dela funcionava; o
-- contraste entre as duas e o que tornou o defeito obvio.
--
-- NOT NULL junto: o trigger roda BEFORE INSERT e ja levanta excecao quando nao resolve a
-- pessoa ou o bloco, entao a coluna nunca deveria nascer nula. Sem o NOT NULL, um caminho
-- futuro que contorne o trigger gravaria linha sem escopo — e a policy, que le `unidade_id`,
-- passaria a esconder a linha de todo mundo em vez de acusar o erro.
-- Seguro agora: as tabelas estao vazias (0 linhas nas duas).

-- Guarda: se houver linha que viole o que vamos declarar, abortar com mensagem legivel em
-- vez de deixar o ALTER falhar com erro de constraint sem contexto.
do $$
declare
  v_orfas integer;
begin
  select count(*) into v_orfas
    from public.evento_apresentacao a
   where a.evento_id is null
      or a.unidade_id is null
      or not exists (select 1 from public.evento e where e.id = a.evento_id);
  if v_orfas > 0 then
    raise exception 'evento_apresentacao tem % linha(s) sem evento/unidade resolvidos — corrigir antes de declarar as FKs', v_orfas;
  end if;

  select count(*) into v_orfas
    from public.evento_participacao p
   where p.unidade_id is null
      or not exists (select 1 from public.unidades u where u.id = p.unidade_id);
  if v_orfas > 0 then
    raise exception 'evento_participacao tem % linha(s) sem unidade resolvida', v_orfas;
  end if;
end $$;

alter table public.evento_apresentacao
  alter column evento_id set not null,
  alter column unidade_id set not null,
  alter column pessoa_chave set not null;

alter table public.evento_participacao
  alter column unidade_id set not null,
  alter column pessoa_chave set not null;

alter table public.evento_apresentacao
  add constraint evento_apresentacao_evento_fk
    foreign key (evento_id) references public.evento(id) on delete cascade,
  add constraint evento_apresentacao_unidade_fk
    foreign key (unidade_id) references public.unidades(id);

alter table public.evento_participacao
  add constraint evento_participacao_unidade_fk
    foreign key (unidade_id) references public.unidades(id);

comment on constraint evento_apresentacao_evento_fk on public.evento_apresentacao is
  'O valor vem do trigger (derivado do bloco), mas a integridade e do banco. Tambem e o '
  'que faz o PostgREST enxergar evento -> evento_apresentacao para o count da lista.';
