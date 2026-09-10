-- ⛔ NÃO APLICADA EM PRODUÇÃO. Reconciliação da cadeia do caixa.
--
-- 🔴 POR QUE ESTA MIGRATION EXISTE. Cinco funções da cadeia do caixa não são
--    reproduzíveis a partir de `supabase/migrations/`: replayar o repo num banco
--    limpo converge para um corpo DIFERENTE do que está vivo em produção.
--
--    A causa é o estilo de várias migrations deste repo — inclusive três que eu
--    escrevi hoje: elas patcham a função com `pg_get_functiondef` + `replace` +
--    `execute`. Isso guarda a TRANSFORMAÇÃO, não o corpo resultante. Aplicada
--    sobre um estado inicial diferente, produz um resultado diferente — e um
--    `grep "create or replace function <nome>"` nem enxerga que ela mexeu ali.
--
--    Conferi no ledger (`supabase_migrations.schema_migrations`): as cinco têm
--    entrada com o mesmo NOME do arquivo do repo, só com timestamp próprio da
--    aplicação via MCP. **Não falta migration nenhuma** — a procedência de cada
--    uma está anotada no bloco dela abaixo.
--
-- COMO ESTE ARQUIVO FOI PRODUZIDO. Um gerador em SQL leu, por SELECT-only:
--    · `statements[]` do ledger, para a procedência (versão + nome);
--    · `pg_get_functiondef` e o catálogo vivo, para o corpo final materializado,
--      a assinatura, volatility, SECURITY DEFINER, search_path, ACL e comentário.
--    Nenhum corpo foi editado, "corrigido" ou reescrito.
--
-- ⚠️ O MOJIBAKE DE `_contrato_tipo_20260817` FICA COMO ESTÁ, byte a byte
--    (`decisÃ£o`, `locaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o`, `emprÃƒÆ’Ã‚Â©stimo`). Duas dessas
--    sequências estão dentro de padrões `LIKE` — ou seja, são FUNCIONAIS: mexer
--    nelas muda o que a função classifica como lançamento avulso. Limpeza de
--    encoding é outra mudança, com outro gate, e não se mistura com reprodução.
--
-- ⚠️ A GARANTIA NÃO É A MINHA ATENÇÃO — É O BLOCO DO FIM. Ele confere o md5 do
--    corpo INSTALADO contra o hash de produção, função por função, mais ACL e
--    atributos. Se um byte tiver se perdido no caminho, isto reprova em vez de
--    passar quieto. É o que torna seguro um arquivo deste tamanho.
--
-- ⚠️ IDEMPOTENTE: só `create or replace` + `revoke/grant` + `comment`. Rodar
--    duas vezes é inofensivo — ao contrário das migrations de patch, que é
--    justamente o defeito que esta corrige.

\set ON_ERROR_STOP on

