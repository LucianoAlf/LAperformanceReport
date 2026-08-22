-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ETAPA 1: Atualizar status_pagamento de inadimplente para em_dia
-- para todos os alunos da Barra que pagaram (conforme CSV)
-- EXCETO os 7 inadimplentes reais (Juliana, Saulo, Alicia, Maria Flor, Joaquim Candido, Lorenzo)

UPDATE alunos 
SET status_pagamento = 'em_dia', updated_at = NOW()
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  AND status = 'ativo'
  AND status_pagamento = 'inadimplente'
  AND nome NOT IN (
    'Juliana de Oliveira almeida',
    'Saulo Reina da Rocha',
    'Alicia Reina',
    'Maria Flor Silveira',
    'Joaquim Candido Querido Ferraz Soares',
    'Lorenzo Tavares Bernardino de Lima'
  );
