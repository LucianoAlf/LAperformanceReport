-- A BASE PASSA A SER ACHÁVEL — duas correções medidas em 06/09/2026.
--
-- 🔴 CORREÇÃO 1: A BUSCA EXIGIA TODAS AS PALAVRAS.
--    `websearch_to_tsquery` monta um AND. Pergunta de gente é frase inteira, e
--    aí nada casa: "uma das consultoras caiu de rendimento, o que eu faço" não
--    encontrava NADA — nem o bloco 8, que é exatamente sobre isso. Medido em 5
--    perguntas reais do shadow: **3 davam zero resultado**.
--    Agora a situação vira um **OR dos lexemas** dela e o `ts_rank` ordena.
--    Depois da correção, as 6 perguntas do ensaio acham o bloco certo — 5 delas
--    em primeiro lugar.
--
-- 🔴 CORREÇÃO 2: NÃO HAVIA COMO LISTAR O CATÁLOGO.
--    Só existia busca, então para saber o que existe a Mila tinha que adivinhar
--    o tema de cada bloco. No ensaio ela achou 6 de 7 e foi honesta: "a base diz
--    que há 7 blocos públicos, mas um deles não casou com as buscas que testei,
--    então eu não vou inventar". Toda resposta agora traz `catalogo` — título,
--    versão e público de tudo que aquela pessoa alcança, **sem conteúdo**: é
--    para ela saber o que pedir, não para despejar.
--
-- ⚠️ O gate não mudou: departamento + nível, resolvido no servidor pelo
--    telefone. Consultora continua sem alcançar bloco de liderança.
--
-- ⚠️ Arquivo versionado DEPOIS de aplicado (mesmo dia), como manda a casa. O
--    corpo aqui é o mesmo que está em produção.

CREATE OR REPLACE FUNCTION public.mila_base_comercial_v1(p_solicitante_telefone text, p_situacao text DEFAULT NULL::text, p_limite integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quem record; v_publico text; v_limite int := least(greatest(coalesce(p_limite,3),1),3);
  v_blocos jsonb; v_catalogo jsonb; v_total_pub int; v_dep text; v_niv text;
  v_q tsquery;
begin
  select * into v_quem
  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''), '\D', '', 'g'));
  if v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido',
      'recado', 'Nao consegui identificar quem esta perguntando — sem carimbo eu nao entrego conteudo.');
  end if;

  v_dep := lower(coalesce(v_quem.departamento,''));
  v_niv := lower(coalesce(v_quem.nivel,''));
  v_publico := case
    when v_niv = 'diretoria' or (v_dep = 'comercial' and v_niv = 'lider') then 'lideranca'
    when v_dep = 'comercial' then 'comercial'
    else null end;
  if v_publico is null then
    return jsonb_build_object('ok', false, 'motivo', 'fora_do_publico_da_base',
      'quem', jsonb_build_object('nome', v_quem.nome, 'departamento', v_quem.departamento, 'nivel', v_quem.nivel),
      'recado', 'Essa base e material do time comercial — nao e para este solicitante.');
  end if;

  -- OR dos lexemas da pergunta. Sem lexema util (frase so de stopword), fica null
  -- e a funcao devolve por ordem, como no pedido de catalogo.
  if coalesce(btrim(p_situacao),'') <> '' then
    select to_tsquery('portuguese', string_agg(lexeme, ' | ')) into v_q
    from unnest(to_tsvector('portuguese', p_situacao));
  end if;

  select count(*), jsonb_agg(jsonb_build_object(
           'titulo', b.titulo, 'versao', b.versao, 'publico', b.publico) order by b.ordem)
    into v_total_pub, v_catalogo
  from base_conhecimento_blocos b
  where b.ativo and b.estado='aprovado'
    and (b.publico = v_publico or (v_publico='lideranca' and b.publico='comercial'));

  select jsonb_agg(x order by x->>'ordem_rank') into v_blocos
  from (
    select jsonb_build_object(
             'id', b.id, 'titulo', b.titulo, 'versao', b.versao, 'publico', b.publico,
             'revisar_em', b.revisar_em, 'aprovado_por', b.aprovado_por, 'aprovado_em', b.aprovado_em,
             'envelhecido', (b.revisar_em is not null and b.revisar_em < current_date),
             'relevancia', round(ts_rank(to_tsvector('portuguese', b.titulo||' '||b.conteudo),
                                         coalesce(v_q, to_tsquery('a')))::numeric, 4),
             'conteudo', b.conteudo,
             'ordem_rank', lpad((row_number() over (
                order by case when v_q is null then 0
                              else -ts_rank(to_tsvector('portuguese', b.titulo||' '||b.conteudo), v_q) end,
                         b.ordem))::text, 3, '0')) x
    from base_conhecimento_blocos b
    where b.ativo and b.estado='aprovado'
      and (b.publico = v_publico or (v_publico='lideranca' and b.publico='comercial'))
      and (v_q is null or to_tsvector('portuguese', b.titulo||' '||b.conteudo) @@ v_q)
    order by case when v_q is null then 0
                  else -ts_rank(to_tsvector('portuguese', b.titulo||' '||b.conteudo), v_q) end, b.ordem
    limit v_limite) s;

  return jsonb_build_object('ok', true,
    'quem', jsonb_build_object('nome', v_quem.nome, 'departamento', v_quem.departamento, 'nivel', v_quem.nivel),
    'publico_resolvido', v_publico, 'blocos_no_publico', v_total_pub,
    'catalogo', coalesce(v_catalogo,'[]'::jsonb), 'blocos', coalesce(v_blocos,'[]'::jsonb),
    'motivo_vazio', case when v_total_pub = 0 then 'base_sem_bloco_aprovado'
                         when v_blocos is null then 'nenhum_bloco_casou_com_a_situacao' else null end);
end; $function$
;

revoke all on function public.mila_base_comercial_v1(text, text, integer) from public, anon;
grant execute on function public.mila_base_comercial_v1(text, text, integer) to service_role;
