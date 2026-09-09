-- Cadeia real do lote e ATOMICIDADE, contra banco isolado.
--
--   docker exec sol-ensaio psql -U postgres -d ensaio -v ON_ERROR_STOP=1 \
--     -f ensaio-cadeia-e-atomicidade.sql
--
-- 🔴 POR QUE ISTO NÃO PODE SER MOCK. O teste de runtime que eu chamei de "ponta
--    a ponta" mocka `resolverMultiFn` E `lancarLoteFn` — prova a fiação em
--    JavaScript e mais nada. O Alfredo recusou o gate por isso, e ele tem um
--    precedente do lado dele: em 01/09 um lote aprovado de R$ 1.722 gravou
--    R$ 432 e a Sol anunciou "nenhum item foi lançado parcialmente", justamente
--    porque a validação tinha sido feita com o `lancarLoteFn` mockado.
--
-- Prova, em ordem:
--   A. resolver → lista plana → `sol_caixa_validar_multi_aluno_snapshot_v1`
--      (LEITURA: o mesmo caminho que o "pode" percorre)
--   B. o lote grava N movimentações e a soma fecha
--   C. 🔴 lote com um item a menos no payload NÃO grava NADA
--      (a invariante `SOL_LOTE_INCOMPLETO`, que é o coração da atomicidade)
--
-- ⚠️ B e C ESCREVEM. Rodam dentro de uma transação que termina em ROLLBACK, e o
--    ensaio confere no fim que o banco voltou ao estado anterior — não confia,
--    verifica. Só faz sentido em banco isolado; contra produção é proibido.

\set ON_ERROR_STOP on

begin;

do $cadeia$
declare
  v_unidade uuid := '11111111-1111-1111-1111-111111111111';
  v_falhas  text[] := '{}';
  v_itens   jsonb;
  v_r       jsonb;
  v_snap    jsonb;
  v_total   numeric;
  v_n       int;
  v_movs_antes  int;
  v_movs_depois int;
  v_caixa   uuid;
  v_payload jsonb;
  v_res     jsonb;
  v_erro    text;
