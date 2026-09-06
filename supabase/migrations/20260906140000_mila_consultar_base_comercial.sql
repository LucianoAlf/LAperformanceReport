-- A MILA PASSA A CONSULTAR A BASE COMERCIAL — passo 3 do plano de carga.
--
-- Duas RPCs, nenhuma tabela nova:
--   `mila_base_comercial_v1`      — devolve 1 a 3 blocos APROVADOS para a situação
--   `mila_registrar_lacuna_base_v1` — a Mila avisa quando a base não tinha resposta
--
-- 🔴 O GATE É AQUI, NO SERVIDOR, PELO TELEFONE. Não é argumento da tool e não é
--    decisão do modelo: `governanca.quem_eh` diz o nível de quem perguntou e a
--    função escolhe o público. Consultora nunca alcança bloco `lideranca` —
--    nem o texto, nem o título, nem um resumo. Se o gate morasse no MCP, bastaria
--    alguém chamar a RPC direto para furá-lo.
--
-- ⚠️ SÓ DEVOLVE `estado='aprovado'`. Hoje isso significa **zero blocos** — os 11
--    estão em `candidato`. A função entra funcionando e muda, sozinha e sem
--    deploy, quando o Alf aprovar. É de propósito: a tool existir antes do
--    conteúdo é melhor que o contrário.
--
-- ⚠️ A BUSCA É POR TEXTO COMPLETO sobre o próprio bloco, não por um mapa de
--    palavras-chave numa tabela nova. O bloco já carrega a seção "Quando usar",
--    escrita pelo Alf — é ela que casa com a situação. Mapa em tabela separada
--    seria uma segunda fonte da mesma regra, e divergiria do texto na primeira
--    revisão.

create or replace function public.mila_base_comercial_v1(
  p_solicitante_telefone text,
  p_situacao             text default null,
  p_limite               integer default 3
) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_quem      record;
  v_publico   text;
  v_limite    int := least(greatest(coalesce(p_limite, 3), 1), 3);
  v_blocos    jsonb;
  v_total_pub int;
  v_dep       text;
  v_niv       text;
begin
  -- ── quem pergunta ─────────────────────────────────────────────────────────
  select * into v_quem
  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''), '\D', '', 'g'));

  if v_quem.nome is null then
    return jsonb_build_object(
      'ok', false, 'motivo', 'solicitante_desconhecido',
      'recado', 'Nao consegui identificar quem esta perguntando — sem carimbo eu nao entrego conteudo.');
  end if;

  -- 🔴 A RÉGUA É DEPARTAMENTO + NÍVEL, NUNCA O NÍVEL SOZINHO. `nivel='lider'`
  --    inclui Rose (financeiro), Yuri (marketing), Juliana e Quintela
  --    (pedagógico), Clayton e Jerêh (administrativo): seis pessoas que veriam
  --    mídia paga, corridinha e o bloco de liderança do time comercial. Foi
  --    exatamente essa a falha de 05/09, quando custo de mídia ficou visível
  --    para 7 pessoas — e eu a repeti aqui, na primeira versão desta função.
  --    Quem está fora do comercial e fora da diretoria não vê bloco NENHUM:
  --    a base é material de venda, não conteúdo geral da casa.
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

  select count(*) into v_total_pub
  from base_conhecimento_blocos b
  where b.ativo and b.estado = 'aprovado'
    and (b.publico = v_publico or (v_publico = 'lideranca' and b.publico = 'comercial'));

  -- ── os blocos ─────────────────────────────────────────────────────────────
  -- Sem situação: devolve os primeiros por ordem (a Mila pediu "o que existe").
  -- Com situação: ranqueia por full-text sobre título + conteúdo.
  select jsonb_agg(x order by x->>'ordem_rank')
    into v_blocos
  from (
    select jsonb_build_object(
             'id', b.id, 'titulo', b.titulo, 'versao', b.versao,
             'publico', b.publico, 'revisar_em', b.revisar_em,
             'aprovado_por', b.aprovado_por, 'aprovado_em', b.aprovado_em,
             -- ⚠️ `envelhecido` no mesmo espírito de `mila_padroes_v1`: conteúdo
             -- de venda vencido é pista, não verdade. A Mila tem de poder dizer.
             'envelhecido', (b.revisar_em is not null and b.revisar_em < current_date),
             'conteudo', b.conteudo,
             'ordem_rank', lpad((row_number() over (
                order by case when p_situacao is null or btrim(p_situacao) = '' then 0
                              else -ts_rank(
                                     to_tsvector('portuguese', b.titulo || ' ' || b.conteudo),
                                     websearch_to_tsquery('portuguese', p_situacao)) end,
                         b.ordem))::text, 3, '0')
           ) x
    from base_conhecimento_blocos b
    where b.ativo and b.estado = 'aprovado'
      and (b.publico = v_publico or (v_publico = 'lideranca' and b.publico = 'comercial'))
      and (p_situacao is null or btrim(p_situacao) = ''
           or to_tsvector('portuguese', b.titulo || ' ' || b.conteudo)
              @@ websearch_to_tsquery('portuguese', p_situacao))
    order by case when p_situacao is null or btrim(p_situacao) = '' then 0
                  else -ts_rank(
                         to_tsvector('portuguese', b.titulo || ' ' || b.conteudo),
                         websearch_to_tsquery('portuguese', p_situacao)) end,
             b.ordem
    limit v_limite
  ) s;

  return jsonb_build_object(
    'ok', true,
    'quem', jsonb_build_object('nome', v_quem.nome, 'departamento', v_quem.departamento, 'nivel', v_quem.nivel),
    'publico_resolvido', v_publico,
    'blocos_no_publico', v_total_pub,
    'blocos', coalesce(v_blocos, '[]'::jsonb),
    -- ⚠️ Distinguir "a base nao tem isso" de "a base esta vazia" importa: a
    -- primeira e lacuna para registrar, a segunda e so o conteudo nao aprovado
    -- ainda. Dizer "nao temos material sobre X" com a base vazia seria mentira.
    'motivo_vazio', case
      when v_total_pub = 0 then 'base_sem_bloco_aprovado'
      when v_blocos is null then 'nenhum_bloco_casou_com_a_situacao'
      else null end);
