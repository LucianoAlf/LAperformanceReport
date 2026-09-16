-- Caixa de Entrada: por que a mensagem falhou, e como apontar a conversa para o numero certo.
--
-- Contexto (16/09/2026). Bruno Ribeiro (2499) e Mariana de Oliveira Azevedo (2496) ficaram
-- 2 e 5 dias sem receber nada: a matricula entrou do Emusys com um digito errado, a conversa
-- copiou esse numero no instante em que nasceu e congelou. O cadastro foi corrigido depois
-- (sync + edicao manual), mas quem manda no envio e admin_conversas.whatsapp_jid, nao o
-- cadastro -- entao o cabecalho da tela exibia o numero certo enquanto as mensagens saiam
-- para o errado. Confirmado no Chatwoot: o numero bom tem foto de perfil e conversa viva; o
-- errado e um contato fantasma criado pela nossa propria tentativa de envio.
--
-- Duas pecas aqui:
--
-- 1. admin_mensagens.erro_motivo. A edge ja CONHECIA o motivo (uazapiData.error) e o jogava
--    fora: gravava status_entrega='erro' e mandava o texto so para console.error, cujo log
--    vive 24h. O front ate le msg.erro_motivo no tooltip, mas a coluna nao existia -- o
--    valor so vivia na memoria de quem enviou e sumia no reload. Por isso a causa deste
--    incidente teve de ser deduzida por padrao ("0 recebidas + saida em erro"), nao lida.
--
-- 2. admin_conversa_usar_numero_do_cadastro_v1. Aplica a regra combinada com o Hugo:
--      - conversa que NUNCA recebeu mensagem -> migra o jid (nao ha historia a preservar;
--        conversa nova deixaria um fantasma vazio na lista);
--      - conversa que JA recebeu -> cria conversa NOVA para o numero do cadastro, porque ali
--        o jid e o endereco real de alguem e trocar misturaria duas pessoas na mesma thread.
--    E o mesmo discriminador do diagnostico: recebeu = numero provado, nao se toca.
--    ATENCAO: nao roda sozinha. E chamada por um botao, com a pessoa confirmando. Escrita
--    automatica aqui muda para quem a escola fala, e nos dois casos de hoje o cadastro tambem
--    tinha campo errado -- so que do outro lado.

alter table public.admin_mensagens add column if not exists erro_motivo text;

comment on column public.admin_mensagens.erro_motivo is
  'Resposta do provedor quando o envio falha (status_entrega=erro). Preenchido pela edge '
  'enviar-mensagem-admin; quando o numero usado diverge do cadastro do aluno, o texto diz '
  'isso explicitamente. Antes de 16/09/2026 o motivo ia so para console.error e se perdia.';

create or replace function public.admin_conversa_usar_numero_do_cadastro_v1(p_conversa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conv        admin_conversas%rowtype;
  v_aluno       alunos%rowtype;
  v_novo_jid    text;
  v_tem_entrada boolean;
  v_existente   uuid;
  v_nova_id     uuid;
begin
  select * into v_conv from admin_conversas where id = p_conversa_id;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'conversa_inexistente');
  end if;

  if v_conv.aluno_id is null then
    return jsonb_build_object('ok', false, 'erro', 'conversa_externa_sem_cadastro');
  end if;

  select * into v_aluno from alunos where id = v_conv.aluno_id;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'aluno_inexistente');
  end if;

  -- O jid e o numero COMO ESTA no cadastro, so com 55 na frente. Nunca usar
  -- fn_normalizar_telefone_br_key para MONTAR numero: ela descarta o 9o digito do celular
  -- (21987654321 -> 2187654321) e produziria um jid que nao existe.
  v_novo_jid := regexp_replace(
                  coalesce(nullif(btrim(v_aluno.whatsapp), ''), v_aluno.telefone, ''),
                  '[^0-9]', '', 'g');
  if length(v_novo_jid) between 10 and 11 then
    v_novo_jid := '55' || v_novo_jid;
  end if;

  if length(v_novo_jid) < 12 then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_sem_telefone_utilizavel',
                              'telefone_cadastro', v_aluno.telefone);
  end if;

  if v_novo_jid = v_conv.whatsapp_jid then
    return jsonb_build_object('ok', false, 'erro', 'ja_e_o_numero_do_cadastro',
                              'jid', v_conv.whatsapp_jid);
  end if;

  select exists (
    select 1 from admin_mensagens m
     where m.conversa_id = p_conversa_id and m.direcao = 'entrada'
  ) into v_tem_entrada;

  -- Se ja existe conversa naquele numero no mesmo departamento, ela e o destino -- nao criar
  -- outra (o UNIQUE recusaria) nem migrar por cima.
  select id into v_existente
    from admin_conversas
   where whatsapp_jid = v_novo_jid and departamento = v_conv.departamento
   limit 1;

  if v_existente is not null then
    insert into automacao_log (evento, acao, status, aluno_id, aluno_nome, detalhes)
    values ('caixa_entrada', 'numero_corrigido', 'ok', v_aluno.id, v_aluno.nome,
            jsonb_build_object('resultado', 'reaproveitou', 'de', v_conv.whatsapp_jid,
                               'para', v_novo_jid, 'conversa_origem', p_conversa_id,
                               'conversa_destino', v_existente));
    return jsonb_build_object('ok', true, 'acao', 'reaproveitou',
                              'conversa_id', v_existente, 'jid', v_novo_jid);
  end if;

  if v_tem_entrada then
    insert into admin_conversas (aluno_id, unidade_id, caixa_id, whatsapp_jid, departamento,
                                 status, nao_lidas, ultima_mensagem_at)
    values (v_conv.aluno_id, v_conv.unidade_id, v_conv.caixa_id, v_novo_jid, v_conv.departamento,
            coalesce(v_conv.status, 'aberta'), 0, now())
    returning id into v_nova_id;

    insert into automacao_log (evento, acao, status, aluno_id, aluno_nome, detalhes)
    values ('caixa_entrada', 'numero_corrigido', 'ok', v_aluno.id, v_aluno.nome,
            jsonb_build_object('resultado', 'criou', 'de', v_conv.whatsapp_jid,
                               'para', v_novo_jid, 'conversa_origem', p_conversa_id,
                               'conversa_destino', v_nova_id,
                               'motivo', 'a conversa antiga ja tinha mensagem recebida'));
    return jsonb_build_object('ok', true, 'acao', 'criou',
                              'conversa_id', v_nova_id, 'jid', v_novo_jid);
  end if;

  update admin_conversas
     set whatsapp_jid = v_novo_jid, updated_at = now()
   where id = p_conversa_id;

  insert into automacao_log (evento, acao, status, aluno_id, aluno_nome, detalhes)
  values ('caixa_entrada', 'numero_corrigido', 'ok', v_aluno.id, v_aluno.nome,
          jsonb_build_object('resultado', 'migrou', 'de', v_conv.whatsapp_jid,
                             'para', v_novo_jid, 'conversa_origem', p_conversa_id,
                             'motivo', 'a conversa nunca recebeu mensagem'));

  return jsonb_build_object('ok', true, 'acao', 'migrou',
                            'conversa_id', p_conversa_id, 'jid', v_novo_jid);
end;
$function$;

revoke all on function public.admin_conversa_usar_numero_do_cadastro_v1(uuid) from public, anon;
grant execute on function public.admin_conversa_usar_numero_do_cadastro_v1(uuid) to authenticated, service_role;
