- modificar a coluna de telefone da coluna leads para nao aceitar telefones repetidos.
- implementar A inserçao de leads atendidos e remover o webhook de lead_criado de inserir direto na base, ja que agora apenas os leads atendidos serao inseridos na base.
- corrigir a duplicação de leads que viram experimental: adicionar um lead para experimental causa uma duplicação dos leads

- corrigir as views de metricas: as metricas de churn rate utilizam umas views que contam valores duplicados.

- o ltv tambem conta dados historicos e nao filtra corretamente pelos dados.