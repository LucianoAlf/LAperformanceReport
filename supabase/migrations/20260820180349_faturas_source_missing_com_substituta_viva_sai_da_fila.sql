-- Fatura que sumiu da origem MAS foi substituída por outra sai da fila de reconciliação.
-- Decisão do Alf, 2026-08-20.
--
-- O CASO: Rayane Bianca (fatura 45114, Violão, R$ 447) e Vinícius Lopa (49911, Power Kids,
-- R$ 0,00) apareciam como "fatura não observada na origem" — um alerta que a equipe não
-- tem como resolver, porque a cobrança continua existindo, só mudou de identificador.
--
-- O QUE ACONTECE: quando a parcela é editada no Emusys, ele NÃO altera a fatura — apaga e
-- cria outra com id novo. O nosso sync vê a antiga desaparecer do payload e marca
-- `source_missing`, que é o comportamento correto e conservador (sumir nunca pode
-- significar "pagou"). Só que, quando existe substituta viva, a pergunta já tem resposta.
--
-- Assinatura medida: o intervalo entre `source_last_seen_at` e `source_missing_detected_at`
-- é sempre de 15-20 minutos — exatamente a janela do cron de faturas. Rayane sumiu 19 min
-- depois de vista, e a substituta 43436 está lá, aberta, mesmo valor e vencimento.
-- Das 19 faturas nessa condição em ago/2026, 8 têm substituta viva.
--
-- ⚠️ NÃO é inventar pagamento. A substituta precisa ser da MESMA pessoa, MESMA competência,
-- id DIFERENTE e com valor > 0. A fatura antiga sai da FILA, mas os totais financeiros
-- continuam vindo da substituta — que é a cobrança real e é quem entra em aberto/atraso.
-- Nenhum valor deixa de ser cobrado por causa disto: `entra_nos_totais` NÃO foi tocado e
-- segue usando `not c.source_missing`, então a fatura fantasma continua fora dos totais.
--
-- ⚠️ O caso do Vinícius também revela outra coisa: fatura de R$ 0,00 num curso de banda
-- (Power Kids não cobra, REGRAS §3.5). Ela sai por consequência — tem duas irmãs pagas de
-- R$ 447 na mesma competência.
--
-- Os que NÃO têm substituta continuam na fila: ali "sumiu e não voltou" é pergunta legítima.
--
-- Resultado: Campo Grande 4 -> 2 pendências (as 2 que restam são Marina Flor e Pablo
-- Vinicius, inadimplentes reais confirmados pela equipe). Barra e Recreio seguem em 0.

do $mig$
declare
  v_def text;
  v_new text;
  v_antigo text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_faturas_alunos_financeiro_v1_canonica_20260817';

  if position('substituta_viva' in v_def) > 0 then
    raise notice 'regra da substituta ja aplicada';
    return;
  end if;

  v_antigo := '      nullif(btrim(ls.payload ->> ''forma_pagamento_transacao''), '''')' || E'\n'
           || '        as forma_pagamento_transacao' || E'\n'
           || '    from linhas_snapshot ls';

  if position(v_antigo in v_def) = 0 then
    raise exception 'ancora de classificadas nao encontrada';
  end if;

  v_novo := '      nullif(btrim(ls.payload ->> ''forma_pagamento_transacao''), '''')' || E'\n'
         || '        as forma_pagamento_transacao,' || E'\n'
         || '      -- substituta_viva: o Emusys apaga e recria a fatura ao editar a parcela.' || E'\n'
         || '      -- Se existe outra fatura da MESMA pessoa na MESMA competencia, com id' || E'\n'
         || '      -- diferente e valor > 0, a cobranca continua existindo — so mudou de id.' || E'\n'
         || '      (' || E'\n'
         || '        ls.source_missing' || E'\n'
         || '        and exists (' || E'\n'
         || '          select 1 from public.emusys_faturas ef' || E'\n'
         || '          where ef.unidade_id = ls.unidade_id' || E'\n'
         || '            and ef.emusys_student_id = ls.emusys_student_id' || E'\n'
         || '            and ef.competencia = ls.competencia' || E'\n'
         || '            and ef.emusys_fatura_id <> ls.emusys_fatura_id' || E'\n'
         || '            and coalesce(ef.valor_original, 0) > 0' || E'\n'
         || '        )' || E'\n'
         || '      ) as substituta_viva' || E'\n'
         || '    from linhas_snapshot ls';

  v_new := replace(v_def, v_antigo, v_novo);

  v_new := replace(
    v_new,
    '  itens_reconciliacao as (' || E'\n'
    || '    select a.*,' || E'\n'
    || '      array_remove(array[' || E'\n'
    || '        case when a.source_missing then ''source_missing'' end,',
    '  itens_reconciliacao as (' || E'\n'
    || '    select a.*,' || E'\n'
    || '      array_remove(array[' || E'\n'
    || '        case when a.source_missing and not a.substituta_viva then ''source_missing'' end,'
  );

  v_new := replace(
    v_new,
    '    where a.source_missing' || E'\n'
    || '       or a.identidade_invalida',
    '    where (a.source_missing and not a.substituta_viva)' || E'\n'
    || '       or a.identidade_invalida'
  );

  v_new := replace(
    v_new,
    '      count(*) filter (where source_missing)::integer as source_missing,',
    '      count(*) filter (where source_missing and not substituta_viva)::integer as source_missing,'
  );

  if v_new = v_def then
    raise exception 'nenhum replace surtiu efeito — abortando';
  end if;

  execute v_new;
end $mig$;
