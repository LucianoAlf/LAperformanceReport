-- A BASE PASSA A ENTREGAR O CONTEXTO DO MES JUNTO COM OS BLOCOS (06/09/2026).
--
-- Medido por repeticao: com a Krissya, no comeco do mes, a Mila cita campanha
-- ou calendario em apenas **3 de 5 rodadas**. Nas outras duas ela responde bem,
-- mas pelo FUNIL — bumerangue, experimental, indicacao — e nunca chega no ritmo
-- do mes.
--
-- A causa nao e desatencao: e a BUSCA. A pergunta real e "como a gente ataca
-- setembro?", e a busca e um OR de lexemas. "setembro", "atacar" e "mes" nao
-- aparecem nos blocos 6 (campanha e corridinha) e 9 (calendario comercial) —
-- aparecem nos blocos de funil, que e para onde o ranking a manda. Ela responde
-- com o que recebeu.
--
-- ⚠️ Ja tentei resolver isso com instrucao e nao resolve de forma confiavel:
--    regra no SOUL disputa atencao com 130 linhas de prompt, e a distribuicao
--    fica exatamente assim, intermitente. O que funciona e colocar o FATO ao
--    lado do dado, no proprio resultado da tool.
--
-- ⚠️ `campanha_do_mes` diz "nao registrada" e NAO "nao existe". Nao ha tabela de
--    campanha em lugar nenhum do sistema — afirmar que falta seria inventar.
--    A liderança e quem sabe; o papel dela e PERGUNTAR. (Mesma regra que ja
--    vale no briefing proativo, no campo `perguntar_campanha`.)
--
-- ⚠️ `blocos_de_ritmo` sai da PROPRIA base, casando titulo, e nao de uma lista
--    fixa aqui dentro: bloco novo de calendario entra sozinho, e bloco
--    renomeado nao vira referencia morta.
--
-- ⚠️ So para `lideranca`. A consultora nao decide campanha do mes; para ela
--    isso seria ruido, e ruido ensina a ignorar o campo.

do $patch$
declare
  v_def text; v_novo text; v_n int;
  ANC constant text := '  return jsonb_build_object(''ok'', true,';
  CTX constant text :=
    '  -- Contexto temporal ao lado do dado: sem isso a busca lexical nunca leva' || E'\n' ||
    '  -- "como atacamos setembro?" aos blocos de campanha/calendario (medido:' || E'\n' ||
    '  -- 3 de 5). Nao substitui o ranking — anda junto com ele.' || E'\n' ||
    '  if v_publico = ''lideranca'' then' || E'\n' ||
    '    select jsonb_build_object(' || E'\n' ||
    '      ''dia_do_mes'', extract(day from (now() at time zone ''America/Sao_Paulo''))::int,' || E'\n' ||
    '      ''mes'', to_char((now() at time zone ''America/Sao_Paulo''), ''TMMonth''),' || E'\n' ||
    '      ''campanha_do_mes'', ''nao registrada em nenhuma tabela do sistema — PERGUNTE se ja definiram, nunca afirme que falta'',' || E'\n' ||
    '      ''blocos_de_ritmo'', coalesce(jsonb_agg(jsonb_build_object(' || E'\n' ||
    '          ''titulo'', b.titulo, ''versao'', b.versao) order by b.ordem), ''[]''::jsonb))' || E'\n' ||
    '      into v_contexto' || E'\n' ||
    '    from base_conhecimento_blocos b' || E'\n' ||
    '    where b.ativo and b.estado = ''aprovado''' || E'\n' ||
    '      and (b.titulo ilike ''%campanha%'' or b.titulo ilike ''%calend%'' or b.titulo ilike ''%corridinha%'');' || E'\n' ||
    '  end if;' || E'\n\n';
  DECL constant text := '  v_q tsquery;';
  DECL_NOVA constant text := '  v_q tsquery; v_contexto jsonb;';
  RET_ANTIGO constant text := '''motivo_vazio'', case when v_total_pub = 0 then ''base_sem_bloco_aprovado''';
  RET_NOVO constant text := '''contexto'', v_contexto,' || E'\n' ||
    '    ''motivo_vazio'', case when v_total_pub = 0 then ''base_sem_bloco_aprovado''';
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'mila_base_comercial_v1' and pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception 'mila_base_comercial_v1 nao existe'; end if;
  if position('blocos_de_ritmo' in v_def) > 0 then
    raise notice 'contexto do mes ja aplicado — nada a fazer';
    return;
  end if;

  foreach v_novo in array array[DECL, ANC, RET_ANTIGO] loop
    v_n := (length(v_def) - length(replace(v_def, v_novo, ''))) / length(v_novo);
    if v_n <> 1 then
      raise exception 'ancora "%": esperava 1, achei %', left(v_novo, 40), v_n;
    end if;
  end loop;

  v_novo := replace(v_def, DECL, DECL_NOVA);
  v_novo := replace(v_novo, ANC, CTX || ANC);
  v_novo := replace(v_novo, RET_ANTIGO, RET_NOVO);
  execute v_novo;
  raise notice 'contexto do mes acrescentado';
end $patch$;

revoke all on function public.mila_base_comercial_v1(text, text, integer, text) from public, anon;
grant execute on function public.mila_base_comercial_v1(text, text, integer, text) to service_role;

-- prova: lideranca recebe o contexto com os blocos de ritmo; consultora nao.
do $prova$
declare v_lid text; v_con text; v jsonb; v_ritmo int;
begin
  select telefone into v_lid from governanca.agente_usuarios
   where lower(nivel) = 'diretoria' and coalesce(ativo, true) limit 1;
  select telefone into v_con from governanca.agente_usuarios
   where lower(departamento) = 'comercial' and lower(coalesce(nivel,'')) <> 'diretoria'
     and coalesce(ativo, true) limit 1;
  if v_lid is null or v_con is null then
    raise exception 'faltou telefone de lideranca ou de consultora para provar';
  end if;

  v := mila_base_comercial_v1(v_lid, 'como a gente ataca setembro', 3, 'ensaio');
  if v->'contexto' is null or v->'contexto' = 'null'::jsonb then
    raise exception 'lideranca ficou sem contexto do mes';
  end if;
  v_ritmo := jsonb_array_length(v->'contexto'->'blocos_de_ritmo');
  if v_ritmo < 1 then
    raise exception 'nenhum bloco de ritmo casou pelo titulo — a base mudou de nome?';
  end if;
  if (v->'contexto'->>'dia_do_mes')::int not between 1 and 31 then
    raise exception 'dia_do_mes fora de faixa: %', v->'contexto'->>'dia_do_mes';
  end if;

  v := mila_base_comercial_v1(v_con, 'como a gente ataca setembro', 3, 'ensaio');
  if v->'contexto' is not null and v->'contexto' <> 'null'::jsonb then
    raise exception 'consultora recebeu contexto de lideranca — nao deveria';
  end if;

  raise notice 'contexto provado: % bloco(s) de ritmo para lideranca, nada para consultora', v_ritmo;
end $prova$;
