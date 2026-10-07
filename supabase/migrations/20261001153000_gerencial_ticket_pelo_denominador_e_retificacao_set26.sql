-- supabase/migrations/20261001153000_gerencial_ticket_pelo_denominador_e_retificacao_set26.sql
--
-- Relatorio administrativo mensal de set/2026 recusava CG e Recreio com
-- RELATORIO_ADMIN_MENSAL_TICKET_DIVERGENTE.
--
-- Causa: no payload gerencial, kpis_alunos_canonicos.totais.ticket_medio vem da camada
-- legacy_p18 (sum(mrr)/sum(alunos_pagantes)). A canonica e o validador do relatorio usam
-- mrr / ticket_denominador_pagantes (a base financeira). A p24 ja aplica o ticket da fonte
-- financeira, mas so quando kpis_alunos_canonicos e array — e ele e objeto, entao o ticket
-- da p18 sobrava. Diferenca medida em set/2026: 1 aluno (Recreio 342 x 341, CG 362 x 363).
-- Em ago/2026 o mesmo defeito foi contornado regravando versoes do snapshot a mao.
--
-- (1) p24: com fonte financeira presente, totais.ticket_medio = round(totais.mrr / denominador, 2),
--     denominador na MESMA ordem que get_relatorio_admin_mensal_rico_v1 le
--     (ticket_denominador_pagantes, depois alunos_pagantes_canonicos). Nada mais muda.
-- (2) set/2026 ja esta fechado: retificacao append-only (mesmo mecanismo do leitor), so do
--     campo totais.ticket_medio, com guarda de escopo. Unidade em que ja bate fica intacta.

do $$
declare
  d text;
  n int;
  v_ancora text;
