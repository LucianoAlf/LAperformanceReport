-- R19 E R20 PASSAM A EMITIR, E A PAUTA VELHA E LIMPA (06/09/2026).
--
-- A migration anterior fez R15/R16/R17 exigirem `estado = cobrar`, o que para o
-- ruido de amanha em diante. Faltavam duas coisas para o ciclo fechar:
--
--   1. NINGUEM EMITIA R19/R20. As regras existiam em `radar_regras` e nenhum
--      bloco as gerava — os 24 leads de conversa resolvida simplesmente sumiriam
--      da pauta. Sumir e melhor que cobrar errado, mas nao e o que foi pedido:
--      o motivo continua faltando, e e ele que fecha o caso.
--
--   2. OS SINAIS JA ABERTOS CONTINUAVAM ABERTOS. Os 24 R15 de "Ligar HOJE" tem
--      `expira_em` de 30 dias — sem tocar neles, a Daiana veria o mesmo ruido
--      amanha de manha, com a correcao ja no ar. **Corrigir a regra nao conserta
--      a lista que ja existe.**
--
-- ⚠️ A pauta velha e ARQUIVADA com motivo, nao deletada: `status='resolvido'` +
--    `resolucao` dizendo por que. Sinal apagado sem rastro impede saber depois
--    se a troca foi boa.

-- ── os dois blocos novos, no fim da funcao ────────────────────────────────
do $patch$
declare
  v_def text; v_novo text; v_n int;
  ANC constant text := '  return jsonb_build_object(
    ''ok'', true, ''competencia'', v_competencia, ''semana'', v_semana,';
  BLOCOS constant text := $b$  -- R19 — a consultora ENCERROU a conversa e o motivo nao foi registrado.
  -- Nao pede ligacao: pede a palavra que falta.
  with alvo as (
    select j.*, l.chatwoot_status, l.chatwoot_ultima_msg_em
    from public.vw_jornada_lead_v1 j
    join public.leads l on l.id = j.lead_id
    where j.etapa in ('experimental_realizada','experimental_faltou','experimental_agendada')
      and not j.converteu
      and j.motivo_nao_matricula is null
      and j.dias_parado > 2 and j.dias_parado <= 30
      and j.entrou_em >= v_hoje - 120
      and public.fn_lead_estado_pauta_v1(j.lead_id) = 'pedir_motivo'
  ), ins as (
    insert into public.radar_sinais
      (entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal, severidade,
       canonico, origem, dominio, contexto, interpretacao, orientacao, evidencia,
       identificacao, detectado_em, competencia, expira_em, chave_dedup, status, regra_versao)
    select 'lead', a.lead_id, a.unidade_id, 'R19', 'conversa_encerrada_sem_motivo', r.severidade_padrao,
           true, 'sql_comercial', 'comercial',
           'Você encerrou a conversa de ' || a.nome ||
             coalesce(' em ' || to_char(a.chatwoot_ultima_msg_em at time zone 'America/Sao_Paulo', 'DD/MM'), '') ||
             ', mas o motivo não ficou registrado.',
           r.lastro, r.orientacao_padrao,
           jsonb_build_object(
             'etapa', a.etapa, 'dias_parado', a.dias_parado,
             'chatwoot_status', a.chatwoot_status,
             'ultima_mensagem_em', a.chatwoot_ultima_msg_em,
             'curso', a.curso_interesse, 'telefone', a.telefone),
           jsonb_build_object('metodo','jornada_lead+chatwoot','confianca',1.0,'lead_id',a.lead_id),
           now(), v_competencia, (v_hoje + 30)::timestamptz,
           'R19|lead|' || a.lead_id || '|' || v_semana, 'aberto', r.versao
    from alvo a cross join (select * from public.radar_regras where codigo='R19') r
    on conflict (chave_dedup) do nothing
    returning 1
  ) select count(*) into v_r19 from ins;

  -- R20 — ela falou por ultimo e o cliente sumiu. Ligar de novo repete o que ja
  -- foi feito; o que falta e decidir se ainda vale.
  with alvo as (
    select j.*, l.chatwoot_ultima_msg_em
    from public.vw_jornada_lead_v1 j
    join public.leads l on l.id = j.lead_id
    where j.etapa in ('experimental_realizada','experimental_faltou','experimental_agendada')
      and not j.converteu
      and j.motivo_nao_matricula is null
      and j.dias_parado > 2 and j.dias_parado <= 30
      and j.entrou_em >= v_hoje - 120
      and public.fn_lead_estado_pauta_v1(j.lead_id) = 'oferecer_fechar'
  ), ins as (
    insert into public.radar_sinais
      (entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal, severidade,
       canonico, origem, dominio, contexto, interpretacao, orientacao, evidencia,
       identificacao, detectado_em, competencia, expira_em, chave_dedup, status, regra_versao)
    select 'lead', a.lead_id, a.unidade_id, 'R20', 'cliente_em_silencio', r.severidade_padrao,
           true, 'sql_comercial', 'comercial',
           'Você mandou a última mensagem para ' || a.nome ||
             coalesce(' em ' || to_char(a.chatwoot_ultima_msg_em at time zone 'America/Sao_Paulo', 'DD/MM'), '') ||
             ' e não teve retorno desde então.',
           r.lastro, r.orientacao_padrao,
           jsonb_build_object(
             'etapa', a.etapa, 'dias_parado', a.dias_parado,
             'ultima_mensagem_em', a.chatwoot_ultima_msg_em,
             'dias_de_silencio',
               (v_hoje - (a.chatwoot_ultima_msg_em at time zone 'America/Sao_Paulo')::date),
             'curso', a.curso_interesse, 'telefone', a.telefone),
           jsonb_build_object('metodo','jornada_lead+chatwoot','confianca',1.0,'lead_id',a.lead_id),
           now(), v_competencia, (v_hoje + 30)::timestamptz,
           'R20|lead|' || a.lead_id || '|' || v_semana, 'aberto', r.versao
    from alvo a cross join (select * from public.radar_regras where codigo='R20') r
    on conflict (chave_dedup) do nothing
    returning 1
  ) select count(*) into v_r20 from ins;

