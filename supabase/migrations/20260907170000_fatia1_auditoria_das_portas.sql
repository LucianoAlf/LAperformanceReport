-- FATIA 1 — auditoria de toda chamada de porta (07/09/2026).
--
-- 🔴 O LIMITE QUE EU DESCOBRI AO LIGAR, e que muda o que se pode prometer.
--
--    O desenho da Maria resolve o perfil ANTES do modelo: o bridge le o
--    telefone do remetente e escolhe o `agentId`. Isso funciona la porque cada
--    pessoa fala num canal proprio e o agente e escolhido por pessoa.
--
--    Na Sol nao da, e a razao e do runtime: o processo do MCP recebe env
--    ESTATICO. Verificado no codigo do Hermes — `mcp_tool.py:3027` monta
--    `StdioServerParameters(env=safe_env)` a partir de `_build_safe_env(
--    user_env)`, onde `user_env` e o bloco `env:` do config.yaml. E o
--    `get_session_env` do gateway e uma **context var de Python interna ao
--    processo do gateway**, que nao atravessa para o subprocesso.
--
--    Ou seja: **o telefone de quem fala nao chega ao MCP pelo ambiente.** Ele
--    tem de viajar na chamada.
--
-- ⚠️ O QUE ISSO SIGNIFICA, SEM MAQUIAGEM: o modelo informa o telefone, logo o
--    modelo PODE informar o de outra pessoa. O gate por telefone continua
--    valendo — ele so nao e mais inforjavel.
--
-- O que sustenta a decisao de seguir assim mesmo:
--   1. E ESTRITAMENTE MELHOR QUE HOJE. O MCP atual e o `server-postgres`
--      generico: o modelo escreve SQL livre e digita o telefone dentro dele.
--      A porta ao menos restringe a 12 perguntas e recorta por unidade.
--   2. O pior caso e limitado: ver o escopo de OUTRO COLEGA — todos ja
--      autorizados —, nao dado arbitrario.
--   3. Com esta migration, mentir vira DETECTAVEL: toda chamada grava quem foi
--      alegado, o que foi resolvido e qual porta. Sem o registro, a fraqueza
--      seria invisivel, que e a parte inaceitavel.
--
-- ⚠️ E o que fecha isso de verdade fica escrito como pendencia, nao como
--    "resolvido": o bridge da Sol precisa carimbar o remetente no proprio
--    turno — mesmo lugar onde a Maria resolve o `agentId`. Ate la, o telefone
--    e uma AFIRMACAO do modelo, e o log e o que a torna verificavel.

-- ⚠️ Reusa `automacao_log`, que ja e o registro desta casa. Nao cria tabela: a
--    pergunta "quem chamou o que" tem de ter UMA resposta.
--    `evento` e `aluno_nome` sao NOT NULL e `status` so aceita ok|warn|erro —
--    os tres ja derrubaram funcao em silencio aqui (05/09 e 20/08).

