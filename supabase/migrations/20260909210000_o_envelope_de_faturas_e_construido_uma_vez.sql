-- 🔴 O ENVELOPE DE FATURAS ERA RECONSTRUÍDO POR ALUNO, E POR RAMO.
--
-- Medido em produção (09/09/2026, `explain analyze`, cache quente):
--
--     sol_faturas_alunos_v1(CG, 2026, 9, 'janela_3', 'todas')  →  1.266 ms
--     ... e ele monta 1.318 faturas da UNIDADE INTEIRA para olhar as ~5 de um aluno.
--
--   pagamento inteiro, antes:   2 alunos  4.086 ms  ·  4 alunos  10.024 ms
--
-- O teto do `authenticator` é 8 s para TODO acesso por PostgREST — inclusive
-- `service_role`. Ou seja: a partir de ~3 alunos em cascata a chamada morria com
-- 57014 antes de responder. Subir `statement_timeout` (o que eu tinha feito em
-- `20260909193000`) não resolve isso — só faz demorar mais para quebrar. O
-- Alfredo apontou exatamente isso, e está certo.
--
-- ✅ SÃO DUAS FUNÇÕES, NÃO TRÊS — conferido em `pg_proc`, não suposto:
--      sol_caixa_resolver_composto_aluno_v1  → constrói envelope
--      sol_caixa_parcela_canonica            → constrói envelope
--      sol_caixa_casar_parcela               → NÃO constrói
--    Por isso o custo por aluno é ~2 × 1,27 s, que é o 2,5 s medido.
--
-- ✅ E AS DUAS PEDEM O MESMO ENVELOPE — também conferido no texto vivo:
--    `(unidade, ano(as_of), mes(as_of), 'janela_3', 'todas', as_of)`, com
--    `as_of` defaultando à data BRT nas duas. Compartilhar não muda o que
--    nenhuma delas enxerga.
--
-- A FORMA DA CORREÇÃO. Cada função ganha uma variante `_env_v1` que RECEBE o
-- envelope, e a função original vira casca fina sobre ela. A regra continua num
-- lugar só; os consumidores existentes (18 deles, entre runtime, portas e o
-- validador de snapshot) não mudam de assinatura nem de comportamento.
--
-- ⚠️ O CORPO NÃO FOI TRANSCRITO À MÃO. É `pg_get_functiondef` + `regexp_replace`
--    com guarda: a única mudança no corpo é a atribuição do envelope virar
--    `coalesce(p_env_in, <a mesma chamada de antes>)`. `COALESCE` não avalia o
--    segundo argumento quando o primeiro não é nulo — é isso que compra o tempo.
--
-- ⚠️ DUAS COISAS QUE **NÃO** MUDAM: quem escolhe fatura continua sendo a regra
--    de dentro dessas funções, e chamar a variante `_env` com `p_env_in => null`
--    é byte a byte o comportamento de hoje. Envelope nulo = constrói, como
--    sempre construiu.
--
-- ⚠️ CORREÇÃO DE FUSO EMBUTIDA, E DELIBERADA: o resolver passava `current_date`
--    à canônica. `current_date` no banco é **UTC** — das 21h BRT à meia-noite
--    ele já é o dia seguinte, então a canônica olhava um `as_of` diferente do da
--    composta na mesma chamada. É a armadilha já documentada em
--    `vw_contratos_vencendo` (10/08). Agora as duas recebem a MESMA data BRT.

------------------------------------------------------------------ 1) variantes
--
-- 🔴 GUARDA DE SAÍDA, NÃO SÓ DE ENTRADA — e isto foi aprendido do jeito ruim
--    em 09/09/2026, comigo. Rodando este mesmo transform num ensaio ad-hoc, eu
--    contei a âncora do ENVELOPE (achei 1, segui) mas não conferi que o RENAME
--    tinha acontecido. A âncora da assinatura eu montei a partir de
--    `pg_get_function_identity_arguments`, que **não mostra DEFAULTs** — e o
--    cabeçalho real é `p_valor numeric DEFAULT NULL::numeric`. O `replace` não
--    casou, não reclamou, e o `execute` recriou a função **em `public`** com um
--    `p_env_in` que não existe ali: `sol_caixa_parcela_canonica` ficou quebrada
--    em produção por ~3 minutos. (Sem impacto — zero chamadas na janela,
--    conferido no `caixa.log` e em `sol_caixa_lancamento_auditoria`.)
--
--    A lição é dura e simples: **contar a âncora prova que a entrada estava lá,
--    não que a saída ficou certa.** Um `execute` de definição transformada tem
--    de provar, antes de rodar, que está criando o objeto que se pretendia — e
--    que NÃO está por cima do original.
do $mig$
declare
  v_def   text;
  v_n     int;
  v_anc   text := 'v_env := public.sol_faturas_alunos_v1(';
  -- O regex do rename casa só NOME + parêntese de abertura, então o resto da
  -- assinatura é preservado LITERALMENTE — inclusive os `DEFAULT NULL::…`, que
  -- foram exatamente o que a âncora antiga não enxergava.
