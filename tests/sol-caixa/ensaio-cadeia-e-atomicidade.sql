-- Cadeia real do lote e ATOMICIDADE, contra banco isolado.
--
--   docker exec sol-ensaio psql -U postgres -d ensaio -v ON_ERROR_STOP=1 \
--     -f ensaio-cadeia-e-atomicidade.sql
--
-- 🔴 POR QUE ISTO NÃO PODE SER MOCK. O teste de runtime que eu chamei de "ponta
--    a ponta" mocka `resolverMultiFn` E `lancarLoteFn` — prova a fiação em
--    JavaScript e mais nada. Precedente: em 01/09 um lote aprovado de R$ 1.722
--    gravou R$ 432 e a Sol anunciou "nenhum item foi lançado parcialmente",
--    justamente porque a validação tinha sido feita com o `lancarLoteFn` mockado.
--
-- Prova, em ordem:
--   A. resolver → lista plana → `sol_caixa_validar_multi_aluno_snapshot_v1`
--      (LEITURA: o mesmo caminho que o "pode" percorre)
--   B. CAMINHO FELIZ REAL: evento + preview + approval V3 válidos, o lote grava
--      N linhas e a soma fecha
--   C. 🔴 ATOMICIDADE POR FALHA INJETADA no SEGUNDO insert — não por recusa
--      antes do laço. Recusa pré-laço não prova rollback nenhum: prova que o
--      portão funciona, que é outra coisa.
--
-- ⚠️ B e C ESCREVEM. Tudo dentro de uma transação que termina em ROLLBACK, e o
--    ensaio confere no fim que o banco voltou — não confia, verifica. Só faz
--    sentido em banco isolado; contra produção é proibido.

\set ON_ERROR_STOP on

begin;

-- Gatilho EXCLUSIVO de teste: derruba o SEGUNDO insert de movimentação.
-- É o que transforma "o lote recusou" em "o lote gravou metade e voltou tudo".
create or replace function pg_temp.ensaio_falha_no_segundo() returns trigger
language plpgsql as $trg$
declare v_n int;
begin
  v_n := coalesce(current_setting('ensaio.inserts', true), '0')::int + 1;
  perform set_config('ensaio.inserts', v_n::text, true);
  if v_n = 2 then
    raise exception 'ENSAIO_FALHA_INJETADA: derrubando o segundo insert de propósito';
  end if;
  return new;
end $trg$;

