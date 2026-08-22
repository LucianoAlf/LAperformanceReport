-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- GRUPO A: Atualizar valor_parcela (reajuste real) - 18 alunos
-- Aprovado pelo usuário em 15/02/2026

UPDATE alunos SET valor_parcela = 465.00, updated_at = NOW() WHERE id = 710;  -- Alana Vasconcelos
UPDATE alunos SET valor_parcela = 402.00, updated_at = NOW() WHERE id = 717;  -- Ana Paula dos Santos
UPDATE alunos SET valor_parcela = 402.00, updated_at = NOW() WHERE id = 726;  -- Arthur Moreno
UPDATE alunos SET valor_parcela = 402.00, updated_at = NOW() WHERE id = 732;  -- Benício Carvalho
UPDATE alunos SET valor_parcela = 403.00, updated_at = NOW() WHERE id = 799;  -- Joaquim Toshio
UPDATE alunos SET valor_parcela = 531.00, updated_at = NOW() WHERE id = 818;  -- Lucas Bianchi
UPDATE alunos SET valor_parcela = 408.00, updated_at = NOW() WHERE id = 825;  -- Lucas Reis Pinna
UPDATE alunos SET valor_parcela = 404.00, updated_at = NOW() WHERE id = 833;  -- Marcelo Ximenes
UPDATE alunos SET valor_parcela = 375.00, updated_at = NOW() WHERE id = 841;  -- Mariana Herd Giglio (Canto)
UPDATE alunos SET valor_parcela = 463.00, updated_at = NOW() WHERE id = 842;  -- Marina Holanda
UPDATE alunos SET valor_parcela = 404.00, updated_at = NOW() WHERE id = 849;  -- Maya Kelly
UPDATE alunos SET valor_parcela = 402.00, updated_at = NOW() WHERE id = 874;  -- Pedro Henrique Moreno
UPDATE alunos SET valor_parcela = 375.00, updated_at = NOW() WHERE id = 879;  -- Pérola Madeira (Canto)
UPDATE alunos SET valor_parcela = 404.00, updated_at = NOW() WHERE id = 882;  -- Rafael Kelly
UPDATE alunos SET valor_parcela = 403.00, updated_at = NOW() WHERE id = 893;  -- Sergio Paulo Fogaça
UPDATE alunos SET valor_parcela = 482.00, updated_at = NOW() WHERE id = 899;  -- Thalita Araujo
UPDATE alunos SET valor_parcela = 470.00, updated_at = NOW() WHERE id = 903;  -- Thoth dos Anjos
UPDATE alunos SET valor_parcela = 482.00, updated_at = NOW() WHERE id = 910;  -- Vitoria da Luz