end;
$function$;

revoke all on function public.mila_base_comercial_v1(text, text, integer) from public, anon;
grant execute on function public.mila_base_comercial_v1(text, text, integer) to service_role;

comment on function public.mila_base_comercial_v1(text, text, integer) is
  'Base de conhecimento comercial para a Mila. Gate por telefone NO SERVIDOR (governanca.quem_eh): consultora nunca alcanca bloco lideranca. So devolve estado=aprovado. Busca por full-text sobre o proprio bloco — a secao "Quando usar" e o mapa.';

-- ── a lacuna ────────────────────────────────────────────────────────────────
-- ⚠️ SEM TABELA NOVA: vai para `automacao_log`, que ja e o lugar onde este
--    projeto guarda "aconteceu isso e alguem precisa olhar". Vira fila de
--    escrita da base sem inventar objeto.
create or replace function public.mila_registrar_lacuna_base_v1(
  p_solicitante_telefone text,
  p_situacao             text,
  p_o_que_faltou         text
) returns jsonb
language plpgsql volatile security definer set search_path to 'public' as $function$
declare v_quem record;
begin
  select * into v_quem
  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''), '\D', '', 'g'));
  if v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido');
  end if;
  if coalesce(btrim(p_o_que_faltou),'') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem_descricao');
  end if;

  -- ⚠️ `aluno_nome` E `evento` sao NOT NULL nesta tabela. O `aluno_nome` ja
  -- derrubou funcao em silencio em 05/09 (o insert falhava DEPOIS de a funcao
  -- ter feito o trabalho, e o efeito voltava atras sem rastro). Os dois vao
  -- explicitos, com rotulo, nunca null.
  -- ⚠️ `status` so aceita ok|warn|erro — 'aviso' viola o CHECK e cai no
  -- exception handler, que foi como um alerta ficou sem rastro em 20/08.
  insert into automacao_log (evento, acao, status, aluno_nome, detalhes)
  values ('base_conhecimento', 'lacuna_base_comercial', 'warn', 'base de conhecimento',
          jsonb_build_object('quem', v_quem.nome, 'nivel', v_quem.nivel,
                             'situacao', left(coalesce(p_situacao,''), 500),
                             'faltou', left(p_o_que_faltou, 1000)));

  return jsonb_build_object('ok', true,
    'recado', 'Anotei a lacuna. Vira fila de escrita da base.');
end;
$function$;

revoke all on function public.mila_registrar_lacuna_base_v1(text, text, text) from public, anon;
grant execute on function public.mila_registrar_lacuna_base_v1(text, text, text) to service_role;

comment on function public.mila_registrar_lacuna_base_v1(text, text, text) is
  'A Mila avisa que a base nao tinha resposta para uma situacao. Grava em automacao_log (acao=lacuna_base_comercial) — sem tabela nova. Insumo da fila de escrita.';
