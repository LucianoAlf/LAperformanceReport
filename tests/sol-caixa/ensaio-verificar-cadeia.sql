-- MANIFESTO DA CADEIA DO CAIXA — o container tem de reproduzir produção.
--
-- 🔴 POR QUE ESTE ARQUIVO É O CORAÇÃO DO HARNESS. Sem ele, "montei um banco de
--    ensaio" é uma afirmação sem prova, e todo resultado medido lá em cima vale
--    zero. Um container novo, subido por `ensaio-subir.sh`, tem de chegar
--    sozinho a 14/14 — se não chegar, o bootstrap está sujo e o ensaio mente.
--
-- ⚠️ NORMALIZA APENAS CRLF. Os arquivos de migration passam por Windows e o
--    `\r` entra no corpo das funções: não muda semântica, mas faz todo md5
--    divergir. Foi o que me fez concluir que 14 funções estavam diferentes de
--    produção quando 8 eram byte-idênticas. Diferença proporcional ao número de
--    LINHAS é fim de linha; diferença proporcional ao tamanho é código.
--
-- ⚠️ HASHES DE PRODUÇÃO tirados por `pg_get_functiondef` em 09/09/2026, do
--    corpo a partir de `$function$` — o cabeçalho fica de fora de propósito,
--    porque a renderização dele muda entre versões de servidor.
--
-- ⚠️ Objeto com hash diferente NÃO é necessariamente migration faltando. Antes
--    de concluir isso, conferir se a migration que o define FALHOU no replay —
--    foi a minha lição do dia: a `20260817193125` renomeia e cria, quebra na
--    segunda passada, e deixa o nome canônico com a implementação antiga.

\set ON_ERROR_STOP on

do $manifesto$
declare
  v_falhas text[] := '{}';
  v_ok     int := 0;
  v_nome   text;
  v_esp    text;
  v_obtido text;
  v_par    text[];
  -- nome|md5 do corpo em producao (09/09/2026)
  v_cadeia text[] := array[
    'get_faturas_alunos_financeiro_v1|7c4a3ae5e87d042ac3b5c928f8cc181f',
    'get_faturas_alunos_financeiro_v1_contrato_tipo_20260817|b972e914302d47f62ab0be247c101d0a',
    'sol_caixa_aluno_da_fatura_v1|0454a9ab89eb9b1e24ddfbb08f4cc9e8',
    'sol_caixa_autorizar_payload_v1|e70beb9b2740e40ea54d4602cff498a9',
    'sol_caixa_casar_parcela|020d42d86c865d7e7735aceef189961d',
    'sol_caixa_grupo_operacao_ok|b84cb58580226739281444285cafae8b',
    'sol_caixa_lancar_recebimento|63630cc84351cc97bfd8021139bf63bf',
    'sol_caixa_lancar_recebimento_lote_v1|f7141f150b5ac1be2aa306b0b41dec18',
    'sol_caixa_normalizar_competencia_v1|1d6dd117f0e28bf6b05ddb797842c1bd',
    'sol_caixa_responsavel_aluno|577221c9cc8aa423bf0dd373762d407c',
    'sol_caixa_v3_validar_approval_v1|2f274032638f6ecc73deeaaf75a5f14a',
    'sol_caixa_validar_multi_aluno_snapshot_v1|f4ede61d95baefcf7a08584c68d954c0',
    'sol_faturas_alunos_v1|0a05681e69320774c073eb25a772215e',
    'sol_nome_mesma_pessoa_v1|c38e778a608963e7cd97325c4d4c1aba'];
begin
  ------------------------------------------ 1) as 14 que devem ser IDÊNTICAS
  foreach v_nome in array v_cadeia loop
    v_par  := string_to_array(v_nome, '|');
    v_esp  := v_par[2];
    v_nome := v_par[1];

    select md5(replace(
             substring(pg_get_functiondef(p.oid)
                       from position('$function$' in pg_get_functiondef(p.oid))),
             chr(13), ''))
      into v_obtido
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_nome
     limit 1;

    if v_obtido is null then
      v_falhas := v_falhas || format('%s: AUSENTE no container', v_nome);
    elsif v_obtido <> v_esp then
      v_falhas := v_falhas || format('%s: corpo diverge (esperado %s, veio %s)',
        v_nome, left(v_esp,12), left(v_obtido,12));
    else
      v_ok := v_ok + 1;
    end if;
  end loop;

  ---------------------------- 2) o que as migrations DESTA frente devem criar
  -- Estas TÊM de divergir de produção: é o que ainda não foi promovido.
  foreach v_nome in array array[
    'sol_caixa_resolver_pagamento_itens_v1',
    'sol_caixa_resolver_composto_aluno_env_v1',
    'sol_caixa_parcela_canonica_env_v1'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname = v_nome) then
      v_falhas := v_falhas || format('%s: AUSENTE — a migration da frente nao aplicou', v_nome);
    end if;
  end loop;

  ------------------------------------------- 3) o pipeline de enriquecimento
  -- A guarda que o Alfredo pediu: migration futura não pode apagar uma etapa.
  declare v_def text;
  begin
    v_def := pg_get_functiondef('public.get_faturas_alunos_financeiro_v1'::regproc);
    if v_def not like '%financeiro_enriquecer_tipos_fatura_v1%' then
      v_falhas := v_falhas || 'pipeline: wrapper perdeu o enriquecimento de TIPO';
    end if;
    if v_def not like '%_contrato_tipo_20260817%' then
      v_falhas := v_falhas || 'pipeline: wrapper perdeu o enriquecimento em LOTE';
    end if;
    if (length(v_def) - length(replace(v_def,'financeiro_enriquecer_tipos_fatura_v1','')))
       / length('financeiro_enriquecer_tipos_fatura_v1') < 2 then
      v_falhas := v_falhas || 'pipeline: TIPO nao roda em reconciliation.items';
    end if;
  end;

  ------------------------------------------------- 4) e o efeito, nao so a forma
  -- Hash igual mas envelope sem tipo seria um verde que nao serve.
  declare v_sem_tipo int;
  begin
    select count(*) into v_sem_tipo
      from (select public.sol_faturas_alunos_v1(
                     '11111111-1111-1111-1111-111111111111'::uuid,
                     extract(year from current_date)::int,
                     extract(month from current_date)::int,
                     'janela_3','todas',current_date) as e) x,
           jsonb_array_elements(e->'items') i
     where i->>'tipo_fatura' is null;
    if v_sem_tipo > 0 then
      v_falhas := v_falhas || format('envelope: %s itens SEM tipo_fatura', v_sem_tipo);
    end if;
  exception when others then
    v_falhas := v_falhas || format('envelope nao construiu: %s', left(SQLERRM, 80));
  end;

  ------------------------------------------------------------------ veredito
  if array_length(v_falhas,1) > 0 then
    raise exception E'CADEIA NAO REPRODUZ PRODUCAO (% de 14 iguais):\n  %',
      v_ok, array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'CADEIA OK — %/14 funcoes identicas a producao, pipeline completo, envelope com tipo', v_ok;
end $manifesto$;
