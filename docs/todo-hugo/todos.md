- modificar a coluna de telefone da coluna leads para nao aceitar telefones repetidos.
- implementar A inserçao de leads atendidos e remover o webhook de lead_criado de inserir direto na base, ja que agora apenas os leads atendidos serao inseridos na base.
- corrigir a duplicação de leads que viram experimental: adicionar um lead para experimental causa uma duplicação dos leads

- corrigir as views de metricas: as metricas de churn rate utilizam umas views que contam valores duplicados.

- o ltv tambem conta dados historicos e nao filtra corretamente pelos dados.

- Professor Gabriel Antony Trabalha em duas unidades mas so esta configurada para uma.


Do adm:
1. ⁠1. A Grade horária está com horários diferentes do real(emusys), aulas em horários diferentes.
2. ⁠Distribuição dos alunos por professor irregular.
3. ⁠Quantidade de novas matriculas irregular, ferindo o saldo liquido no report. 

Do comercial: 
1. Irregularidades na  sinalização das matriculas dos professores, experimental computada, mas matricula não direcionada aos professores. 
2. ⁠Quantidade de Matriculas no mês diferente entre os dois sistemas, ora para mais ora pra menos.

Gap de dados:
- 15 leads (datas 27/04 a 25/05) com `leads.data_experimental` preenchido mas SEM linha correspondente em `lead_experimentais`. Investigar qual webhook/workflow está setando o campo no lead sem criar o registro na tabela canônica. Suspeitos: edge `processar-matricula-emusys`, workflow n8n da Mila SDR, ou FormLead manual no frontend. Enquanto não corrige na origem, a Agenda usa fallback híbrido (lead_experimentais primário + leads como fallback).