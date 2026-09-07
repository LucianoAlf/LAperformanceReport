-- FATIA 2, passo 6 — o sinal de conversa some quando o time responde (07/09/2026).
--
-- 🔴 O FALSO POSITIVO, MEDIDO: **5 de 30 sinais de conversa vigentes (17%) ja
--    tinham sido respondidos** e continuavam na pauta. E isso com 4 dias de
--    operacao — a taxa so cresce, porque nada os apagava.
--
--    Nomes reais que a Sol cobraria a toa hoje: Matheus Vanzan (R7), Jimmy
--    Cordeiro (R8), Giovanna Oliveira (R8), Saulo Medeiros (R7), Joao Guilherme
--    (R14). Cobrar a ADM por conversa que ela JA respondeu e a forma mais rapida
--    de ensinar a equipe a ignorar o agente — e ela ja convive com o TOM, o
--    Fabio e a Mila.
--
--    A causa esta escrita no proprio extrator: *"a chave inclui a ULTIMA
--    MENSAGEM, entao conversa parada do mesmo jeito nao e reclassificada — so
--    volta se o cliente escrever de novo"*. O sinal e uma FOTOGRAFIA do
--    instante da deteccao. Ninguem tira a segunda foto.
--
-- 🔴 A SEGUNDA FOTO JA EXISTE E NAO CUSTA NADA. `vw_atendimento_candidatos_sinal`
--    (projeto SOL) e, por definicao, "conversas em que o cliente falou por
--    ultimo e ninguem respondeu". O extrator ja a busca inteira a cada rodada,
--    antes de chamar a OpenAI. Basta CARIMBAR os sinais cujas conversas ainda
--    estao la — zero token, zero chamada nova.
--
--    E a mesma ideia do passo 1 (o detector diz a verdade de hoje), aplicada a
--    um detector que e edge em vez de SQL.
--
-- ⚠️ SAIR DA FOTO TEM TRES CAUSAS E SO DUAS SAO BOAS. O predicado da view e
--    `ultimo_autor='contact' AND status <> 'resolved' AND ultima_msg_em entre
--    14 dias e 2 horas atras`. Logo, a conversa sai quando:
--      1. **o time respondeu** (`ultimo_autor` vira `agent`) — sanou ✅
--      2. **a conversa foi RESOLVIDA no Chatwoot** — sanou ✅ e de brinde: e
--         exatamente o gesto pelo qual a consultora declara o desfecho, que foi
--         a licao da Daiana no lado comercial chegando de graca no lado aluno
--      3. **passou de 14 dias sem ninguem responder** — NAO sanou ❌, e um
--         falso NEGATIVO: sumiria da pauta justamente o cliente mais
--         abandonado. Este caso e detectado pelo `ultima_msg_em` do proprio
--         sinal e mantido vivo.
--
-- ⚠️ FOTO TRUNCADA NAO DECIDE NADA. A edge de export ja devolve `truncado`
--    quando bate o teto de 500 (hoje: 251). Com a foto incompleta, ausencia nao
--    prova resposta — a rodada nao e registrada e tudo segue vigente.

