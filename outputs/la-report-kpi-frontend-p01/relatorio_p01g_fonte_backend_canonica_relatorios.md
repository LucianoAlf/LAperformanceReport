# P0.1G - Fonte Backend Canonica para Relatorios de KPIs de Alunos

Data: 2026-06-08

## 1. Objetivo

Criar um contrato canonico de banco para os KPIs executivos de alunos, para que relatorios, IA e futuras RPCs deixem de consultar `vw_kpis_gestao_mensal` como fonte cega.

Este pacote ainda nao foi executado no banco.

## 2. Arquivo gerado

- `supabase/migrations/20260608_p01g_fonte_canonica_kpis_alunos_relatorios.sql`

Status:

- proposta executavel;
- depende de APPROVE explicito do Alf;
- nao altera dados historicos;
- nao recalcula snapshot;
- nao faz backfill;
- nao fecha competencia.

## 3. O que a migration propoe

### 3.1 Nova funcao canonica

`public.get_kpis_alunos_canonicos(p_unidade_id uuid, p_ano int, p_mes int)`

Retorna JSON com:

- `fonte`;
- `competencia_fechada`;
- `competencia_parcial`;
- `alertas_fonte`;
- `totais`;
- `por_unidade`.

Regra de fonte:

| Situacao | Fonte |
|---|---|
| Competencia fechada/retificacao_pendente | `dados_mensais` |
| Mes atual aberto | calculo vivo canonico de `alunos` + `movimentacoes_admin` |
| Mes passado aberto com snapshot | `preliminar` |
| Mes passado aberto sem snapshot | `indisponivel` |

### 3.2 Regra viva implementada

- `alunos_ativos`: pessoas unicas por `lower(trim(nome)) + unidade_id`.
- `alunos_pagantes`: pessoas unicas com MRR recorrente maior que zero.
- `matriculas_ativas`: linhas/vinculos ativos ou trancados.
- `matriculas_banda`: vinculos de curso/projeto banda.
- `matriculas_2_curso`: vinculos `is_segundo_curso`, excluindo banda/coral.
- `MRR`: soma de todas as parcelas recorrentes pagantes da pessoa, incluindo segundo curso.
- `ticket_medio`: MRR / pessoas pagantes.
- `Kids/School`: mesma base de `alunos_ativos` no mes atual aberto.
- `novas_matriculas`: pessoas novas pagantes do mes, sem banda/coral/segundo curso/bolsista.
- `evasoes`: dedup por `aluno_id` ou nome/unidade em `movimentacoes_admin`.

### 3.3 Wrappers cirurgicos

A migration nao copia o corpo inteiro das RPCs legadas.

Ela renomeia:

- `get_dados_relatorio_gerencial` para `get_dados_relatorio_gerencial_legacy_p01g`;
- `get_dados_retencao_ia` para `get_dados_retencao_ia_legacy_p01g`.

Depois recria wrappers com o nome original:

- chamam a funcao legada;
- substituem a chave `kpis_gestao` pelo retorno canonico;
- adicionam `kpis_alunos_canonicos` ao JSON.

Isso preserva os demais blocos do relatorio, mas tira os KPIs executivos de alunos da view antiga.

## 4. O que fica fora deste pacote

Ainda nao corrige:

- `kpis_retencao` vindo de `vw_kpis_retencao_mensal`;
- renovacao antecipada;
- Fideliza+ / `get_programa_fideliza_dados`;
- Professores/Carteira como fonte historica;
- views antigas como objeto de banco.

Esses itens continuam como proximas frentes:

- P0.1H: retencao/graficos/relatorios que usam `vw_kpis_retencao_mensal`;
- P0.2: Fideliza+;
- P0.3: Professores/Carteira;
- P0.4: plano de deprecacao de views/tabelas.

## 5. Por que nao trocar direto o Edge Function agora

`supabase/functions/relatorio-admin-whatsapp/index.ts` hoje possui uma copia local da regra canonica viva.

Trocar o Edge Function para chamar `get_kpis_alunos_canonicos` antes da migration ser aplicada quebraria o deploy, porque a RPC ainda nao existe no banco.

Sequencia segura:

1. revisar SQL P0.1G;
2. APPROVE do Alf;
3. aplicar migration;
4. rodar checklist SELECT-only;
5. trocar Edge Function para chamar `get_kpis_alunos_canonicos`;
6. deploy controlado da Edge Function;
7. validar relatorio automatico e manual.

## 6. Checklist antes de aprovar

- Confirmar projeto ativo: `ouqwbbermlzqqvtqwlul`.
- Confirmar assinatura real:
  - `get_dados_relatorio_gerencial(uuid, integer, integer)`;
  - `get_dados_retencao_ia(uuid, integer, integer)`.
- Confirmar que nenhum wrapper `_legacy_p01g` ja existe.
- Validar com SELECT-only que CG/Junho vivo segue:
  - ativos 479;
  - pagantes 449;
  - Kids 194;
  - School 285;
  - matriculas 543.
