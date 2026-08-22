-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

insert into public.crm_templates_whatsapp (nome, slug, conteudo, tipo, ativo, contexto)
values (
 'Boas-vindas da Equipe (carrossel)',
 'boas_vindas_equipe',
 E'🎵 Olá, {responsavel}! Seja muito bem-vinda à família LA Music! 🎵\n\nA matrícula de {aluno} no curso de {curso} está confirmada, e estamos muito felizes em tê-los conosco nessa jornada musical! 🎶✨\n\n👥 Conheça abaixo a nossa equipe da unidade, sempre pronta para te ajudar:\n\n📞 *Fale com a Secretaria {unidade}:*\n• WhatsApp: {secretaria_whatsapp}\n• Telefone fixo: {secretaria_fixo}\n\n{equipe}\n\n📲 E não esqueça de entrar na nossa Comunidade 👇',
 'automacao_boas_vindas_equipe',
 true,
 'sucesso_aluno'
)
on conflict do nothing;