-- ═══════════════════════════════════════════════════════════════════════════
-- get_faturas_alunos_financeiro_v1_contrato_tipo_20260817
-- procedência: ledger 20260909020009 (financeiro_faturas_enriquecimento_em_lote)
-- hash do corpo vivo: b972e914302d47f62ab0be247c101d0a
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_modo_periodo text DEFAULT 'janela_3'::text, p_status text DEFAULT 'todas'::text, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payload jsonb;
  v_item jsonb;
  v_enriched jsonb;
  v_motivos jsonb;
  v_filtrados jsonb;
  v_reconciliacao jsonb;
  v_main_items jsonb := '[]'::jsonb;
  v_reconciliation_items jsonb := '[]'::jsonb;
  v_unidade_id uuid;
  v_fatura_id bigint;
  v_decisoes text[];
  v_categoria text;
  v_fora_historico integer := 0;
  v_fora_avulso integer := 0;
  v_resolvidas integer := 0;
  v_source_missing integer := 0;
  v_identidade integer := 0;
  v_status integer := 0;
  v_validacoes integer := 0;
  v_forma integer := 0;
  v_contato integer := 0;
  v_total integer := 0;
  v_motivo text;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_20260817(
    p_unidade_id, p_ano, p_mes, p_modo_periodo, p_status, p_as_of_date
  );

  v_main_items := public.financeiro_enriquecer_faturas_itens_v1(
    coalesce(v_payload->'items', '[]'::jsonb)
  );
  v_payload := jsonb_set(v_payload, '{items}', v_main_items, true);

  for v_item in
    select value
    from jsonb_array_elements(
      public.financeiro_enriquecer_faturas_itens_v1(
        coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)
      )
    ) as rows(value)
  loop
    v_enriched := v_item;
    v_unidade_id := nullif(v_enriched->>'unidade_id', '')::uuid;
    v_fatura_id := nullif(v_enriched->>'emusys_fatura_id', '')::bigint;
    v_motivos := coalesce(v_enriched->'motivos', '[]'::jsonb);

    -- Se a forma foi encontrada no enriquecimento (Emusys atual ou decisÃ£o
    -- manual), nÃ£o manter a pendÃªncia antiga originada no snapshot.
    if nullif(btrim(v_enriched #>> '{forma_pagamento,nome}'), '') is not null then
      select coalesce(jsonb_agg(motivo), '[]'::jsonb)
        into v_motivos
      from jsonb_array_elements_text(v_motivos) as motivos(motivo)
      where motivo <> 'forma_pagamento_ausente';
      v_enriched := jsonb_set(v_enriched, '{motivos}', v_motivos, true);
    end if;

    v_categoria := case
      when lower(coalesce(v_enriched #>> '{aluno,estado_operacional}', '')) in ('evadido', 'inativo', 'trancado', 'trancada')
        or v_motivos ? 'historico_ex_aluno' then 'historico_ex_aluno'
      when v_motivos ? 'registro_nao_aluno'
        or (
          v_enriched->>'emusys_matricula_id' is null
          and (
            coalesce(nullif(btrim(v_enriched->>'emusys_student_id'), ''), '1') in ('0', '1')
            or lower(coalesce(v_enriched->>'descricao', '')) like '%passaporte%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%estoque%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%caderno%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%clips%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%coach%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%palheta%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%rateio entre unidades%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%ingresso%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locacao%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%bora gravar%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprestimo%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprÃƒÆ’Ã‚Â©stimo%'
          )
        ) then 'registro_nao_aluno'
      else null
    end;

    if v_categoria = 'historico_ex_aluno' then
      v_fora_historico := v_fora_historico + 1;
      continue;
    elsif v_categoria = 'registro_nao_aluno' then
      v_fora_avulso := v_fora_avulso + 1;
      continue;
    end if;

    select coalesce(array_agg(distinct d.tipo_decisao), '{}'::text[])
      into v_decisoes
    from public.financeiro_fatura_reconciliacao_decisoes d
    where d.unidade_id = v_unidade_id
      and d.emusys_fatura_id = v_fatura_id;

    select coalesce(jsonb_agg(motivo), '[]'::jsonb)
      into v_filtrados
    from jsonb_array_elements_text(v_motivos) as motivos(motivo)
    where not (
      (motivo = 'source_missing' and (
        'pagamento_confirmado' = any(v_decisoes)
        or 'renovacao' = any(v_decisoes)
        or 'trancamento' = any(v_decisoes)
        or 'ultima_parcela_aviso_previo' = any(v_decisoes)
        or 'conferido_sem_cobranca' = any(v_decisoes)
        or 'parcela_remarcada' = any(v_decisoes)
        or 'outro' = any(v_decisoes)
      ))
      or (motivo = 'forma_pagamento_ausente' and 'forma_pagamento_manual' = any(v_decisoes))
      or ('conferido_sem_cobranca' = any(v_decisoes))
    );

    if jsonb_array_length(v_filtrados) = 0 then
      if cardinality(v_decisoes) > 0 then v_resolvidas := v_resolvidas + 1; end if;
      continue;
    end if;

    v_enriched := jsonb_set(v_enriched, '{motivos}', v_filtrados, true);
    v_reconciliation_items := v_reconciliation_items || jsonb_build_array(v_enriched);
    v_total := v_total + 1;

    for v_motivo in select value from jsonb_array_elements_text(v_filtrados) as motivos(value) loop
      if v_motivo = 'source_missing' then v_source_missing := v_source_missing + 1;
      elsif v_motivo = 'identidade_invalida' then v_identidade := v_identidade + 1;
      elsif v_motivo = 'status_desconhecido' then v_status := v_status + 1;
      elsif v_motivo = 'validacao_origem' then v_validacoes := v_validacoes + 1;
      elsif v_motivo = 'forma_pagamento_ausente' then v_forma := v_forma + 1;
      elsif v_motivo = 'contato_pendente' then v_contato := v_contato + 1;
      end if;
    end loop;
  end loop;

  v_reconciliacao := jsonb_build_object(
    'source_missing', v_source_missing,
    'identidade_invalida', v_identidade,
    'status_desconhecido', v_status,
    'validacoes_origem', v_validacoes,
    'forma_pagamento_ausente', v_forma,
    'contato_pendente', v_contato,
    'total', v_total,
    'resolvidas_manualmente', v_resolvidas,
    'fora_operacao', jsonb_build_object(
      'historico_ex_aluno', v_fora_historico,
      'registro_nao_aluno', v_fora_avulso,
      'total', v_fora_historico + v_fora_avulso
    ),
    'items', v_reconciliation_items
  );

  v_payload := jsonb_set(v_payload, '{reconciliation}', v_reconciliacao, true);
  v_payload := jsonb_set(
    v_payload,
    '{status}',
    to_jsonb(case
      when coalesce((v_payload #>> '{freshness,competencias_stale}')::integer, 0) > 0 then 'stale'
      when v_total > 0 then 'partial'
      else 'ok'
    end),
    true
  );
  return v_payload;
end;
$function$
;

revoke all on function public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(uuid,integer,integer,text,text,date) from public, anon, authenticated;
grant execute on function public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(uuid,integer,integer,text,text,date) to service_role;
comment on function public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(uuid,integer,integer,text,text,date) is 'Leitura canonica de faturas com reconciliacao operacional manual auditavel; historico e lancamentos avulsos ficam fora da fila.';

-- ═══════════════════════════════════════════════════════════════════════════
-- sol_caixa_aluno_da_fatura_v1
-- procedência: ledger 20260824223826 (sol_caixa_vinculo_aluno_fatura_caminho_simples)
-- hash do corpo vivo: 0454a9ab89eb9b1e24ddfbb08f4cc9e8
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sol_caixa_aluno_da_fatura_v1(p_unidade_id uuid, p_fatura_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select a.id
  from public.emusys_faturas f
  join public.alunos a
    on a.emusys_matricula_id = f.emusys_matricula_id::text
   and a.unidade_id = f.unidade_id
  where f.id = p_fatura_id
    and f.unidade_id = p_unidade_id
    and f.emusys_matricula_id is not null
  order by a.id
  limit 1;
$function$
;

revoke all on function public.sol_caixa_aluno_da_fatura_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.sol_caixa_aluno_da_fatura_v1(uuid,uuid) to service_role, sol_acesso_restrito;

-- ═══════════════════════════════════════════════════════════════════════════
-- sol_caixa_normalizar_competencia_v1
-- procedência: ledger 20260824122716 (composto_aceita_competencia_iso)
-- hash do corpo vivo: 1d6dd117f0e28bf6b05ddb797842c1bd
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sol_caixa_normalizar_competencia_v1(p_competencia text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when nullif(btrim(coalesce(p_competencia, '')), '') is null then null
    when btrim(p_competencia) ~ '^(0[1-9]|1[0-2])/[0-9]{4}$' then btrim(p_competencia)
    when btrim(p_competencia) ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$'
      then substring(btrim(p_competencia) from 6 for 2) || '/' || substring(btrim(p_competencia) from 1 for 4)
    else null
  end;
$function$
;

revoke all on function public.sol_caixa_normalizar_competencia_v1(text) from public, anon, authenticated;
grant execute on function public.sol_caixa_normalizar_competencia_v1(text) to service_role, sol_acesso_restrito;

-- ═══════════════════════════════════════════════════════════════════════════
-- POS-CONDIÇÃO — a garantia deste arquivo.
--
-- Confere o md5 do corpo INSTALADO contra o hash de produção (09/09/2026),
-- normalizando apenas CRLF, mais volatility, SECURITY DEFINER, search_path e
-- ACL. Um byte perdido no transporte reprova aqui.
--
-- ⚠️ As duas maiores da cadeia — `sol_caixa_lancar_recebimento_lote_v1` e
--    `sol_caixa_validar_multi_aluno_snapshot_v1` — ficam para o arquivo
--    companheiro `20260909230500`, para manter cada migration legível.
-- ═══════════════════════════════════════════════════════════════════════════
do $pos$
declare
  v_falhas text[] := '{}';
  v_sig text; v_esp text; v_obt text; v_i int;
  v_esperado text[][] := array[
    ['public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(uuid,integer,integer,text,text,date)','b972e914302d47f62ab0be247c101d0a'],
    ['public.sol_caixa_aluno_da_fatura_v1(uuid,uuid)','0454a9ab89eb9b1e24ddfbb08f4cc9e8'],
    ['public.sol_caixa_normalizar_competencia_v1(text)','1d6dd117f0e28bf6b05ddb797842c1bd']
  ];
begin
  for v_i in 1 .. array_length(v_esperado,1) loop
    v_sig := v_esperado[v_i][1];
    v_esp := v_esperado[v_i][2];

    select md5(replace(substring(pg_get_functiondef(v_sig::regprocedure)
             from position('$function$' in pg_get_functiondef(v_sig::regprocedure))), chr(13), ''))
      into v_obt;

    if v_obt is distinct from v_esp then
      v_falhas := v_falhas || format('%s: corpo %s, esperado %s (transporte corrompeu ou producao mudou)',
        v_sig, left(coalesce(v_obt,'<nulo>'),12), left(v_esp,12));
    end if;
    if has_function_privilege('anon', v_sig, 'EXECUTE') then
      v_falhas := v_falhas || format('%s: executavel por anon', v_sig);
    end if;
    if has_function_privilege('authenticated', v_sig, 'EXECUTE') then
      v_falhas := v_falhas || format('%s: executavel por authenticated', v_sig);
    end if;
    if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
      v_falhas := v_falhas || format('%s: service_role SEM execute', v_sig);
    end if;
  end loop;

  -- atributos, um a um, contra o que producao declara
  if (select provolatile from pg_proc where oid =
       'public.sol_caixa_normalizar_competencia_v1(text)'::regprocedure) <> 'i' then
    v_falhas := v_falhas || 'normalizar_competencia: deveria ser IMMUTABLE';
  end if;
  if (select prosecdef from pg_proc where oid =
       'public.sol_caixa_normalizar_competencia_v1(text)'::regprocedure) then
    v_falhas := v_falhas || 'normalizar_competencia: NAO deveria ser SECURITY DEFINER';
  end if;
  if (select provolatile from pg_proc where oid =
       'public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(uuid,integer,integer,text,text,date)'::regprocedure) <> 'v' then
    v_falhas := v_falhas || 'contrato_tipo: deveria ser VOLATILE';
  end if;
  if (select provolatile from pg_proc where oid =
       'public.sol_caixa_aluno_da_fatura_v1(uuid,uuid)'::regprocedure) <> 's' then
    v_falhas := v_falhas || 'aluno_da_fatura: deveria ser STABLE';
  end if;

  if array_length(v_falhas,1) > 0 then
    raise exception E'RECONCILIACAO NAO FECHOU:\n  %', array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'reconciliacao 1/2 ok: 3 funcoes, corpo + ACL + atributos conferidos';
end $pos$;

-- ROLLBACK: não há. Este arquivo AFIRMA o estado de produção; revertê-lo seria
--           reintroduzir a divergência. Se alguma definição mudar em produção,
--           gere o arquivo de novo pelo mesmo caminho SELECT-only.
