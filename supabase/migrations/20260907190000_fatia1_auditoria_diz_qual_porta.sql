-- FATIA 1 — a auditoria passa a dizer QUAL porta, nao so quem (07/09/2026).
--
-- ⚠️ O buraco: `automacao_log.acao` era sempre `resolver_escopo`, entao o
--    registro respondia "quem perguntou" e nao "o que pediu". Para uma trilha
--    cuja razao de existir e tornar verificavel um telefone que o modelo
--    afirma, saber que Fulano consultou **inadimplencia** e diferente de saber
--    que ele consultou **alguma coisa**.
--
-- ⚠️ A porta NAO precisa se declarar — seria mudar as 12 e criar a chance de a
--    13a nascer sem se declarar (o mesmo tipo de furo do `motivo_saida_id`,
--    que dependia de a edge lembrar). `PG_CONTEXT` do plpgsql traz a pilha de
--    chamada, e dela sai o nome de quem chamou. Porta nova ja nasce coberta.
--
-- ⚠️ Chamada direta (ensaio, psql) nao tem porta na pilha e grava
--    `chamada_direta` — que e a verdade, nao um buraco.

do $patch$
declare v_def text; n int;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname='sol_resolver_escopo_v1' and pronamespace='public'::regnamespace;

  -- declara ancoras esperadas (27/08: assumir 1 escondeu metade da correcao)
  n := (length(v_def) - length(replace(v_def, 'declare v_quem record;', '')))
       / length('declare v_quem record;');
  if n <> 1 then raise exception 'ANCORA declare: esperava 1, achei %', n; end if;

  n := (length(v_def) - length(replace(v_def, '''resolver_escopo'',', '')))
       / length('''resolver_escopo'',');
  if n <> 1 then raise exception 'ANCORA acao: esperava 1, achei %', n; end if;

  v_def := replace(v_def, 'declare v_quem record;',
                          'declare v_ctx text; v_porta text; v_quem record;');

  v_def := replace(v_def, 'begin' || chr(10) || '  select * into v_quem',
    'begin' || chr(10)
 || '  -- de qual porta veio: lido da PILHA, para porta nova nascer coberta.' || chr(10)
 || '  get diagnostics v_ctx = pg_context;' || chr(10)
 || '  v_porta := coalesce((select m[1] from regexp_matches(v_ctx, ''function (sol_porta_[a-z_0-9]+)'', ''g'') m limit 1),' || chr(10)
 || '                      ''chamada_direta'');' || chr(10)
 || '  select * into v_quem');

  v_def := replace(v_def, '''resolver_escopo'',', 'v_porta,');

  execute v_def;
  raise notice 'auditoria agora carimba a porta de origem';
end $patch$;

revoke all on function public.sol_resolver_escopo_v1(text, text) from public, anon;
grant execute on function public.sol_resolver_escopo_v1(text, text)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

-- ── prova: porta na pilha aparece; chamada direta se identifica como tal ────
do $prova$
declare t text; v_u uuid; v_porta_direta text; v_porta_via text; v_marco timestamptz := clock_timestamp();
begin
  select telefone, unidade_id into t, v_u from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;

  perform sol_resolver_escopo_v1(t, null);
  perform sol_porta_caixa_do_dia_v1(t, null, null);

  -- ⚠️ ordena por id, nao por created_at: as duas linhas nascem na mesma
  --    transacao e compartilham `now()` (erro que ja cometi em 07/09).
  select acao into v_porta_direta from automacao_log
   where evento='sol_portas' order by id asc offset 0 limit 1;
  select acao into v_porta_via from automacao_log
   where evento='sol_portas' and created_at >= v_marco order by id desc limit 1;

  select acao into v_porta_direta from automacao_log
   where evento='sol_portas' and created_at >= v_marco order by id asc limit 1;

  if v_porta_direta <> 'chamada_direta' then
    raise exception 'chamada direta devia gravar chamada_direta, gravou %', v_porta_direta;
  end if;
  if v_porta_via <> 'sol_porta_caixa_do_dia_v1' then
    raise exception 'chamada pela porta devia gravar o nome dela, gravou %', v_porta_via;
  end if;

  raise notice 'prova: direta=% · pela porta=%', v_porta_direta, v_porta_via;
end $prova$;
