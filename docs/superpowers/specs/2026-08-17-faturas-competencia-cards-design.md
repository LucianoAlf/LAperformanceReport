# Faturas de Alunos — competência mensal e cards-filtro

Data: 17/08/2026

Status: aprovado pelo usuário em 17/08/2026

Projeto: LA Report  
Supabase: `ouqwbbermlzqqvtqwlul`

## Objetivo

Corrigir o recorte padrão da página `/app/faturas` e simplificar sua hierarquia
visual. Quando o cabeçalho indicar **Ago/2026**, todos os totais e linhas devem
ser exclusivamente da competência agosto de 2026. Ao selecionar julho, a mesma
regra vale para julho.

A página continua sendo uma visão global do ciclo financeiro da fatura, com a
carteira D+2 e a reconciliação como recortes operacionais seguros.

## Evidência da causa

Em 17/08/2026, a RPC `get_faturas_alunos_financeiro_v1` foi consultada em modo
somente leitura para agosto:

| Recorte | Todas | Pagas | Em aberto |
|---|---:|---:|---:|
| Consolidado, junho a agosto | R$ 1.207.957,69 | R$ 1.133.388,74 | R$ 74.568,95 |
| Consolidado, somente agosto | R$ 405.660,34 | R$ 338.968,40 | R$ 66.691,94 |
| Barra, junho a agosto | R$ 316.138,99 | R$ 305.652,29 | R$ 10.486,70 |
| Barra, somente agosto | R$ 107.776,44 | R$ 97.698,39 | R$ 10.078,05 |

A tela usava `janela_3` quando não havia `competencia` na URL. Assim, o selo
global mostrava Ago/2026, mas a leitura somava junho, julho e agosto e a tabela
começava por junho.

## Alternativas consideradas

1. **Cards como filtros primários, competência mensal no topo — escolhida.**
   Elimina a duplicidade entre abas e KPIs, mantém os totais visíveis e segue a
   interação já conhecida no Emusys.
2. Manter abas e cards. Rejeitada por repetir o mesmo estado em duas linhas e
   consumir espaço vertical.
3. Manter apenas abas. Rejeitada porque esconde os valores agregados que a
   equipe precisa conferir antes de abrir a lista.

## Regra de período

- A fonte de verdade visual é a competência mensal do `AppLayout`.
- A chamada da RPC usa sempre `p_modo_periodo='competencia'` nesta página.
- O ano e o mês vêm do filtro global de competência.
- O parâmetro de URL `competencia=YYYY-MM-01` continua válido para atalhos e é
  sincronizado com o filtro global.
- Alterar mês ou ano atualiza a URL e recarrega a RPC.
- A opção **Últimas 3 competências** sai do filtro principal da página.
- A carteira canônica da Sol continua com sua janela própria; esta mudança não
  altera `get_inadimplencia_canonica` nem a régua de cobrança externa.

## Unidade e autorização

- A página não terá um segundo seletor de unidade dentro da tabela.
- Admin troca unidade no seletor global do cabeçalho e pode usar Consolidado.
- Usuário operacional de uma unidade vê apenas sua unidade, sem seletor local.
- Usuário não-admin com mais de uma unidade continua limitado ao seletor global
  e às unidades permitidas pelo RBAC.
- Parâmetro `unidade` da URL nunca amplia acesso. Para admin, pode inicializar o
  seletor global; para não-admin, é ignorado em favor da unidade autenticada.
- A RPC autenticada permanece como última barreira de autorização.

## Hierarquia da interface

### Faixa superior

Usar `PageFilterBar` logo abaixo do cabeçalho global:

- seletor mensal de competência do design system;
- botão **Atualizar agora**;
- unidade permanece no `AppHeader`, onde já respeita o perfil do usuário.

A faixa de frescor continua visível, mas o texto passa a mencionar a
competência selecionada e não uma janela de três meses.

### Cards-filtro

Remover a linha duplicada de `PageTabs`. Os cards passam a ser os filtros da
lista e usam `aria-pressed` para indicar a seleção:

- Todas;
- Pagas;
- Em aberto;
- Em atraso · D+0;
- A vencer.

Cada card exibe quantidade e valor da competência selecionada. O estado ativo
tem borda e contraste mais fortes; clicar troca `situacao` na URL e a lista
abaixo.

### Ações operacionais

Abaixo dos cards, uma faixa compacta contém:

- **Cobrar agora · D+2**, respeitando `collectionAllowed`;
- **Reconciliação financeira**, com contagem de pendências;
- **Canceladas**, como visão secundária.

Essas entradas não repetem KPIs da linha principal. Reconciliação continua no
mesmo ambiente e nunca compõe totais ou cobrança.

### Filtros da lista

Permanecem junto da tabela:

- busca;
- curso;
- forma de pagamento;
- limpar filtros.

Saem dessa linha os filtros de unidade e competência, pois ambos já estão na
faixa superior/global.

## Formas de pagamento

O rótulo continua preservando a fonte: **Pago via**, **Forma prevista** ou
**Forma não informada**. O ícone passa a representar o meio:

| Meio normalizado | Ícone |
|---|---|
| Pix / Pix automático | QR code |
| Cartão de crédito / recorrente | cartão |
| Boleto | código de barras |
| Cheque | documento com confirmação |
| Dinheiro | cédula |
| Transferência | instituição bancária |
| Ausente ou desconhecido | círculo de ajuda |

Nenhum ícone altera a semântica financeira; ele apenas facilita leitura
rápida. A forma prevista nunca é apresentada como pagamento confirmado.

## Dados e fronteiras

- Fonte: `get_faturas_alunos_financeiro_v1` sobre `sync_run_items` publicado.
- Grão: `unidade_id + canonical_fatura_id`.
- IDs Emusys continuam escopados pela unidade.
- Não haverá migration nem nova fórmula monetária nesta revisão.
- Os três valores contratuais permanecem: com desconto, sem desconto
  condicional e atualizado/pago.
- Não alterar RPCs de caixa da Sol, agenda, presença ou LA Teacher.

## Testes e critérios de aceitação

1. Sem parâmetro de URL, Ago/2026 chama a RPC com ano 2026, mês 8 e
   `p_modo_periodo='competencia'`.
2. Ao mudar para julho, a RPC recebe mês 7 e nenhuma linha de junho/agosto
   aparece.
3. O cabeçalho, a URL e a leitura financeira exibem a mesma competência.
4. Não existe seletor local de unidade; o escopo vem do contexto autenticado.
5. Perfil de unidade não consegue produzir consulta consolidada por URL.
6. Não existe mais `PageTabs` duplicando os cards.
7. Cada card filtra a lista e apresenta estado ativo acessível.
8. D+2 continua bloqueado quando `collectionAllowed=false`.
9. Reconciliação permanece acessível na própria página.
10. Pix, cartão, boleto, cheque, dinheiro e transferência usam ícones
    distintos.
11. A página continua sem leitura direta de `sync_run_items` ou
    `emusys_faturas` no browser.
12. Testes, build, DOM, console e reload autenticado passam antes da entrega.

## Risco residual

Os totais mensais refletem o último snapshot completo e publicado da
competência. A faixa de frescor continua obrigatória; mudar o recorte não torna
um snapshot velho em dado pronto para cobrança.