create or replace function public.radar_marcar_foto_conversas_v1(
  p_conversa_ids  integer[],
  p_truncado      boolean default false,
  p_janela_dias   integer default 14
) returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $function$
declare v_id bigint; v_presentes int; v_velhos int; v_total int;
begin
  -- 🔴 foto incompleta nao autoriza declarar que ninguem sanou
  if coalesce(p_truncado, false) then
    return jsonb_build_object('ok', false, 'motivo', 'foto_truncada',
      'recado', 'A foto bateu no teto — ausencia nao prova resposta, entao nada foi marcado.');
  end if;
  if p_conversa_ids is null then
    return jsonb_build_object('ok', false, 'motivo', 'foto_ausente');
  end if;

  insert into radar_rodadas (rodada, detector) values ('diaria', 'conversa') returning id into v_id;

  -- (a) ainda na foto = ainda esperando resposta
  update radar_sinais s set visto_em = now(), atualizado_em = now()
  where s.status in ('aberto','triado')
    and s.evidencia ? 'conversa_id'
    and (s.evidencia->>'conversa_id')::int = any(p_conversa_ids);
  get diagnostics v_presentes = row_count;

  -- (b) ⚠️ fora da foto POR IDADE (>14d): a view nao os enxerga mais, entao a
  --     ausencia nao diz nada sobre resposta. Manter vivo e a escolha certa —
  --     sumir com o cliente mais abandonado seria o pior falso negativo
  --     possivel. Quem os encerra e o `expira_em`, que todos ja tem.
  update radar_sinais s set visto_em = now(), atualizado_em = now()
  where s.status in ('aberto','triado')
    and s.evidencia ? 'conversa_id'
    and not ((s.evidencia->>'conversa_id')::int = any(p_conversa_ids))
    and (s.evidencia->>'ultima_msg_em')::timestamptz < now() - make_interval(days => p_janela_dias);
  get diagnostics v_velhos = row_count;

  select count(*) into v_total from radar_sinais
   where status in ('aberto','triado') and evidencia ? 'conversa_id';

  update radar_rodadas
     set concluida_em = now(),
         resultado = jsonb_build_object(
           'conversas_na_foto', array_length(p_conversa_ids, 1),
           'sinais_mantidos_por_presenca', v_presentes,
           'sinais_mantidos_por_idade_inconclusiva', v_velhos,
           'sinais_de_conversa_abertos', v_total,
           -- 🔴 este e o numero que interessa ao Alf: quantos sairam da pauta
           --    porque o time resolveu, sem ninguem cobrar.
           'sanaram_nesta_rodada', greatest(v_total - v_presentes - v_velhos, 0))
   where id = v_id;

  return jsonb_build_object('ok', true, 'rodada_id', v_id,
    'mantidos_por_presenca', v_presentes, 'mantidos_por_idade', v_velhos,
    'sanaram', greatest(v_total - v_presentes - v_velhos, 0));
end; $function$;

comment on function public.radar_marcar_foto_conversas_v1(integer[], boolean, integer) is
  'Carimba visto_em nos sinais cujas conversas ainda estao na foto de "cliente falou por ultimo e ninguem respondeu". E o que faz o sinal de conversa SUMIR quando a equipe responde ou resolve no Chatwoot — sem custo de LLM, reusando a foto que o extrator ja busca. Foto truncada nao marca nada.';

revoke all on function public.radar_marcar_foto_conversas_v1(integer[], boolean, integer) from public, anon;
grant execute on function public.radar_marcar_foto_conversas_v1(integer[], boolean, integer) to service_role;

-- ── as 6 regras de conversa passam a ter detector ──────────────────────────
update radar_regras set detector = 'conversa' where origem = 'llm_conversa';

-- ⚠️ `radar_sincronizar_detectores_v1` deriva o mapa do corpo das FUNCOES SQL;
--    o detector de conversa e uma EDGE, entao ele nao aparece la. A sincronizacao
--    so faz UPDATE do que encontra e nunca apaga o resto, entao este valor
--    sobrevive — mas fica dito, para ninguem "consertar" a sincronizacao
--    achando que ha uma lacuna.
comment on column radar_regras.detector is
  'Qual detector emite esta regra. Para detectores SQL, e DERIVADO por radar_sincronizar_detectores_v1 do corpo das funcoes — nao editar a mao. Para o detector `conversa` (edge extrair-sinais-conversa) o valor e fixado por migration, porque nao ha corpo SQL de onde deriva-lo. A vigencia so declara `sanou` se ESTE detector rodou e nao reemitiu.';

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_regras int; v_r jsonb;
begin
  select count(*) into v_regras from radar_regras where detector = 'conversa';
  if v_regras < 6 then raise exception 'esperava >=6 regras de conversa, achei %', v_regras; end if;

  -- 🔴 foto truncada nao pode marcar nada
  v_r := radar_marcar_foto_conversas_v1(array[1,2,3], true, 14);
  if coalesce((v_r->>'ok')::bool, true) then
    raise exception 'foto truncada foi aceita — a guarda nao pegou: %', v_r;
  end if;

  -- 🔴 foto nula tambem nao
  v_r := radar_marcar_foto_conversas_v1(null, false, 14);
  if coalesce((v_r->>'ok')::bool, true) then
    raise exception 'foto nula foi aceita: %', v_r;
  end if;

  raise notice 'prova: % regras com detector=conversa · foto truncada e foto nula recusadas', v_regras;
end $prova$;
