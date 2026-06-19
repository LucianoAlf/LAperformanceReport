# Parecer P02.G1.1 - Validacao visual

Data: 2026-06-15

## Escopo

Revisao visual local autenticada/read-only do PR #4, branch `p02g1-sazonalidade-v2`, apos o ajuste conservador de `ComercialSazonalidade`.

Nao houve banco, SQL, migration, merge ou deploy.

## Evidencias

Prints salvos em:

- `outputs/la-report-comercial-funil-audit/2026-06-15/p02g1_1_visual/01_inicio.png`
- `outputs/la-report-comercial-funil-audit/2026-06-15/p02g1_1_visual/02_sazonalidade_topo.png`
- `outputs/la-report-comercial-funil-audit/2026-06-15/p02g1_1_visual/03_sazonalidade_heatmap.png`
- `outputs/la-report-comercial-funil-audit/2026-06-15/p02g1_1_visual/04_origem.png`

## Resultado

- Login autenticado: OK.
- Rota `/apresentacao/comercial`: OK.
- Primeira tela: OK, com `Leads Entrantes = 2.133`, `Matriculas Comerciais = 73` e `Taxa de Matricula Comercial = 3.4%`.
- Sazonalidade: OK.
- `Leads Entrantes` aparece como metrica principal.
- `Matriculas comerciais -- criterio atual em validacao` aparece apenas como card consolidado/diagnostico.
- Grafico mostra `Evolucao Mensal: Leads Entrantes`.
- Heatmap mostra `Heatmap de Leads Entrantes 2025`.
- Copy de ressalva aparece: `Distribuicao de matriculas por unidade em validacao semantica. Leads ja usam fonte canonica v2.`
- Nao aparece heatmap de matriculas.
- Nao aparece evolucao mensal de matriculas.
- Nao ha toggle visivel para `Matriculas Comerciais`.
- `ComercialOrigem` continua renderizando com ranking real.
- Sem `NaN`.
- Sem loading infinito.
- Sem erro visivel de RPC/comercial.

## Observacao tecnica

Durante a automacao, apareceram requests `HEAD` abortados para `automacao_invariantes`, sem erro visual, sem HTTP 4xx/5xx e sem relacao com a RPC comercial v2 validada neste PR.

## Veredito

P02.G1.1 passa para revisao humana Alf/Hugo como visual conservador.

PR #4 deve continuar em draft ate decisao humana sobre sair do draft ou aguardar a regra canonica de matricula comercial por unidade.
