# Health Score Professor V3 - Execucao das Fases 0 e 1

**Data:** 2026-07-16
**Projeto Supabase confirmado:** `ouqwbbermlzqqvtqwlul`
**Contrato:** V5 aprovado
**Escopo executado:** baseline, staging historico e coletor retomavel
**Situacao:** V2 produtiva preservada; V3 ainda sem consumidor produtivo

> Este arquivo e o snapshot do encerramento das Fases 0 e 1. O estado posterior
> do piloto e da escala historica esta nos relatorios
> `2026-07-16-health-score-professor-v3-piloto.md` e
> `2026-07-16-health-score-professor-v3-escala-pre2022.md`.

## 1. Veredito

- Gate 0: aprovado.
- Gate 1: aprovado.
- Nenhum card, ranking, relatorio, RPC produtiva de professor ou pipeline de churn mudou de fonte.
- Nenhum backfill historico completo foi iniciado.
- A Edge foi publicada sem cron e exige JWT valido.
- O staging permaneceu vazio depois da remocao dos dados sinteticos de teste.

## 2. Fase 0 - baseline

Foram congelados em teste os consumidores produtivos da V2:

- Gestao de Professores: performance, carteira, modal individual, configuracao e relatorio da coordenacao;
- Dashboard e Analytics de professores;
- motor `calcularHealthScore`;
- configuracao `config_health_score_professor`;
- RPC vigente `get_kpis_professor_periodo_canonico_v3`;
- payloads de relatorio e transporte de WhatsApp.

O sufixo `canonico_v3` da RPC vigente e uma versao dos KPIs atuais. Ele nao representa o novo Health Score Professor V3 deste contrato.

Artefatos:

- `tests/healthScoreProfessorV3Contrato.test.mjs`;
- `docs/auditorias/2026-07-16-health-score-professor-v3-consumidores-v2.md`.

## 3. Fase 1 - staging historico

### 3.1 Tabelas

Foram criadas quatro tabelas isoladas:

1. `emusys_historico_backfill_execucoes_v1`: job, janela, cursor, estado e contadores.
2. `emusys_aulas_historico_staging_v1`: ultima versao observada da aula por unidade e ID Emusys.
3. `emusys_aulas_historico_revisoes_v1`: versoes distintas append-only do payload bruto.
4. `emusys_aula_alunos_historico_staging_v1`: linhas distintas de roster observadas, sem apagar evidencia anterior.

Invariantes:

- uma aula corrente por `(unidade_id, emusys_aula_id)`;
- hashes SHA-256 obrigatorios;
- checkpoint por unidade, janela e cursor;
- um job em execucao por unidade;
- uma pagina, suas aulas, roster e checkpoint persistem na mesma transacao;
- checkpoint divergente e rejeitado antes de gravar;
- staging nao escreve em `aulas_emusys`, `aluno_presenca`, `anotacoes` ou `anotacoes_fabio`.

### 3.2 Seguranca

As quatro tabelas possuem RLS ativa e acesso direto apenas para:

- `postgres`;
- `service_role`.

Durante a validacao foi detectado que as default privileges do projeto haviam concedido grants aos papeis dos agentes. A migration complementar removeu esses grants. O resultado remoto final foi conferido tabela por tabela.

A RPC interna `registrar_pagina_backfill_historico_professor_v1`:

- e `SECURITY DEFINER`;
- possui `search_path = public, pg_temp`;
- nao pode ser executada por `public`, `anon` ou `authenticated`;
- pode ser executada por `service_role`.

O advisor do Supabase informa `RLS enabled no policy`. Neste staging isso e intencional: nao existe leitura direta de usuario. A administracao opera pela Edge autenticada, que usa service role internamente.

### 3.3 Coletor

Edge Function: `backfill-historico-professor-emusys`, versao 1, estado `ACTIVE`, `verify_jwt=true`.

Regras:

- service role ou usuario LA Report ativo com perfil `admin`;
- uma unidade por job;
- janelas mensais;
- limite de 100 itens por pagina;
- no maximo 10 paginas por invocacao;
- intervalo minimo de 1.350 ms entre paginas, equivalente a no maximo aproximadamente 44,4 requisicoes por minuto;
- respeito a `Retry-After` em HTTP 429;
- retries controlados para timeout e 5xx;
- erro permanente nao avanca o cursor;
- logs e respostas nao carregam payload pessoal ou token.

A chamada sem JWT foi rejeitada com HTTP 401. Nao existe job de cron para a funcao.

### 3.4 Operacao local

CLI: `scripts/backfill-historico-professor-emusys.mjs`.

Comandos:

- `create`;
- `resume`;
- `pause`;
- `status`.

Credenciais sao lidas exclusivamente de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## 4. Teste transacional remoto

Foi criado um job sintetico descartavel no staging e executada esta sequencia:

1. pagina 1 persistida com um cursor seguinte;
2. repeticao com o checkpoint antigo;
3. retomada pelo cursor correto;
4. avancar para a proxima janela;
5. concluir o job;
6. remover todos os registros sinteticos.

Resultado:

| Evidencia | Resultado |
|---|---:|
| checkpoint antigo rejeitado | sim |
| paginas processadas | 3 |
| itens de aula recebidos | 2 |
| aulas correntes unicas | 1 |
| revisoes unicas | 1 |
| linhas de roster unicas | 1 |
| observacoes da mesma revisao | 2 |
| estado final | concluido |
| linhas restantes apos limpeza | 0 |

Isso comprova retomada, idempotencia por hash e atomicidade do checkpoint no banco.

## 5. Arquivos da implementacao

- `supabase/migrations/20260716155305_health_score_v3_staging_historico.sql`;
- `supabase/migrations/20260716155615_health_score_v3_staging_isolamento_roles.sql`;
- `supabase/functions/_shared/emusys-aulas.ts`;
- `supabase/functions/backfill-historico-professor-emusys/index.ts`;
- `scripts/backfill-historico-professor-emusys.mjs`;
- `tests/backfillHistoricoProfessorEmusys.test.mjs`;
- `supabase/config.toml`;
- `deno.lock`.

## 6. Limite desta entrega

Esta entrega nao reconstruiu periodos professor-matricula-disciplina, nao calculou permanencia, nao criou score, nao alterou sliders e nao mudou telas. Essas atividades pertencem as fases seguintes e somente consumirao o historico depois do piloto e da conciliacao previstos nos gates.

A transparencia de exclusao da permanencia, incluindo quantidade total, elegiveis, excluidos por menos de quatro meses e por confianca, permanece requisito obrigatorio da futura RPC de retorno. Ela nao pertence ao coletor da Fase 1.
