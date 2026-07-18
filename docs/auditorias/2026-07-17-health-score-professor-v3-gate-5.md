# Health Score Professor V3 - Gate 5

**Data:** 2026-07-17

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Status tecnico:** implementado e validado em sombra

**Status funcional:** aberto; duas metas aguardam homologacao
**Publicacao produtiva:** nao realizada

## 1. Veredito

O motor versionado, a configuracao temporal e os snapshots imutaveis estao
implantados sem alterar cards, rankings, relatorios ou agentes produtivos.

O ajuste conceitual aprovado separa:

- **peso:** participacao do pilar no score, controlada pelo slider;
- **meta:** referencia versionada de desempenho;
- **valor real:** evidencia bruta preservada no snapshot;
- **nota:** `min(100, valor_real / meta * 100)`.

O Gate 5 nao esta fechado. A configuracao V1 continua `rascunho` porque as
metas de conversao e permanencia ainda nao foram homologadas.

## 2. Entregas tecnicas

- configuracao pai/filha com seis pilares e pesos somando 100;
- vigencia versionada e bloqueio de sobreposicao;
- snapshots professor-unidade e consolidado com revisoes;
- valor bruto, amostra, fonte, confianca, nota e peso por metrica;
- distincao entre `publicavel` e `publicado`;
- retificacao append-only e imutabilidade de snapshots fechados;
- RLS, grants restritos e RPCs com guard explicito;
- normalizacao por meta versionada nos seis pilares;
- estados explicitos para metas aprovadas, em calibracao ou sem dados.

## 3. Configuracao remota

| Pilar | Peso | Meta | Estado |
|---|---:|---:|---|
| Media/turma | 15 | 1,44 | aprovada |
| Numero de alunos | 10 | 33 | aprovada |
| Conversao | 15 | null | em_calibracao |
| Permanencia | 25 | null | em_calibracao |
| Retencao | 25 | null | aguardando_dados_reais |
| Presenca | 10 | null | bloqueada_ate_inicio |

Estado confirmado no remoto:

- versao: `1`;
- status: `rascunho`;
- peso total: `100`;
- metas preenchidas: `2`;
- snapshots persistidos: `0`.

## 4. Smoke de ativacao

A chamada controlada de
`ativar_health_score_professor_v3_config(...)` foi executada em bloco com
rollback interno. A RPC recusou a configuracao com a mensagem esperada:

`quatro metas calibraveis ainda nao homologadas`

Depois do smoke, a versao permaneceu `rascunho` e `ativado_em` permaneceu nulo.

## 5. Calibracao

- media/turma `1,44`: aprovada;
- numero de alunos `33`: aprovada;
- conversao: Q3 parcial possui apenas 3 linhas professor-unidade com base;
  candidato `66,67%` nao homologado;
- permanencia: os antigos `10,80` e `8,68` foram retraidos. O recorte aceito
  desde 2018 foi reconstruido na V1.18. Peterson, primeiro caso de controle
  totalmente conciliado, possui `14,51` meses em 57 vinculos encerrados
  elegiveis, com estado `ok` e confianca alta. A meta da rede permanece nula
  ate uma amostra representativa receber cobertura equivalente;
- retencao: sem variacao real confirmada nos motivos;
- presenca: bloqueada ate 03/08/2026.

As queries e distribuicoes completas estao em
`docs/auditorias/2026-07-17-health-score-professor-v3-calibracao.md`.

## 6. Seguranca e compatibilidade

- `public` e `anon` nao acessam as tabelas V3;
- `authenticated` nao possui acesso direto as tabelas;
- `service_role` possui somente leitura direta;
- escrita passa por RPC protegida;
- a RPC de ativacao exige permissao global `professores.editar`;
- nenhuma fonte V2 ou consumidor produtivo foi trocado;
- nenhum snapshot oficial foi criado.

## 7. Validacoes

- suite dirigida Gate 4 + Gate 5: `24/24`;
- suite oficial do repositorio: `209/209`;
- build de producao: aprovado;
- aplicacao remota no projeto correto: aprovada;
- leitura pos-migration: seis pilares, peso 100 e estados esperados;
- smoke de ativacao incompleta: bloqueado como esperado;
- advisors: sem regressao nova; alertas do Gate 5 permanecem os esperados para
  uma camada vazia, sem acesso direto e ainda em sombra;
- `git diff --check`: aprovado.

## 8. Condicao de fechamento

O Gate 5 somente fecha depois de:

1. meta de conversao aprovada;
2. meta de permanencia aprovada;
3. ambas registradas com autoridade e justificativa;
4. testes completos e smokes finais aprovados.

Somente depois disso o Gate 6 pode rodar em sombra.

## 9. Arquivos

- `supabase/migrations/20260717170000_health_score_v3_config_snapshots.sql`;
- `supabase/migrations/20260717173000_health_score_v3_service_role_readonly.sql`;
- `supabase/migrations/20260717174500_health_score_v3_fk_indexes.sql`;
- `supabase/migrations/20260717180000_health_score_v3_normalizacao_meta.sql`;
- `tests/healthScoreProfessorV3Snapshots.test.mjs`;
- `docs/specs/2026-07-17-health-score-professor-v3-normalizacao-addendum.md`;
- `docs/auditorias/2026-07-17-health-score-professor-v3-calibracao.md`.
