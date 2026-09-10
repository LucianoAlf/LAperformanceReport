-- GERADOR da migration de reconciliação. SELECT-only; não escreve nada.
--
--   psql "$DSN_PRODUCAO_SOMENTE_LEITURA" -tA -f tests/sol-caixa/gerar-reconciliacao.sql \
--     > supabase/migrations/<timestamp>_reconciliacao_<escopo>.sql
--
-- 🔴 POR QUE UM GERADOR, E NÃO COPIAR À MÃO. Cinco funções da cadeia do caixa
--    chegaram ao estado atual por migrations de PATCH (`pg_get_functiondef` +
--    `replace` + `execute`). Patch guarda a TRANSFORMAÇÃO, não o corpo
--    resultante: replayado sobre outro estado inicial, produz outra coisa. O
--    estado final só existe no catálogo vivo — e transcrevê-lo à mão, num
--    arquivo com mojibake funcional dentro de padrões `LIKE`, é pedir para
--    perder um byte em silêncio.
--
-- O que ele lê, tudo por SELECT:
--    · `supabase_migrations.schema_migrations` → procedência (versão + nome da
--      última migration que define ou patcha cada função);
--    · `pg_get_functiondef` + catálogo → corpo final, assinatura, volatility,
--      SECURITY DEFINER, search_path, ACL e comentário.
--
-- O que ele emite: `create or replace` verbatim + `revoke/grant` derivados do
-- `proacl` real + `comment` + um bloco de pós-condição que confere o md5 do
-- corpo INSTALADO contra o de produção. É esse bloco que torna o transporte
-- seguro: byte perdido reprova, não passa quieto.
--
-- ⚠️ NUNCA rodar contra produção com intenção de aplicar. Produção é fonte
--    SELECT-only; o arquivo gerado vai para a branch e para o container.
-- ⚠️ Ajuste a lista `alvo` ao escopo que se quer reconciliar.

\pset tuples_only on
\pset format unaligned

with alvo(sig) as (values
  ('public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(uuid,integer,integer,text,text,date)'),
  ('public.sol_caixa_aluno_da_fatura_v1(uuid,uuid)'),
  ('public.sol_caixa_lancar_recebimento_lote_v1(jsonb)'),
  ('public.sol_caixa_normalizar_competencia_v1(text)'),
  ('public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date)'),
  ('public.get_faturas_alunos_financeiro_v1_canonica_20260817(uuid,integer,integer,text,text,date)')),
f as (
  select a.sig, p.oid, p.proname,
         p.oid::regprocedure::text as ident,
         pg_get_functiondef(p.oid) as def,
         md5(replace(substring(pg_get_functiondef(p.oid)
              from position('$function$' in pg_get_functiondef(p.oid))), chr(13),'')) as hash_corpo,
         coalesce(obj_description(p.oid,'pg_proc'),'') as comentario,
         -- ⚠️ ACL derivada do `proacl` REAL, nunca suposta. A canônica, por
         --    exemplo, É executável por `authenticated` (a tela do financeiro a
         --    consome) — impor a regra das outras quebraria a tela.
         (select coalesce(string_agg(quote_ident(g), ', ' order by g), '')
            from (select distinct (aclexplode(p.proacl)).grantee::regrole::text as g) x
           where g <> '-' and g <> 'postgres') as grantees
  from alvo a join pg_proc p on p.oid = a.sig::regprocedure),
prov as (
  select f.proname, m.version, m.name,
         array_to_string(m.statements,' ') ~* 'pg_get_functiondef' as e_patch,
         row_number() over (partition by f.proname order by m.version desc) as rn
  from f join supabase_migrations.schema_migrations m
    on array_to_string(m.statements,' ') ilike ('%'||f.proname||'%')),
corpo as (
  select string_agg(
    format(E'-- %s\n-- procedencia: ledger %s (%s)%s\n-- hash do corpo vivo: %s\n%s;\n\nrevoke all on function %s from public, anon;\ngrant execute on function %s to %s;\n%s\n',
      f.ident,
      coalesce(pr.version,'<sem entrada no ledger>'), coalesce(pr.name,'-'),
      case when pr.e_patch then ' [PATCH — corpo final so existe no catalogo]' else '' end,
      f.hash_corpo, f.def, f.ident, f.ident, nullif(f.grantees,''),
      case when f.comentario = '' then ''
           else format(E'comment on function %s is %s;', f.ident, quote_literal(f.comentario)) end),
    E'\n' order by f.proname) as blocos,
    string_agg(format('    [%s, %s]', quote_literal(f.ident), quote_literal(f.hash_corpo)),
               E',\n' order by f.proname) as pares
  from f left join prov pr on pr.proname = f.proname and pr.rn = 1)
select
  E'-- ⚠️ ARQUIVO GERADO POR tests/sol-caixa/gerar-reconciliacao.sql. NAO EDITAR A MAO.\n'
  '-- gerado_em: ' || to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') || E' BRT\n'
  E'\\set ON_ERROR_STOP on\n\n'
  || corpo.blocos
  || E'\ndo $pos$\ndeclare\n  v_falhas text[] := ''{}'';\n  v_sig text; v_esp text; v_obt text; v_i int;\n'
     '  v_esperado text[][] := array[\n' || corpo.pares || E'\n  ];\n'
     'begin\n  for v_i in 1 .. array_length(v_esperado,1) loop\n'
     '    v_sig := v_esperado[v_i][1]; v_esp := v_esperado[v_i][2];\n'
     '    select md5(replace(substring(pg_get_functiondef(v_sig::regprocedure)\n'
     '           from position(''$function$'' in pg_get_functiondef(v_sig::regprocedure))), chr(13), ''''))\n'
     '      into v_obt;\n'
     '    if v_obt is distinct from v_esp then\n'
     '      v_falhas := v_falhas || format(''%s: corpo %s, esperado %s'', v_sig, left(coalesce(v_obt,''<nulo>''),12), left(v_esp,12));\n'
     '    end if;\n'
     '    if has_function_privilege(''anon'', v_sig, ''EXECUTE'') then\n'
     '      v_falhas := v_falhas || format(''%s: executavel por anon'', v_sig);\n'
     '    end if;\n'
     '    if not has_function_privilege(''service_role'', v_sig, ''EXECUTE'') then\n'
     '      v_falhas := v_falhas || format(''%s: service_role SEM execute'', v_sig);\n'
     '    end if;\n  end loop;\n'
     '  if array_length(v_falhas,1) > 0 then\n'
     '    raise exception E''RECONCILIACAO NAO FECHOU:\\n  %'', array_to_string(v_falhas, E''\\n  '');\n'
     '  end if;\n  raise notice ''reconciliacao ok: corpo e ACL conferidos contra producao'';\nend $pos$;\n'
from corpo;
