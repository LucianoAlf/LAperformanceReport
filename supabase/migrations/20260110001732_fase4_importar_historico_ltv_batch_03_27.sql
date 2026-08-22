-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Importação em massa dos registros restantes (batches 3-27)
-- Usando COPY FROM STDIN simulado via INSERT

-- Batch 3
INSERT INTO alunos_historico (nome, tempo_permanencia_meses, categoria_saida, mes_saida, unidade_id) 
SELECT * FROM (VALUES
('Miguel Cavalcanti Frota Arrigoni', 8, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Helena dos Santos Silveira', 6, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Helena Conrado Nobre Calmon', 6, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Daniel Garcia Lourenço', 7, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Joaquim Martins dos Santos', 6, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Bento Gonçalves Aride', 27, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Joana Thompson Dantas Do Carmo', 18, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Romeo de Paula Paranhos', 4, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Lucas Pereira Fernandes', 22, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Bernardo Ruano Moura', 9, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Arthur Ruano Moura', 9, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Letícia Ocko Cabral de Oliveira', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Lethicia de Oliveira Medeiros', 29, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Maria Luisa Silva de Sá Vale', 16, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Daniel Villar Pinto Ribeiro', 10, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Luiza Vilar Pinto Ribeiro', 10, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Juliana Ferreira do Valle', 6, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Carolina da Silva Pelaez de Sousa', 6, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Maria Eduarda Santos Nougueira', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Maitê Bruno Barbieri Correa', 6, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Halex Guerra Tiago', 6, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Miguel Oliveira Vieira', 11, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Nina Mattos Olivieri', 9, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Luiza De Moura Medeiros', 19, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Lui Belmont Oliveira', 7, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Serena Gomes Fonseca filha', 12, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Tiago Franco Leite Ribeiro', 12, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Helena da silva Rodrigues', 12, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Salomão Barros Bertella', 11, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Alexandre Nunes Peixoto', 8, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Inácio Campêlo Costa', 7, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Yuri José da Silva', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Rafael Gonçalves Bianchini', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Noah Daltro Machado', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Maria Fernanda Machado Lopes', 4, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Mateus Urrets Zavalia Alvares Santos', 4, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Thais Soares Molisani K. de C. de Souza', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Rayana da Costa Melo', 16, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Isaac Costa Miller de Carvalho', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Manuela Silva de Paula', 13, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Lucas Medeiros de Albuquerque', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Alana Teixeira de Assumpção', 12, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Joaquim Vasconcellos Baptista Goulart', 12, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Antonio Carvalho Olivieri', 12, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Luisa medeiros de Albuquerque', 5, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Lara Dias de Lima Martins', 11, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Murilo Mendes Neiva Fernandes', 10, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Giovanna Vieira dos Santos', 8, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Gabriela Garcia de Carvalho', 8, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid),
('Lucas do Valle Carvalho Oliveira', 6, 'Sem categoria', NULL, '95553e96-971b-4590-a6eb-0201d013c14d'::uuid)
) AS t(nome, tempo_permanencia_meses, categoria_saida, mes_saida, unidade_id);