begin
  d := pg_get_functiondef('public.get_dados_relatorio_gerencial_legacy_rankings_p24_20260719'::regproc);
  v_ancora := '    v_result := jsonb_set(v_result, ''{financeiro_faturas_emusys}'', v_financeiro, true);';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p24: ancora esperava 1 ocorrencia, achou %', n; end if;
  d := replace(d, v_ancora,
       '    -- ticket dos totais pelo mesmo denominador que o validador do relatorio usa' || chr(10)
    || '    if jsonb_typeof(v_result#>''{kpis_alunos_canonicos,totais}'') = ''object''' || chr(10)
    || '       and coalesce(nullif(v_fin_totais->>''ticket_denominador_pagantes'', '''')::numeric,' || chr(10)
    || '                    nullif(v_fin_totais->>''alunos_pagantes_canonicos'', '''')::numeric, 0) > 0' || chr(10)
    || '       and nullif(v_result#>>''{kpis_alunos_canonicos,totais,mrr}'', '''') is not null then' || chr(10)
    || '      v_result := jsonb_set(v_result, ''{kpis_alunos_canonicos,totais,ticket_medio}'',' || chr(10)
    || '        to_jsonb(round((v_result#>>''{kpis_alunos_canonicos,totais,mrr}'')::numeric' || chr(10)
    || '          / coalesce(nullif(v_fin_totais->>''ticket_denominador_pagantes'', '''')::numeric,' || chr(10)
    || '                     nullif(v_fin_totais->>''alunos_pagantes_canonicos'', '''')::numeric), 2)), true);' || chr(10)
    || '    end if;' || chr(10)
    || v_ancora);
  execute d;
end $$;

do $$
declare
  s record;
  v_base jsonb;
  v_corrigido jsonb;
  v_faturas jsonb;
  v_den numeric;
  v_mrr numeric;
  v_tk_antes numeric;
  v_tk_novo numeric;
  v_hash text;
  v_ret_id uuid;
  v_n int := 0;
begin
  for s in
    select x.*
    from public.fechamento_mensal_snapshots x
    where x.ano = 2026 and x.mes = 9 and x.escopo = 'unidade'
      and x.dominio = 'relatorio_gerencial' and x.status = 'fechado'
      and x.versao = (select max(y.versao) from public.fechamento_mensal_snapshots y
                      where y.ano = x.ano and y.mes = x.mes and y.escopo = x.escopo
                        and y.dominio = x.dominio and y.unidade_id = x.unidade_id and y.status = 'fechado')
  loop
    if exists (select 1 from public.fechamento_mensal_retificacoes r where r.snapshot_id = s.id) then
      raise exception 'snapshot % ja tem retificacao: encadear em vez de partir do payload original', s.id;
    end if;
    v_base := s.payload;
    v_faturas := coalesce(v_base#>'{financeiro_faturas_emusys,totais}',
                          v_base#>'{kpis_gestao,0,financeiro_faturas_emusys}',
                          v_base#>'{dados_mes_atual,0,financeiro_faturas_emusys}');
    v_den := coalesce(nullif(v_base#>>'{financeiro_ticket_contratual,ticket_denominador_pagantes}', '')::numeric,
                      nullif(v_faturas->>'ticket_denominador_pagantes', '')::numeric,
                      nullif(v_faturas->>'alunos_pagantes_canonicos', '')::numeric);
    v_mrr := nullif(v_base#>>'{kpis_alunos_canonicos,totais,mrr}', '')::numeric;
    v_tk_antes := nullif(v_base#>>'{kpis_alunos_canonicos,totais,ticket_medio}', '')::numeric;
    if v_den is null or v_den <= 0 or v_mrr is null then
      raise exception 'snapshot %: base financeira incompleta (den %, mrr %)', s.id, v_den, v_mrr;
    end if;
    v_tk_novo := round(v_mrr / v_den, 2);
    continue when round(v_tk_antes, 2) = v_tk_novo;

    v_corrigido := jsonb_set(v_base, '{kpis_alunos_canonicos,totais,ticket_medio}', to_jsonb(v_tk_novo), true);
    -- guarda de escopo: so o ticket dos totais muda
    if (v_corrigido #- '{kpis_alunos_canonicos,totais,ticket_medio}')
       is distinct from (v_base #- '{kpis_alunos_canonicos,totais,ticket_medio}') then
      raise exception 'snapshot %: retificacao excederia o campo ticket_medio', s.id;
    end if;
    v_hash := public.hash_jsonb_canonico(v_corrigido);

    insert into public.fechamento_mensal_retificacoes
      (snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash, motivo, evidencias)
    values (s.id, s.payload_hash, v_corrigido, v_hash,
      'Ticket medio dos totais recalculado pelo denominador da base financeira (mrr / ticket_denominador_pagantes), mesma regra da canonica e do validador do relatorio administrativo',
      jsonb_build_object('mrr', v_mrr, 'denominador', v_den, 'ticket_antes', v_tk_antes, 'ticket_depois', v_tk_novo,
                         'migration', '20261001153000'))
    returning id into v_ret_id;

    insert into public.fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes)
    values (s.id, s.ano, s.mes, s.escopo, s.unidade_id, 'retificacao_solicitada',
      jsonb_build_object('status', 'aplicada', 'origem', 'ticket_denominador_financeiro',
        'retificacao_id', v_ret_id, 'base_payload_hash', s.payload_hash, 'payload_corrigido_hash', v_hash,
        'antes', jsonb_build_object('ticket_medio', v_tk_antes),
        'depois', jsonb_build_object('ticket_medio', v_tk_novo)));
    v_n := v_n + 1;
  end loop;
  raise notice 'retificacoes de ticket set/2026 aplicadas: %', v_n;
end $$;

-- prova: o relatorio administrativo de set/2026 sai nas 3 unidades, senao a migration inteira volta
do $$
declare
  u record;
begin
  for u in select id, nome from public.unidades where ativo order by nome loop
    begin
      perform public.get_relatorio_admin_mensal_rico_v1(u.id, 2026, 9);
    exception when others then
      raise exception 'relatorio admin set/2026 ainda falha em %: %', u.nome, sqlerrm;
    end;
  end loop;
end $$;
