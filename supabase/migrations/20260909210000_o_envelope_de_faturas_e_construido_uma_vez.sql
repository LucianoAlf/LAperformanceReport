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
  -- ⚠️ NORMALIZA CRLF ANTES DE CASAR ANCORA. Arquivo que passou por Windows
  --    injeta `` no corpo da funcao; ancora multilinha entao nao casa e a
  --    migration aborta pela propria guarda. Foi exatamente isso na 193000.
  v_def := replace(pg_get_functiondef('public.sol_caixa_resolver_composto_aluno_v1(jsonb)'::regprocedure), chr(13), '');
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
  v_def := replace(pg_get_functiondef(
    'public.sol_caixa_parcela_canonica(uuid,text,numeric,date)'::regprocedure), chr(13), '');
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

-- ⚠️ O RESOLVER SAIU DAQUI. Ele era patchado por `pg_get_functiondef` +
--    `replace` neste arquivo; hoje a definicao FINAL dele e autocontida em
--    `20260909232000_resolver_pagamento_autocontido.sql`, que roda depois e ja
--    chama as variantes `_env_v1` criadas aqui. Patch que depende do estado em
--    que encontra a funcao nao reproduz num banco novo — foi o que derrubou a
--    20260909193000 e deixou a regra financeira FORA do banco sem ninguem ver.

-------------------------------------------------------------------- 4) acesso
-- 🔴 `CREATE OR REPLACE` preserva ACL, mas função NOVA nasce com EXECUTE para
--    `anon` E PARA `authenticated` — o ALTER DEFAULT PRIVILEGES do schema
--    concede aos três papéis. Revogar só de `public, anon` deixa toda a base
--    autenticada executando uma função SECURITY DEFINER de dinheiro. As duas
--    `_env_v1` nasceram assim e o CI ficou VERDE: a asserção de ACL do ensaio
--    não listava estas assinaturas. Verde que não olha não é prova.
-- ⚠️ As duas de baixo são `CREATE OR REPLACE` de funções que já existiam, então
--    herdam a ACL antiga — e o ensaio prova que `authenticated` não tem EXECUTE
--    nelas. Por isso o revoke delas fica como está: alargar sem medir seria
--    mexer em permissão de consumidor vivo às cegas.
revoke execute on function public.sol_caixa_resolver_composto_aluno_env_v1(jsonb, jsonb)
  from public, anon, authenticated;
grant  execute on function public.sol_caixa_resolver_composto_aluno_env_v1(jsonb, jsonb)
  to service_role, sol_acesso_restrito;

revoke execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb, uuid, text, numeric, date)
  from public, anon, authenticated;
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

-- 🔴 POR QUE AS DUAS `_env_v1` CONTINUAM DERIVADAS, e nao autocontidas.
--    Elas TEM de andar em lockstep com `sol_caixa_resolver_composto_aluno_v1` e
--    `sol_caixa_parcela_canonica`: sao a MESMA regra, com o envelope recebido em
--    vez de construido. Copiar os corpos para ca criaria uma segunda fonte de
--    verdade que envelhece em silencio — exatamente a doenca que esta frente
--    inteira diagnosticou. Derivar garante que nunca divergem.
--    O que fragilizava a derivacao era o CRLF, e isso agora e normalizado; as
--    guardas de saida acima recusam executar se o rename nao aconteceu ou se a
--    definicao ainda aponta para a funcao original.
--    ⚠️ A base delas e reproduzivel: as duas funcoes de origem estao no
--       manifesto 16/16, conferidas contra producao.
