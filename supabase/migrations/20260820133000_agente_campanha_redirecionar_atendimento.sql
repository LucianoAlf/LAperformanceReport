-- Redirecionamento de atendimento no agente de campanha (Mila / Feirão).
--
-- Contexto: quem escreve na caixa da campanha nem sempre é lead. Em 18/08/2026 a
-- aluna Luciene (ativa em Campo Grande, responsável por outros dois alunos) pediu
-- "eu preciso falar com a Vitória" e recebeu de volta oferta do Feirão. O texto
-- com os telefones das secretarias já existia em `numeros_meta.auto_reply_message`,
-- mas é um `else if` no `meta-webhook-campanhas`: só roda quando NÃO há agente na
-- caixa, então com a Mila ativa ficava inalcançável.
--
-- Esta migration liga a tool `redirecionar_atendimento` (edge `agente-webhook`) no
-- agente do Feirão e ajusta o texto compartilhado dos canais. Nenhuma mudança de
-- schema — é dado de configuração, versionado aqui para deixar rastro.

-- 1. Texto dos canais ────────────────────────────────────────────────────────
-- O campo agora é usado nas duas situações (com e sem agente). Dizer "não é
-- monitorado para atendimento" logo abaixo de uma mensagem que a Mila acabou de
-- assinar faz o bot parecer mentiroso. Os telefones não mudam.
update numeros_meta
set auto_reply_message = replace(
      auto_reply_message,
      'Este canal é usado apenas para *envio de avisos* e não é monitorado para atendimento.',
      'Este canal é usado para *avisos e campanhas*.'
    ),
    updated_at = now()
where auto_reply_message like '%não é monitorado para atendimento%';

-- 2. Tool ligada no agente do Feirão ─────────────────────────────────────────
-- Idempotente: só acrescenta se ainda não existir.
update agentes
set tools = tools || jsonb_build_array(jsonb_build_object(
      'name', 'redirecionar_atendimento',
      'description', 'Envia os canais oficiais de atendimento (secretaria de cada unidade) e SAI do funil de vendas. Use quando a mensagem NÃO for de alguém buscando matrícula nova: a pessoa já é aluno ou responsável por aluno, quer falar com uma pessoa específica da equipe (consultora, professor, secretaria, coordenação) ou trata de assunto da secretaria — falta, reposição, horário de aula, boleto, mensalidade, cancelamento, atestado, material. NÃO use com quem quer se matricular ou saber da campanha: aluno que quer um SEGUNDO curso é matrícula nova, use transfer. IMPORTANTE: quando usar esta tool, NÃO envie texto adicional — a mensagem já é a resposta.',
      'parameters', jsonb_build_array(
        jsonb_build_object('name', 'motivo', 'type', 'string', 'description', 'Por que está redirecionando, em poucas palavras (ex: "quer falar com a consultora", "já é aluno, dúvida de reposição")', 'required', true),
        jsonb_build_object('name', 'intro', 'type', 'string', 'description', 'Frase curta de abertura, reagindo ao que a pessoa disse, que vem ANTES dos telefones. Ex: "Ah, entendi! Aqui eu só falo do Feirão — quem resolve isso é a secretaria da sua unidade 😊"', 'required', false)
      ),
      'enabled', true,
      'config', jsonb_build_object('mensagem_retomada', 'Se quiser saber do Feirão depois, é só me chamar por aqui!')
    )),
    updated_at = now()
where id = 'f4238ffa-8d08-4db8-af28-b5d4a355d7ca'
  and not exists (
    select 1 from jsonb_array_elements(tools) t where t->>'name' = 'redirecionar_atendimento'
  );

-- 3. Prompt: a seção antiga só reagia a "já sou aluno" ───────────────────────
-- "Preciso falar com a Vitória" não casava com ela, e a seção PERGUNTAS FORA DO
-- FLUXO mandava retomar a pergunta pendente — foi exatamente o que aconteceu.
-- A seção nova aciona a tool e delimita a exceção (aluno querendo 2º curso é
-- matrícula nova, continua indo para transfer).
update agentes
set system_prompt = replace(system_prompt, $antigo$## LEAD JÁ É ALUNO
Se o lead sinalizar que já é aluno matriculado ("já fiz matrícula", "já sou
aluno", "já estudo aí"), PARE o funil de vendas imediatamente. Não pergunte
mais unidade/perfil/nome nem tente transferir pro consultor comercial.
Responda algo como "Que ótimo que você já é aluno da LA Music! 🎸 Qualquer
coisa que precisar, é só falar com a secretaria da sua unidade." e encerre.$antigo$, $novo$## QUEM NÃO É LEAD — REDIRECIONE
Nem todo mundo que escreve aqui quer se matricular: aluno e responsável usam
este número por engano. Assim que perceber esse sinal, chame
redirecionar_atendimento — na PRIMEIRA mensagem que der o sinal, sem oferecer
o Feirão antes. Sinais:
- "já sou aluno", "já fiz matrícula", "meu filho estuda aí"
- "preciso falar com a Vitória/Daiana/Kailane", "quero falar com o professor",
  "me passa o contato da secretaria"
- falta, reposição, atestado, troca de horário, boleto, mensalidade,
  cancelamento, material
Na tool, escreva a intro reagindo ao que a pessoa disse (uma frase, um emoji).
Os telefones a tool acrescenta sozinha — não escreva mais nada depois dela.
EXCEÇÃO: aluno que quer um SEGUNDO curso, ou que pergunta da campanha, é
matrícula nova — siga o fluxo normal e use transfer.
DEPOIS DE REDIRECIONAR: não volte a oferecer o Feirão nem mande botões.
Responda curto e cordial ao que ela disser. Só fale da campanha de novo se ela
mesma perguntar.$novo$),
    updated_at = now()
where id = 'f4238ffa-8d08-4db8-af28-b5d4a355d7ca'
  and system_prompt like '%## LEAD JÁ É ALUNO%';