do $cadeia$
declare
  v_unidade uuid := '11111111-1111-1111-1111-111111111111';
  v_falhas  text[] := '{}';
  v_itens   jsonb;
  v_r       jsonb;
  v_snap    jsonb;
  v_total   numeric;
  v_n       int;
  v_caixa   uuid;
  v_evento  uuid;
  v_preview uuid;
  v_approval uuid;
  v_payload jsonb;
  v_res     jsonb;
  v_erro    text;
  v_movs_antes int; v_movs_depois int;
  v_lotes_antes int; v_itens_antes int;
  -- 🔴 DATA DE NEGOCIO E BRT. `current_date` no banco e UTC: das 21h BRT a
  --    meia-noite ele ja e o dia seguinte, e a canonica recusa com
  --    "p_as_of_date nao pode estar no futuro". Foi exatamente o que este
  --    ensaio pegou as 21h — a MESMA armadilha que a migration 210000 corrige
  --    no resolver. Quem passar `current_date` como `data` no payload leva o
  --    mesmo erro em producao, nessa faixa do dia.
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  ------------------------------------------------------- A) cadeia de LEITURA
  -- ⚠️ O VALOR DECLARADO É OBRIGATÓRIO na fixture: sem ele a composta recusa
  --    com `valor_total_invalido`, a cascata cai na canônica e o caso N×M —
  --    que é o ponto do ensaio — nunca acontece.
  select jsonb_agg(jsonb_build_object('aluno_nome', nome, 'valor', soma)) into v_itens
    from (
      (select a.nome,
              (select sum(coalesce(f.valor_pago, f.valor_original))
                 from public.emusys_faturas f
                where f.emusys_student_id = a.emusys_student_id::bigint
                  and f.competencia = date_trunc('month', v_hoje)::date) as soma
         from public.alunos a
        where a.unidade_id = v_unidade and a.is_segundo_curso is not true
          and (select count(*) from public.emusys_faturas f
                where f.emusys_student_id = a.emusys_student_id::bigint
                  and f.competencia = date_trunc('month', v_hoje)::date) >= 2
        order by a.id limit 1)
      union all
      (select a.nome,
              (select sum(coalesce(f.valor_pago, f.valor_original))
                 from public.emusys_faturas f
                where f.emusys_student_id = a.emusys_student_id::bigint
                  and f.competencia = date_trunc('month', v_hoje)::date) as soma
         from public.alunos a
        where a.unidade_id = v_unidade and a.is_segundo_curso is not true
          and (select count(*) from public.emusys_faturas f
                where f.emusys_student_id = a.emusys_student_id::bigint
                  and f.competencia = date_trunc('month', v_hoje)::date) = 1
        order by a.id limit 1)) x;

  if v_itens is null or jsonb_array_length(v_itens) < 2 then
    raise exception 'FIXTURE AUSENTE: preciso de um aluno composto e um simples';
  end if;

  v_r := public.sol_caixa_resolver_pagamento_itens_v1(v_unidade, v_itens, null, null);
  if not coalesce((v_r->>'ok')::boolean, false) then
    raise exception 'A) o resolver recusou a fixture: %', coalesce(v_r->>'motivo','<nulo>');
  end if;
  v_n     := jsonb_array_length(v_r->'itens');
  v_total := (v_r->>'soma_itens')::numeric;
  raise notice 'A) resolver: % alunos declarados -> % linhas planas, R$ %',
    jsonb_array_length(v_itens), v_n, v_total;

  -- 2 alunos com um deles composto TEM de virar 3+ linhas.
  if v_n <= jsonb_array_length(v_itens) then
    v_falhas := v_falhas || format(
      'A) %s alunos viraram %s linhas — o caso composto (N x M) nao foi exercitado',
      jsonb_array_length(v_itens), v_n);
  end if;

  -- é ESTE array que o "pode" revalida
  v_snap := public.sol_caixa_validar_multi_aluno_snapshot_v1(v_unidade, v_r->'itens', v_total, null);
  if not coalesce((v_snap->>'ok')::boolean, false) then
    v_falhas := v_falhas || format('A) o snapshot RECUSOU a lista plana do resolver: %s',
      coalesce(v_snap->>'motivo','<nulo>'));
  else
    if jsonb_array_length(v_snap->'itens') <> v_n then
      v_falhas := v_falhas || format(
        'A) snapshot devolveu %s itens para %s de entrada — foi assim que o R$ 1.290 do Davi sumiu em 01/09',
        jsonb_array_length(v_snap->'itens'), v_n);
    end if;
    if abs((v_snap->>'soma_itens')::numeric - v_total) > 0.01 then
      v_falhas := v_falhas || format('A) soma do snapshot %s != resolver %s',
        v_snap->>'soma_itens', v_total);
    end if;
  end if;

  --------------------------------------------- trilho V3 (o que o "pode" usa)
  -- ⚠️ O ATOR PRECISA ESTAR NA MATRIZ. `sol_caixa_autorizar_payload_v1` so
  --    autoriza por grupo financeiro oficial OU por linha explicita em
  --    `sol_caixa_autorizados` — nao existe "qualquer um que mandou mensagem".
  --    Sem isso o lote recusa com `ator_nao_autorizado_v3` ANTES do laco, e a
  --    atomicidade fica sem prova (foi o que aconteceu duas rodadas atras).
  insert into public.sol_caixa_autorizados (unidade_id, numero, nome, papel, operacoes, ativo)
  values (v_unidade, '5521999999999', 'Ensaio', 'adm', array['todas'], true)
  on conflict do nothing;

  insert into public.caixas_diarios (unidade_id, data_caixa, status)
  values (v_unidade, v_hoje, 'aberto') returning id into v_caixa;

  -- ⚠️ O evento V3 guarda HASHES, nao o chat em claro: `chat_id_hash`,
  --    `sender_id_hash`. E o desenho certo — o ledger de aprovacao nao precisa
  --    saber o telefone de ninguem para provar quem autorizou.
  insert into public.sol_caixa_shadow_eventos_v1
    (event_id_hash, chat_id_hash, sender_id_hash, unidade_id, source, mode, status)
  --    ⚠️ `chat_id_hash` e md5 do jid EXATO: a RPC compara
  --       `v_e.chat_id_hash <> md5(v_chat)`. Hash de fantasia passa na insercao
  --       e reprova no "pode".
  values ('EVT-'||gen_random_uuid()::text, md5('ensaio@g.us'), 'ATOR-HASH-ENSAIO',
          v_unidade, 'ensaio', 'shadow', 'ok')
  returning id into v_evento;

  -- ⚠️ `pending.itens` tem de ser IDENTICO ao payload: a RPC compara os dois com
  --    `is distinct from`. É a trava que impede aprovar um card e gravar outro.
  insert into public.sol_caixa_shadow_previews_v1
    (evento_id, preview_hash, unidade_id, operacao, categoria, valor_centavos, forma, status, preview_json)
  values (v_evento, 'PRV-'||gen_random_uuid()::text, v_unidade, 'entrada', 'parcela',
          round(v_total*100)::int, 'pix', 'public_preview_sent',
          jsonb_build_object('pending', jsonb_build_object(
            'tipoOperacao','lancar_recebimento_lote', 'itens', v_r->'itens')))
  returning id into v_preview;

  insert into public.sol_caixa_shadow_approvals_v1
    (preview_id, decision, actor_id_hash, approval_event_hash)
  values (v_preview, 'approved', 'ATOR-HASH-ENSAIO', 'APV-'||gen_random_uuid()::text)
  returning id into v_approval;

  v_payload := jsonb_build_object(
    'unidade_id', v_unidade,
    'data', v_hoje,
    'itens', v_r->'itens',
    'valor', v_total,
    'forma', 'pix',
    'categoria', 'parcela',
    'chat_id', 'ensaio@g.us',
    'grupo_jid', 'ensaio@g.us',
    'origem_message_id', 'ENSAIO1',
    'preview_message_id', 'ENSAIOP1',
    'idempotency_key', 'ensaio:' || gen_random_uuid()::text,
    'autorizado_por', 'Ensaio',
    'ator_numero', '5521999999999',
    'ator_papel', 'adm',
    'v3_preview_id', v_preview,
    'v3_approval_id', v_approval,
    'v3_actor_id_hash', 'ATOR-HASH-ENSAIO',
    'v3_preview_hash', (select preview_hash from public.sol_caixa_shadow_previews_v1 where id = v_preview),
    'v3_approval_event_hash', (select approval_event_hash from public.sol_caixa_shadow_approvals_v1 where id = v_approval));

  ------------------------------------------------------- B) caminho feliz REAL
  select count(*) into v_movs_antes from public.caixa_movimentacoes;
  begin
    v_res := public.sol_caixa_lancar_recebimento_lote_v1(v_payload);
  exception when others then
    v_res := jsonb_build_object('ok', false, 'motivo', 'excecao: ' || SQLERRM);
  end;
  select count(*) into v_movs_depois from public.caixa_movimentacoes;

  if not coalesce((v_res->>'ok')::boolean, false) then
    v_falhas := v_falhas || format(
      'B) o lote nao chegou ao laco: recusado com "%s". A atomicidade (C) so vale se o caminho feliz gravar antes.',
      coalesce(v_res->>'motivo','<nulo>'));
    if v_movs_depois <> v_movs_antes then
      v_falhas := v_falhas || format('B) lote RECUSADO mas gravou %s movimentacoes',
        v_movs_depois - v_movs_antes);
    end if;
  else
    if v_movs_depois - v_movs_antes <> v_n then
      v_falhas := v_falhas || format('B) gravou %s movimentacoes para %s itens',
        v_movs_depois - v_movs_antes, v_n);
    end if;
    if abs((select coalesce(sum(valor),0) from public.caixa_movimentacoes
             where caixa_diario_id = v_caixa) - v_total) > 0.01 then
      v_falhas := v_falhas || 'B) a soma gravada no caixa nao bate com o total aprovado'::text;
    end if;
    raise notice 'B) caminho feliz: % movimentacoes, R$ %', v_movs_depois - v_movs_antes, v_total;
  end if;

  ------------------------------- C) ATOMICIDADE por falha injetada no 2º insert
  -- Novo par preview/approval e nova chave: a idempotencia devolveria o lote
  -- anterior e o teste passaria sem executar o laco.
  select count(*), (select count(*) from public.sol_caixa_lotes_v1),
         (select count(*) from public.sol_caixa_lote_itens_v1)
    into v_movs_antes, v_lotes_antes, v_itens_antes
    from public.caixa_movimentacoes;

  insert into public.sol_caixa_shadow_previews_v1
    (evento_id, preview_hash, unidade_id, operacao, categoria, valor_centavos, forma, status, preview_json)
  values (v_evento, 'PRV-'||gen_random_uuid()::text, v_unidade, 'entrada', 'parcela',
          round(v_total*100)::int, 'pix', 'public_preview_sent',
          jsonb_build_object('pending', jsonb_build_object(
            'tipoOperacao','lancar_recebimento_lote', 'itens', v_r->'itens')))
  returning id into v_preview;
  insert into public.sol_caixa_shadow_approvals_v1
    (preview_id, decision, actor_id_hash, approval_event_hash)
  values (v_preview, 'approved', 'ATOR-HASH-ENSAIO', 'APV-'||gen_random_uuid()::text)
  returning id into v_approval;

  v_payload := v_payload
    || jsonb_build_object('idempotency_key', 'ensaio:' || gen_random_uuid()::text)
    || jsonb_build_object('v3_preview_id', v_preview, 'v3_approval_id', v_approval,
         'v3_preview_hash', (select preview_hash from public.sol_caixa_shadow_previews_v1 where id = v_preview),
         'v3_approval_event_hash', (select approval_event_hash from public.sol_caixa_shadow_approvals_v1 where id = v_approval));

  perform set_config('ensaio.inserts', '0', true);
  create trigger ensaio_falha_no_segundo
    before insert on public.caixa_movimentacoes
    for each row execute function pg_temp.ensaio_falha_no_segundo();

  v_erro := null;
  begin
    v_res := public.sol_caixa_lancar_recebimento_lote_v1(v_payload);
  exception when others then
    v_erro := SQLERRM;   -- a subtransacao do bloco desfaz tudo o que a RPC fez
  end;

  drop trigger ensaio_falha_no_segundo on public.caixa_movimentacoes;

  if v_erro is null then
    v_falhas := v_falhas || format(
      'C) a falha injetada NAO derrubou o lote. Resposta da RPC: ok=%s motivo=%s — se recusou, o laco nem rodou e a atomicidade continua sem prova',
      coalesce(v_res->>'ok','<nulo>'), coalesce(v_res->>'motivo','<nenhum>'));
  elsif v_erro not like '%ENSAIO_FALHA_INJETADA%' then
    v_falhas := v_falhas || format('C) caiu por outro motivo: %s', left(v_erro, 90));
  end if;

  -- zero delta em TUDO: movimentos, lote, itens do lote
  if (select count(*) from public.caixa_movimentacoes) <> v_movs_antes then
    v_falhas := v_falhas || format('C) 🔴 LOTE PARCIAL: sobraram %s movimentacoes',
      (select count(*) from public.caixa_movimentacoes) - v_movs_antes);
  end if;
  if (select count(*) from public.sol_caixa_lotes_v1) <> v_lotes_antes then
    v_falhas := v_falhas || 'C) 🔴 sobrou cabecalho de lote sem itens'::text;
  end if;
  if (select count(*) from public.sol_caixa_lote_itens_v1) <> v_itens_antes then
    v_falhas := v_falhas || 'C) 🔴 sobraram itens de lote'::text;
  end if;
  -- e a aprovacao NAO pode ter sido consumida
  if (select decision from public.sol_caixa_shadow_approvals_v1 where id = v_approval) <> 'approved' then
    v_falhas := v_falhas || 'C) 🔴 a aprovacao foi consumida por um lote que nao existiu'::text;
  end if;

  if v_erro is not null and array_length(v_falhas,1) is null then
    raise notice 'C) falha injetada no 2o insert: zero delta em movimentos, lote, itens e aprovacao';
  end if;

  ------------------------------------------------------------------ veredito
  if array_length(v_falhas,1) > 0 then
    raise exception E'ENSAIO DA CADEIA FALHOU:\n  %', array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'CADEIA E ATOMICIDADE: ok';
end $cadeia$;

rollback;

-- Não confia no ROLLBACK: confere.
do $limpo$
declare v_n int;
begin
  select count(*) into v_n from public.caixa_movimentacoes;
  if v_n <> 0 then
    raise exception 'ROLLBACK NAO LIMPOU: sobraram % movimentacoes de caixa', v_n;
  end if;
  select count(*) into v_n from public.sol_caixa_lotes_v1;
  if v_n <> 0 then
    raise exception 'ROLLBACK NAO LIMPOU: sobraram % lotes', v_n;
  end if;
  select count(*) into v_n from public.caixas_diarios;
  if v_n <> 0 then
    raise exception 'ROLLBACK NAO LIMPOU: sobraram % caixas diarios', v_n;
  end if;
  raise notice 'ROLLBACK conferido: banco voltou ao estado anterior';
end $limpo$;