begin
  select count(*) into v_movs_antes from public.caixa_movimentacoes;

  ------------------------------------------------------- A) cadeia de LEITURA
  -- dois alunos: um com 2+ faturas (composto) e um com 1
  -- ⚠️ O VALOR DECLARADO E OBRIGATORIO na fixture: sem ele
  --    `sol_caixa_resolver_composto_aluno_v1` recusa com `valor_total_invalido`,
  --    a cascata cai na canonica e o caso N x M — que e o ponto do ensaio —
  --    nunca acontece. Na 1a execucao deste arquivo foi exatamente isso: 2
  --    alunos viraram 2 linhas em vez de 3, e o ensaio passou sem provar nada.
  select jsonb_agg(jsonb_build_object('aluno_nome', nome, 'valor', soma)) into v_itens
    from (
      (select a.nome,
              (select sum(coalesce(f.valor_pago, f.valor_original))
                 from public.emusys_faturas f
                where f.emusys_student_id = a.emusys_student_id::bigint
                  and f.competencia = date_trunc('month', current_date)::date) as soma
         from public.alunos a
        where a.unidade_id = v_unidade
          and (select count(*) from public.emusys_faturas f
                where f.emusys_student_id = a.emusys_student_id::bigint
                  and f.competencia = date_trunc('month', current_date)::date) >= 2
        order by a.id limit 1)
      union all
      (select a.nome,
              (select sum(coalesce(f.valor_pago, f.valor_original))
                 from public.emusys_faturas f
                where f.emusys_student_id = a.emusys_student_id::bigint
                  and f.competencia = date_trunc('month', current_date)::date) as soma
         from public.alunos a
        where a.unidade_id = v_unidade
          and (select count(*) from public.emusys_faturas f
                where f.emusys_student_id = a.emusys_student_id::bigint
                  and f.competencia = date_trunc('month', current_date)::date) = 1
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
  -- 2 alunos com um deles composto TEM de virar 3+ linhas. Se virar 2, a
  -- composta nao entrou e o ensaio esta medindo o caso facil.
  if v_n <= jsonb_array_length(v_itens) then
    v_falhas := v_falhas || format(
      'A) %s alunos viraram %s linhas — o caso composto (N x M) nao foi exercitado',
      jsonb_array_length(v_itens), v_n);
  end if;

  -- é ESTE array que o "pode" revalida
  v_snap := public.sol_caixa_validar_multi_aluno_snapshot_v1(
              v_unidade, v_r->'itens', v_total, null);
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

  ------------------------------------------------------- B) o lote GRAVA certo
  insert into public.caixas_diarios (unidade_id, data_caixa, status)
  values (v_unidade, current_date, 'aberto')
  returning id into v_caixa;

  v_payload := jsonb_build_object(
    'unidade_id', v_unidade,
    'data_caixa', current_date,
    'itens', v_r->'itens',
    -- a RPC le `valor`; `valor_total` fica junto porque o bridge manda os dois
    'valor', v_total,
    'valor_total', v_total,
    'forma_pagamento', 'pix',
    'categoria', 'parcela',
    'chat_id', 'ensaio@g.us',
    'origem_message_id', 'ENSAIO1',
    'preview_message_id', 'ENSAIOP1',
    'idempotency_key', 'ensaio:' || gen_random_uuid()::text,
    'autorizado_por', 'Ensaio',
    'ator_numero', '5521999999999');

  begin
    v_res := public.sol_caixa_lancar_recebimento_lote_v1(v_payload);
  exception when others then
    v_res := jsonb_build_object('ok', false, 'motivo', 'excecao: ' || SQLERRM);
  end;

  select count(*) into v_movs_depois from public.caixa_movimentacoes;

  if coalesce((v_res->>'ok')::boolean, false) then
    if v_movs_depois - v_movs_antes <> v_n then
      v_falhas := v_falhas || format('B) gravou %s movimentacoes para %s itens',
        v_movs_depois - v_movs_antes, v_n);
    end if;
    if abs((select coalesce(sum(valor),0) from public.caixa_movimentacoes
             where caixa_diario_id = v_caixa) - v_total) > 0.01 then
      v_falhas := v_falhas || 'B) a soma gravada no caixa nao bate com o total aprovado';
    end if;
    raise notice 'B) lote gravou % movimentacoes, R$ %', v_movs_depois - v_movs_antes, v_total;
  else
    -- Recusa por portão de autorização/V3 é ESPERADA num banco sem o trilho do
    -- WhatsApp montado. O que não pode acontecer é gravar parcial — e é o C que
    -- prova isso. Registro o motivo para o leitor saber onde parou.
    v_falhas := v_falhas || format(
      'B) o lote nao chegou ao laco: recusado com "%s". A atomicidade (C) so vale '
      'se o caminho feliz gravar antes — senao C passa sem provar nada.',
      coalesce(v_res->>'motivo','<nulo>'));
    if v_movs_depois <> v_movs_antes then
      v_falhas := v_falhas || format(
        'B) lote RECUSADO mas gravou %s movimentacoes — escrita fora do caminho aprovado',
        v_movs_depois - v_movs_antes);
    end if;
  end if;

  --------------------------------- C) payload adulterado NAO grava nada (raiz)
  -- Tiro UM item do payload mantendo o total: o snapshot vai devolver menos
  -- itens do que o payload declara e a invariante pos-loop tem de derrubar tudo.
  v_movs_antes := v_movs_depois;
  v_payload := jsonb_set(v_payload, '{itens}',
                 (v_r->'itens') - (v_n - 1));            -- remove o ultimo item
  v_payload := jsonb_set(v_payload, '{idempotency_key}',
                 to_jsonb('ensaio:' || gen_random_uuid()::text));
  v_erro := null;
  begin
    v_res := public.sol_caixa_lancar_recebimento_lote_v1(v_payload);
  exception when others then
    v_erro := SQLERRM;
  end;

  select count(*) into v_movs_depois from public.caixa_movimentacoes;
  if v_movs_depois <> v_movs_antes then
    v_falhas := v_falhas || format(
      'C) 🔴 LOTE PARCIAL: payload adulterado gravou %s movimentacoes (deveria gravar ZERO)',
      v_movs_depois - v_movs_antes);
  else
    raise notice 'C) payload adulterado nao gravou nada%',
      case when v_erro is null then '' else ' (erro: ' || left(v_erro, 60) || ')' end;
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
  select count(*) into v_n from public.caixas_diarios;
  if v_n <> 0 then
    raise exception 'ROLLBACK NAO LIMPOU: sobraram % caixas diarios', v_n;
  end if;
  raise notice 'ROLLBACK conferido: banco voltou ao estado anterior';
end $limpo$;
