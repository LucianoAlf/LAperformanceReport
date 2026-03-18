# Dominio Operacional — LA Music

## Professores
- `src/components/App/Professores/ProfessoresPage.tsx`
- Cadastro, feedback 360, performance, health score, itinerario
- Hooks: `useProfessoresData`, `useProfessoresPerformance`
- Metricas: carteira de alunos, taxa evasao por professor, avaliacao 360
- Edge function `professor-360-whatsapp` — envia feedback via WhatsApp
- Edge function `gemini-insights-professor` — insights IA por professor
- Edge function `gemini-ranking-professores` — ranking comparativo

## Salas
- `src/components/App/Salas/SalasPage.tsx`
- Inventario de salas, ocupacao, capacidade
- Vinculadas a turmas e grade horaria

## Projetos
- `src/components/App/Projetos/ProjetosPage.tsx`
- Bandas, concertos, grupos. Hook: `useProjetos`

## Metas
- `src/components/App/Metas/MetasPage.tsx`
- Configuracao por unidade + ano
- KPI targets: alunos, matriculas, churn, ticket, faturamento
- Tabela `metas` com upsert por `unidade_id,ano`

## Dashboard
- `src/components/App/Dashboard/DashboardPage.tsx`
- Hub de BI consolidado, usa hooks de KPIs de todos os dominios

## Entrada de Dados
- `src/components/App/Entrada/` — FormLead, FormEvasao, RelatorioDiario
- Formularios simplificados para entrada rapida

## Administrativo
- `src/components/App/Administrativo/AdministrativoPage.tsx`
- Movimentacoes: renovacao, nao-renovacao, aviso previo, trancamento, evasao
- Alertas de retencao, plano de acao, Fideliza+, Lojinha, Painel Farmer

## Lojinha (Sistema de Loja Interna)
- Embarcada no Administrativo (`TabLojinha`)
- Sub-tabs: Produtos, Vendas, Estoque, Comissoes, Configuracoes

### Entidades
- `loja_produtos` — nome, descricao, categoria, SKU, preco, custo
- `loja_variacoes` — variantes (tamanho, cor)
- `loja_estoque` — estoque por unidade e variacao
- `loja_vendas` — transacao (tipo_cliente: aluno|colaborador|avulso, forma_pagamento, desconto)
- `loja_vendas_itens` — itens da venda (produto, variacao, quantidade, preco_unitario)
- `loja_carteira` — carteira digital para farmers/professores (saldo, moedas_la)
- `loja_carteira_movimentacao` — historico (comissao_venda, comissao_indicacao, moeda_la, saque, compra_loja, ajuste)

### Formas de Pagamento
- `pix`, `dinheiro`, `debito`, `credito`, `folha`, `saldo`

### Alertas de Estoque
- Niveis: `critico`, `atencao`, `zerado`
- Edge function `lojinha-alerta-estoque` — WhatsApp quando estoque < minimo

### Configuracoes
- `comissao_farmer_padrao`, `comissao_professor_indicacao`, `valor_moeda_la`, `alerta_whatsapp_ativo`
- Parte do programa Fideliza+ (meta vendas_lojinha por unidade)

## Config
- `src/components/App/Config/ConfigPage.tsx` — configuracoes do sistema

## Tabelas Principais
- `unidades`, `alunos`, `leads`, `matriculas`, `renovacoes`, `evasoes`
- `professores`, `turmas`, `cursos`, `dados_mensais`, `metas`
- `movimentacoes_admin`, `aulas_emusys`, `aluno_presenca`, `motivos_saida`
- `loja_*` (produtos, variacoes, estoque, vendas, vendas_itens, carteira, movimentacao)