begin
  ------------------------------------------------------------------- composta
  v_def := pg_get_functiondef('public.sol_caixa_resolver_composto_aluno_v1(jsonb)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n <> 1 then raise exception 'composta: ancora do envelope %x, esperava 1', v_n; end if;

  -- `[^;]+` porque a chamada atravessa linhas mas não contém ponto-e-vírgula.
  v_def := regexp_replace(v_def,
    'v_env := (public\.sol_faturas_alunos_v1\([^;]+\));',
    'v_env := coalesce(p_env_in, \1);');
  -- Casa só NOME + parêntese: imune a DEFAULT, quebra de linha e ordem de args.
  v_def := regexp_replace(v_def,
    'FUNCTION public\.sol_caixa_resolver_composto_aluno_v1\(',
    'FUNCTION public.sol_caixa_resolver_composto_aluno_env_v1(p_env_in jsonb, ');

  if v_def not like '%FUNCTION public.sol_caixa_resolver_composto_aluno_env_v1(p_env_in jsonb, %' then
    raise exception 'composta: o rename NAO aconteceu — abortado antes de executar';
  end if;
  if v_def like '%FUNCTION public.sol_caixa_resolver_composto_aluno_v1(%' then
    raise exception 'composta: a definicao ainda aponta para a funcao ORIGINAL — abortado';
  end if;
  if v_def not like '%coalesce(p_env_in,%' then
    raise exception 'composta: o envelope nao virou coalesce — abortado';
  end if;
  execute v_def;

  ------------------------------------------------------------------- canônica
  v_def := pg_get_functiondef(
    'public.sol_caixa_parcela_canonica(uuid,text,numeric,date)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  if v_n <> 1 then raise exception 'canonica: ancora do envelope %x, esperava 1', v_n; end if;

  v_def := regexp_replace(v_def,
    'v_env := (public\.sol_faturas_alunos_v1\([^;]+\));',
    'v_env := coalesce(p_env_in, \1);');
  v_def := regexp_replace(v_def,
    'FUNCTION public\.sol_caixa_parcela_canonica\(',
    'FUNCTION public.sol_caixa_parcela_canonica_env_v1(p_env_in jsonb, ');

  if v_def not like '%FUNCTION public.sol_caixa_parcela_canonica_env_v1(p_env_in jsonb, %' then
    raise exception 'canonica: o rename NAO aconteceu — abortado antes de executar';
  end if;
  if v_def like '%FUNCTION public.sol_caixa_parcela_canonica(%' then
    raise exception 'canonica: a definicao ainda aponta para a funcao ORIGINAL — abortado';
  end if;
  if v_def not like '%coalesce(p_env_in,%' then
    raise exception 'canonica: o envelope nao virou coalesce — abortado';
  end if;
  execute v_def;
end $mig$;

------------------------------------------------------------------- 2) cascas
-- As originais passam a delegar. Zero regra aqui dentro — é o que impede a
-- segunda fonte de verdade que gerou as duplicatas de renovação.
create or replace function public.sol_caixa_resolver_composto_aluno_v1(p_payload jsonb)
returns jsonb language sql stable security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$ select public.sol_caixa_resolver_composto_aluno_env_v1(null::jsonb, p_payload) $$;

-- ⚠️ Os DEFAULTs vão AQUI também: `sol_caixa_parcela_canonica` é chamada com 2,
--    3 e 4 argumentos por consumidores diferentes. Casca sem default quebraria
--    quem hoje omite `p_valor`/`p_as_of` — e quebraria em runtime, não no deploy.
create or replace function public.sol_caixa_parcela_canonica(
  p_unidade_id uuid, p_aluno text,
  p_valor numeric default null, p_as_of date default null)
returns jsonb language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select public.sol_caixa_parcela_canonica_env_v1(
         null::jsonb, p_unidade_id, p_aluno, p_valor, p_as_of) $$;

--------------------------------------------------- 3) o resolver monta UMA vez
do $mig$
declare
  v_def text;
  v_n   int;
  v_a1 text := '  v_composto    jsonb;';
  v_n1 text := '  v_composto    jsonb;
  -- 🔴 UM envelope para a chamada inteira (09/09/2026). Antes: 2 por aluno.
  v_envelope    jsonb;
  -- data de NEGOCIO e BRT. `current_date` e UTC e vira o dia seguinte as 21h.
  v_as_of_brt   date := (now() at time zone ''America/Sao_Paulo'')::date;';
  v_a2 text := '    v_composto := sol_caixa_resolver_composto_aluno_v1(jsonb_build_object(';
  v_n2 text := '    v_composto := sol_caixa_resolver_composto_aluno_env_v1(v_envelope, jsonb_build_object(';
  v_a3 text := 'v_canon := sol_caixa_parcela_canonica(p_unidade_id, v_nome, v_valor, current_date);';
  v_n3 text := 'v_canon := sol_caixa_parcela_canonica_env_v1(v_envelope, p_unidade_id, v_nome, v_valor, v_as_of_brt);';
  v_a4 text := '  for v_item in select * from jsonb_array_elements(p_itens) loop';
  v_n4 text := '  -- Monta o envelope UMA vez, antes do laco. As duas funcoes de regra pedem
  -- exatamente este (conferido no texto vivo delas), entao compartilhar nao
  -- muda o que nenhuma enxerga — so para de refazer o mesmo trabalho N vezes.
  v_envelope := public.sol_faturas_alunos_v1(
    p_unidade_id, extract(year from v_as_of_brt)::int, extract(month from v_as_of_brt)::int,
    ''janela_3'', ''todas'', v_as_of_brt);

  for v_item in select * from jsonb_array_elements(p_itens) loop';
