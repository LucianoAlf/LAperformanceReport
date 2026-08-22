-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Templates de mensagens WhatsApp com placeholders
CREATE TABLE crm_templates_whatsapp (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  conteudo TEXT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: 7 templates padrão
INSERT INTO crm_templates_whatsapp (nome, slug, conteudo, tipo) VALUES
  (
    'Confirmação de Experimental',
    'confirmacao_experimental',
    'Olá, {nome}! 😊 Tudo bem? Aqui é a Andreza, da LA Music.

Estou passando para confirmar sua aula experimental de {curso} agendada para {data} às {horario} na unidade {unidade}.

Você confirma presença? 🎵',
    'confirmacao'
  ),
  (
    'Lembrete 24h',
    'lembrete_24h',
    'Oi, {nome}! 👋 Lembrando que amanhã ({data}) às {horario} você tem sua aula experimental de {curso} na LA Music {unidade}.

Estamos te esperando! 🎶 Qualquer dúvida, é só me chamar.',
    'lembrete'
  ),
  (
    'Reagendar',
    'reagendar',
    'Oi, {nome}! Vi que não conseguiu vir na sua aula experimental. Sem problemas! 😊

Que tal agendarmos um novo horário? Temos disponibilidade essa semana ainda. Me conta qual dia e horário ficam melhor pra você! 🎵',
    'reagendar'
  ),
  (
    'Pós-Experimental',
    'pos_experimental',
    'Oi, {nome}! 🎉 Que legal que você veio conhecer a LA Music!

O que achou da aula? Gostaria de saber se ficou alguma dúvida sobre os planos e como funciona a matrícula. Posso te ajudar! 😊',
    'pos_experimental'
  ),
  (
    'Follow-up Lead Frio',
    'follow_up_frio',
    'Oi, {nome}! Tudo bem? 😊 Aqui é a Andreza da LA Music.

Você entrou em contato com a gente há um tempo sobre aulas de {curso}. Ainda tem interesse? Temos novidades e horários disponíveis que podem funcionar pra você! 🎵',
    'follow_up_frio'
  ),
  (
    'Boas-vindas Matrícula',
    'boas_vindas',
    'Parabéns, {nome}! 🎉🎵 Seja muito bem-vindo(a) à família LA Music!

Sua matrícula na unidade {unidade} está confirmada. Em breve você receberá todas as informações sobre suas aulas. Qualquer dúvida, estou aqui! 💜',
    'boas_vindas'
  ),
  (
    'Tentativa sem Resposta',
    'tentativa_sem_resposta',
    'Oi, {nome}! Tentei falar com você mas não consegui contato. 😊

Ainda tem interesse em conhecer a LA Music? Estou à disposição para agendar sua aula experimental de {curso}. É só me responder! 🎵',
    'tentativa_sem_resposta'
  );
