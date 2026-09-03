-- Mapa de Sinais / A5.
--
-- (1) R14 — dificuldade financeira declarada. Nasce de caso real encontrado no
--     espelho do Chatwoot em 03/09/2026, parado ha 7 dias sem resposta:
--     "esse mes eu ainda nao consegui o valor da mensalidade mas assim que eu
--      conseguir eu mando".
--     Nao cabia em nenhuma regra existente e a acao e OUTRA: negociar/parcelar,
--     nao fazer discurso de retencao. O dono tambem e outro (financeiro/ADM,
--     nao a guardia).
--
-- (2) Correcao do lastro do R8. Ele afirmava "260 turnos de cliente sem NENHUMA
--     resposta", numero que eu mesmo medi e reportei — e que a calibracao de
--     03/09 derrubou: de 25 amostras aleatorias do grupo "72h+", 23 eram
--     cortesia de fechamento ("👍", "❤️", "Obrigada", "Ok"). Com filtro
--     deterministico a lista cai de 248 para 51, e olhando os 51 um a um so
--     ~12 sao cobranca real (~24% de precisao). Mandar a versao ingenua para a
--     guardia seria a "lista que renasce".
--     Por isso o R8 passa a depender do extrator semantico, nao de SQL de
--     "ultima mensagem e do contato".

insert into public.radar_regras
  (codigo, titulo, descricao, entidade_tipo, origem, severidade_padrao,
   canonico, ativo, params, lastro, orientacao_padrao, versao)
values (
  'R14',
  'Dificuldade financeira declarada',
  'Aluno ou responsável escreveu que não vai conseguir pagar, pediu prazo, parcelamento ou desconto.',
  'aluno',
  'llm_conversa',
  'alto',
  true,
  true,
  '{"janela_dias": 14}'::jsonb,
  'Caso real encontrado no espelho do Chatwoot em 03/09/2026, 7 dias sem resposta: "esse mês eu ainda não consegui o valor da mensalidade mas assim que eu conseguir eu mando". Quem avisa que não vai conseguir pagar está pedindo negociação; sem resposta, o caminho seguinte é a inadimplência e depois a saída.',
  'Falar de dinheiro, não de retenção: oferecer prazo, parcelamento ou revisão do plano. Registrar o combinado. Não mandar cobrança automática antes de responder — a pessoa já avisou.',
  'v1')
on conflict (codigo) do update
  set titulo            = excluded.titulo,
      descricao         = excluded.descricao,
      entidade_tipo     = excluded.entidade_tipo,
      origem            = excluded.origem,
      severidade_padrao = excluded.severidade_padrao,
      params            = excluded.params,
      lastro            = excluded.lastro,
      orientacao_padrao = excluded.orientacao_padrao,
      versao            = excluded.versao,
      atualizada_em     = now();

update public.radar_regras
   set descricao = 'Cliente escreveu algo que pede retorno e ninguém respondeu. O veredito é do extrator semântico, não de "a última mensagem é do contato".',
       lastro    = 'Calibrado em 03/09/2026 e CORRIGIDO: a medição anterior ("260 turnos sem nenhuma resposta") era majoritariamente falso positivo — de 25 amostras aleatórias do grupo 72h+, 23 eram cortesia de fechamento ("👍", "❤️", "Obrigada", "Ok"). Filtro determinístico leva 248 → 51, e dos 51 apenas ~12 são cobrança real (~24% de precisão). Por isso a regra passou a exigir classificação semântica.',
       params    = '{"horas_sem_resposta": 4, "janela_dias": 14}'::jsonb,
       versao    = 'v2',
       atualizada_em = now()
 where codigo = 'R8';
