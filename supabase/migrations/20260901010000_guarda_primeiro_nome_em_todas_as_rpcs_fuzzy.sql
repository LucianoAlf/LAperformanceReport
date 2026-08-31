-- A VARREDURA QUE FALTOU EM 29/08: a guarda de primeiro nome
-- (sol_nome_mesma_pessoa_v1) foi aplicada em 2 das 8 RPCs de fuzzy do caixa —
-- e o buraco da Soraia/Laura reapareceu pela QUARTA porta em 31/08 20:18
-- (Kailane/Barra): rótulo "Aluna Luiza Rodrigues" (não matriculada), a canônica
-- casou "Miguel Luís RODRIGUES Alves da Rocha Pinto" (a guarda do runtime
-- rejeitou ✅), e aí `sol_caixa_identificar_aluno_novo_v1` fez o PRÓPRIO fuzzy
-- sem guarda (sim 0.72 ≥ corte 0.62) e devolveu o Miguel por outra porta — o
-- card saiu com aluno e responsável de outra família, e a equipe: "Como fala
-- com esse robô".
--
-- ⚠️ NÃO é regressão: o mesmo fluxo funcionou às 17:30 do mesmo dia (Théo
-- Benatti, conf 1 via experimental) — entrada diferente, mesma porta sem
-- guarda. E é exatamente a lição já escrita no CLAUDE.md em 27/08: "corrigir o
-- helper compartilhado não garante cobertura — sempre varrer os consumidores".
-- A varredura, agora feita: `select proname from pg_proc where prosrc ilike
-- '%word_similarity%'` → 8 RPCs sol_caixa_*; 2 com guarda; 6 recebem aqui:
--   sol_caixa_parcela_canonica            (input = nome de aluno)
--   sol_caixa_identificar_aluno_novo_v1   (3 ramos: alunos, experimentais, leads)
--   sol_caixa_resolver_multi_aluno_v1     (item.aluno_nome vs alunos)
--   sol_caixa_derivar_valores_multi_aluno_v1
--   sol_caixa_validar_multi_aluno_snapshot_v1
--   sol_caixa_aluno_por_responsavel       (nome de RESPONSÁVEL vs responsavel_nome
--                                          — mesma pessoa, guarda vale)
-- ⚠️ `sol_caixa_identificar_por_pagador` fica FORA de propósito: casa família
-- por SOBRENOME (mãe paga pro filho — primeiro nome diferente é o normal), e a
-- saída dela é pergunta com candidatos, nunca afirmação.
--
-- Padrão: replace COM GUARDA sobre o corpo vivo (pg_get_functiondef), nunca
-- transcrição à mão. Cada âncora declara o nº esperado de ocorrências.
-- Recriar função reabre EXECUTE para anon (ALTER DEFAULT PRIVILEGES) → revoke
-- nominal no fim.

begin;

-- ── 1) sol_caixa_parcela_canonica ────────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.sol_caixa_parcela_canonica(uuid,text,numeric,date)'::regprocedure);
  v_anc text := '  from alunos a
  where a.unidade_id = p_unidade_id and a.nome_normalizado is not null
    and (a.status ilike ''ativo%'' or a.status is null)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc limit 1;';
  v_new text := '  from alunos a
  where a.unidade_id = p_unidade_id and a.nome_normalizado is not null
    and (a.status ilike ''ativo%'' or a.status is null)
    and public.sol_nome_mesma_pessoa_v1(v_in, a.nome_normalizado)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc limit 1;';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n <> 1 then raise exception 'ANCORA parcela_canonica: esperava 1, achei %', v_n; end if;
  execute replace(v_def, v_anc, v_new);
end $$;

-- ── 2) sol_caixa_identificar_aluno_novo_v1 (3 ramos) ─────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.sol_caixa_identificar_aluno_novo_v1(uuid,text)'::regprocedure);
  v_anc1 text := '  where a.unidade_id = p_unidade_id
    and a.nome_normalizado is not null
    and (a.status ilike ''ativo%'' or a.status is null)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc';
  v_new1 text := '  where a.unidade_id = p_unidade_id
    and a.nome_normalizado is not null
    and (a.status ilike ''ativo%'' or a.status is null)
    and public.sol_nome_mesma_pessoa_v1(v_in, a.nome_normalizado)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc';
  v_anc2 text := '  where le.unidade_id = p_unidade_id
    and le.nome_aluno is not null';
  v_new2 text := '  where le.unidade_id = p_unidade_id
    and le.nome_aluno is not null
    and public.sol_nome_mesma_pessoa_v1(v_in, le.nome_aluno)';
  v_anc3 text := '  where l.unidade_id = p_unidade_id
    and l.nome is not null';
  v_new3 text := '  where l.unidade_id = p_unidade_id
    and l.nome is not null
    and public.sol_nome_mesma_pessoa_v1(v_in, l.nome)';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc1, ''))) / length(v_anc1);
  if v_n <> 1 then raise exception 'ANCORA aluno_novo/alunos: esperava 1, achei %', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_anc2, ''))) / length(v_anc2);
  if v_n <> 1 then raise exception 'ANCORA aluno_novo/experimentais: esperava 1, achei %', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_anc3, ''))) / length(v_anc3);
  if v_n <> 1 then raise exception 'ANCORA aluno_novo/leads: esperava 1, achei %', v_n; end if;
  v_def := replace(v_def, v_anc1, v_new1);
  v_def := replace(v_def, v_anc2, v_new2);
  v_def := replace(v_def, v_anc3, v_new3);
  execute v_def;
