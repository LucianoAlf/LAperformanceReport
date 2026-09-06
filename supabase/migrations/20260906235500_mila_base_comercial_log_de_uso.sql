-- A BASE COMERCIAL NAO DEIXAVA RASTRO DE USO (06/09/2026).
--
-- `mila_base_comercial_v1` e `STABLE` e nao escreve nada. Consequencia: nao ha
-- como responder "a base esta sendo usada? por quem? para qual pergunta? qual
-- bloco puxa mais?". A unica coisa registrada hoje e a LACUNA — ou seja, so o
-- fracasso aparece, e mesmo esse depende de o modelo se auto-denunciar.
--
-- Isso quebra justamente o ciclo que a base existe para ter: ela deve crescer a
-- partir do que acontece de verdade. Sem saber quais situacoes chegam, a
-- proxima versao dos blocos vira palpite.
--
-- ⚠️ A funcao passa de STABLE para VOLATILE. E o preco de escrever, e e barato:
--    o volume medido e de poucas consultas por dia, uma linha por chamada.
--
-- ⚠️ NAO registra o CONTEUDO dos blocos (30 KB por chamada). So titulo, versao,
--    relevancia e o publico resolvido — o suficiente para responder "qual bloco
--    serve para que pergunta" sem inchar a tabela de log.
--
-- ⚠️ `automacao_log` tem `evento` e `aluno_nome` NOT NULL e `status` com CHECK
--    que so aceita ok|warn|erro. Os tres ja derrubaram funcao em silencio neste
--    projeto (05/09 e 20/08) — vao explicitos.
--
-- ⚠️ Patch por `pg_get_functiondef` + replace com guarda, nao transcricao a mao:
--    a funcao tem ~60 linhas e a regra da casa e nao redigitar corpo vivo.

do $patch$
declare
  v_def text; v_novo text; v_n int;
  ANC_STABLE constant text := ' STABLE SECURITY DEFINER';
  ANC_RET    constant text := '  return jsonb_build_object(''ok'', true,';
  LOG_SQL constant text :=
    '  -- rastro de uso: quem perguntou o que, e o que a base devolveu.' || E'\n' ||
    '  insert into automacao_log (evento, acao, status, aluno_nome, detalhes)' || E'\n' ||
    '  values (''base_conhecimento'', ''consulta_base_comercial'', ''ok'', ''base de conhecimento'',' || E'\n' ||
    '          jsonb_build_object(' || E'\n' ||
    '            ''quem'', v_quem.nome, ''departamento'', v_quem.departamento, ''nivel'', v_quem.nivel,' || E'\n' ||
    '            ''publico'', v_publico, ''situacao'', left(coalesce(p_situacao,''''), 400),' || E'\n' ||
    '            ''blocos_no_publico'', v_total_pub,' || E'\n' ||
    '            ''devolvidos'', coalesce((select jsonb_agg(jsonb_build_object(' || E'\n' ||
    '                 ''titulo'', b->>''titulo'', ''versao'', b->>''versao'',' || E'\n' ||
    '                 ''relevancia'', b->>''relevancia'', ''envelhecido'', b->>''envelhecido''))' || E'\n' ||
    '               from jsonb_array_elements(coalesce(v_blocos,''[]''::jsonb)) b), ''[]''::jsonb),' || E'\n' ||
    '            ''vazio'', (v_blocos is null)));' || E'\n\n';
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'mila_base_comercial_v1'
     and pronamespace = 'public'::regnamespace;
  if v_def is null then
    raise exception 'mila_base_comercial_v1 nao existe';
  end if;

  -- guarda 1: a funcao ainda e STABLE (senao alguem ja mexeu e o patch nao vale)
  v_n := (length(v_def) - length(replace(v_def, ANC_STABLE, ''))) / length(ANC_STABLE);
  if v_n <> 1 then
    raise exception 'ancora STABLE: esperava 1 ocorrencia, achei %', v_n;
  end if;

  -- guarda 2: o return de sucesso aparece uma vez so
  v_n := (length(v_def) - length(replace(v_def, ANC_RET, ''))) / length(ANC_RET);
  if v_n <> 1 then
    raise exception 'ancora do return de sucesso: esperava 1, achei %', v_n;
  end if;

  -- guarda 3: nao aplicar duas vezes
  if position('consulta_base_comercial' in v_def) > 0 then
    raise notice 'log de uso ja aplicado — nada a fazer';
    return;
  end if;

  v_novo := replace(v_def, ANC_STABLE, ' SECURITY DEFINER');
  v_novo := replace(v_novo, ANC_RET, LOG_SQL || ANC_RET);
  execute v_novo;
  raise notice 'log de uso aplicado em mila_base_comercial_v1';
end $patch$;

-- A recriacao reabre EXECUTE para `anon` por causa do ALTER DEFAULT PRIVILEGES
-- do schema public — revoke NOMINAL, nao so de public.
revoke all on function public.mila_base_comercial_v1(text, text, integer) from public, anon;
grant execute on function public.mila_base_comercial_v1(text, text, integer) to service_role;

-- prova: uma consulta real grava uma linha, e a resposta nao mudou de forma.
do $prova$
declare v_tel text; v_antes int; v_depois int; v jsonb; v_acl text;
begin
  select telefone into v_tel from governanca.agente_usuarios
   where lower(departamento) = 'comercial' and coalesce(ativo, true) limit 1;
  if v_tel is null then
    raise exception 'sem consultora ativa para provar';
  end if;

  select count(*) into v_antes from automacao_log
   where evento = 'base_conhecimento' and acao = 'consulta_base_comercial';

  v := mila_base_comercial_v1(v_tel, 'lead pediu preco e sumiu', 3);
  if not (v->>'ok')::bool then
    raise exception 'a consulta parou de funcionar: %', v;
  end if;
  if jsonb_array_length(v->'blocos') = 0 then
    raise exception 'a consulta deixou de devolver bloco';
  end if;

  select count(*) into v_depois from automacao_log
   where evento = 'base_conhecimento' and acao = 'consulta_base_comercial';
  if v_depois <> v_antes + 1 then
    raise exception 'esperava 1 linha de log a mais, fui de % para %', v_antes, v_depois;
  end if;

  select array_to_string(proacl, ',') into v_acl from pg_proc
   where proname = 'mila_base_comercial_v1' and pronamespace = 'public'::regnamespace;
  if v_acl like '%anon=%' then
    raise exception 'anon voltou a ter EXECUTE: %', v_acl;
  end if;

  raise notice 'log de uso provado: % blocos devolvidos, 1 linha gravada, anon fora',
    jsonb_array_length(v->'blocos');
end $prova$;
