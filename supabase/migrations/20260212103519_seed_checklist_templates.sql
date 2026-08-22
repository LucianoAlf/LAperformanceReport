-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Templates iniciais de checklists (globais — disponíveis para todas as unidades)
INSERT INTO farmer_checklist_templates (nome, descricao, categoria, itens, ordem) VALUES

-- Template 1: Abertura da Escola (Diário)
('Abertura da Escola — Diário', 
 'Checklist diário de abertura da unidade', 
 'administrativo',
 '[
   {"descricao": "Abrir portas e ligar equipamentos", "canal": null, "ordem": 1, "subs": []},
   {"descricao": "Conferir agenda do dia no sistema", "canal": null, "ordem": 2, "subs": []},
   {"descricao": "Verificar recados e mensagens pendentes", "canal": "WhatsApp", "ordem": 3, "subs": []},
   {"descricao": "Confirmar experimentais do dia", "canal": "WhatsApp", "ordem": 4, "subs": [
     {"descricao": "Confirmar se o aluno recebeu a mensagem", "canal": "WhatsApp", "ordem": 1},
     {"descricao": "Confirmar com o professor", "canal": "WhatsApp", "ordem": 2}
   ]},
   {"descricao": "Verificar aniversariantes do dia", "canal": null, "ordem": 5, "subs": []},
   {"descricao": "Conferir caixa de abertura", "canal": null, "ordem": 6, "subs": []}
 ]'::jsonb,
 1),

-- Template 2: Primeiro Dia de Aula (Onboarding)
('Primeiro Dia de Aula — Onboarding',
 'Checklist para novos alunos com primeiro dia de aula',
 'onboarding',
 '[
   {"descricao": "Disparar mensagem no WhatsApp para todos os alunos", "canal": "WhatsApp", "ordem": 1, "subs": [
     {"descricao": "Confirmar se todos receberam", "canal": "WhatsApp", "ordem": 1}
   ]},
   {"descricao": "Enviar email institucional sobre recesso", "canal": "Email", "ordem": 2, "subs": []},
   {"descricao": "Publicar comunicado no Instagram", "canal": "Instagram", "ordem": 3, "subs": []},
   {"descricao": "Avisar todos os professores via WhatsApp", "canal": "WhatsApp", "ordem": 4, "subs": []},
   {"descricao": "Atualizar site com mural de recesso", "canal": null, "ordem": 5, "subs": []},
   {"descricao": "Ligar para alunos que não confirmaram recebimento", "canal": "Telefone", "ordem": 6, "subs": [
     {"descricao": "Registrar tentativa de contato para cada aluno", "canal": "Telefone", "ordem": 1}
   ]}
 ]'::jsonb,
 2),

-- Template 3: Recesso / Feriado
('Recesso / Feriado — Comunicação',
 'Comunicação de recesso ou feriado para alunos e professores',
 'recesso',
 '[
   {"descricao": "Disparar mensagem no WhatsApp para todos os alunos", "canal": "WhatsApp", "ordem": 1, "subs": [
     {"descricao": "Confirmar se todos receberam", "canal": "WhatsApp", "ordem": 1}
   ]},
   {"descricao": "Enviar email institucional sobre recesso", "canal": "Email", "ordem": 2, "subs": []},
   {"descricao": "Publicar comunicado no Instagram", "canal": "Instagram", "ordem": 3, "subs": []},
   {"descricao": "Avisar todos os professores via WhatsApp", "canal": "WhatsApp", "ordem": 4, "subs": []},
   {"descricao": "Atualizar site com mural de recesso", "canal": null, "ordem": 5, "subs": []},
   {"descricao": "Ligar para alunos que não confirmaram recebimento", "canal": "Telefone", "ordem": 6, "subs": [
     {"descricao": "Registrar tentativa de contato para cada aluno", "canal": "Telefone", "ordem": 1}
   ]}
 ]'::jsonb,
 3),

-- Template 4: Conferência Mensal de Dados
('Conferência Mensal de Dados',
 'Checklist mensal de conferência de dados e relatórios',
 'administrativo',
 '[
   {"descricao": "Conferir dados de inadimplência no sistema", "canal": null, "ordem": 1, "subs": []},
   {"descricao": "Verificar renovações do mês", "canal": null, "ordem": 2, "subs": []},
   {"descricao": "Atualizar planilha de controle", "canal": null, "ordem": 3, "subs": []},
   {"descricao": "Enviar relatório para gerência", "canal": "Email", "ordem": 4, "subs": []},
   {"descricao": "Conferir health scores dos alunos", "canal": null, "ordem": 5, "subs": []},
   {"descricao": "Solicitar relatórios dos professores", "canal": "WhatsApp", "ordem": 6, "subs": []}
 ]'::jsonb,
 4),

-- Template 5: Evento Especial
('Evento Especial — Comunicação',
 'Checklist para comunicação de eventos especiais (shows, recitais, workshops)',
 'evento',
 '[
   {"descricao": "Criar arte/flyer do evento", "canal": null, "ordem": 1, "subs": []},
   {"descricao": "Publicar no Instagram", "canal": "Instagram", "ordem": 2, "subs": []},
   {"descricao": "Enviar convite via WhatsApp para alunos", "canal": "WhatsApp", "ordem": 3, "subs": []},
   {"descricao": "Avisar professores sobre o evento", "canal": "WhatsApp", "ordem": 4, "subs": []},
   {"descricao": "Confirmar presença dos alunos", "canal": "WhatsApp", "ordem": 5, "subs": [
     {"descricao": "Ligar para quem não respondeu", "canal": "Telefone", "ordem": 1}
   ]},
   {"descricao": "Preparar lista de presença", "canal": null, "ordem": 6, "subs": []}
 ]'::jsonb,
 5);
