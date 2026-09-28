-- Recital: aluno de OUTRA unidade pode se apresentar no evento (pedido do Arthur, 28/09/2026).
--
-- Raro, mas acontece: aluno do Recreio tocando no recital da Barra e vice-versa. O evento
-- era fechado na unidade em três camadas:
--   1. a lista de candidatos (`vw_evento_aluno_elegivel_v1`) é filtrada pela unidade do evento;
--   2. a RLS de `alunos` esconde a matrícula de outra unidade — então
--      `evento_apresentacao_adicionar_v1` (INVOKER) não achava o aluno e a grade/check-in
--      mostrariam "(aluno removido)" no lugar do nome;
--   3. `pessoa_chave` é `emusys:<id>`, e o id do Emusys COLIDE entre unidades (51 ids de
--      alunos ativos aparecem em 2+ unidades, com pessoas diferentes). Com a UNIQUE
--      (evento_id, pessoa_chave), o visitante poderia se fundir com um aluno da casa.
--
-- O que muda:
--   * `fn_evento_pessoa_chave(aluno, evento)`: a chave de sempre para aluno da casa; para
--     visitante, `ext:<unidade do aluno>|<chave>` — sem colisão possível. Linhas existentes
--     não mudam (todas são da casa; conferido abaixo).
--   * Os dois gatilhos de derivação, `juntar`, `sincronizar` e `relatorios` passam a usar a
--     função nova. Para aluno da casa o resultado é IDÊNTICO ao anterior.
--   * `evento_apresentacao_adicionar_v1` vira SECURITY DEFINER com guarda explícita
--     (antes a RLS fazia o papel): evento no escopo do usuário E aluno da casa OU visitante
--     já registrado na participação.
--   * Duas RPCs novas, as duas SECURITY DEFINER com `fn_evento_pode_ver`:
--       `evento_buscar_aluno_outra_unidade_v1` — busca por nome, só matrícula ativa,
--       só o mínimo (nome, unidade, cursos);
--       `evento_visitantes_v1` — os visitantes do evento no MESMO formato da view de
--       elegíveis, mais os nomes de todas as matrículas que a grade referencia.
--
-- ⚠️ O cartão do professor no LA Teacher (`relatorio_anual.evento_id`) é escolhido do lado
-- do LA Teacher; se o relatório do visitante apontar para o evento da unidade de origem, ele
-- não casa aqui e o ADM preenche a música na grade. Não tratado nesta migration.
--
-- Custo: nenhuma rotina de fundo nova; as RPCs rodam sob demanda na tela do evento.

-- ───────────────────────── identidade no evento ─────────────────────────

create or replace function public.fn_evento_pessoa_chave(p_aluno_id integer, p_evento_id bigint)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
           when a.unidade_id = e.unidade_id then pc.pessoa_chave
           else 'ext:' || a.unidade_id::text || '|' || pc.pessoa_chave
         end
    from public.alunos a
    join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
    join public.evento e on e.id = p_evento_id
   where a.id = p_aluno_id;
$$;

comment on function public.fn_evento_pessoa_chave(integer, bigint) is
  'Identidade da pessoa DENTRO de um evento. Aluno da unidade do evento: a pessoa_chave de sempre. '
  'Aluno de outra unidade: ext:<unidade>|<chave>, porque emusys_student_id colide entre unidades.';

revoke all on function public.fn_evento_pessoa_chave(integer, bigint) from public, anon;
grant execute on function public.fn_evento_pessoa_chave(integer, bigint) to authenticated, service_role;

create or replace function public.fn_evento_participacao_deriva()
returns trigger
language plpgsql
as $function$
begin
  select e.unidade_id into new.unidade_id from public.evento e where e.id = new.evento_id;
  new.pessoa_chave := public.fn_evento_pessoa_chave(new.aluno_id, new.evento_id);
  -- Sem chave de pessoa a UNIQUE nao protege nada e a linha entraria orfa de identidade.
  if new.pessoa_chave is null then
    raise exception 'evento_participacao: nao resolvi a pessoa da matricula % (aluno inexistente?)', new.aluno_id;
  end if;
  return new;
end;
$function$;