begin
  v_def := pg_get_functiondef(
    'public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1);
  if v_n <> 1 then raise exception 'declare do resolver %x, esperava 1', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2);
  if v_n <> 1 then raise exception 'chamada da composta %x, esperava 1', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_a3, ''))) / length(v_a3);
  if v_n <> 1 then raise exception 'chamada da canonica %x, esperava 1', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_a4, ''))) / length(v_a4);
  if v_n <> 1 then raise exception 'laco de itens %x, esperava 1', v_n; end if;

  v_def := replace(v_def, v_a1, v_n1);
  v_def := replace(v_def, v_a2, v_n2);
  v_def := replace(v_def, v_a3, v_n3);
  v_def := replace(v_def, v_a4, v_n4);
  execute v_def;
end $mig$;

-------------------------------------------------------------------- 4) acesso
-- `CREATE OR REPLACE` preserva ACL, mas função NOVA nasce com EXECUTE para
-- `anon` por causa do ALTER DEFAULT PRIVILEGES do schema. Nominal, sempre.
revoke execute on function public.sol_caixa_resolver_composto_aluno_env_v1(jsonb, jsonb)
  from public, anon;
grant  execute on function public.sol_caixa_resolver_composto_aluno_env_v1(jsonb, jsonb)
  to service_role, sol_acesso_restrito;

revoke execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb, uuid, text, numeric, date)
  from public, anon;
grant  execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb, uuid, text, numeric, date)
  to service_role, sol_acesso_restrito;

revoke execute on function public.sol_caixa_resolver_composto_aluno_v1(jsonb) from public, anon;
grant  execute on function public.sol_caixa_resolver_composto_aluno_v1(jsonb)
  to service_role, sol_acesso_restrito;
revoke execute on function public.sol_caixa_parcela_canonica(uuid, text, numeric, date) from public, anon;
grant  execute on function public.sol_caixa_parcela_canonica(uuid, text, numeric, date)
  to service_role, sol_acesso_restrito;

comment on function public.sol_caixa_resolver_composto_aluno_env_v1(jsonb, jsonb) is
  'Regra do pagamento composto (um aluno, N faturas). Recebe o envelope de '
  'faturas pronto; com p_env_in nulo constroi o proprio, identico ao de antes. '
  'sol_caixa_resolver_composto_aluno_v1 e casca fina sobre esta.';
comment on function public.sol_caixa_parcela_canonica_env_v1(jsonb, uuid, text, numeric, date) is
  'Regra da parcela canonica. Recebe o envelope pronto; com p_env_in nulo '
  'constroi o proprio. sol_caixa_parcela_canonica e casca fina sobre esta.';

-- ROLLBACK
--   Reaplicar, nesta ordem, as definicoes anteriores de
--   sol_caixa_resolver_composto_aluno_v1, sol_caixa_parcela_canonica e
--   sol_caixa_resolver_pagamento_v1 (migrations 20260909163318, 20260909170500,
--   20260909193000), e depois:
--     drop function public.sol_caixa_resolver_composto_aluno_env_v1(jsonb,jsonb);
--     drop function public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date);
