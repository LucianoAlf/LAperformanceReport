-- 28/09/2026 — Recital: apresentacoes que sobem JUNTAS no mesmo numero.
--
-- Pedido do Hugo a partir do prototipo novo do Arthur ("+ Adicionar aluno" dentro da
-- apresentacao): a Ana no Violao acompanhando o Pedro no Canto sao UM numero na programacao —
-- um horario, uma musica, as duas pessoas listadas.
--
-- ⚠️ A apresentacao CONTINUA sendo o par (pessoa, curso) e a UNIQUE (evento_id, pessoa_chave,
-- curso_id) nao muda. E nela que moram o certificado por curso (`certificado_status`) e o que
-- o professor lanca no LA Teacher (`evento_recital_sincronizar_v1` casa por pessoa+curso).
-- Transformar a apresentacao num grupo de pessoas quebraria os dois. O numero e so uma
-- etiqueta comum, `grupo_id`, entre as apresentacoes que tocam juntas.
--
-- ⚠️ `uuid` sem FK, e nao "id da apresentacao lider": com FK, apagar a primeira do numero
-- desfaria o grupo inteiro por `on delete set null`. Com a etiqueta, quem sobra continua junto.
-- Numero que sobra com UM integrante nao e erro: a grade e o calculo o tratam como
-- apresentacao sozinha (`agruparEmNumeros` em src/lib/eventos.ts).
--
-- Custo (rules/desempenho_banco.md): nenhum cron, nenhum cache. A trava de coerencia roda uma
-- vez por linha escrita de `evento_apresentacao`, fazendo um `exists` por indice parcial numa
-- tabela de ~270 linhas por recital, e so quando `grupo_id` nao e nulo. Escrita e manual (tela).

alter table public.evento_apresentacao
  add column if not exists grupo_id uuid;

comment on column public.evento_apresentacao.grupo_id is
  'Mesmo valor = sobem juntas no mesmo numero do recital (um horario, uma musica). NULL = sozinha. '
  'A apresentacao continua sendo (pessoa, curso): certificado e canal do LA Teacher nao mudam. '
  'Escrever pelas RPCs evento_apresentacao_juntar_v1 / evento_apresentacao_separar_v1.';

create index if not exists ix_evento_apresentacao_grupo
  on public.evento_apresentacao (grupo_id)
  where grupo_id is not null;

-- ─────────────── trava: o numero inteiro fica no mesmo bloco ───────────────
--
-- Checada no COMMIT (constraint trigger deferida), nao linha a linha: mover um numero de bloco
-- escreve os integrantes um de cada vez dentro da mesma transacao, e uma checagem imediata
-- recusaria o primeiro por ainda estar separado do segundo.
create or replace function public.fn_evento_apresentacao_grupo_coerente()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.grupo_id is null then
    return null;
  end if;
  if exists (
    select 1
      from public.evento_apresentacao o
     where o.grupo_id = new.grupo_id
       and o.id <> new.id
       and o.bloco_id <> new.bloco_id
  ) then
    raise exception 'Quem sobe junto no mesmo número tem de estar no mesmo bloco.'
      using errcode = 'P0001',
            hint = 'Mova o número inteiro, ou separe o aluno antes de levá-lo para outro bloco.';
  end if;
  return null;
end;
$$;
revoke all on function public.fn_evento_apresentacao_grupo_coerente() from public, anon, authenticated;

drop trigger if exists trg_evento_apresentacao_grupo_coerente on public.evento_apresentacao;
create constraint trigger trg_evento_apresentacao_grupo_coerente
  after insert or update of grupo_id, bloco_id on public.evento_apresentacao
  deferrable initially deferred
  for each row execute function public.fn_evento_apresentacao_grupo_coerente();

