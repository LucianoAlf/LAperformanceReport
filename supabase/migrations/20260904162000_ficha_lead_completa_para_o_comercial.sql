-- Ficha do lead COMPLETA para o comercial (pedido do Luciano, 04/09/2026):
-- "se eles pedirem o contato do cliente, ela tem que entregar TUDO — nome da
-- criança, se tem neurodivergência, nome dos responsáveis, curso de interesse,
-- um resumo de como foi a conversa com a Mila. Não fica travando a Mila."
--
-- Nada disso precisou ser criado: `lead_experimentais.contexto_ia` já é extraído
-- da CONVERSA da Mila + recepção (199 preenchidos em 60 dias, 99 com alerta) e
-- traz nome da criança, responsável, data de nascimento, história, ganchos de
-- conexão, apoio declarado e o que a família espera. A ficha simplesmente não
-- devolvia. Agora devolve, junto com a anamnese de quem já virou aluno.
--
-- ⚠️ `apoio_declarado` é onde aparece neurodivergência quando a família contou na
-- conversa (caso real: "a aluna é atípica (síndrome de Down)"). Não existe campo
-- estruturado para isso no lead — é texto da extração.
--
-- ⚠️ O nome do CADASTRO costuma ser de quem escreveu (o responsável); o nome da
-- criança vem de `recepcao.aluno`. Por isso os dois vão no bloco `pessoas`.
--
-- ⚠️ `telefone_chave` é a chave NORMALIZADA (sem o 9, para casar número antigo com
-- novo): concatenar '55' + chave produz número que não existe (5521982721676
-- virava 552182721676). O `wa_link` sai do telefone real.
--
-- ⚠️ plpgsql: `record` que pode nunca ser atribuído não serve em expressão, nem
-- com flag booleana — o parser precisa da estrutura mesmo no ramo `else` não
-- tomado (55000 "not-yet-assigned"). Por isso a anamnese é montada em jsonb.
--
-- O que NÃO mudou: o escopo. Continua só a unidade de quem pergunta
-- (`fora_do_escopo` provado com CG pedindo lead do Recreio).
create or replace function public.get_situacao_lead_v1(
  p_solicitante_telefone text, p_telefone_lead text default null::text,
  p_nome_lead text default null::text, p_lead_id integer default null::integer
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare
  v_quem record; v_ids int[]; v_lead record; v_calor record; v_ctx jsonb; v_anam_json jsonb; v_al record;
begin
  select * into v_quem from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;

  if p_lead_id is not null then
    v_ids := array[p_lead_id];
  elsif nullif(trim(p_telefone_lead),'') is not null then
    select array_agg(l.id order by l.created_at desc) into v_ids from public.leads l
     where fn_normalizar_telefone_br_key(l.telefone) = fn_normalizar_telefone_br_key(p_telefone_lead)
       and (v_quem.unidade_id is null or l.unidade_id = v_quem.unidade_id);
  elsif nullif(trim(p_nome_lead),'') is not null then
    select array_agg(l.id order by l.created_at desc) into v_ids from (
      select l.* from public.leads l
       where unaccent(lower(l.nome)) like '%' || unaccent(lower(trim(p_nome_lead))) || '%'
         and (v_quem.unidade_id is null or l.unidade_id = v_quem.unidade_id)
         and l.created_at >= now() - interval '180 days'
       order by l.created_at desc limit 6) l;
  else
    return jsonb_build_object('ok', false, 'motivo', 'informe_telefone_nome_ou_id');
  end if;

  if v_ids is null or array_length(v_ids,1) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado_no_escopo',
      'nota', case when v_quem.unidade_id is null then 'nenhum lead com esse dado'
                   else 'nenhum lead com esse dado na sua unidade' end);
  end if;
  if array_length(v_ids,1) > 1 and p_lead_id is null and nullif(trim(p_telefone_lead),'') is null then
    return jsonb_build_object('ok', false, 'motivo', 'ambiguo',
      'candidatos', (select jsonb_agg(jsonb_build_object('lead_id', j.lead_id, 'nome', j.nome, 'unidade', j.unidade_nome,
                                                          'etapa', j.etapa, 'entrou_em', j.entrou_em) order by j.entrou_em desc)
                       from public.vw_jornada_lead_v1 j where j.lead_id = any(v_ids)),
      'nota', 'mais de um lead com esse nome — pergunte qual, nao escolha');
  end if;

  select * into v_lead from public.vw_jornada_lead_v1 j where j.lead_id = v_ids[1];
  if v_quem.unidade_id is not null and v_lead.unidade_id <> v_quem.unidade_id then
    return jsonb_build_object('ok', false, 'motivo', 'fora_do_escopo');
  end if;

  select * into v_calor from public.atendimento_conversa_estado e
   where e.telefone_key = v_lead.telefone_chave and e.departamento = 'comercial'
   order by e.ultima_msg_em desc limit 1;

  -- o que a Mila apurou na conversa (a extração já existia; a ficha é que nao lia)
  select le.contexto_ia into v_ctx from public.lead_experimentais le
   where le.lead_id = v_lead.lead_id and le.contexto_ia is not null
   order by le.contexto_ia_em desc nulls last limit 1;

  select l.idade, l.data_nascimento, l.tipo_aluno, l.quantidade, l.observacoes, l.aluno_id
    into v_al from public.leads l where l.id = v_lead.lead_id;

  if v_al.aluno_id is not null then
    select jsonb_build_object('tem', true, 'diagnosticos', an.diagnosticos,
              'diagnosticos_outro', an.diagnosticos_outro, 'necessidade_apoio', an.necessidade_apoio,
              'temperamento', an.temperamento_codinome, 'situacao_responsaveis', an.situacao_responsaveis)
       into v_anam_json from public.anamneses an where an.aluno_id = v_al.aluno_id
      order by an.created_at desc limit 1;
  end if;

  return jsonb_build_object(
    'ok', true, 'solicitante', v_quem.nome,
    'lead', jsonb_build_object('id', v_lead.lead_id, 'nome', v_lead.nome, 'telefone', v_lead.telefone,
                               'unidade', v_lead.unidade_nome, 'curso_interesse', v_lead.curso_interesse,
                               'canal_origem', v_lead.canal_origem, 'anuncio', v_lead.anuncio,
                               'campanha_meta', v_lead.campanha_meta, 'instagram', v_lead.instagram_conta),
    'contato', jsonb_build_object('telefone', v_lead.telefone,
                                  'wa_link', case when nullif(regexp_replace(coalesce(v_lead.telefone,''), '\D', '', 'g'), '') is not null
                                                  then 'https://wa.me/' ||
                                                       case when regexp_replace(v_lead.telefone, '\D', '', 'g') like '55%'
                                                            then regexp_replace(v_lead.telefone, '\D', '', 'g')
                                                            else '55' || regexp_replace(v_lead.telefone, '\D', '', 'g') end end,
                                  'nota', 'pode passar o contato para a consultora — e o lead da unidade dela'),
    'pessoas', jsonb_build_object(
        'nome_no_cadastro', v_lead.nome,
        'aluno', coalesce(v_ctx->'recepcao'->>'aluno', v_lead.nome),
        'responsavel', v_ctx->'recepcao'->>'responsavel',
        'junto_com', v_ctx->'recepcao'->>'junto_com',
        'data_nascimento', coalesce(v_ctx->'recepcao'->>'data_nascimento', v_al.data_nascimento::text),
        'idade', v_al.idade, 'tipo_aluno', v_al.tipo_aluno, 'quantidade_alunos', v_al.quantidade,
        'nota', 'o nome do cadastro costuma ser de quem escreveu (responsavel); `aluno` e quem vai ter aula'),
    'da_conversa_com_a_mila', case when v_ctx is null
        then jsonb_build_object('tem', false, 'nota', 'sem extracao de conversa para este lead')
        else jsonb_build_object('tem', true,
             'historia', v_ctx->'quem_e_esse_aluno'->>'historia',
             'de_quem_partiu', v_ctx->'quem_e_esse_aluno'->>'de_quem_partiu',
             'nivel_declarado', v_ctx->'quem_e_esse_aluno'->>'nivel_declarado',
             'o_que_a_familia_espera', v_ctx->'para_a_devolutiva'->>'o_que_a_familia_espera',
             'porque', v_ctx->'para_a_devolutiva'->>'porque',
             'atencao_conversao', v_ctx->'para_a_devolutiva'->>'atencao_conversao',
             'ganchos_de_conexao', coalesce(v_ctx->'ganchos_de_conexao', '[]'::jsonb),
             'apoio_declarado', v_ctx->'apoio_declarado',
             'alertas', coalesce(v_ctx->'alertas', '[]'::jsonb),
             'como_conduzir', v_ctx->>'como_conduzir',
             'fonte', v_ctx->'procedencia') end,
    'anamnese', coalesce(v_anam_json, jsonb_build_object('tem', false)),
    'observacoes_do_cadastro', nullif(v_al.observacoes, ''),
    'jornada', jsonb_build_object('etapa', v_lead.etapa, 'entrou_em', v_lead.entrou_em,
                                  'dias_no_funil', v_lead.dias_no_funil, 'dias_parado', v_lead.dias_parado,
                                  'experimental_agendada_para', v_lead.experimental_agendada_para,
                                  'experimentais', jsonb_build_object('total', v_lead.aulas_experimentais,
                                     'realizadas', v_lead.experimentais_realizadas, 'faltou', v_lead.experimentais_faltou,
                                     'canceladas', v_lead.experimentais_canceladas, 'ultima_em', v_lead.ultima_experimental_em),
                                  'professor_experimental', v_lead.professor_experimental,
                                  'converteu', v_lead.converteu, 'motivo_nao_matricula', v_lead.motivo_nao_matricula),
    'calor', case when v_calor is null then jsonb_build_object('conversa', 'sem conversa comercial espelhada')
                  else jsonb_build_object('chegou_a_humano', v_calor.houve_humano, 'so_falou_com_bot', v_calor.so_falou_com_bot,
                         'minutos_ate_humano', v_calor.minutos_ate_humano, 'mensagens_do_contato', v_calor.msgs_do_contato,
                         'mensagens_do_bot', v_calor.msgs_do_bot, 'ultimo_autor', v_calor.ultimo_autor,
                         'horas_desde_ultima', v_calor.horas_desde_ultima, 'assignee', v_calor.assignee_nome,
                         'conversa_status', v_calor.conversa_status) end,
    'sinais_abertos', coalesce((select jsonb_agg(jsonb_build_object('sinal_id', s.id, 'regra', s.regra_codigo, 'tipo', s.tipo_sinal,
                                   'contexto', s.contexto, 'orientacao', s.orientacao, 'detectado_em', s.detectado_em) order by s.detectado_em desc)
                                 from public.radar_sinais s where s.entidade_tipo = 'lead' and s.entidade_id = v_lead.lead_id
                                  and s.status in ('aberto','triado')), '[]'::jsonb),
    'cobertura', jsonb_build_object('calor_desde', '2026-09-03', 'nota', 'conversas comerciais so sao espelhadas desde 03/09/2026')
  );
end;
$function$;

revoke all on function public.get_situacao_lead_v1(text,text,text,integer) from public, anon, authenticated;
grant execute on function public.get_situacao_lead_v1(text,text,text,integer) to service_role, mila_acesso_restrito;
