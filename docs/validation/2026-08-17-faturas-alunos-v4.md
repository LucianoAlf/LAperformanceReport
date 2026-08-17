# Validação — Faturas de Alunos e inadimplência canônica v4

**Data:** 17/08/2026
**Ambiente:** produção Supabase ouqwbbermlzqqvtqwlul e Vercel
**Escopo:** leitura global de faturas, carteira D+2 ativa, fila de sync e exportador.

## Publicação confirmada

- Migrations no ledger remoto:
  - 20260817103000_inadimplencia_canonica_carteira_ativa_d2_v1
  - 20260817110000_inadimplencia_canonica_v4_carteira_ativa_d2
- export-contas-receber: versão **21**, ACTIVE, verify_jwt=false preservado.
- sync-faturas-emusys: versão **33**, com frescor compatível com a cadência.
- Deploy Vercel de produção, **Ready**:
  https://la-performance-report-ljirunzqh-luciano-alfs-projects.vercel.app
- Alias de produção: https://la-performance-report.vercel.app

## Testes locais

| Checagem | Resultado |
|---|---|
| npm test | 196 aprovados, 0 falhas |
| npm run build | aprovado |
| Teste PostgreSQL das migrations | aprovado, inclusive o wrapper v4 |
| Contrato do exportador | aprovado: bloqueia v3, stale, escopo ou fórmula divergentes |

O build mantém avisos preexistentes de Recharts/chunks grandes; eles não foram
introduzidos por esta entrega.

## Reconciliação Emusys × snapshot

Valores de principal original, antes de juros/multa:

| Unidade | Jun/2026 | Jul/2026 | Ago/2026 |
|---|---:|---:|---:|
| Campo Grande | 6 / R$ 2.682,00 | 8 / R$ 3.576,00 | 3 / R$ 1.341,00 |
| Recreio | 1 / R$ 480,00 | 1 / R$ 480,00 | 5 / R$ 2.390,87 |
| Barra | 0 / R$ 0,00 | 1 / R$ 397,00 | 18 / R$ 7.579,00 |

Os seis arquivos do Emusys coincidiram com snapshots frescos de
sync_run_items. A coleta controlada de agosto em Campo Grande também comparou
459 faturas ao vivo contra 459 no snapshot, sem itens exclusivos nem diferença
nos campos centrais.

## Pendência explícita de validação visual

A rota publicada respondeu e redirecionou corretamente para login sem sessão.
Nesta execução a sessão autenticada não estava disponível no navegador. Ainda
falta, após login, validar visualmente:

1. /app/faturas com os oito atalhos de status;
2. três valores, forma de pagamento e filtros do design system;
3. estados partial, stale e reconciliação na própria página;
4. troca entre Campo Grande, Recreio e Barra; reload e console sem erro.

Essa pendência não autoriza cobrança automática. O envio da Sol continua
desligado até comparação sombra e aprovação humana.
