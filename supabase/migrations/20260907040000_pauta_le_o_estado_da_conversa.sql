-- A PAUTA DO DIA PASSA A LER O ESTADO DA CONVERSA (06/09/2026).
--
-- Regra do Alf, a partir do achado da Daiana: **"resolvida nao vem no
-- relatorio; aberta vem a cobranca"**. O estado da conversa no Chatwoot e
-- declaracao da consultora, e passa a mandar no que a pauta pede.
--
-- MEDIDO nos 115 sinais R15/R16/R17 abertos hoje:
--
--   sem espelho (mantem a cobranca de hoje) ............ 51
--   aberta e viva -> "ligar hoje" ...................... 31
--   RESOLVIDA -> hoje diz "ligar hoje" ................. 24  ← 21% de RUIDO
--   aberta, cliente em silencio 7d+ .................... 9
--
-- E os SEIS leads que a Daiana citou nominalmente estao todos `resolved`.
-- Ela estava certa em cada um.
--
-- 🔴 RESOLVER NAO APAGA O LEAD. Se resolvesse, viraria botao de silenciar a
--    lista. Conversa resolvida deixa de pedir LIGACAO e passa a pedir o
--    MOTIVO — que e a lacuna real, e a unica coisa que fecha o caso de
--    verdade. Quantos ficam resolvidos sem motivo vira numero medivel.
--
-- ⚠️ SEM ESPELHO MANTEM A COBRANCA. Ausencia de informacao nao pode virar
--    silencio: seria o mesmo erro da agenda da escola, onde "nao sei" quase
--    virou "fechado". 51 dos 115 estao nessa faixa hoje (conversa mais velha
--    que a janela de 14 dias da varredura, ou lead sem conversa).
--
-- ⚠️ ESPELHO VELHO NAO VALE. `chatwoot_espelhado_em` mais velho que 2 dias e
--    tratado como ausente — a varredura pode ter parado e um "resolvida" de
--    duas semanas atras nao descreve mais a conversa de hoje.

-- ── o veredito do estado da conversa, em UM lugar so ───────────────────────
-- Cinco blocos consultam isto. Se a regra morasse em cada um, ela divergiria —
-- e regra de negocio duplicada foi a causa-raiz das duplicatas de renovacao.
create or replace function public.fn_lead_estado_pauta_v1(p_lead_id bigint)
returns text language sql stable security definer set search_path to 'public' as $function$
  select case
    -- espelho ausente ou velho: nao sei, entao cobro (comportamento de hoje)
    when l.chatwoot_status is null
      or l.chatwoot_espelhado_em is null
      or l.chatwoot_espelhado_em < now() - interval '2 days' then 'cobrar'
    when l.chatwoot_status = 'resolved' then 'pedir_motivo'
    -- aberta, mas quem falou por ultimo foi a equipe e o cliente sumiu:
    -- nao e caso de ligar de novo, e caso de decidir se ainda vale
    when l.chatwoot_ultima_msg_de = 'equipe'
     and l.chatwoot_ultima_msg_em < now() - interval '7 days' then 'oferecer_fechar'
    else 'cobrar' end
  from leads l where l.id = p_lead_id;
$function$;

comment on function public.fn_lead_estado_pauta_v1(bigint) is
  'O que a pauta deve PEDIR sobre este lead, a partir do estado da conversa no Chatwoot: '
  'cobrar (ligar hoje) | pedir_motivo (a consultora ja encerrou) | oferecer_fechar '
  '(ela falou por ultimo e o cliente sumiu ha 7+ dias). Espelho ausente ou com mais de '
  '2 dias devolve `cobrar`: ausencia de informacao nunca vira silencio.';

revoke all on function public.fn_lead_estado_pauta_v1(bigint) from public, anon;
grant execute on function public.fn_lead_estado_pauta_v1(bigint) to service_role, authenticated;

-- ── as duas regras novas ───────────────────────────────────────────────────
insert into public.radar_regras
  (codigo, titulo, descricao, entidade_tipo, origem, severidade_padrao, canonico, ativo,
   lastro, orientacao_padrao, versao, dominio)
