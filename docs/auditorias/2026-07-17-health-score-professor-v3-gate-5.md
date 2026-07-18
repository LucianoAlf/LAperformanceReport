# Health Score Professor V3 - Gate 5

**Data de fechamento:** 2026-07-18

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Status tecnico:** fechado e validado em sombra

**Status funcional:** metas iniciais homologadas para execucao em sombra

**Publicacao produtiva:** nao realizada

## 1. Veredito

O Gate 5 esta fechado. O motor versionado, a configuracao temporal e os
snapshots imutaveis foram implantados sem alterar cards, rankings, relatorios,
agentes ou qualquer consumidor V2.

O modelo separa explicitamente:

- **peso:** participacao do pilar no score, controlada pelo slider;
- **meta:** referencia versionada de desempenho, editada em controle separado;
- **valor real:** evidencia bruta preservada no snapshot;
- **nota:** `min(100, valor_real / meta * 100)`;
- **estado de base:** informa quando a metrica ainda nao pode pontuar.

Peso, meta e nota nao sao intercambiaveis. Alterar um peso ou uma meta no
futuro exigira nova versao de configuracao e nunca reescrevera snapshots
fechados.

## 2. Entregas tecnicas

- configuracao pai/filha com seis pilares e pesos somando 100;
- vigencia versionada e bloqueio de sobreposicao;
- snapshots professor-unidade e consolidado com revisoes;
- valor bruto, amostra, fonte, confianca, nota e peso por metrica;
- distincao entre `publicavel` e `publicado`;
- retificacao append-only e imutabilidade de snapshots fechados;
- RLS, grants restritos e RPCs com guard explicito;
- normalizacao por meta versionada nos seis pilares;
- estados explicitos para metas aprovadas, aguardando dados ou bloqueadas por
  vigencia.

## 3. Configuracao V1 remota

| Pilar | Peso | Meta | Estado |
|---|---:|---:|---|
| Media/turma | 15 | 1,44 | aprovada |
| Numero de alunos | 10 | 33 | aprovada |
| Conversao | 15 | 70% | aprovada para sombra |
| Permanencia | 25 | 12 meses | aprovada para sombra |
| Retencao | 25 | null | aguardando_dados_reais |
| Presenca | 10 | null | bloqueada_ate_inicio |

Estado confirmado no remoto:

- versao: `1`;
- status: `ativa`;
- vigencia inicial: `2026-07-01`;
- peso total: `100`;
- finalidade: execucao em sombra;
- snapshots publicados: `0`.

`Retencao` e `presenca` permanecem sem meta por decisao explicita, e nao por
omissao. O motor redistribui somente os pesos das metricas disponiveis e
preserva `null/sem_base`; ele nunca fabrica zero.

## 4. Calibracao homologada

- media/turma: meta `1,44`;
- numero de alunos: meta `33`;
- conversao: meta trimestral inicial `70%`, arredondada a partir do P90
  `66,67%` da coorte canonica de 2026-Q2;
- permanencia: meta `> 12 meses`, baseada no historico integral reconstruido
  desde 2018 e na amostra nominal auditada;
- retencao: aguarda motivos e vinculos reais suficientes;
- presenca: comeca a pontuar em `03/08/2026`.

As evidencias estao em:

- `docs/auditorias/2026-07-18-health-score-professor-v3-conversao-trimestral.md`;
- `docs/auditorias/2026-07-18-permanencia-amostra-12-professores.md`;
- `docs/auditorias/2026-07-17-health-score-professor-v3-calibracao.md`.

## 5. Seguranca e compatibilidade

- `public`, `anon` e `authenticated` nao acessam as tabelas V3;
- agentes internos nao leem diretamente a camada ainda em sombra;
- `service_role` possui somente leitura direta;
- escrita passa por RPC protegida;
- a RPC de ativacao exige permissao global `professores.editar`;
- nenhuma fonte ou consumidor V2 foi trocado;
- nenhum snapshot oficial foi publicado.

## 6. Condicao atendida

O fechamento ocorreu depois de:

1. meta de conversao aprovada e registrada com evidencia;
2. meta de permanencia aprovada e registrada com evidencia;
3. autoridade, data e justificativa preservadas na configuracao;
4. ativacao restrita a sombra;
5. testes e leitura pos-migration aprovados.

O Gate 6 foi autorizado e executado sem virada produtiva.

## 7. Arquivos principais

- `supabase/migrations/20260717170000_health_score_v3_config_snapshots.sql`;
- `supabase/migrations/20260717180000_health_score_v3_normalizacao_meta.sql`;
- `supabase/migrations/20260718173000_health_score_v3_meta_permanencia_12.sql`;
- `supabase/migrations/20260718183000_health_score_v3_meta_conversao_70_ativa.sql`;
- `tests/healthScoreProfessorV3Snapshots.test.mjs`.