-- ─────────────── juntar: + Adicionar aluno dentro de uma apresentacao ───────────────
--
-- Recebe o PAR (aluno, curso), como `evento_apresentacao_adicionar_v1`:
--   • a pessoa ainda nao tem apresentacao desse curso → cria, pela mesma RPC de sempre
--     (resolve a matricula do curso, o professor e a UNIQUE com a mesma mensagem);
--   • ja tem, em outro lugar da grade → a apresentacao dela e MOVIDA para este numero. Nunca
--     duplica: a regra "uma apresentacao por curso" e a do Hugo, e mover preserva a musica, o
--     rider e o certificado que ela ja tinha.
--
-- O novo integrante entra logo DEPOIS do ultimo do numero, e o bloco e reenumerado 1..N — e o
-- que mantem o numero contiguo, que e o que `agruparEmNumeros` exige para dar um slot so.
--
-- SECURITY INVOKER, como as outras RPCs da grade: a RLS de `evento_apresentacao` vale. Como a
-- policy FILTRA em vez de recusar, cada UPDATE confere quantas linhas alcancou.
create or replace function public.evento_apresentacao_juntar_v1(
  p_alvo_id bigint,
  p_aluno_id integer,
  p_curso_id integer
)
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_alvo_bloco    bigint;
  v_alvo_evento   bigint;
  v_alvo_grupo    uuid;
  v_pessoa        text;
  v_membro        bigint;
  v_membro_bloco  bigint;
  v_membro_grupo  uuid;
  v_grupo         uuid;
  v_n             integer;
begin
  select ap.bloco_id, ap.evento_id, ap.grupo_id
    into v_alvo_bloco, v_alvo_evento, v_alvo_grupo
    from public.evento_apresentacao ap
   where ap.id = p_alvo_id;

  if v_alvo_bloco is null then
    raise exception 'Não encontrei a apresentação %.', p_alvo_id using errcode = 'P0001';
  end if;

  select pc.pessoa_chave into v_pessoa
    from public.vw_aluno_pessoa_chave pc
   where pc.aluno_id = p_aluno_id;

  if v_pessoa is null then
    raise exception 'evento_apresentacao_juntar_v1: matricula % nao existe', p_aluno_id
      using errcode = 'P0001';
  end if;

  -- A apresentacao que essa pessoa ja tem DESTE curso neste evento. A UNIQUE garante que e
  -- no maximo uma.
  select ap.id, ap.bloco_id, ap.grupo_id
    into v_membro, v_membro_bloco, v_membro_grupo
    from public.evento_apresentacao ap
   where ap.evento_id = v_alvo_evento
     and ap.pessoa_chave = v_pessoa
     and ap.curso_id = p_curso_id;

  if v_membro = p_alvo_id then
    raise exception 'Essa já é a apresentação que você está editando.' using errcode = 'P0001';
  end if;

  v_grupo := coalesce(v_alvo_grupo, gen_random_uuid());

  if v_membro is not null and v_membro_grupo = v_grupo then
    raise exception 'Esse aluno já está neste número.' using errcode = 'P0001';
  end if;

  if v_membro is null then
    v_membro := public.evento_apresentacao_adicionar_v1(v_alvo_bloco, p_aluno_id, p_curso_id);
    v_membro_bloco := v_alvo_bloco;
  end if;

  if v_alvo_grupo is null then
    update public.evento_apresentacao set grupo_id = v_grupo where id = p_alvo_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'Sem permissão para alterar a apresentação %.', p_alvo_id using errcode = '42501';
    end if;
  end if;

  update public.evento_apresentacao
     set grupo_id = v_grupo, bloco_id = v_alvo_bloco
   where id = v_membro;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Sem permissão para mover a apresentação %.', v_membro using errcode = '42501';
  end if;

  -- Bloco do numero: o novo integrante vai para logo depois do ultimo que ja estava nele.
  with base as (
    select ap.id,
           ap.ordem,
           case
             when ap.id = v_membro then
               (select max(o.ordem) from public.evento_apresentacao o
                 where o.bloco_id = v_alvo_bloco and o.grupo_id = v_grupo and o.id <> v_membro)
             else ap.ordem
           end as chave,
           (ap.id = v_membro) as e_novo
      from public.evento_apresentacao ap
     where ap.bloco_id = v_alvo_bloco
  ),
  nova as (
    select id, row_number() over (order by chave, e_novo, ordem, id) as ordem_nova
      from base
  )
  update public.evento_apresentacao ap
     set ordem = nova.ordem_nova
    from nova
   where ap.id = nova.id
     and ap.ordem is distinct from nova.ordem_nova;

  -- Bloco de onde ele saiu, se era outro: fecha o buraco na ordem.
  if v_membro_bloco <> v_alvo_bloco then
    with nova as (
      select ap.id, row_number() over (order by ap.ordem, ap.id) as ordem_nova
        from public.evento_apresentacao ap
       where ap.bloco_id = v_membro_bloco
    )
    update public.evento_apresentacao ap
       set ordem = nova.ordem_nova
      from nova
     where ap.id = nova.id
       and ap.ordem is distinct from nova.ordem_nova;
  end if;

  -- Numero de onde ele saiu, se tinha outro: com um integrante so, deixa de ser numero.
  if v_membro_grupo is not null
     and (select count(*) from public.evento_apresentacao where grupo_id = v_membro_grupo) = 1 then
    update public.evento_apresentacao set grupo_id = null where grupo_id = v_membro_grupo;
  end if;

  return v_membro;
