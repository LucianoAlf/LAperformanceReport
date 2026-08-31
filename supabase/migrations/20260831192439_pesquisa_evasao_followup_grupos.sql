-- Fila de follow-up da pesquisa de evasao: separar EM ABERTO de ENCERRADAS.
--
-- PROBLEMA (31/08/2026): a secao e uma lista unica com 35 casos, onde o que ainda
-- exige acao convive com o que ja acabou. A paginacao existia mas NUNCA entrava em
-- acao -- pagina de 50 contra 35 linhas -- entao a tela era uma rolagem so. E os
-- estados terminais (`concluida`, `opt_out`, `followup_realizado`,
-- `followup_dispensado`) nao tinham para onde sair: ficavam empilhados no meio da
-- fila de trabalho, e o filtro por estado so alcancava 6 dos 12 valores possiveis
-- (`revisada`, `opt_out`, `nova_rodada`, `respondendo`, `pronta_para_revisao` e
-- `em_revisao` so apareciam sob "Todos").
--
-- ⚠️ A ASSINATURA DE `listar_followups_pesquisa_evasao_v1` NAO MUDA: ela faz
-- `select estado.*` e um RETURNS TABLE novo exigiria DROP+CREATE, que neste schema
-- reabre EXECUTE para `anon` (ver "Regras Importantes" no CLAUDE.md). Os dois grupos
-- entram como VALOR de `p_estado`, nao como parametro novo.

-- ---------------------------------------------------------------------------
-- Predicado 1: o que conta como ENCERRADA. Fonte unica.
-- ---------------------------------------------------------------------------
-- A particao espelha a ordem do `case` de `fn_pesquisa_evasao_followup_estado`:
-- `revisada` fica de FORA de proposito (ainda falta classificar e registrar
-- desfecho -- foi por isso que ela perdeu a cor esmeralda em 31/08), e
-- `followup_realizado` fica DENTRO porque, naquele ramo do case, a pesquisa nao
-- teve resposta nenhuma: o operador ligou, registrou, e a fila nao tem mais o que
-- pedir dela.
--
-- ⚠️ SEM `set search_path`: clausula SET impede o inline de funcao SQL, e esta roda
-- linha a linha dentro do WHERE. Ela nao le tabela nenhuma, entao nao ha superficie
-- de search_path a proteger.
create or replace function public.fn_pesquisa_evasao_followup_encerrada(
  p_estado_visivel text
)
returns boolean
language sql
immutable
parallel safe
as $function$
  select p_estado_visivel in (
    'concluida',
    'followup_realizado',
    'followup_dispensado',
    'opt_out'
  );
$function$;

comment on function public.fn_pesquisa_evasao_followup_encerrada(text) is
  'Fonte unica da particao em aberto x encerrada da fila de follow-up da pesquisa de evasao. Mudou aqui, muda na lista e no contador ao mesmo tempo.';

-- ---------------------------------------------------------------------------
-- Predicado 2: o que a busca livre casa. Fonte unica.
-- ---------------------------------------------------------------------------
-- Ja estava duplicado entre a listagem e o contador antigo; com um contador por
-- grupo seria a terceira copia -- e badge que discorda da lista e exatamente o
-- defeito que a separacao pretende resolver.
create or replace function public.fn_pesquisa_evasao_followup_casa_busca(
  p_aluno_nome text,
  p_unidade_nome text,
  p_operador_nome text,
  p_busca text
)
returns boolean
language sql
immutable
parallel safe
as $function$
  select nullif(btrim(p_busca), '') is null
    or p_aluno_nome ilike ('%' || btrim(p_busca) || '%')
    or p_unidade_nome ilike ('%' || btrim(p_busca) || '%')
    or coalesce(p_operador_nome, '') ilike ('%' || btrim(p_busca) || '%');
$function$;

