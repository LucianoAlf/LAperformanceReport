# Dominio Operacional — LA Music

## Professores
- `src/components/App/Professores/ProfessoresPage.tsx`
- Cadastro, feedback 360, performance, health score, itinerario
- Hooks: `useProfessoresData`, `useProfessoresPerformance`
- Metricas: carteira de alunos, taxa evasao por professor, avaliacao 360 (fórmulas em `metricas.md`)
- Edge function `professor-360-whatsapp` — envia feedback via WhatsApp
- Edge function `gemini-insights-professor` — insights IA por professor
- Edge function `gemini-ranking-professores` — ranking comparativo

### Schema multi-unidade
- Tabela `professores` armazena a PESSOA (id, nome, ativo, comissao_percentual, etc).
- Tabela `professores_unidades` e a juncao N×N entre professor e unidade. Armazena `emusys_id` por par (professor, unidade) — Emusys e por-escola, o mesmo humano tem `emusys_id` DIFERENTE em cada unidade.
- Exemplo: Leticia (prof_id 18) → CG emusys=2745, REC emusys=1522. Sao a mesma pessoa, 2 cadastros no Emusys.
- Hoje: 23 professores multi-unidade, 3 deles em 3 unidades (Joel, Lohana, Willer).

### Sync semanal com Emusys (2026-05-20)
- Edge function `sync-professores-emusys` (v1) — chama `GET /v1/professores` em cada unidade.
- Cron `sync-professores-emusys-semanal`: Domingo 04:00 BRT.
- Acoes: (1) ja vinculado, (2) vinculou emusys_id por nome, (3) vinculou unidade existente, (4) criou professor novo.
- "Sumiu da lista" — apenas LOGA em `professores_sync_log`, NAO desativa.

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

## Caixa Financeiro (Administrativo > aba Caixa)
- Caixa diario = **por `unidade_id + data_caixa`** (constraint unique), NAO por usuario. Todos da unidade (ou admin) compartilham o mesmo caixa do dia (RLS por `usuarios.unidade_id`). Tabelas: `caixas_diarios`, `caixa_movimentacoes`, `caixa_financeiro_grupos_whatsapp`.
- **Data sempre BRT**: usar `hojeISOBrt()` de `lib/caixaFinanceiro.ts` (`toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})`). NUNCA `new Date().toISOString().slice(0,10)` (UTC pula o dia apos 21h BRT — bug corrigido 23/06).
- `CaixaFinanceiroTab` tem **estado proprio de data** (desacoplado do filtro de competencia) + date picker navegavel (setas ◄►+ DatePicker). Trava: dia 01 do mes corrente ≤ data ≤ hoje (futuro bloqueado, so mes corrente). Permite abrir/fechar/enviar caixa retroativo dentro do mes.
- Botao "Enviar WhatsApp" so habilita com caixa **fechado**. Envio via edge `caixa-financeiro-whatsapp` (provedor `funcao=sistema`, hoje WAHA "Sol") pro grupo financeiro da unidade. Falha comum: sessao WAHA caida ("Session status is not as expected").

## Config
- `src/components/App/Config/ConfigPage.tsx` — configuracoes do sistema

## Tabelas Principais
- `unidades`, `alunos`, `leads`, `matriculas`, `renovacoes`, `evasoes`
- `professores`, `turmas`, `cursos`, `dados_mensais`, `metas`
- `movimentacoes_admin`, `aulas_emusys`, `aluno_presenca`, `motivos_saida`
- `loja_*` (produtos, variacoes, estoque, vendas, vendas_itens, carteira, movimentacao)
- `professores_unidades` (juncao N×N + emusys_id por par)
- `professores_sync_log` (auditoria do sync semanal)
