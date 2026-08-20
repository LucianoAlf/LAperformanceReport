-- Correção da migration 20260820103419: `v_campos_aplicados || 'forma_pagamento_id'`
-- estoura com `malformed array literal`. Em Postgres, concatenar text[] com um literal de
-- string faz o parser tentar ler a string como ARRAY, não como elemento. Precisa de cast.
--
-- ⚠️ O erro só aparecia em runtime, no ramo que executa quando o patch traz
-- forma_pagamento_id — e como a chamada do sync está dentro de try/catch, ele era engolido
-- e o run terminava com `erros: 0`. Dois runs seguidos "passaram" sem aplicar nada.
-- Testar a função com dado real, e não só reler o código, foi o que achou.
--
-- O arquivo 20260820103419 já foi versionado com o cast, então em base nova ele nasce
-- correto e esta migration vira no-op.

do $mig$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'aplicar_cadastro_emusys_canonico'
    and pg_get_function_identity_arguments(p.oid) = 'p_unidade_id uuid, p_aluno_id integer, p_emusys_matricula_id text, p_patch jsonb';

  if position('|| ''forma_pagamento_id''::text' in v_def) > 0 then
    raise notice 'cast ja aplicado';
    return;
  end if;

  v_new := replace(
    v_def,
    'v_campos_aplicados := v_campos_aplicados || ''forma_pagamento_id'';',
    'v_campos_aplicados := v_campos_aplicados || ''forma_pagamento_id''::text;'
  );

  if v_new = v_def then
    raise exception 'ancora do concat nao encontrada';
  end if;

  execute v_new;
end $mig$;
