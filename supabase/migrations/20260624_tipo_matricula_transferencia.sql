-- Tipo operacional para transferencias internas.
-- Conta em base pagante/ticket/MRR, mas deve ficar fora de "matricula nova" comercial.
INSERT INTO public.tipos_matricula (
  nome,
  codigo,
  entra_ticket_medio,
  conta_como_pagante,
  entra_ltv,
  entra_churn,
  descricao,
  ativo
)
VALUES (
  'Transferencia Interna',
  'TRANSFERENCIA',
  true,
  true,
  true,
  true,
  'Aluno transferido entre unidades. Conta como pagante/ticket/base ativa, mas nao como matricula nova comercial.',
  true
)
ON CONFLICT (codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  entra_ticket_medio = EXCLUDED.entra_ticket_medio,
  conta_como_pagante = EXCLUDED.conta_como_pagante,
  entra_ltv = EXCLUDED.entra_ltv,
  entra_churn = EXCLUDED.entra_churn,
  descricao = EXCLUDED.descricao,
  ativo = EXCLUDED.ativo;