create or replace function public.fn_evento_apresentacao_deriva()
returns trigger
language plpgsql
as $function$
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
$function$;

-- ───────────────────────── adicionar à grade ─────────────────────────

create or replace function public.evento_apresentacao_adicionar_v1(p_bloco_id bigint, p_aluno_id integer, p_curso_id integer)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id              bigint;
  v_evento          bigint;
  v_evento_unidade  uuid;
  v_pessoa          text;
  v_unidade         uuid;
  v_aluno           integer;
  v_professor       integer;
  v_nome            text;
  v_curso           text;
begin
  select b.evento_id, e.unidade_id into v_evento, v_evento_unidade
    from public.evento_bloco b
    join public.evento e on e.id = b.evento_id
   where b.id = p_bloco_id;

  -- SECURITY DEFINER: a RLS nao filtra mais aqui, entao o escopo e conferido na mao.
  if v_evento is null or not public.fn_evento_pode_ver(v_evento) then
    raise exception 'Bloco % fora do seu escopo.', p_bloco_id using errcode = '42501';
  end if;

  select pc.pessoa_chave, a.unidade_id, a.nome
    into v_pessoa, v_unidade, v_nome
    from public.alunos a
    join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
   where a.id = p_aluno_id;

  if v_pessoa is null then
    raise exception 'evento_apresentacao_adicionar_v1: matricula % nao existe', p_aluno_id
      using errcode = 'P0001';
  end if;

  -- Aluno de outra unidade so entra na grade depois de registrado como participante do
  -- evento (o botao "Aluno de outra unidade" na aba Alunos). Sem isto, o definer abriria a
  -- grade para qualquer matricula da rede.
  if v_unidade <> v_evento_unidade and not exists (
       select 1 from public.evento_participacao ep
        where ep.evento_id = v_evento
          and ep.pessoa_chave = public.fn_evento_pessoa_chave(p_aluno_id, v_evento)
     ) then
    raise exception '% é de outra unidade e ainda não foi adicionado a este evento.', coalesce(v_nome, 'Esta pessoa')
      using errcode = 'P0001',
            hint = 'Adicione pela aba Alunos, em "Aluno de outra unidade".';
  end if;

  select c.nome into v_curso from public.cursos c where c.id = p_curso_id;

  -- A matricula DAQUELE curso, da MESMA pessoa. `unidade_id` entra no filtro porque
  -- `emusys_student_id` colide entre unidades (91 ids com nomes diferentes) — pessoa e o
  -- PAR (unidade, chave), nunca a chave sozinha.
  select a.id, a.professor_atual_id
    into v_aluno, v_professor
    from public.alunos a
    join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
   where pc.pessoa_chave = v_pessoa
     and a.unidade_id    = v_unidade
     and a.curso_id      = p_curso_id
     and a.status        = 'ativo'
   order by a.id desc
   limit 1;

  if v_aluno is null then
    -- Recusa em vez de gravar procedencia errada. Sem isto, escolher um curso que a pessoa
    -- nao faz criaria uma apresentacao ancorada na matricula errada, com o professor errado.
    raise exception '% não tem matrícula ativa de %.',
      coalesce(v_nome, 'Esta pessoa'), coalesce(v_curso, 'deste curso')
      using errcode = 'P0001',
            hint = 'A apresentação é sempre de um curso que a pessoa cursa hoje.';
  end if;

  insert into public.evento_apresentacao (bloco_id, aluno_id, curso_id, professor_id, ordem)
  select p_bloco_id, v_aluno, p_curso_id, v_professor, coalesce(max(ap.ordem), 0) + 1
    from public.evento_apresentacao ap
   where ap.bloco_id = p_bloco_id
  returning id into v_id;

  return v_id;

exception
  when unique_violation then
    raise exception '% já tem uma apresentação de % neste evento.',
      coalesce(v_nome, 'Esta pessoa'), coalesce(v_curso, 'deste curso')
      using
        errcode = 'P0001',
        hint = 'Duas matrículas do mesmo curso geram uma apresentação só. '
               'Cursos diferentes, sim, geram duas.';
end;
$function$;

-- ─────────── juntar / sincronizar / relatorios: troca cirurgica com guarda ───────────

