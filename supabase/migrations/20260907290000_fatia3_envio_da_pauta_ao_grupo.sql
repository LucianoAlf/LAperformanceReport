-- FATIA 3 — a Sol passa a FALAR: a pauta vai ao grupo da unidade (07/09/2026).
--
-- 🔴 CINCO TRAVAS, e cada uma existe por um motivo dito. O pedido do Luciano foi
--    literal: "esses agentes têm que ser parceiros, cirúrgicos, e não pode vir
--    com falsos positivos nem falsos negativos". A equipe já convive com o TOM,
--    o Fábio e a Mila — mais um canal de cobrança é o que ela não precisa.
--
--    1. **Interruptor** `radar_pauta_grupo` em `automacoes_config`, e ele nasce
--       DESLIGADO. O primeiro envio real exige um "pode" explícito.
--    2. **Agenda da escola**: dia sem expediente não recebe pauta. Hoje, 07/09,
--       `escola_agenda_v1` diz `feriado` com 0 aulas — mandar cobrança de
--       retenção no feriado da Independência é o oposto de parceiro.
--       ⚠️ RECESSO É DIFERENTE DE FERIADO: no recesso a escola opera (tem
--       atendimento, matrícula, experimental) e a pauta SAI.
--    3. **Nada a dizer = não fala.** Unidade sem item vigente não gera mensagem.
--       Um "tudo certo por aqui" diário é ruído com cara de educação, e ensina
--       a rolar a tela sem ler.
--    4. **Entrega única** por (destinatário, regra, pessoa) a cada 14 dias — já
--       resolvida na migration anterior. Quem já foi avisado vira um NÚMERO no
--       rodapé, não um item repetido.
--    5. **Teto por turno** (8), que já vinha do destinatário.
--
-- ⚠️ ORDEM IMPORTA: a pauta é lida SEM registrar, a mensagem é enfileirada, e
--    só então a entrega é registrada. Na ordem inversa — registrar e depois
--    falhar ao enfileirar — a pessoa ficaria marcada como avisada sem nunca ter
--    sido avisada, e o assunto sumiria por 14 dias. É o mesmo raciocínio do
--    ledger do extrator, que grava DEPOIS do sinal justamente por isso.
--
-- ⚠️ Reusa `fila_relatorios_sol_hermes` (worker `process-sol-report-queue.py`,
--    cron de 1 min na la-hq). Não criar caminho de envio novo: este já sobrevive
--    a queda de sessão, tem retry e deixa `message_id`.

