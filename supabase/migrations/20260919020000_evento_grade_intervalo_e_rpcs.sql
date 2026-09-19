-- MODULO EVENTOS — fase 3: a grade (LAPE-39)
--
-- Tres coisas que a montagem de blocos precisa e que a fase 1 nao criou.
--
-- 1) O INTERVALO ENTRE BLOCOS. Lendo o prototipo do Arthur com o navegador em 18/09:
--    com o Bloco 1 comecando 09:00 e uma apresentacao de 5 min (09:00-09:05), o Bloco 2
--    nasce em 09:50 e a tela desenha um separador "INTERVALO — 45 MINUTOS". Ou seja
--    `inicio(N+1) = fim(N) + 45min`. Isso e configuracao do evento, igual a duracao
--    padrao — nao constante de codigo: recital de unidade pequena nao precisa de 45 min
--    de virada, e o dia em que alguem quiser mudar nao pode exigir deploy.
--
-- 2) `evento_apresentacao_adicionar_v1` — a UNIQUE (evento_id, pessoa_chave, curso_id) e a
--    regra do Hugo ("2 cursos = 2 apresentacoes; 2 matriculas do mesmo curso = 1"), mas o
--    erro cru dela chega na tela como `23505 duplicate key value violates constraint
--    evento_apresentacao_pessoa_curso_unica`. Quem monta a grade nao tem como saber que
--    isso significa "esta pessoa ja se apresenta neste curso". A RPC traduz.
--
-- 3) `evento_grade_reordenar_v1` — o drag-and-drop move varias linhas de uma vez, e
--    aplicar UPDATE a UPDATE deixaria a grade num estado intermediario visivel se a
--    conexao caisse no meio.
--
-- ⚠️ NAO existe UNIQUE em (bloco_id, ordem) nem (evento_id, ordem), e isso e deliberado:
--    constraint de unicidade sobre coluna de ordenacao obriga toda reordenacao a passar
--    por valores temporarios (negativos ou deferrable) para nao colidir no meio do lote.
--    A ordem aqui e preferencia de exibicao, nao identidade — empate e resolvido pelo
--    desempate por `id`, nunca por erro.

-- ─────────────────────────────── 1. intervalo ───────────────────────────────

alter table public.evento
  add column if not exists intervalo_entre_blocos_segundos integer not null default 2700;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.evento'::regclass and conname = 'evento_intervalo_positivo'
  ) then
    alter table public.evento
      add constraint evento_intervalo_positivo
      check (intervalo_entre_blocos_segundos >= 0);
  end if;
end $$;

comment on column public.evento.intervalo_entre_blocos_segundos is
  'Folga entre o fim de um bloco e o inicio do seguinte. 2700s = os 45 min do prototipo. '
  'Zero e valido (recital corrido); negativo nao.';

-- ──────────────────────── 2. adicionar apresentacao ────────────────────────

create or replace function public.evento_apresentacao_adicionar_v1(
  p_bloco_id bigint,
  p_aluno_id integer,
  p_curso_id integer
)
returns bigint
language plpgsql
-- SECURITY INVOKER (o default): as tres tabelas tem policy escopada por unidade e o
-- usuario ja e barrado por elas. `definer` aqui so criaria um caminho que ignora a RLS.
as $function$
declare
  v_id     bigint;
  v_nome   text;
  v_curso  text;
begin
  -- A ordem nasce no fim do bloco. `max` de conjunto vazio devolve NULL, entao o primeiro
  -- item do bloco recebe 1.
  insert into public.evento_apresentacao (bloco_id, aluno_id, curso_id, ordem)
  select p_bloco_id, p_aluno_id, p_curso_id, coalesce(max(ap.ordem), 0) + 1
    from public.evento_apresentacao ap
   where ap.bloco_id = p_bloco_id
  returning id into v_id;

  return v_id;