- Validar que CG/Maio fechado segue vindo de `dados_mensais`.

## 7. Riscos residuais

- `kpis_retencao` ainda pode divergir ate P0.1H.
- `get_programa_fideliza_dados` continua misturando `dados_mensais`, `movimentacoes_admin`, `renovacoes` e fallback vivo.
- Se algum consumidor espera exatamente o formato bruto da antiga `vw_kpis_gestao_mensal`, precisa validar o JSON antes do deploy.
- Kids/School de mes fechado continuam indisponiveis no banco enquanto `dados_mensais` nao tiver colunas `alunos_kids` e `alunos_school`.
- A migration altera RPCs; rollback esta documentado no proprio SQL.
- As RPCs atuais tinham EXECUTE para `PUBLIC`/`anon`; a migration foi ajustada para revogar `PUBLIC`/`anon` e manter `authenticated`/`service_role`.

## 8. Checklist SELECT-only pre-execucao rodado

Projeto ativo confirmado:

- `https://ouqwbbermlzqqvtqwlul.supabase.co`

Assinaturas atuais:

| Funcao | Assinatura | Status |
|---|---|---|
| `get_dados_relatorio_gerencial` | `(p_unidade_id uuid, p_ano integer, p_mes integer)` | existe |
| `get_dados_retencao_ia` | `(p_unidade_id uuid, p_ano integer, p_mes integer)` | existe |
| `get_kpis_alunos_canonicos` | n/a | ainda nao existe |
| `get_dados_relatorio_gerencial_legacy_p01g` | n/a | ainda nao existe |
| `get_dados_retencao_ia_legacy_p01g` | n/a | ainda nao existe |

Colunas necessarias:

- `alunos`: colunas usadas pela regra viva existem.
- `dados_mensais`: snapshot historico possui KPIs principais, mas ainda nao possui `alunos_kids`/`alunos_school`.
- `competencias_mensais`: existe e Maio/2026 esta fechado nas tres unidades.
- `movimentacoes_admin`, `cursos`, `tipos_matricula`, `unidades`: colunas usadas pela proposta existem.

Campo Grande / Junho 2026 vivo, corte 08/06/2026:

| KPI | Resultado SELECT-only |
|---|---:|
| Alunos ativos | 479 |
| Alunos pagantes | 449 |
| Ticket medio | 388.95 |
| MRR | 174639.23 |
| Kids | 194 |
| School | 285 |
| Sem classificacao | 0 |
| Matriculas ativas | 543 |
| Matriculas banda | 39 |
| Matriculas 2o curso | 27 |
| Bolsistas integrais | 16 |
| Bolsistas parciais | 14 |
| Novas matriculas | 6 |
| Evasoes/nao renovacoes ate 08/06 | 2 |

Observacao sobre evasoes:

- A view `vw_kpis_gestao_mensal` tambem retorna `total_evasoes = 2` para CG/Junho.
- O relatorio administrativo enviado para CG tambem trouxe 2 evasoes/nao renovacoes.
- Se alguma tela exibiu 5, isso fica como investigacao P0.1H de retencao/graficos, nao blocker da fonte canonica de alunos.

Todas as unidades / Junho 2026:

| Unidade | Ativos | Pagantes | Kids | School | Sem classificacao | Classificacao fecha? | Matriculas | Banda | 2o curso |
|---|---:|---:|---:|---:|---:|---|---:|---:|---:|
| Barra | 228 | 225 | 147 | 81 | 0 | sim | 259 | 18 | 13 |
| Campo Grande | 479 | 449 | 194 | 285 | 0 | sim | 543 | 39 | 27 |
| Recreio | 327 | 315 | 173 | 154 | 0 | sim | 407 | 59 | 24 |

Campo Grande / Maio 2026 fechado:

| KPI | `dados_mensais` |
|---|---:|
| Status competencia | fechado |
| Alunos ativos | 496 |
| Alunos pagantes | 470 |
| Ticket medio | 368.66 |
| Faturamento estimado | 173270.20 |
| Evasoes | 13 |
| Churn | 2.77 |
| Inadimplencia | 0.00 |

Permissoes atuais antes da migration:

- `get_dados_relatorio_gerencial`: EXECUTE para `PUBLIC`, `anon`, `authenticated`, `service_role`.
- `get_dados_retencao_ia`: EXECUTE para `PUBLIC`, `anon`, `authenticated`, `service_role`.
- Ajuste incorporado na migration: revogar `PUBLIC`/`anon`; manter `authenticated`/`service_role`.

## 9. Decisao recomendada

Aprovar agora apenas revisao humana do arquivo SQL.

Nao executar ainda sem:

- checklist SELECT-only pre-execucao;
- confirmacao do projeto ativo;
- APPROVE explicito do Alf para P0.1G.
