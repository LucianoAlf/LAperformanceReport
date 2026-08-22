-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Atualizar formas de pagamento dos alunos da Barra baseado no CSV PARCELAS-ALUNOS-FEV.csv
-- Mapeamento:
-- 1 = Crédito Recorrente (Cobrança Automática / Cartão de Crédito, Cartão de Crédito, Pagamento Recorrente, Cartão de Débito)
-- 2 = Cheque
-- 3 = Pix
-- 4 = Dinheiro
-- 6 = Boleto

-- CRÉDITO RECORRENTE (ID 1) - Maioria dos alunos
UPDATE alunos SET forma_pagamento_id = 1, updated_at = NOW()
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  AND status IN ('ativo', 'trancado')
  AND forma_pagamento_id IS NULL;

-- Agora corrigir os casos específicos que NÃO são crédito recorrente:

-- PIX (ID 3)
UPDATE alunos SET forma_pagamento_id = 3, updated_at = NOW()
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  AND nome IN (
    'Francisco Thomé Godoi',
    'Agatha Carias da Silva Pereira',
    'Filippe Carnetti Fernandes',
    'Giovani Breda Silva',
    'Ana Vitória de Lima',
    'Elizaveta Bogatyreva',
    'Paulo César Benzi Filho'
  );

-- CHEQUE (ID 2)
UPDATE alunos SET forma_pagamento_id = 2, updated_at = NOW()
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  AND nome IN (
    'Martina Gomes Ferreira',
    'Gabriela Ferreira Noritomi',
    'Clara de Souza Dantas Lapa',
    'Bento Lapa Cazarim',
    'Tito Lapa Cazarim'
  );

-- DINHEIRO (ID 4)
UPDATE alunos SET forma_pagamento_id = 4, updated_at = NOW()
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  AND nome IN (
    'Pedro José Dos santos Nadaes',
    'Julia dos Santos Nadaes'
  );

-- BOLETO (ID 6)
UPDATE alunos SET forma_pagamento_id = 6, updated_at = NOW()
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  AND nome IN (
    'Carlos Vitor Pinheiro da Silva',
    'Vivian Dangelo',
    'Ana Paula dos Santos Souza',
    'Lucas Cardoso Neiva'
  );