values
  ('R19', 'Conversa encerrada e o motivo não foi registrado',
   'A consultora resolveu a conversa no Chatwoot — ela só resolve o que acabou — mas o CRM '
   'ficou sem motivo de não-matrícula. Não é caso de ligar: é caso de capturar o motivo.',
   'lead', 'sql_comercial', 'atencao', true, true,
   'A consultora declara o desfecho resolvendo a conversa. Medido em 06/09/2026: 24 dos 115 '
   'sinais de pauta eram de conversa já resolvida, e os 6 casos apontados pela Daiana estavam '
   'todos resolvidos.',
   'NÃO peça para ligar. Pergunte em uma linha o que houve — "achou caro", "horário não '
   'batia", "vai pensar" — e registre com registrar_motivo_perda. Se ela disser que quer ser '
   'procurada mais pra frente, use registrar_retomada com a frase dela.',
   'v1', 'comercial'),
  ('R20', 'Você falou por último e o cliente sumiu',
   'Conversa aberta, a última mensagem é da equipe e o cliente não responde há 7 dias ou mais. '
   'Ligar de novo repete o que já foi feito; o que falta é decidir se ainda vale.',
   'lead', 'sql_comercial', 'atencao', true, true,
   'Medido em 06/09/2026: 9 dos 115 sinais de pauta estavam nesse estado, e 27 das 39 conversas '
   'abertas tinham a última mensagem escrita pela equipe.',
   'Ofereça as duas saídas e deixe ela escolher: marcar como resolvida (e aí me diga o motivo) '
   'ou manter aberta com um lembrete de retomada em data que ela escolher. Não decida por ela.',
   'v1', 'comercial')
on conflict (codigo) do update set
  titulo = excluded.titulo, descricao = excluded.descricao,
  lastro = excluded.lastro, orientacao_padrao = excluded.orientacao_padrao,
  ativo = true, atualizada_em = now();

-- ── as tres regras existentes passam a exigir `cobrar` ─────────────────────
do $patch$
declare
  v_def text; v_novo text; v_n int; v_anc text;
  ANCORAS constant text[] := array[
    '      and j.motivo_nao_matricula is null',                       -- R15
    '      and j.experimental_agendada_para >= v_hoje - 30   -- fora disso e higiene de cadastro, nao pauta',  -- R16
    '      and j.dias_parado > 2'                                      -- R17
  ];
  FILTRO constant text :=
    E'\n      -- ⚠️ so cobra ligacao quando a conversa NAO foi encerrada pela'
    || E'\n      --    consultora. Ver fn_lead_estado_pauta_v1 — R19 e R20 pegam o resto.'
    || E'\n      and public.fn_lead_estado_pauta_v1(j.lead_id) = ''cobrar''';
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'radar_detectar_sinais_comercial_v1';
  if v_def is null then raise exception 'a funcao de sinais nao existe'; end if;
  if position('fn_lead_estado_pauta_v1' in v_def) > 0 then
    raise notice 'a pauta ja le o estado da conversa — nada a fazer';
    return;
  end if;

  v_novo := v_def;
  foreach v_anc in array ANCORAS loop
    v_n := (length(v_novo) - length(replace(v_novo, v_anc, ''))) / length(v_anc);
    if v_n <> 1 then
      raise exception 'ancora "%": esperava 1 ocorrencia, achei %', left(v_anc, 45), v_n;
    end if;
    v_novo := replace(v_novo, v_anc, v_anc || FILTRO);
  end loop;

  execute v_novo;
  raise notice 'R15, R16 e R17 passaram a exigir estado = cobrar';
end $patch$;

revoke all on function public.radar_detectar_sinais_comercial_v1() from public, anon;
grant execute on function public.radar_detectar_sinais_comercial_v1() to service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_cobrar int; v_motivo int; v_fechar int; v_sem int; v_r19 int; v_r20 int;
begin
  select count(*) filter (where e = 'cobrar'),
         count(*) filter (where e = 'pedir_motivo'),
         count(*) filter (where e = 'oferecer_fechar')
    into v_cobrar, v_motivo, v_fechar
  from (select fn_lead_estado_pauta_v1(s.entidade_id) e
          from radar_sinais s
         where s.regra_codigo in ('R15','R16','R17') and s.status = 'aberto'
           and s.entidade_tipo = 'lead') x;

  -- ⚠️ Os tres baldes tem de somar o total: se um lead escapar de todos, ele
  --    some da pauta em silencio — que e o defeito que estamos corrigindo, ao
  --    contrario.
  if v_cobrar + v_motivo + v_fechar
     <> (select count(*) from radar_sinais where regra_codigo in ('R15','R16','R17')
          and status = 'aberto' and entidade_tipo = 'lead') then
    raise exception 'os baldes nao somam o total — ha lead sem veredito';
  end if;

  select count(*) into v_r19 from radar_regras where codigo = 'R19' and ativo;
  select count(*) into v_r20 from radar_regras where codigo = 'R20' and ativo;
  if v_r19 <> 1 or v_r20 <> 1 then
    raise exception 'R19/R20 nao ficaram ativas';
  end if;

  -- os 6 casos da Daiana tem de sair da cobranca
  select count(*) into v_sem from leads
   where id in (13771, 11839, 13418, 13715, 13439, 13354)
     and fn_lead_estado_pauta_v1(id) = 'cobrar';
  if v_sem > 0 then
    raise exception '% dos 6 casos da Daiana ainda pediriam ligacao', v_sem;
  end if;

  raise notice 'pauta lendo a conversa: cobrar=% · pedir_motivo=% · oferecer_fechar=% · os 6 da Daiana sairam da cobranca',
    v_cobrar, v_motivo, v_fechar;
end $prova$;