end;
$$;

revoke all on function public.evento_apresentacao_juntar_v1(bigint, integer, integer) from public, anon;
grant execute on function public.evento_apresentacao_juntar_v1(bigint, integer, integer)
  to authenticated, service_role;
comment on function public.evento_apresentacao_juntar_v1(bigint, integer, integer) is
  'Recital: poe (aluno, curso) no mesmo numero da apresentacao p_alvo_id. Cria a apresentacao se '
  'nao existir; se existir em outro lugar, move. Devolve o id da apresentacao do integrante.';

-- ─────────────── separar: tira um aluno do numero ───────────────
--
-- Ele vira apresentacao sozinha logo DEPOIS do numero de onde saiu — na mesma regiao da
-- grade, para quem separou ver o resultado ali mesmo. Se o numero ficar com um integrante so,
-- esse tambem volta a ser apresentacao sozinha.
create or replace function public.evento_apresentacao_separar_v1(p_id bigint)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_bloco bigint;
  v_grupo uuid;
  v_n     integer;
begin
  select ap.bloco_id, ap.grupo_id into v_bloco, v_grupo
    from public.evento_apresentacao ap
   where ap.id = p_id;

  if v_bloco is null then
    raise exception 'Não encontrei a apresentação %.', p_id using errcode = 'P0001';
  end if;
  if v_grupo is null then
    return;
  end if;

  with base as (
    select ap.id,
           ap.ordem,
           case
             when ap.id = p_id then
               (select max(o.ordem) from public.evento_apresentacao o
                 where o.bloco_id = v_bloco and o.grupo_id = v_grupo)
             else ap.ordem
           end as chave,
           (ap.id = p_id) as e_ele
      from public.evento_apresentacao ap
     where ap.bloco_id = v_bloco
  ),
  nova as (
    select id, row_number() over (order by chave, e_ele, ordem, id) as ordem_nova
      from base
  )
  update public.evento_apresentacao ap
     set ordem = nova.ordem_nova
    from nova
   where ap.id = nova.id
     and ap.ordem is distinct from nova.ordem_nova;

  update public.evento_apresentacao set grupo_id = null where id = p_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Sem permissão para alterar a apresentação %.', p_id using errcode = '42501';
  end if;

  if (select count(*) from public.evento_apresentacao where grupo_id = v_grupo) = 1 then
    update public.evento_apresentacao set grupo_id = null where grupo_id = v_grupo;
  end if;
end;
$$;

revoke all on function public.evento_apresentacao_separar_v1(bigint) from public, anon;
grant execute on function public.evento_apresentacao_separar_v1(bigint) to authenticated, service_role;
comment on function public.evento_apresentacao_separar_v1(bigint) is
  'Recital: tira a apresentacao do numero em que esta; ela passa a tocar sozinha, logo depois dele.';