-- ── 1. o item passa a carregar a chave do alvo ─────────────────────────────
-- Sem isso, quem enfileira não consegue registrar a entrega sem recalcular o
-- colapso por pessoa — e recalcular em dois lugares é como nasceram as
-- duplicatas de renovação.
do $item$
declare v_def text; n int; velho text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_pauta_v1' and pronamespace='public'::regnamespace;

  velho := '''sinal_id'',c.sinal_id,''regra'',c.regra_codigo,''severidade'',c.severidade,';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA item: esperava 1, achei %', n; end if;

  v_def := replace(v_def, velho,
    '''sinal_id'',c.sinal_id,''alvo_chave'',c.alvo_chave,' ||
    '''regra'',c.regra_codigo,''severidade'',c.severidade,');

  execute v_def;
  raise notice 'radar_pauta_v1: o item carrega alvo_chave';
end $item$;

revoke all on function public.radar_pauta_v1(text, boolean) from public, anon;
grant execute on function public.radar_pauta_v1(text, boolean) to service_role;

-- ── 2. o interruptor, desligado ────────────────────────────────────────────
insert into automacoes_config (slug, ativo)
values ('radar_pauta_grupo', false)
on conflict (slug) do nothing;

-- ── 3. o envio ─────────────────────────────────────────────────────────────
create or replace function public.radar_enfileirar_pauta_v1(
  p_dry_run boolean default true,
  p_data    date    default null
) returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_dia   date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_turno text := to_char(v_dia,'YYYY-MM-DD') ||
                  case when extract(hour from now() at time zone 'America/Sao_Paulo') < 13
                       then '-manha' else '-tarde' end;
  v_ligado boolean; v_agenda jsonb; v_expediente boolean; v_situacao text;
  v_pauta jsonb; v_b jsonb; v_jid text; v_grupo text; v_id bigint;
  v_out jsonb := '[]'::jsonb; v_enviados int := 0; v_repetidos int;
begin
  select coalesce(ativo,false) into v_ligado from automacoes_config where slug='radar_pauta_grupo';
  if not coalesce(v_ligado,false) and not p_dry_run then
    return jsonb_build_object('ok', false, 'motivo', 'desligado',
      'recado', 'O interruptor radar_pauta_grupo esta off — o primeiro envio real exige um pode explicito.');
  end if;

  -- 🔴 dia sem expediente nao recebe pauta. Recesso NAO e feriado: no recesso a
  --    escola opera e a pauta sai.
  v_agenda := escola_agenda_v1(v_dia, v_dia, null);
  v_expediente := coalesce((v_agenda->0->>'tem_expediente')::boolean, true);
  v_situacao := coalesce(v_agenda->0->>'situacao', 'desconhecido');
  if not v_expediente then
    return jsonb_build_object('ok', true, 'enviados', 0, 'pulado', 'sem_expediente',
      'situacao', v_situacao, 'dia', v_dia,
      'recado', format('%s nao tem expediente (%s) — a Sol cala.', v_dia, v_situacao));
  end if;

  -- ⚠️ SEM registrar: a entrega so e marcada depois que a mensagem entra na fila.
  v_pauta := radar_pauta_v1('sol', false);

  for v_b in select b from jsonb_array_elements(coalesce(v_pauta->'destinatarios','[]'::jsonb)) b loop
    if v_b->>'camada' <> 'operacional' or coalesce(jsonb_array_length(v_b->'itens'),0) = 0 then
      continue;  -- nada a dizer = nao fala
    end if;

    -- o grupo da unidade, descoberto pelo que a Sol JA enviou (mesmo metodo de
    -- `fn_enfileirar_relatorio_presenca` — nao ha tabela de jid para manter)
    select f.jid, f.grupo_nome into v_jid, v_grupo
    from fila_relatorios_sol_hermes f
    where f.grupo_nome ilike 'RELAT%DI%RIOS%'
      and f.status = 'enviada' and f.jid is not null
      and f.unidade_id = (v_b->>'unidade_id')::uuid
    order by f.enviada_em desc limit 1;

    if v_jid is null then
      v_out := v_out || jsonb_build_object('unidade', v_b->>'destinatario',
                                           'pulado', 'grupo_desconhecido');
      continue;
    end if;

    -- quantos ja avisei antes e seguem abertos: vira NUMERO, nunca lista repetida
    select count(*) into v_repetidos
    from radar_entregas e
    join radar_sinais s on s.id = e.sinal_id
    where e.status <> 'erro' and e.criado_em >= now() - interval '14 days'
      and s.unidade_id = (v_b->>'unidade_id')::uuid
      and s.status in ('aberto','triado');

    if p_dry_run then
      v_out := v_out || jsonb_build_object('unidade', v_b->>'destinatario',
        'grupo', v_grupo, 'jid', v_jid, 'itens', jsonb_array_length(v_b->'itens'),
        'repetidos_em_aberto', v_repetidos,
        'texto', (v_b->>'mensagem') ||
          case when v_repetidos > 0
               then chr(10) || chr(10) || '_' || v_repetidos::text ||
                    ' que mandei antes seguem abertos._' else '' end);
      continue;
    end if;

    if exists (select 1 from fila_relatorios_sol_hermes
                where tipo_relatorio = 'radar_pauta'
                  and unidade_id = (v_b->>'unidade_id')::uuid
                  and data_dia = v_dia
                  and metadata->>'turno' = v_turno
                  and status <> 'erro') then
      v_out := v_out || jsonb_build_object('unidade', v_b->>'destinatario',
                                           'pulado', 'ja_enfileirado_neste_turno');
      continue;
    end if;

    insert into fila_relatorios_sol_hermes
      (tipo_relatorio, origem, unidade_id, unidade_nome, jid, grupo_nome,
       texto, status, agendada_para, data_dia, tentativas, metadata)
    values
      ('radar_pauta', 'auto_cron', (v_b->>'unidade_id')::uuid,
       replace(v_b->>'destinatario','Secretaria — ',''), v_jid, v_grupo,
       (v_b->>'mensagem') ||
         case when v_repetidos > 0
              then chr(10) || chr(10) || '_' || v_repetidos::text ||
                   ' que mandei antes seguem abertos._' else '' end,
       'sol_pendente', now(), v_dia, 0,
       jsonb_build_object('rota','sol_hermes_native','fonte','radar_pauta_v1',
                          'turno', v_turno, 'itens', jsonb_array_length(v_b->'itens')))
    returning id into v_id;

    -- 🔴 SO AGORA a entrega e registrada. Registrar antes e falhar aqui deixaria
    --    a pessoa marcada como avisada sem ter sido — e o assunto sumiria por 14
    --    dias.
    insert into radar_entregas
      (destinatario_id, sinal_id, agente, canal, chave_idem, alvo_chave, status, mensagem)
    select d.id, (i->>'sinal_id')::uuid, 'sol', 'grupo',
           (v_b->>'destinatario')||'|'||(i->>'sinal_id')||'|'||v_turno,
           i->>'alvo_chave', 'pendente', 'fila:'||v_id
    from jsonb_array_elements(v_b->'itens') i
    join radar_destinatarios d
      on d.agente='sol' and d.camada='operacional'
     and d.unidade_id = (v_b->>'unidade_id')::uuid and d.ativo
    on conflict (chave_idem) do nothing;

    v_enviados := v_enviados + 1;
    v_out := v_out || jsonb_build_object('unidade', v_b->>'destinatario',
      'grupo', v_grupo, 'fila_id', v_id,
      'itens', jsonb_array_length(v_b->'itens'), 'repetidos_em_aberto', v_repetidos);
  end loop;

  return jsonb_build_object('ok', true, 'dia', v_dia, 'turno', v_turno,
    'situacao_do_dia', v_situacao, 'dry_run', p_dry_run,
    'enviados', v_enviados, 'unidades', v_out);
end; $function$;

comment on function public.radar_enfileirar_pauta_v1(boolean, date) is
  'Enfileira a pauta operacional no grupo de cada unidade. Cinco travas: interruptor radar_pauta_grupo (nasce off), agenda da escola (feriado/domingo nao recebe; recesso SIM), nada-a-dizer-nao-fala, entrega unica por pessoa em 14 dias e teto por turno. A entrega e registrada DEPOIS de enfileirar — a ordem inversa marcaria como avisado quem nunca foi.';

revoke all on function public.radar_enfileirar_pauta_v1(boolean, date) from public, anon;
grant execute on function public.radar_enfileirar_pauta_v1(boolean, date) to service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v jsonb; v_pessoas int; v_rep int;
begin
  -- ⚠️ limpa o ensaio da migration anterior: entrega de teste nao pode impedir
  --    o envio real. A prova de la estava ERRADA (assertei que a 2a leitura
  --    traria MENOS itens; com fila mais funda que o teto, ela traz outros 24 —
  --    o certo era medir repeticao de PESSOA, que deu ZERO).
  delete from radar_entregas where enviado_em is null and mensagem is null;

  -- 🔴 hoje e feriado: a Sol tem de calar.
  -- ⚠️ Em ENSAIO, porque o interruptor e avaliado ANTES da agenda (ordem certa:
  --    desligado nao faz trabalho nenhum) e devolveria `desligado` primeiro. O
  --    ensaio atravessa o interruptor de proposito — e para isso que ele serve:
  --    mostrar o que ACONTECERIA, inclusive "hoje eu ficaria calada".
  v := radar_enfileirar_pauta_v1(true, current_date);
  if v->>'pulado' is distinct from 'sem_expediente' then
    raise exception 'em dia sem expediente a Sol deveria calar, e devolveu: %', v;
  end if;
  if v->>'situacao' is null then
    raise exception 'a recusa nao disse qual e a situacao do dia';
  end if;

  -- ⚠️ desligado + dia util = recusa pelo interruptor
  v := radar_enfileirar_pauta_v1(false, current_date + 1);
  if v->>'motivo' is distinct from 'desligado' then
    raise exception 'com o interruptor off o envio real deveria recusar, e devolveu: %', v;
  end if;

  -- ensaio em dia util: tem de montar texto para as 3 unidades
  v := radar_enfileirar_pauta_v1(true, current_date + 1);
  if jsonb_array_length(coalesce(v->'unidades','[]'::jsonb)) = 0 then
    raise exception 'o ensaio nao montou nada — a prova nao exercitou o caminho feliz';
  end if;

  raise notice 'prova: feriado cala (%) · interruptor off recusa · ensaio monta % unidades',
    (radar_enfileirar_pauta_v1(true, current_date))->>'situacao',
    jsonb_array_length(v->'unidades');
end $prova$;