-- ---------------------------------------------------------------------------
-- Listagem: aceita os dois grupos como valor de `p_estado`.
-- ---------------------------------------------------------------------------
create or replace function public.listar_followups_pesquisa_evasao_v1(
  p_unidade_id uuid default null::uuid,
  p_limite integer default 50,
  p_offset integer default 0,
  p_estado text default 'todos'::text,
  p_ano integer default null::integer,
  p_mes integer default null::integer,
  p_busca text default null::text
)
returns table(
  total_count bigint,
  pesquisa_id uuid,
  evasao_id integer,
  aluno_id integer,
  aluno_nome text,
  telefone_destino text,
  unidade_id uuid,
  unidade_nome text,
  enviado_em timestamp with time zone,
  vencido_em timestamp with time zone,
  operador_usuario_id integer,
  operador_nome text,
  estado_visivel text,
  followup_pendente boolean,
  interagiu_sem_resposta_valida boolean,
  alerta_enviado_em timestamp with time zone,
  acao text,
  acao_canal text,
  acao_observacao text,
  acao_registrada_em timestamp with time zone,
  acao_operador_nome text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'usuario_interno_ativo_required';
  end if;

  if coalesce(p_estado, 'todos') not in (
    'todos', 'em_aberto', 'encerradas',
    'followup_pendente', 'followup_avisado',
    'followup_realizado', 'followup_dispensado', 'aguardando_resposta',
    'concluida', 'revisada', 'opt_out'
  ) then
    raise exception 'estado_followup_invalido';
  end if;

  return query
  select
    count(*) over ()::bigint,
    estado.*
  from public.fn_pesquisa_evasao_followup_estado(clock_timestamp()) estado
  where (p_unidade_id is null or estado.unidade_id = p_unidade_id)
    and (p_ano is null or extract(year from estado.enviado_em)::integer = p_ano)
    and (p_mes is null or extract(month from estado.enviado_em)::integer = p_mes)
    and public.fn_pesquisa_evasao_followup_casa_busca(
      estado.aluno_nome, estado.unidade_nome, estado.operador_nome, p_busca
    )
    and (
      coalesce(p_estado, 'todos') = 'todos'
      or (p_estado = 'em_aberto'
          and not public.fn_pesquisa_evasao_followup_encerrada(estado.estado_visivel))
      or (p_estado = 'encerradas'
          and public.fn_pesquisa_evasao_followup_encerrada(estado.estado_visivel))
      or (p_estado = 'followup_pendente' and estado.followup_pendente)
      or estado.estado_visivel = p_estado
    )
  order by
    estado.followup_pendente desc,
    -- Arquivo se le do mais recente para o mais antigo; fila de trabalho, do prazo
    -- mais apertado para o mais folgado. Fora de 'encerradas' o `case` devolve NULL
    -- em toda linha, entao o criterio se anula e a ordem antiga fica intacta.
    case when p_estado = 'encerradas' then estado.enviado_em end desc nulls last,
    estado.vencido_em,
    estado.pesquisa_id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Contador por grupo: alimenta os numeros das duas abas numa varredura so.
-- ---------------------------------------------------------------------------
-- Substitui `contar_followups_pesquisa_evasao_v1` na tela. A antiga devolvia so o
-- total de pendentes e nao aceitava busca, entao o badge do cabecalho continuava
-- dizendo "28 pendentes" com um unico caso na tela. Ela fica no banco: nao tem
-- outro consumidor, e derrubar funcao SECURITY DEFINER por assepsia nao paga o
-- risco.
create or replace function public.contar_followups_pesquisa_evasao_grupos_v1(
  p_unidade_id uuid default null::uuid,
  p_ano integer default null::integer,
  p_mes integer default null::integer,
  p_busca text default null::text
)
returns table(
  em_aberto bigint,
  encerradas bigint,
  pendentes bigint
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'usuario_interno_ativo_required';
  end if;

  return query
  select
    count(*) filter (
      where not public.fn_pesquisa_evasao_followup_encerrada(estado.estado_visivel)
    )::bigint,
    count(*) filter (
      where public.fn_pesquisa_evasao_followup_encerrada(estado.estado_visivel)
    )::bigint,
    count(*) filter (where estado.followup_pendente)::bigint
  from public.fn_pesquisa_evasao_followup_estado(clock_timestamp()) estado
  where (p_unidade_id is null or estado.unidade_id = p_unidade_id)
    and (p_ano is null or extract(year from estado.enviado_em)::integer = p_ano)
    and (p_mes is null or extract(month from estado.enviado_em)::integer = p_mes)
    and public.fn_pesquisa_evasao_followup_casa_busca(
      estado.aluno_nome, estado.unidade_nome, estado.operador_nome, p_busca
    );
end;
$function$;

-- `ALTER DEFAULT PRIVILEGES` neste schema concede EXECUTE a `anon` em funcao nova,
-- e `create or replace` conta como nova. Revogar NOMINALMENTE de anon -- tirar de
-- `public` sozinho nao basta.
revoke execute on function public.fn_pesquisa_evasao_followup_encerrada(text)
  from public, anon;
revoke execute on function public.fn_pesquisa_evasao_followup_casa_busca(text, text, text, text)
  from public, anon;
revoke execute on function public.listar_followups_pesquisa_evasao_v1(uuid, integer, integer, text, integer, integer, text)
  from public, anon;
revoke execute on function public.contar_followups_pesquisa_evasao_grupos_v1(uuid, integer, integer, text)
  from public, anon;

grant execute on function public.fn_pesquisa_evasao_followup_encerrada(text)
  to authenticated, service_role;
grant execute on function public.fn_pesquisa_evasao_followup_casa_busca(text, text, text, text)
  to authenticated, service_role;
grant execute on function public.listar_followups_pesquisa_evasao_v1(uuid, integer, integer, text, integer, integer, text)
  to authenticated, service_role;
grant execute on function public.contar_followups_pesquisa_evasao_grupos_v1(uuid, integer, integer, text)
  to authenticated, service_role;
