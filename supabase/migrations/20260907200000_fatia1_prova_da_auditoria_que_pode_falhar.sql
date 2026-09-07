-- FATIA 1 — refaz a prova da auditoria, agora capaz de falhar (07/09/2026).
--
-- 🔴 A PROVA DA MIGRATION ANTERIOR (`20260907190000`) PASSOU SEM PROVAR NADA.
--    Ela imprimiu `direta=<NULL> · pela porta=<NULL>` e **nao levantou excecao**,
--    porque `NULL <> 'chamada_direta'` e NULL — que nao e verdadeiro, entao o
--    `if` nao dispara. Guarda que nao pode falhar e pior que guarda nenhuma:
--    anuncia uma confianca que ela nao tem.
--
--    E o motivo do NULL foi o segundo erro, ja anotado no proprio comentario da
--    migration e cometido do mesmo jeito: `automacao_log.created_at` usa o
--    default `now()`, que e o **inicio da transacao**, enquanto o meu marco era
--    `clock_timestamp()`. Nenhuma linha satisfazia `created_at >= v_marco`.
--
-- 🔴 As duas licoes, que valem para toda prova em bloco `do $$`:
--    1. **Comparar com `is distinct from`**, nunca `<>`, quando o valor pode ser
--       NULL — senao a guarda vira decorativa.
--    2. **Marcar por `id`, nunca por tempo**, para achar linhas escritas na
--       mesma transacao: `now()` nao anda dentro dela.
--    3. Provar que a prova PODE falhar antes de confiar nela.

do $prova$
declare
  t text; v_id_marco bigint;
  v_direta text; v_via text; v_quem text;
begin
  select telefone into t from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;
  if t is null then raise exception 'sem colaborador com unidade para o ensaio'; end if;

  -- ⚠️ marco por ID: `now()` nao avanca dentro da transacao
  select coalesce(max(id), 0) into v_id_marco from automacao_log where evento='sol_portas';

  perform sol_resolver_escopo_v1(t, null);          -- sem porta na pilha
  perform sol_porta_caixa_do_dia_v1(t, null, null); -- com porta na pilha

  select acao into v_direta from automacao_log
   where evento='sol_portas' and id > v_id_marco order by id asc limit 1;
  select acao, detalhes->>'resolveu_para' into v_via, v_quem from automacao_log
   where evento='sol_portas' and id > v_id_marco order by id desc limit 1;

  -- ⚠️ `is distinct from` pega o NULL que o `<>` deixou passar
  if v_direta is distinct from 'chamada_direta' then
    raise exception 'chamada direta devia gravar chamada_direta, gravou %', coalesce(v_direta, '<NULL>');
  end if;
  if v_via is distinct from 'sol_porta_caixa_do_dia_v1' then
    raise exception 'chamada pela porta devia gravar o nome dela, gravou %', coalesce(v_via, '<NULL>');
  end if;
  if v_quem is null then
    raise exception 'a linha nao guardou para quem resolveu';
  end if;

  -- ⚠️ a prova precisa provar que SABE falhar: se o marco nao pegou linha
  --    nenhuma, os dois `select` acima teriam dado NULL e agora explodem —
  --    este check e o que garante que o caminho de falha e alcancavel.
  if (select count(*) from automacao_log where evento='sol_portas' and id > v_id_marco) < 2 then
    raise exception 'esperava ao menos 2 linhas novas; a prova nao exercitou nada';
  end if;

  raise notice 'prova VALIDA: direta=% · pela porta=% · quem=%', v_direta, v_via, v_quem;
end $prova$;
