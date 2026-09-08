-- A porta de ADOÇÃO do orçamento de atenção (08/09/2026).
--
-- 🔴 O QUE FALTAVA. O teto existe e funciona, mas conta só o que passa pela
--    `fila_relatorios_sol_hermes` — e 100% dela é da Sol. O Fábio, a Mila, a
--    Lia e o TOM falam com a MESMA equipe por canais próprios, e o acúmulo que
--    o Luciano descreveu ("cobrança, cobrança, cobrança") mora justamente na
--    soma dos quatro.
--
--    Eu não posso escrever no runtime alheio. O que posso — e é o que está
--    aqui — é tornar a adesão de **duas linhas**: perguntar antes, registrar
--    depois. Se a porta for difícil, ninguém adota e o teto vira decoração.
--
-- ⚠️ Fábio, Mila e Lia vivem NESTE banco e ganham EXECUTE direto. O TOM está em
--    OUTRO projeto Supabase e não alcança daqui — para ele há a edge
--    `registrar-mensagem-agente`, mesmo contrato, com token.
--
-- ⚠️ RISCO ACEITO, dito: um agente pode registrar mensagem que não mandou e
--    calar os outros. É auto-prejuízo entre agentes da própria casa, fica tudo
--    assinado em `agente` e a coluna `criado_por` guarda o papel do banco —
--    dá para auditar quem inflou. Trancar isso com verificação cruzada custaria
--    mais que o dano que evita.
--
-- ⚠️ `essencial` NUNCA é cortado — nem para os outros agentes. Um teto que
--    silencia "sua aula foi cancelada" não é proteção, é falha.

alter table agente_mensagens_externas
  add column if not exists criado_por text default current_user;
comment on column agente_mensagens_externas.criado_por is
  'Papel do banco que registrou, preenchido pelo default. Existe porque `agente` e declarado pelo chamador: se alguem inflar a contagem para calar os outros, e por aqui que se descobre quem foi.';

create or replace function public.agente_registrar_mensagem_v1(
  p_agente  text,
  p_destino text,
  p_tipo    text default null,
  p_peso    text default 'essencial'
) returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $function$
declare v_id bigint; v_hoje int;
begin
  if coalesce(btrim(p_agente),'') = '' or coalesce(btrim(p_destino),'') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'agente_e_destino_obrigatorios');
  end if;
  if coalesce(p_peso,'essencial') not in ('essencial','nudge') then
    return jsonb_build_object('ok', false, 'motivo', 'peso_invalido',
      'aceitos', jsonb_build_array('essencial','nudge'));
  end if;

  insert into agente_mensagens_externas (agente, destino, tipo, peso)
  values (btrim(p_agente), btrim(p_destino), nullif(btrim(coalesce(p_tipo,'')),''),
          coalesce(p_peso,'essencial'))
  returning id into v_id;

  select (agente_pode_falar_v1(btrim(p_destino), 'nudge')->>'ja_hoje')::int into v_hoje;

  return jsonb_build_object('ok', true, 'id', v_id,
    'destino_ja_recebeu_hoje', v_hoje,
    'nota', 'registrado. Antes do PROXIMO nudge, pergunte a agente_pode_falar_v1.');
end; $function$;

comment on function public.agente_registrar_mensagem_v1(text, text, text, text) is
  'Onde TOM/Fabio/Mila/Lia registram o que mandaram, para o orcamento de atencao contar TODOS os agentes e nao so a Sol. Duas linhas de adesao: `agente_pode_falar_v1` antes de um nudge, esta aqui depois de enviar.';

revoke all on function public.agente_registrar_mensagem_v1(text, text, text, text) from public, anon;
grant execute on function public.agente_registrar_mensagem_v1(text, text, text, text)
  to service_role, sol_acesso_restrito, fabio_agent, mila_acesso_restrito, lia_acesso_restrito;

-- ⚠️ Sem EXECUTE no CONSULTOR eles registrariam sem nunca poder perguntar — meia
--    adesão, que é a pior (conta e não protege).
grant execute on function public.agente_pode_falar_v1(text, text, text, date)
  to sol_acesso_restrito, fabio_agent, mila_acesso_restrito, lia_acesso_restrito;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v jsonb; v_jid text := '__prova_adocao__@g.us'; i int; v_antes int;
begin
  select (agente_pode_falar_v1(v_jid,'nudge')->>'ja_hoje')::int into v_antes;

  -- peso inválido recusa
  v := agente_registrar_mensagem_v1('fabio', v_jid, 'briefing', 'urgentissimo');
  if coalesce((v->>'ok')::bool,true) then raise exception 'peso invalido aceito: %', v; end if;

  -- registro conta no orçamento de TODOS
  for i in 1..4 loop
    v := agente_registrar_mensagem_v1('fabio', v_jid, 'briefing', 'essencial');
    if not (v->>'ok')::bool then raise exception 'registro falhou: %', v; end if;
  end loop;

  v := agente_pode_falar_v1(v_jid, 'nudge');
  if (v->>'de_outros_agentes')::int < 4 then
    raise exception 'o registro de outro agente nao entrou na conta: %', v;
  end if;
  if (v->>'pode')::bool then
    raise exception 'com 4 mensagens de outro agente o nudge deveria ceder: %', v;
  end if;

  -- 🔴 e o essencial continua passando, mesmo com o dia estourado por terceiros
  v := agente_pode_falar_v1(v_jid, 'essencial');
  if not (v->>'pode')::bool then
    raise exception 'essencial cortado por mensagem de outro agente — inaceitavel: %', v;
  end if;

  -- e o papel do banco fica registrado
  if not exists (select 1 from agente_mensagens_externas
                  where destino = v_jid and criado_por is not null) then
    raise exception 'criado_por nao foi preenchido — nao daria para auditar quem inflou';
  end if;

  delete from agente_mensagens_externas where destino = v_jid;
  raise notice 'prova: peso invalido recusa · registro de OUTRO agente cala o nudge da Sol · essencial atravessa · autoria gravada';
end $prova$;