create or replace function public.sol_resolver_escopo_v1(
  p_solicitante_telefone text,
  p_unidade_pedida       text default null
) returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'governanca' as $function$
declare v_quem record; v_publico text; v_uid uuid; v_unome text; v_pedida uuid; v_out jsonb;
begin
  select * into v_quem
  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''), '\D', '', 'g'));

  if v_quem.nome is null then
    v_out := jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido',
      'recado', 'Não consegui identificar quem está perguntando — sem carimbo eu não entrego dado.');
  else
    v_publico := case
      when lower(coalesce(v_quem.nivel,'')) = 'diretoria' then 'estrategico'
      when lower(coalesce(v_quem.departamento,'')) = 'administrativo'
       and lower(coalesce(v_quem.nivel,'')) = 'lider' then 'tatico'
      when lower(coalesce(v_quem.departamento,'')) = 'administrativo' then 'operacional'
      else null end;

    if v_publico is null then
      v_out := jsonb_build_object('ok', false, 'motivo', 'fora_do_publico',
        'quem', v_quem.nome, 'departamento', v_quem.departamento,
        'recado', 'Essas portas são do time administrativo.');
    else
      if coalesce(btrim(p_unidade_pedida),'') <> '' then
        select u.id, u.nome into v_pedida, v_unome from unidades u
        where unaccent(lower(u.nome)) like '%' || unaccent(lower(btrim(p_unidade_pedida))) || '%'
        limit 1;
      end if;

      if v_pedida is null and coalesce(btrim(p_unidade_pedida),'') <> '' then
        v_out := jsonb_build_object('ok', false, 'motivo', 'unidade_nao_encontrada',
          'pedida', p_unidade_pedida);
      elsif v_publico = 'estrategico' then
        v_uid := v_pedida;
        if v_uid is null then v_unome := 'Rede (3 unidades)'; end if;
        v_out := null;
      elsif v_quem.unidade_id is null then
        -- ⚠️ falha fechada: 2 dos 9 do operacional estao sem unidade no
        --    cadastro, e vazio de cadastro nao vira permissao.
        v_out := jsonb_build_object('ok', false, 'motivo', 'sem_unidade_no_cadastro',
          'quem', v_quem.nome,
          'recado', 'Seu cadastro está sem unidade — peça para incluírem antes de eu puxar número.');
      elsif v_pedida is not null and v_pedida <> v_quem.unidade_id then
        v_out := jsonb_build_object('ok', false, 'motivo', 'fora_do_escopo',
          'recado', 'Essa unidade não é a sua — eu não vejo as outras.');
      else
        v_uid := v_quem.unidade_id;
        select nome into v_unome from unidades where id = v_uid;
        v_out := null;
      end if;

      if v_out is null then
        v_out := jsonb_build_object('ok', true, 'publico', v_publico,
          'quem', v_quem.nome, 'nivel', v_quem.nivel, 'departamento', v_quem.departamento,
          'unidade_id', v_uid, 'unidade_nome', coalesce(v_unome, 'Rede'),
          'escopo', case when v_uid is null then 'rede' else 'unidade' end);
      end if;
    end if;
  end if;

  -- 🔴 O REGISTRO E O QUE TORNA A FRAQUEZA VERIFICAVEL. Enquanto o telefone for
  --    afirmacao do modelo, e daqui que sai a resposta para "quem pediu o que".
  --    Grava o telefone so em DIGITOS e sem o numero completo no campo de
  --    texto — o suficiente para cruzar com o cadastro, nao para vazar lista.
  begin
    insert into automacao_log (evento, acao, status, aluno_nome, detalhes)
    values ('sol_portas', 'resolver_escopo',
            case when (v_out->>'ok')::bool then 'ok' else 'warn' end,
            'portas da Sol',
            jsonb_build_object(
              'telefone_alegado', regexp_replace(coalesce(p_solicitante_telefone,''), '\D', '', 'g'),
              'unidade_pedida', p_unidade_pedida,
              'resolveu_para', v_out->>'quem',
              'publico', v_out->>'publico',
              'unidade', v_out->>'unidade_nome',
              'ok', (v_out->>'ok')::bool,
              'motivo', v_out->>'motivo'));
  exception when others then
    null;  -- ⚠️ log nunca derruba a porta
  end;

  return v_out;
end; $function$;

revoke all on function public.sol_resolver_escopo_v1(text, text) from public, anon;
grant execute on function public.sol_resolver_escopo_v1(text, text)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

-- ── prova: o gate segue igual E agora deixa rastro ─────────────────────────
do $prova$
declare t_op text; t_outra text; v_u uuid; v jsonb; v_antes int; v_depois int;
begin
  select telefone, unidade_id into t_op, v_u from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;
  select nome into t_outra from unidades where id <> v_u limit 1;

  select count(*) into v_antes from automacao_log where evento='sol_portas';

  -- o comportamento nao pode ter mudado
  v := sol_resolver_escopo_v1(t_op, null);
  if not (v->>'ok')::bool or v->>'publico' <> 'operacional' then
    raise exception 'o resolvedor mudou de comportamento: %', v;
  end if;
  v := sol_resolver_escopo_v1(t_op, t_outra);
  if (v->>'ok')::bool then
    raise exception 'outra unidade passou — gate furado';
  end if;

  select count(*) into v_depois from automacao_log where evento='sol_portas';
  if v_depois - v_antes < 2 then
    raise exception 'as chamadas nao ficaram registradas (% novas)', v_depois - v_antes;
  end if;

  raise notice 'auditoria provada: gate intacto e % chamadas registradas (1 ok + 1 recusa)',
    v_depois - v_antes;
end $prova$;
