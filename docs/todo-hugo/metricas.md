evasao = cancelamento + não renovaçao

---

## SNAPSHOT METRICAS PRE-UNIFICACAO (25/02/2026)

Gravado antes de unificar evasoes_v2 em movimentacoes_admin.

### View vw_kpis_retencao_mensal (fonte atual: evasoes_v2)

| Unidade | Ano | Mes | Total Evasoes | Interrompidas | Avisos | Transf | Nao Renov | Taxa Evasao | MRR Perdido |
|---------|-----|-----|---------------|---------------|--------|--------|-----------|-------------|-------------|
| Barra | 2025 | 12 | 17 | 14 | 0 | 0 | 3 | 7.80% | 7271 |
| Barra | 2026 | 1 | 19 | 19 | 0 | 0 | 0 | 8.72% | 8366 |
| Barra | 2026 | 2 | 26 | 12 | 11 | 1 | 2 | 11.47% | 6022 |
| Campo Grande | 2025 | 12 | 9 | 9 | 0 | 0 | 0 | 2.02% | 2877 |
| Campo Grande | 2026 | 1 | 16 | 9 | 7 | 0 | 0 | 3.59% | 3455 |
| Campo Grande | 2026 | 2 | **17** | 17 | 0 | 0 | 0 | 3.81% | 6137 |
| Recreio | 2025 | 12 | 25 | 21 | 0 | 0 | 4 | 7.99% | 10001 |
| Recreio | 2026 | 1 | 9 | 7 | 0 | 0 | 2 | 2.88% | 3136 |
| Recreio | 2026 | 2 | 10 | 7 | 0 | 0 | 3 | 3.19% | 4012 |

### evasoes_v2 (contagem direta)

| Unidade | Ano | Mes | Total | Interrompido | Nao Renov | Aviso Previo |
|---------|-----|-----|-------|--------------|-----------|--------------|
| CG | 2025 | 12 | 9 | 9 | 0 | 0 |
| CG | 2026 | 1 | 16 | 9 | 0 | 7 |
| CG | 2026 | 2 | **17** | 17 | 0 | 0 |
| Barra | 2025 | 12 | 17 | 14 | 3 | 0 |
| Barra | 2026 | 1 | 29 | 29 | 0 | 0 |
| Barra | 2026 | 2 | 30 | 13 | 5 | 11 |
| Recreio | 2025 | 12 | 27 | 21 | 6 | 0 |
| Recreio | 2026 | 1 | 9 | 7 | 2 | 0 |
| Recreio | 2026 | 2 | 15 | 8 | 7 | 0 |

### movimentacoes_admin (contagem direta)

| Unidade | Ano | Mes | Evasao | Nao Renov | Aviso Previo | Renovacao | Trancamento |
|---------|-----|-----|--------|-----------|--------------|-----------|-------------|
| CG | 2026 | 1 | 9 | 0 | 6 | 25 | 0 |
| CG | 2026 | 2 | **13** | 0 | 0 | 0 | 0 |
| Barra | 2025 | 12 | 1 | 0 | 0 | 0 | 0 |
| Barra | 2026 | 1 | 19 | 0 | 11 | 10 | 0 |
| Barra | 2026 | 2 | 12 | 5 | 11 | 16 | 0 |
| Recreio | 2025 | 12 | 0 | 3 | 0 | 4 | 0 |
| Recreio | 2026 | 1 | 8 | 2 | 3 | 16 | 1 |
| Recreio | 2026 | 2 | 6 | 0 | 8 | 11 | 8 |

### Divergencias conhecidas (CG fev/2026)
- evasoes_v2: **17** | movimentacoes_admin: **13** | Diferenca: **4 registros extras**
- IDs extras em evasoes_v2: 775 (Beatriz), 780 (Fabio), 786 (Lucas Reis), 789 (Marcio Vital)
- Valor correto: **13 cancelamentos**

### Totais gerais
- evasoes_v2: **742 registros** (jan/2025 a fev/2026)
- movimentacoes_admin com correspondente: 70
- Sem correspondente (migrar): **672 registros**