$b$;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'radar_detectar_sinais_comercial_v1';
  if position('''R19''' in v_def) > 0 then
    raise notice 'R19/R20 ja emitem — nada a fazer';
    return;
  end if;

  v_n := (length(v_def) - length(replace(v_def, ANC, ''))) / length(ANC);
  if v_n <> 1 then
    raise exception 'ancora do return: esperava 1, achei %', v_n;
  end if;

  v_novo := replace(v_def, '  v_r15 int := 0; v_r16 int := 0; v_r17 int := 0;',
                           '  v_r15 int := 0; v_r16 int := 0; v_r17 int := 0; v_r19 int := 0; v_r20 int := 0;');
  v_novo := replace(v_novo, ANC, BLOCOS || ANC);
  v_novo := replace(v_novo,
    '    ''total'', v_r15 + v_r16 + v_r17);',
    '    ''R19_conversa_encerrada_sem_motivo'', v_r19,' || E'\n' ||
    '    ''R20_cliente_em_silencio'', v_r20,' || E'\n' ||
    '    ''total'', v_r15 + v_r16 + v_r17 + v_r19 + v_r20);');
  execute v_novo;
  raise notice 'R19 e R20 passaram a emitir';
end $patch$;

revoke all on function public.radar_detectar_sinais_comercial_v1() from public, anon;
grant execute on function public.radar_detectar_sinais_comercial_v1() to service_role;

-- ── a pauta velha: arquiva o que virou ruido ──────────────────────────────
-- ⚠️ Sem isto a correcao so valeria para sinais NOVOS, e a Daiana veria a mesma
--    lista amanha. Corrigir a regra nao conserta a lista que ja existe.
-- ⚠️ `improcedente` + `falso_positivo` sao os valores exatos que a tabela ja
--    tem para isto — o sinal nao foi resolvido pela equipe, ele NAO DEVERIA
--    TER EXISTIDO. Marcar como 'resolvido' contaria como trabalho feito e
--    sujaria a medicao de eficacia do radar.
update public.radar_sinais s
   set status = 'improcedente',
       desfecho = 'falso_positivo',
       desfecho_nota = 'Arquivado em 06/09/2026: a conversa no Chatwoot está '
                   || coalesce((select l.chatwoot_status from leads l where l.id = s.entidade_id), '?')
                   || ' — este sinal pedia ligação sobre um caso que a consultora já encerrou. '
                   || 'Substituído por R19/R20.',
       desfecho_em = now()
 where s.regra_codigo in ('R15','R16','R17')
   and s.status = 'aberto' and s.entidade_tipo = 'lead'
   and public.fn_lead_estado_pauta_v1(s.entidade_id) <> 'cobrar';

-- ── prova: roda a deteccao e confere o resultado ──────────────────────────
do $prova$
declare v jsonb; v_ruido int; v_r19 int; v_r20 int;
begin
  v := radar_detectar_sinais_comercial_v1();
  if not (v->>'ok')::bool then raise exception 'deteccao falhou: %', v; end if;

  -- nenhum sinal de cobranca pode sobrar sobre conversa encerrada
  select count(*) into v_ruido from radar_sinais s
   where s.regra_codigo in ('R15','R16','R17') and s.status = 'aberto'
     and s.entidade_tipo = 'lead'
     and fn_lead_estado_pauta_v1(s.entidade_id) <> 'cobrar';
  if v_ruido > 0 then
    raise exception '% sinais de "ligar hoje" ainda apontam para conversa encerrada', v_ruido;
  end if;

  select count(*) into v_r19 from radar_sinais where regra_codigo='R19' and status='aberto';
  select count(*) into v_r20 from radar_sinais where regra_codigo='R20' and status='aberto';
  if v_r19 = 0 then
    raise exception 'R19 nao gerou nenhum sinal — os 24 casos medidos sumiram em vez de virar pauta';
  end if;

  raise notice 'pauta limpa: 0 cobrancas sobre conversa encerrada · R19=% · R20=% · detectados=%',
    v_r19, v_r20, v->>'total';
end $prova$;
