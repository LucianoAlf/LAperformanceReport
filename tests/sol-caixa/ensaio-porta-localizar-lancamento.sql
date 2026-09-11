\set ON_ERROR_STOP on
begin;

insert into public.integracao_tokens(nome, token, descricao)
values (
  'sol_cracha_hmac',
  'ensaio-sintetico-nao-usar-fora-do-container',
  'Segredo sintético e transitório do teste; a transação termina em rollback.'
)
on conflict (nome) do update set token = excluded.token;

insert into governanca.agente_usuarios(
  telefone, nome, departamento, nivel, unidade_id, pode_editar, ativo
) values (
  '5500000000000', 'Operador Ensaio', 'administrativo', 'lider',
  '11111111-1111-1111-1111-111111111111', true, true
)
on conflict (telefone) do update
set ativo = true,
    unidade_id = excluded.unidade_id,
    departamento = excluded.departamento,
    nivel = excluded.nivel;

insert into public.caixa_financeiro_grupos_whatsapp(
  unidade_id, nome_grupo, grupo_jid, ativo
) values (
  '11111111-1111-1111-1111-111111111111',
  'Caixa Ensaio', '5500000000000-1@g.us', true
)
on conflict (unidade_id) do update
set nome_grupo = excluded.nome_grupo,
    grupo_jid = excluded.grupo_jid,
    ativo = true;

insert into public.sol_caixa_unidade_policy(unidade_id, autoriza_qualquer_membro)
values ('11111111-1111-1111-1111-111111111111', true)
on conflict (unidade_id) do update
set autoriza_qualquer_membro = true,
    atualizado_em = now();

do $prova$
declare
  v_cracha text;
  v_r jsonb;
begin
  v_cracha := public.sol_cracha_emitir_v1(
    '5500000000000', '5500000000000-1@g.us', now()
  );
  if v_cracha is null then
    raise exception 'crachá de ensaio não foi emitido';
  end if;

  v_r := public.sol_porta_caixa_localizar_lancamento_v1(
    v_cracha, '5500000000000-1@g.us', current_date, current_date,
    null, null, null, '__filtro_sem_match__'
  );
  if not coalesce((v_r->>'ok')::boolean, false) then
    raise exception 'porta localizar recusou contexto válido: %', v_r->>'motivo';
  end if;
  if coalesce((v_r->>'count')::integer, -1) <> 0 then
    raise exception 'filtro sem match deveria devolver zero itens';
  end if;
end;
$prova$;

rollback;
\echo 'porta localizar executada contra schema real: OK'
