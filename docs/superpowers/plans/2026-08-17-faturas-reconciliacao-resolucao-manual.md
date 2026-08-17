# Plano — Reconciliação de faturas resolvida na operação

## Checkpoint 1 — contrato e testes RED

- Criar teste de orientação por tipo de pendência.
- Criar teste do contrato de migration/RPC e preservação da origem.
- Criar teste estrutural da ação inline e dos selects do design system.

## Checkpoint 2 — banco

- Criar tabela append-only de decisões por unidade/fatura/matrícula.
- Criar RPC autorizada para registrar decisão e, quando aplicável, fixar forma de pagamento local.
- Enriquecer nomes e formas a partir da matrícula canônica Emusys.
- Filtrar histórico de ex-aluno e lançamentos avulsos da fila operacional.
- Expor contadores informativos de itens fora da operação e resolvidos manualmente.

## Checkpoint 3 — frontend

- Carregar formas de pagamento ativas pelo mesmo componente usado no Comercial/Administrativo.
- Exibir nome e orientação operacional por item.
- Permitir selecionar forma e registrar decisão com observação.
- Recarregar a leitura canônica após salvar.

## Checkpoint 4 — verificação

- Rodar testes RED/GREEN, suíte financeira e build.
- Aplicar a migration somente com o contrato revisado.
- Validar no banco os casos fornecidos de Campo Grande e Barra.
- Validar visualmente a página, salvar uma decisão de teste autorizada e confirmar persistência após reload.
