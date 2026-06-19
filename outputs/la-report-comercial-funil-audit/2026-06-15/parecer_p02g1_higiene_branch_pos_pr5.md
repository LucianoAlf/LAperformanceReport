# Parecer P02G1 - Higiene da branch apos PR #5

Data: 2026-06-19
Escopo: diagnostico local da branch `p02g1-sazonalidade-v2` apos fechamento do PR #5.
Modo: sem merge, sem rebase, sem pull, sem push, sem commit e sem alteracao de banco.

## 1. Valores pos-merge do PR #5

Valores aceitos da validacao pos-merge informada:

| Competencia | Unidade | Leads Dashboard/RPC v2 | Fonte |
|---|---:|---:|---|
| 2026-05 | Consolidado | 917 | producao + RPC v2 + SELECT direto |
| 2026-05 | Campo Grande | 516 | producao + RPC v2 + SELECT direto |
| 2026-05 | Recreio | 221 | producao + RPC v2 + SELECT direto |
| 2026-05 | Barra | 180 | producao + RPC v2 + SELECT direto |
| 2026-06 | Consolidado | 552 | producao + RPC v2 + SELECT direto |
| 2026-06 | Campo Grande | 252 | producao + RPC v2 + SELECT direto |
| 2026-06 | Recreio | 190 | producao + RPC v2 + SELECT direto |
| 2026-06 | Barra | 110 | producao + RPC v2 + SELECT direto |

Checagem SELECT-only fresca executada no momento deste parecer:

| Competencia | Unidade | RPC v2 | SELECT direto | Diferenca |
|---|---:|---:|---:|---:|
| 2026-05 | Barra | 180 | 180 | 0 |
| 2026-05 | Campo Grande | 516 | 516 | 0 |
| 2026-05 | Recreio | 221 | 221 | 0 |
| 2026-06 | Barra | 110 | 110 | 0 |
| 2026-06 | Campo Grande | 253 | 253 | 0 |
| 2026-06 | Recreio | 190 | 190 | 0 |

Observacao: Junho/2026 e mes aberto/vivo. Na checagem fresca, Campo Grande apareceu com 253, entao o consolidado por soma das unidades passa a 553. Isso nao e, por si so, bug do PR #5; e movimento esperado de fonte transacional viva. Maio permaneceu 917.

## 2. Diagnostico Git local

Comando: `git status --short --branch`

Resultado resumido:

```text
## p02g1-sazonalidade-v2...origin/p02g1-sazonalidade-v2
 M src/components/App/Layout/AppSidebar.tsx
?? outputs/la-report-comercial-funil-audit/2026-06-15/p02g1_1_visual/
?? outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g1_1_validacao_visual.md
?? outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g1_validacao_semantica_matriculas_por_unidade.md
?? outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g2_regra_canonica_matricula_comercial_por_unidade.md
?? outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02h_consumidores_operacionais_2026.md
```

Comando: `git diff --name-status`

Resultado:

```text
M       src/components/App/Layout/AppSidebar.tsx
```

Comando solicitado: `git diff -- src/components/AppLayout/AppSidebar.tsx`
Observacao: esse caminho nao existe no repo atual. O caminho real e:

`src/components/App/Layout/AppSidebar.tsx`

## 3. AppSidebar.tsx

O diff local de `src/components/App/Layout/AppSidebar.tsx` altera o comportamento dos badges no menu lateral quando a sidebar esta colapsada:

- badge de campanhas nao lidas deixa de aparecer no modo colapsado;
- badge de automacoes criticas deixa de aparecer no modo colapsado;
- a logica passa a renderizar os badges somente quando `!isCollapsed`.

Classificacao: alteracao de UI real, fora do escopo P02G1 e fora do PR #4.
Risco: medio para misturar no PR errado, porque o PR #4 deve tratar apenas Sazonalidade comercial v2.

Recomendacao: nao commitar `AppSidebar.tsx` no PR #4.
Opcao preferida: stash separado com nome claro, por exemplo `wip/appsidebar-badges-collapsed`, antes de sincronizar a branch com `main`.
Opcao alternativa: descartar somente se Alf confirmar que foi alteracao acidental.

## 4. Separacao dos arquivos

### A) Codigo real da P02G1

Arquivos que fazem parte do escopo real da branch/PR #4:

- `src/components/Comercial/ComercialSazonalidade.tsx`
- `src/hooks/useComercialSeriesMensaisV2.ts`

Documentacao ja rastreada na branch P02G1:

- `outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g1_sazonalidade_v2.md`
- `outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g1_1_ajuste_conservador_sazonalidade.md`

Diff atual da branch contra `origin/main`:

```text
A       outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g1_1_ajuste_conservador_sazonalidade.md
A       outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g1_sazonalidade_v2.md
M       src/components/Comercial/ComercialSazonalidade.tsx
A       src/hooks/useComercialSeriesMensaisV2.ts
```

### B) Outputs/prints/pareceres candidatos a documentacao

Candidatos relevantes para documentar o PR #4/P02G1:

- `outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g1_1_validacao_visual.md`
- `outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g1_validacao_semantica_matriculas_por_unidade.md`
- `outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02g2_regra_canonica_matricula_comercial_por_unidade.md`

Prints/evidencias visuais:

- `outputs/la-report-comercial-funil-audit/2026-06-15/p02g1_1_visual/`

Recomendacao: os tres pareceres acima sao uteis para explicar por que P02G1.1 removeu a leitura canonica de matriculas por unidade. Os prints podem entrar se Alf quiser evidencia visual versionada no repo; caso contrario, devem ficar fora do PR para evitar ruido binario.

Arquivo util, mas de outro fluxo:

- `outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02h_consumidores_operacionais_2026.md`

Recomendacao: nao incluir esse arquivo no PR #4. Ele pertence ao inventario P02H/operacional 2026 e deve ir em commit/PR separado, se for versionado.

### C) Lixo/artefato temporario que nao deve entrar no PR

Nao ha arquivo confirmado como lixo descartavel sem aprovacao humana.

Fora do PR #4 por escopo:

- `src/components/App/Layout/AppSidebar.tsx`
- `outputs/la-report-comercial-funil-audit/2026-06-15/parecer_p02h_consumidores_operacionais_2026.md`

Possivelmente fora do PR #4, dependendo da decisao do Alf:

- `outputs/la-report-comercial-funil-audit/2026-06-15/p02g1_1_visual/`

## 5. Plano seguro para sincronizar com main

1. Resolver a sujeira de `AppSidebar.tsx` antes de qualquer pull/rebase/merge:
   - recomendado: stash separado;
   - ou descartar, se Alf confirmar que e acidental;
   - nao commitar no PR #4.

2. Decidir quais outputs entram no PR #4:
   - incluir os pareceres P02G1/P02G2 que justificam a decisao semantica;
   - manter P02H fora;
   - decidir se prints entram ou ficam apenas como evidencia local.

3. Evitar `git add outputs/...` amplo.
   Adicionar arquivos explicitamente, um por um, se forem aprovados.

4. Depois de working tree limpo/organizado:
   - buscar remoto;
   - sincronizar a branch `p02g1-sazonalidade-v2` com `main` atualizada;
   - rodar build;
   - revalidar visual se houver conflito ou mudanca relevante.

5. So entao avaliar se PR #4 pode sair de draft.

## 6. Status de seguranca

Nao executado:

- merge;
- rebase;
- pull;
- push;
- commit;
- SQL de escrita;
- alteracao de banco;
- alteracao em `dados_mensais`, `dados_comerciais` ou `origem_leads`;
- deploy.
