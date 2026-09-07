-- FATIA 3, passo 2 — a ADM fecha o item falando (07/09/2026).
--
-- 🔴 ISTO É A MEDIÇÃO DE PRECISÃO, não só uma conveniência. Eu disse ao Luciano
--    que a precisão do extrator LLM nunca foi medida contra julgamento humano
--    (a versão determinística dava 24%), e que sem esse número qualquer corte
--    que eu escolhesse era chute. Esta porta é o instrumento: quando a ADM diz
--    *"esse aí não era nada"*, isso vira `falso_positivo` no banco.
--
--      select regra_codigo,
--             count(*) filter (where desfecho = 'falso_positivo')::numeric
--               / nullif(count(*),0) as taxa_de_erro
--        from radar_sinais where desfecho is not null group by 1;
--
--    Em algumas semanas isso responde, por regra, se ela merece continuar.
--
-- 🔴 O MODELO NÃO INVENTA DESFECHO: ele escolhe entre QUATRO valores e a porta
--    valida contra o CHECK da tabela. Se vier outra coisa, recusa e devolve a
--    lista. É a mesma divisão de poder do classificador de evasão — o modelo
--    descreve, a função pura decide.
--
-- ⚠️ Só fecha sinal da PRÓPRIA unidade e só o que está VIGENTE. Fechar sinal de
--    outra unidade seria escrita fora de escopo — a leitura já é cercada, a
--    escrita tem de ser igual.
--
-- ⚠️ Fecha por PESSOA, não por sinal: a ADM diz "já liguei pra Catarina", não
--    "resolvi o sinal 8f3a…". Todos os sinais vigentes daquela pessoa naquela
--    regra fecham juntos — é uma conversa só.
--
-- ⚠️ NÃO usa `word_similarity` para achar o nome. A lição de 29/08 é dura: o
--    corte de 0.45 aceitava 2.264 pares e **72,7% tinham primeiro nome
--    diferente**. Aqui o casamento é por `sol_nome_mesma_pessoa_v1`, a mesma
--    função que o caixa usa, e ambiguidade vira RECUSA com candidatos — nunca
--    sorteio.

create or replace function public.sol_porta_registrar_desfecho_v1(
  p_solicitante_telefone text,
  p_aluno                text,
  p_desfecho             text,
  p_nota                 text default null
) returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_e jsonb; v_uid uuid; v_alvos jsonb; v_n int; v_status text; v_cands jsonb;
begin
  v_e := sol_resolver_escopo_v1(p_solicitante_telefone, null);
  if not coalesce((v_e->>'ok')::bool,false) then return v_e; end if;
  v_uid := (v_e->>'unidade_id')::uuid;
  if v_uid is null then
    -- diretoria fecha item? nao: quem liga e quem fecha, e a diretoria nao liga.
    return jsonb_build_object('ok', false, 'motivo', 'sem_unidade',
      'recado', 'Quem fecha o item e quem falou com a familia — escolha a unidade.');
  end if;

  -- 🔴 quatro valores, e so eles. O modelo escolhe, nao inventa.
  if p_desfecho is null or p_desfecho not in ('reteve','saiu','falso_positivo','nao_aplicavel') then
    return jsonb_build_object('ok', false, 'motivo', 'desfecho_invalido',
      'aceitos', jsonb_build_array(
        jsonb_build_object('valor','reteve','quando','falei e a familia fica'),
        jsonb_build_object('valor','saiu','quando','falei e vai sair mesmo'),
        jsonb_build_object('valor','falso_positivo','quando','nao era nada, ja estava resolvido'),
        jsonb_build_object('valor','nao_aplicavel','quando','esse item nao e da minha alcada')));
  end if;

  -- ⚠️ casamento de nome pela funcao canonica; ambiguidade RECUSA
  with vig as (
    select v.id, v.regra_codigo, a.nome,
           coalesce(fn_pessoa_chave_aluno(v.entidade_id::int), v.entidade_id::text) pessoa
    from vw_radar_sinal_vigencia_v1 v
    join alunos a on a.id = v.entidade_id
    where v.vigencia='vigente' and v.canonico and v.dominio='aluno'
      and v.unidade_id = v_uid and v.entidade_tipo='aluno'),
  casou as (
    select * from vig
    -- ⚠️ `sol_nome_mesma_pessoa_v1` devolve BOOLEAN, nao jsonb (conferido em
    --    pg_proc). Tratar como jsonb da `operator does not exist: boolean ->> unknown`.
    where sol_nome_mesma_pessoa_v1(vig.nome, p_aluno))
  select jsonb_agg(distinct pessoa), jsonb_agg(distinct nome)
    into v_alvos, v_cands from casou;

  if v_alvos is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrei',
      'recado', format('Nao achei "%s" com item aberto em %s.', p_aluno, v_e->>'unidade_nome'));
  end if;
  if jsonb_array_length(v_alvos) > 1 then
    -- 🔴 duas pessoas de mesmo primeiro nome viram RECUSA, nunca sorteio
    return jsonb_build_object('ok', false, 'motivo', 'ambiguo',
      'candidatos', v_cands,
      'recado', 'Tem mais de uma pessoa com esse nome na lista — me diga o nome completo.');
  end if;

  v_status := case when p_desfecho in ('falso_positivo','nao_aplicavel')
                   then 'improcedente' else 'resolvido' end;

  with vig as (
    select v.id, coalesce(fn_pessoa_chave_aluno(v.entidade_id::int), v.entidade_id::text) pessoa
    from vw_radar_sinal_vigencia_v1 v
    where v.vigencia='vigente' and v.canonico and v.dominio='aluno'
      and v.unidade_id = v_uid and v.entidade_tipo='aluno')
  update radar_sinais s
     set status = v_status, desfecho = p_desfecho, desfecho_em = now(),
         desfecho_nota = p_nota, triado_por = coalesce(v_e->>'quem','sol'),
         triado_em = now(), atualizado_em = now()
  from vig
  where vig.id = s.id and vig.pessoa = (v_alvos->>0);
  get diagnostics v_n = row_count;

  -- 🔴 a trilha e a mesma das portas de leitura: quem disse o que, e quando.
  begin
    insert into automacao_log (evento, acao, status, aluno_nome, detalhes)
    values ('sol_portas','sol_porta_registrar_desfecho_v1','ok', coalesce(v_cands->>0, p_aluno),
      jsonb_build_object('telefone_alegado', regexp_replace(coalesce(p_solicitante_telefone,''),'\D','','g'),
        'quem', v_e->>'quem', 'unidade', v_e->>'unidade_nome',
        'desfecho', p_desfecho, 'sinais_fechados', v_n, 'nota', p_nota));
  exception when others then
    raise warning 'sol_portas: auditoria do desfecho falhou (%): %', sqlstate, sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'quem', v_e->>'quem',
    'aluno', v_cands->>0, 'desfecho', p_desfecho, 'sinais_fechados', v_n,
    'recado', format('Anotei: %s — %s. Fechei %s item(ns).',
                     v_cands->>0, p_desfecho, v_n));