end $$;

-- ── 3) sol_caixa_resolver_multi_aluno_v1 ─────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef((select oid from pg_proc where proname='sol_caixa_resolver_multi_aluno_v1' and pronamespace='public'::regnamespace)::regprocedure);
  v_anc text := '     where a.unidade_id = p_unidade_id
       and a.nome_normalizado is not null
       and (a.status ilike ''ativo%'' or a.status is null)';
  v_new text := '     where a.unidade_id = p_unidade_id
       and a.nome_normalizado is not null
       and (a.status ilike ''ativo%'' or a.status is null)
       and public.sol_nome_mesma_pessoa_v1(v_nome, a.nome_normalizado)';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n <> 1 then raise exception 'ANCORA resolver_multi: esperava 1, achei %', v_n; end if;
  execute replace(v_def, v_anc, v_new);
end $$;

-- ── 4) sol_caixa_derivar_valores_multi_aluno_v1 ──────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef((select oid from pg_proc where proname='sol_caixa_derivar_valores_multi_aluno_v1' and pronamespace='public'::regnamespace)::regprocedure);
  v_anc text := '    where a.unidade_id = p_unidade_id and a.nome_normalizado is not null
      and (a.status ilike ''ativo%'' or a.status is null)';
  v_new text := '    where a.unidade_id = p_unidade_id and a.nome_normalizado is not null
      and (a.status ilike ''ativo%'' or a.status is null)
      and public.sol_nome_mesma_pessoa_v1(v_nome, a.nome_normalizado)';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n <> 1 then raise exception 'ANCORA derivar_valores: esperava 1, achei %', v_n; end if;
  execute replace(v_def, v_anc, v_new);
end $$;

-- ── 5) sol_caixa_validar_multi_aluno_snapshot_v1 ─────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef((select oid from pg_proc where proname='sol_caixa_validar_multi_aluno_snapshot_v1' and pronamespace='public'::regnamespace)::regprocedure);
  v_anc text := '     where a.unidade_id = p_unidade_id
       and a.nome_normalizado is not null
       and (a.status ilike ''ativo%'' or a.status is null)';
  v_new text := '     where a.unidade_id = p_unidade_id
       and a.nome_normalizado is not null
       and (a.status ilike ''ativo%'' or a.status is null)
       and public.sol_nome_mesma_pessoa_v1(v_nome, a.nome_normalizado)';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n <> 1 then raise exception 'ANCORA validar_snapshot: esperava 1, achei %', v_n; end if;
  execute replace(v_def, v_anc, v_new);
end $$;

-- ── 6) sol_caixa_aluno_por_responsavel (responsável vs responsável) ──────────
do $$
declare
  v_def text := pg_get_functiondef((select oid from pg_proc where proname='sol_caixa_aluno_por_responsavel' and pronamespace='public'::regnamespace)::regprocedure);
  v_anc text := '    where a.unidade_id = p_unidade_id
      and a.responsavel_nome is not null
      and (a.status ilike ''ativo%'' or a.status is null)';
  v_new text := '    where a.unidade_id = p_unidade_id
      and a.responsavel_nome is not null
      and (a.status ilike ''ativo%'' or a.status is null)
      and public.sol_nome_mesma_pessoa_v1(v_in, a.responsavel_nome)';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n <> 1 then raise exception 'ANCORA aluno_por_responsavel: esperava 1, achei %', v_n; end if;
  execute replace(v_def, v_anc, v_new);
end $$;

-- ── 7) sol_caixa_resolver_composto_aluno_v1 ──────────────────────────────────
-- (aplicada em produção na migration separada `guarda_primeiro_nome_resolver_composto`
-- — ficou fora do 1º lote por descuido; este arquivo consolida as duas, com
-- replace idempotente: 0 ocorrências = já aplicada.)
do $$
declare
  v_def text := pg_get_functiondef((select oid from pg_proc where proname='sol_caixa_resolver_composto_aluno_v1' and pronamespace='public'::regnamespace)::regprocedure);
  v_anc text := '    where nullif(btrim(x->>''emusys_student_id''),'''') is not null
      and nullif(x->''aluno''->>''nome'','''') is not null';
  v_new text := '    where nullif(btrim(x->>''emusys_student_id''),'''') is not null
      and nullif(x->''aluno''->>''nome'','''') is not null
      and public.sol_nome_mesma_pessoa_v1(v_nome, x->''aluno''->>''nome'')';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n = 1 then execute replace(v_def, v_anc, v_new); end if;
end $$;

-- ── recriar função reabre EXECUTE para anon: revoke nominal nas 7 ────────────
do $$
declare v_p regprocedure;
begin
  for v_p in
    select oid::regprocedure from pg_proc
    where pronamespace='public'::regnamespace
      and proname in ('sol_caixa_parcela_canonica','sol_caixa_identificar_aluno_novo_v1',
                      'sol_caixa_resolver_multi_aluno_v1','sol_caixa_derivar_valores_multi_aluno_v1',
                      'sol_caixa_validar_multi_aluno_snapshot_v1','sol_caixa_aluno_por_responsavel',
                      'sol_caixa_resolver_composto_aluno_v1')
  loop
    execute format('revoke execute on function %s from anon, public', v_p);
  end loop;
end $$;

commit;
