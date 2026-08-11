# Evidência local — integridade do relatório gerencial

**Data:** 10/08/2026  
**Worktree:** `feat/relatorio-gerencial-integridade-hibrido`  
**Escopo:** auditoria e implementação local aprovadas para o modelo híbrido.  
**Limite:** nenhuma migration foi aplicada ao Supabase remoto, nenhum backfill
foi executado e nenhuma Edge/frontend foi publicada.

## Matriz das seis prioridades aprovadas

| Prioridade | Fonte/contrato | Teste reproduzível | Resultado local | Próximo gate |
|---|---|---|---|---|
| Metas operacionais separadas das metas de programa | `get_relatorio_gerencial_canonico_v1`, migration `20260811123000` e renderer | `relatorioGerencialCanonico.test.mjs`, `relatorioGerencialCanonicoPostgres.test.mjs`, render | PASS; Gestão/Comercial leem `metas_kpi`; Fideliza e Matriculador permanecem separados | aplicar migration após aprovação |
| Curso de interesse e cobertura | `comercial.cobertura_curso_interesse` | fixture Recreio/jul/2026 | PASS; `297/296/1/120/176` são publicados sem converter indisponível em “sem curso” | publicar contrato após aprovação |
| Distribuições já existentes | `leads_por_canal`, `matriculas_por_curso` | `relatorioGerencialCanonico.test.mjs`, `relatorioGerencialRender.test.ts` | PASS; listas são renderizadas com grão próprio | publicar Edge após aprovação |
| Ranking oficial ou destaque mensal | Health Score V3 + `rankings.oficiais` / `destaques_mensais_parciais` | `relatorioGerencialRender.test.ts` e contrato canônico | PASS; ciclo parcial não recebe ordinalidade nem premiação | validar snapshot oficial em caso real |
| Comparativos apenas equivalentes | fingerprint `fechamento-equivalente-v1` e snapshots fechados | `relatorio-comparabilidade.test.ts`, teste PostgreSQL isolado | PASS; regra, unidade, grão, cobertura e status incompatíveis bloqueiam; julho continua `indisponivel` sem fechamento anterior equivalente carregado | carregar/validar fechamento anterior equivalente em gate separado |
| Testes do estado real | contratos Edge, SQL e syncs Emusys | suíte Node/Deno + build | PASS nos testes focados; ausência de `/aulas` não possui caminho destrutivo | rodar suíte final e publicar somente após aprovação |

## Auditoria Emusys e domínio do aluno

- `mat.aluno.lead_id` é capturado e materializado em
  `alunos.emusys_lead_id`, sempre sob `unidade_id`.
- Valor local nulo é preenchido; valor idêntico é idempotente; divergência
  abre `matriculas_divergencias` e preserva o valor local.
- Experimental casa primeiro por `(unidade_id, emusys_aula_id)`; diferenças de
  240 ou 30 minutos não quebram um ID exato.
- O sync atual não contém `DELETE` para `aulas_emusys`,
  `aula_alunos_emusys` ou `aluno_presenca`. A ausência corrente é classificada,
  não transformada em exclusão histórica.

## Evidência de execução

Commits locais relevantes:

- `b64e37d7` — renderer e contrato híbrido;
- `f8ec2030` — migration canônica de metas/cobertura;
- `c6f562d8` — Lead ID escopado e reconciliação de experimentais;
- `f4196039` — comparabilidade e preservação histórica.

Comandos já verdes neste gate:

```text
node --test tests/relatorioGerencialCanonico.test.mjs
node --test tests/relatorioGerencialCanonicoPostgres.test.mjs
deno test --no-lock --allow-read supabase/functions/_shared/relatorio-comparabilidade.test.ts supabase/functions/_shared/historico-preservacao.test.ts
node --test tests/historicoPreservacao.test.mjs
```

Os testes PostgreSQL usam `postgres:17-alpine` isolado e descartável. O
resultado não é evidência de aplicação remota.

Verificação final local concluída em 10/08/2026:

- `npm test` — 20 testes aprovados;
- suíte Node canônica, Lead ID e histórico — 10 testes aprovados;
- suíte Deno de renderer, jornada, reconciliação, snapshot e histórico — 52 testes aprovados;
- `npm run build` — build Vite aprovado (somente avisos preexistentes de Rollup/chunks);
- `deno check` das três Edges alteradas — aprovado.

`git diff --check` também passou.

## Rollout pendente

As etapas abaixo permanecem deliberadamente fora desta entrega e exigem nova
aprovação explícita:

1. dry-run e aplicação da migration no projeto Supabase correto;
2. backfill/retificação de dados reais ou tombstones históricos;
3. deploy das Edge Functions e do frontend;
4. validação ponta a ponta com uma competência produtiva e leitura autenticada;
5. carregamento de um fechamento anterior equivalente antes de liberar
   comparativo temporal.