end; $function$;

comment on function public.sol_porta_registrar_desfecho_v1(text, text, text, text) is
  'A ADM fecha o item falando ("ja liguei, ela fica"). E TAMBEM a medicao de precisao das regras: `falso_positivo` acumulado por regra diz quais merecem continuar. Quatro desfechos, validados contra o CHECK; ambiguidade de nome recusa com candidatos, nunca sorteia; so alcanca sinal vigente da propria unidade.';

revoke all on function public.sol_porta_registrar_desfecho_v1(text, text, text, text) from public, anon;
grant execute on function public.sol_porta_registrar_desfecho_v1(text, text, text, text)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare t_op text; v jsonb; v_nome text; v_uid uuid; v_antes int; v_depois int;
begin
  select g.telefone, g.unidade_id into t_op, v_uid from governanca.agente_usuarios g
   where lower(g.departamento)='administrativo' and lower(g.nivel)='colaborador'
     and g.unidade_id is not null and coalesce(g.ativo,true) limit 1;

  -- 🔴 desfecho fora da lista tem de recusar
  v := sol_porta_registrar_desfecho_v1(t_op, 'qualquer', 'resolvido_acho');
  if coalesce((v->>'ok')::bool,true) then raise exception 'desfecho invalido foi aceito: %', v; end if;
  if jsonb_array_length(v->'aceitos') <> 4 then raise exception 'a recusa nao ofereceu os 4 valores'; end if;

  -- 🔴 nome inexistente tem de recusar
  v := sol_porta_registrar_desfecho_v1(t_op, 'Zzzz Inexistente Da Silva', 'reteve');
  if coalesce((v->>'ok')::bool,true) then raise exception 'nome inexistente foi aceito: %', v; end if;

  -- caminho feliz: pega um aluno com sinal vigente na unidade da pessoa
  select a.nome into v_nome
  from vw_radar_sinal_vigencia_v1 v2 join alunos a on a.id = v2.entidade_id
  where v2.vigencia='vigente' and v2.canonico and v2.dominio='aluno'
    and v2.unidade_id = v_uid and v2.entidade_tipo='aluno' limit 1;
  if v_nome is null then raise exception 'sem aluno vigente para exercitar o caminho feliz'; end if;

  select count(*) into v_antes from radar_sinais where desfecho is not null;
  v := sol_porta_registrar_desfecho_v1(t_op, v_nome, 'reteve', 'ensaio da migration');
  if not coalesce((v->>'ok')::bool,false) then raise exception 'o caminho feliz recusou: %', v; end if;
  if (v->>'sinais_fechados')::int < 1 then raise exception 'nao fechou nenhum sinal: %', v; end if;

  select count(*) into v_depois from radar_sinais where desfecho is not null;
  if v_depois <= v_antes then raise exception 'o desfecho nao foi gravado (% -> %)', v_antes, v_depois; end if;

  -- ⚠️ desfaz o ensaio: nao posso deixar item fechado por um teste meu
  update radar_sinais set status='aberto', desfecho=null, desfecho_em=null,
         desfecho_nota=null, triado_por=null, triado_em=null
   where desfecho_nota = 'ensaio da migration';

  raise notice 'prova: desfecho invalido recusa · nome inexistente recusa · % fechou % item(ns), depois revertido',
               v_nome, v->>'sinais_fechados';
end $prova$;