exception
  when unique_violation then
    -- Traduz a regra de negocio. Sem isto a tela mostra o nome da constraint, e quem esta
    -- montando a grade conclui que o sistema quebrou, nao que a regra o impediu.
    select a.nome, c.nome into v_nome, v_curso
      from public.alunos a
      left join public.cursos c on c.id = p_curso_id
     where a.id = p_aluno_id;
    raise exception '% já tem uma apresentação de % neste evento.',
      coalesce(v_nome, 'Esta pessoa'), coalesce(v_curso, 'deste curso')
      using
        errcode = 'P0001',
        hint = 'Duas matrículas do mesmo curso geram uma apresentação só. '
               'Cursos diferentes, sim, geram duas.';
end;
$function$;

-- Recriar funcao reconcede EXECUTE a `anon` pelo ALTER DEFAULT PRIVILEGES do schema:
-- o revoke nominal e obrigatorio, `from public` sozinho nao alcanca.
revoke execute on function public.evento_apresentacao_adicionar_v1(bigint, integer, integer)
  from public, anon;
grant execute on function public.evento_apresentacao_adicionar_v1(bigint, integer, integer)
  to authenticated, service_role;

-- ──────────────────────── 3. reordenar / mover em lote ────────────────────────

create or replace function public.evento_grade_reordenar_v1(
  p_evento_id bigint,
  p_itens jsonb   -- [{"id":1,"bloco_id":7,"ordem":1}, ...]
)
returns integer
language plpgsql
as $function$
declare
  v_pedidos integer;
  v_aplicados integer;
  v_blocos_alheios integer;
begin
  select count(*) into v_pedidos from jsonb_array_elements(p_itens);
  if v_pedidos = 0 then
    return 0;
  end if;

  -- Bloco de OUTRO evento nao pode receber apresentacao: o trigger recalcularia
  -- `evento_id` e a linha mudaria de dono em silencio, levando junto a UNIQUE e o escopo
  -- da policy. Recusar antes de escrever, com o numero na mensagem.
  select count(*) into v_blocos_alheios
    from jsonb_array_elements(p_itens) i
    left join public.evento_bloco b on b.id = (i->>'bloco_id')::bigint
   where b.id is null or b.evento_id <> p_evento_id;

  if v_blocos_alheios > 0 then
    raise exception 'evento_grade_reordenar_v1: % item(ns) apontam para bloco inexistente ou de outro evento',
      v_blocos_alheios using errcode = 'P0001';
  end if;

  update public.evento_apresentacao ap
     set bloco_id   = (i->>'bloco_id')::bigint,
         ordem      = (i->>'ordem')::integer,
         updated_at = now()
    from jsonb_array_elements(p_itens) i
   where ap.id = (i->>'id')::bigint
     and ap.evento_id = p_evento_id;

  get diagnostics v_aplicados = row_count;

  -- Guarda de quantidade: se a policy escondeu linhas ou um id nao pertence ao evento, o
  -- UPDATE simplesmente nao as alcanca e devolveria "sucesso" com a grade pela metade —
  -- exatamente o defeito do lote do caixa (R$ 1.722 aprovados, R$ 432 gravados).
  if v_aplicados <> v_pedidos then
    raise exception 'evento_grade_reordenar_v1: pedi % apresentacao(oes) e alcancei % — nada foi aplicado',
      v_pedidos, v_aplicados using errcode = 'P0001';
  end if;

  return v_aplicados;
end;
$function$;

revoke execute on function public.evento_grade_reordenar_v1(bigint, jsonb) from public, anon;
grant execute on function public.evento_grade_reordenar_v1(bigint, jsonb)
  to authenticated, service_role;

comment on function public.evento_grade_reordenar_v1(bigint, jsonb) is
  'Aplica a nova ordem do drag-and-drop em UMA transacao. Cobre reordenar dentro do bloco '
  'e mover entre blocos do mesmo evento. Aborta se nao alcancar todos os itens pedidos.';
