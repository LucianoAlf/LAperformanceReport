# Handoff para o Claude — Faturas de Alunos concluída

Data: 16/08/2026
Supabase: `ouqwbbermlzqqvtqwlul`
Backend canônico: `2cd9147e`
Frontend A+C: `67ef3a89`, `66266965`, `35aaf3da`

## Estado entregue

A página A+C já foi implementada, integrada à `main`, publicada e validada em
produção. O Claude não deve recriar essa UI.

- Página dedicada: `/app/faturas`.
- Menu operacional: **Faturas**, ao lado de **Alunos**.
- Atalhos contextuais: Gestão de Alunos, Comercial e ficha do aluno.
- Fonte exclusiva do browser:
  `public.get_inadimplencia_canonica(p_unidade_id, p_as_of_date)`.
- Estados implementados: loading, ok, partial, stale, incomplete, error e empty.
- `partial` exibe confirmados e separa reconciliação.
- `stale`/`incomplete`/`error` não exibem lista acionável.
- Valores financeiros preservam duas casas decimais.
- O detalhe prova fatura, matrícula, contrato, competência, data de corte e
  frescor.
- Não há botão de cobrança, segredo, `service_role` ou leitura direta de
  snapshot no frontend.

Arquivos principais:

- `src/lib/faturasAlunosCanonicas.ts`;
- `src/components/App/FaturasAlunos/FaturasAlunosPage.tsx`;
- `src/components/App/FaturasAlunos/types.ts`;
- `src/components/App/Alunos/AlunosPage.tsx`;
- `src/components/App/Alunos/TabelaAlunos.tsx`;
- `src/components/App/Alunos/ModalFichaAluno.tsx`;
- `src/components/App/Comercial/ComercialPage.tsx`;
- `src/components/App/Layout/AppSidebar.tsx`;
- `src/router.tsx`.

## Prova de produção

Em 16/08/2026, com `status=partial`, `collection_allowed=true` e escopo
`confirmed_only`, a página exibiu:

| Unidade | Faturas | Matrículas | Original | Atualizado |
|---|---:|---:|---:|---:|
| Campo Grande | 15 | 11 | R$ 6.705,00 | R$ 6.910,14 |
| Barra | 19 | 18 | R$ 7.976,00 | R$ 8.156,85 |
| Recreio | 4 | 4 | R$ 1.910,87 | R$ 1.954,03 |
| Consolidado | 38 | 33 | R$ 16.591,87 | R$ 17.021,02 |

Também foram conferidos:

- reload preservando a query string;
- atalhos de Alunos e Comercial chegando à mesma página;
- modal com IDs exatos e timestamps;
- console de produção sem erros;
- 1 contato pendente no Recreio separado da ação operacional.

O frescor acima é uma evidência temporal. Todo consumidor deve revalidar
`fresh_until` na execução atual.

## O que o Claude deve fazer agora

O trabalho restante do Claude é somente ligar a Sol ao contrato operacional,
em modo sombra, conforme:

`docs/handoffs/2026-08-16-inadimplencia-canonica-sol.md`

Resumo obrigatório:

1. consumir `public.sol_caixa_inadimplentes` no backend com `service_role`;
2. aplicar os gates publicados, sem fallback;
3. não criar sync próprio;
4. não alterar as RPCs de caixa protegidas;
5. não enviar mensagens durante o modo sombra;
6. devolver ao Alf a lista e os totais que seriam acionados nas três unidades;
7. aguardar aprovação explícita antes de ativar cron ou WhatsApp.

## Fora desta entrega

- histórico completo de ex-alunos e competências anteriores à janela;
- consulta ao vivo por matrícula/aluno/contrato;
- edição, pagamento, cancelamento, renegociação ou conciliação de faturas;
- automação de cobrança pela UI.

Esses itens exigem uma segunda especificação e não podem usar o snapshot de
três meses como se fosse histórico completo.