do $$
declare
  v_def text;
  v_novo text;
  v_n int;
begin
  -- juntar: a pessoa passa a ser resolvida DENTRO do evento
  v_def := pg_get_functiondef('public.evento_apresentacao_juntar_v1(bigint,integer,integer)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def,
    E'  select pc.pessoa_chave into v_pessoa\n    from public.vw_aluno_pessoa_chave pc\n   where pc.aluno_id = p_aluno_id;', ''))) /
    length(E'  select pc.pessoa_chave into v_pessoa\n    from public.vw_aluno_pessoa_chave pc\n   where pc.aluno_id = p_aluno_id;');
  if v_n <> 1 then
    raise exception 'juntar: ancora esperava 1 ocorrencia, achou %', v_n;
  end if;
  v_novo := replace(v_def,
    E'  select pc.pessoa_chave into v_pessoa\n    from public.vw_aluno_pessoa_chave pc\n   where pc.aluno_id = p_aluno_id;',
    E'  v_pessoa := public.fn_evento_pessoa_chave(p_aluno_id, v_alvo_evento);');
  execute v_novo;

  -- sincronizar
  v_def := pg_get_functiondef('public.evento_recital_sincronizar_v1(bigint)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, 'v_pessoa := public.fn_pessoa_chave_aluno(v.aluno_id);', ''))) /
         length('v_pessoa := public.fn_pessoa_chave_aluno(v.aluno_id);');
  if v_n <> 1 then
    raise exception 'sincronizar: ancora esperava 1 ocorrencia, achou %', v_n;
  end if;
  execute replace(v_def, 'v_pessoa := public.fn_pessoa_chave_aluno(v.aluno_id);',
                         'v_pessoa := public.fn_evento_pessoa_chave(v.aluno_id, p_evento_id);');

  -- relatorios: as DUAS ocorrencias (coluna devolvida + casamento com a grade)
  v_def := pg_get_functiondef('public.evento_relatorios_v1(bigint)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, 'public.fn_pessoa_chave_aluno(v.aluno_id)', ''))) /
         length('public.fn_pessoa_chave_aluno(v.aluno_id)');
  if v_n <> 2 then
    raise exception 'relatorios: ancora esperava 2 ocorrencias, achou %', v_n;
  end if;
  execute replace(v_def, 'public.fn_pessoa_chave_aluno(v.aluno_id)',
                         'public.fn_evento_pessoa_chave(v.aluno_id, p_evento_id)');
end;
$$;

-- ───────────────────────── RPCs novas ─────────────────────────

create or replace function public.evento_buscar_aluno_outra_unidade_v1(p_evento_id bigint, p_termo text)
returns table (
  aluno_id_referencia integer,
  nome text,
  unidade_id uuid,
  unidade_nome text,
  idade_anos integer,
  cursos jsonb,
  ja_no_evento boolean
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_unidade uuid;
  v_termo   text := public.unaccent(lower(btrim(coalesce(p_termo, ''))));
begin
  if not public.fn_evento_pode_ver(p_evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;
  -- 3 letras no minimo: sem isso a busca vira listagem da base das outras unidades.
  if length(v_termo) < 3 then
    return;
  end if;

  select e.unidade_id into v_unidade from public.evento e where e.id = p_evento_id;

  return query
  select el.aluno_id_referencia::integer,
         el.nome::text,
         el.unidade_id,
         u.nome::text,
         el.idade_anos::integer,
         el.cursos,
         exists (
           select 1 from public.evento_participacao ep
            where ep.evento_id = p_evento_id
              and ep.pessoa_chave = public.fn_evento_pessoa_chave(el.aluno_id_referencia, p_evento_id)
         )
    from public.vw_evento_aluno_elegivel_v1 el
    join public.unidades u on u.id = el.unidade_id
   where el.unidade_id <> v_unidade
     and el.cursos_no_recital > 0
     and public.unaccent(lower(el.nome)) like '%' || v_termo || '%'
   order by el.nome
   limit 20;
end;
$function$;

comment on function public.evento_buscar_aluno_outra_unidade_v1(bigint, text) is
  'Busca, por nome, aluno ativo de OUTRA unidade para se apresentar no evento. So o minimo '
  '(nome, unidade, idade, cursos). Minimo de 3 letras; ate 20 resultados.';

revoke all on function public.evento_buscar_aluno_outra_unidade_v1(bigint, text) from public, anon;
grant execute on function public.evento_buscar_aluno_outra_unidade_v1(bigint, text) to authenticated, service_role;

create or replace function public.evento_visitantes_v1(p_evento_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_unidade uuid;
  v_pessoas jsonb;
  v_nomes   jsonb;
begin
  if not public.fn_evento_pode_ver(p_evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;
  select e.unidade_id into v_unidade from public.evento e where e.id = p_evento_id;

  -- Mesmo formato da view de elegiveis, com a pessoa_chave DO EVENTO (a que casa com a
  -- participacao e a grade), e a unidade de origem para o selo na tela.
  select coalesce(jsonb_agg(
           to_jsonb(el) || jsonb_build_object(
             'pessoa_chave', ep.pessoa_chave,
             'unidade_origem_nome', u.nome)
           order by el.nome), '[]'::jsonb)
    into v_pessoas
    from public.evento_participacao ep
    join public.alunos a on a.id = ep.aluno_id
    join public.vw_evento_aluno_elegivel_v1 el
      on el.unidade_id = a.unidade_id
     and el.pessoa_chave = public.fn_pessoa_chave_aluno(a.id)
    join public.unidades u on u.id = a.unidade_id
   where ep.evento_id = p_evento_id
     and a.unidade_id <> v_unidade;

  -- Nome de TODA matricula de outra unidade que o evento referencia (participacao e grade):
  -- a grade e o check-in leem o nome pelo embed `alunos(nome)`, que a RLS esconde.
  select coalesce(jsonb_object_agg(a.id::text, jsonb_build_object(
           'nome', a.nome, 'data_nascimento', a.data_nascimento, 'unidade_nome', u.nome)), '{}'::jsonb)
    into v_nomes
    from public.alunos a
    join public.unidades u on u.id = a.unidade_id
   where a.unidade_id <> v_unidade
     and a.id in (
       select ep.aluno_id from public.evento_participacao ep where ep.evento_id = p_evento_id
       union
       select ap.aluno_id from public.evento_apresentacao ap where ap.evento_id = p_evento_id
     );

  return jsonb_build_object('pessoas', v_pessoas, 'nomes', v_nomes);
end;
$function$;

comment on function public.evento_visitantes_v1(bigint) is
  'Alunos de OUTRA unidade registrados no evento: pessoas (formato de vw_evento_aluno_elegivel_v1 '
  'com a pessoa_chave do evento) e nomes por aluno_id para a grade e o check-in.';

revoke all on function public.evento_visitantes_v1(bigint) from public, anon;
grant execute on function public.evento_visitantes_v1(bigint) to authenticated, service_role;

-- ───────────────────────── conferencias ─────────────────────────

do $$
declare v_n int;
begin
  -- Toda linha existente continua com a mesma chave (sao todas da casa).
  select count(*) into v_n from public.evento_participacao ep
   where ep.pessoa_chave is distinct from public.fn_evento_pessoa_chave(ep.aluno_id, ep.evento_id);
  if v_n <> 0 then raise exception 'participacao: % linhas mudariam de chave', v_n; end if;

  select count(*) into v_n from public.evento_apresentacao ap
   where ap.pessoa_chave is distinct from public.fn_evento_pessoa_chave(ap.aluno_id, ap.evento_id);
  if v_n <> 0 then raise exception 'apresentacao: % linhas mudariam de chave', v_n; end if;

  -- ACL: nada novo executavel por anon.
  select count(*) into v_n from pg_proc
   where proname in ('fn_evento_pessoa_chave','evento_buscar_aluno_outra_unidade_v1','evento_visitantes_v1',
                     'evento_apresentacao_adicionar_v1','evento_apresentacao_juntar_v1',
                     'evento_recital_sincronizar_v1','evento_relatorios_v1')
     and has_function_privilege('anon', oid, 'execute');
  if v_n <> 0 then raise exception 'ACL: % funcoes executaveis por anon', v_n; end if;
end;
$$;
