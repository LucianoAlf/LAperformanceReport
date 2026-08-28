# Presença canônica — preflight de produção

Data da inspeção: 26/08/2026
Escopo: leitura remota e validação local; nenhuma migration, função, dado, flag ou deploy foi alterado em produção.

## Resultado executivo

O pacote v2 está pronto localmente para publicação técnica em sombra, mas ainda não está no banco remoto. A produção continua no contrato legado. O preflight encontrou duas evidências que o novo desenho precisa controlar: uma resposta 502 do `sync-presenca-emusys` e execuções repetidas para a mesma unidade/data. As chamadas seguintes retornaram 200, mas isso não prova cobertura completa nem deduplicação.

O avanço permanece bloqueado pelos quatro gates independentes descritos no plano: migration produtiva, reparo de roster, deploy de Edge e ativação de consumidores. A aprovação de um gate não autoriza os demais.

## Alvo remoto confirmado

| Item | Evidência em 26/08/2026 |
|---|---|
| Projeto Supabase | `ouqwbbermlzqqvtqwlul` — LA Performance Report |
| Região | `sa-east-1` |
| Saúde | `ACTIVE_HEALTHY` |
| PostgreSQL | `17.6.1.063` |
| Migrations aplicadas | 1763 |
| Última migration remota | `20260826193535_indice_experimentais_raw_lookup_versao_anterior` |
| Migrations candidatas de presença | ausentes no remoto |
| Objetos v2 principais | `presenca_sync_cobertura`, `presenca_rollout_config`, `vw_presenca_ocorrencia_canonica_v2`, `get_presenca_shadow_comparacao_v2` e `get_presenca_previa_reparo_v2` ausentes |

Unidades verificadas: Campo Grande (`CG`), Barra (`BARRA`) e Recreio (`REC`), todas ativas. Os IDs foram comparados com os IDs usados nos crons candidatos.

## Edge Functions e crons vivos

Versões remotas relevantes no momento da inspeção:

| Função | Versão | JWT |
|---|---:|---|
| `sync-presenca-emusys` | 101 | `false` |
| `relatorio-admin-whatsapp` | 111 | `false` |
| `mila-processar-mensagem` | 33 | `false` |
| `bi-agent-lamusic` | 48 | `false` |
| `processar-alertas-lia` | 12 | `true` |
| `reconciliar-grade-aluno` | 5 | conforme função viva |
| `previsualizar-reconciliacao-grade-emusys` | 4 | conforme função viva |

Nenhum `verify_jwt` foi alterado. Os crons legados de presença por unidade/dia útil e sábado continuam ativos, assim como o relatório das 9h e a reconciliação diária de gêmeas. A migration candidata substitui as janelas sobrepostas somente quando houver autorização de migration.

## Evidência operacional recente

Na janela lida dos logs de Edge:

- `sync-presenca-emusys` v101: oito respostas 200 e uma resposta 502 em `2026-08-26T22:45:38.174Z`, com duração aproximada de 37,8 s;
- houve respostas 200 posteriores ao 502;
- o log operacional registrou 45 eventos sanitizados de sync nas duas horas observadas;
- `emusys_sync_log` mostrou execuções repetidas para Barra e as mesmas datas, incluindo três execuções de 26/08, três de 25/08 e três de 24/08 em intervalos curtos.

Conclusão limitada: existe concorrência ou repetição no fluxo legado. O recorte lido não prova sobrescrita de decisão humana. O ledger, a lease e a cobertura v2 foram construídos justamente para tornar essa situação observável e deduplicável.

## Baseline de advisors

Os advisors foram lidos antes de qualquer publicação candidata, portanto os números abaixo são dívida preexistente e servem de baseline para a comparação pós-migration:

| Advisor | Total | Distribuição principal |
|---|---:|---|
| Segurança | 745 | 19 erros, 603 avisos, 123 infos |
| Performance | 1149 | 480 avisos, 669 infos |

Destaques do baseline de segurança: 123 tabelas com RLS sem policy, 13 views `security_definer`, 171 funções com `search_path` mutável, seis tabelas públicas sem RLS e funções `security_definer` executáveis por papéis amplos. Esses achados não foram atribuídos ao pacote v2, pois os objetos candidatos ainda não existem no remoto.

Validações e hardening locais do pacote:

- `vw_presenca_ocorrencia_metrica_v2` usa `security_barrier=true`, é `service_role` only e expõe os dados externos apenas por RPCs com ACL de unidade; torná-la `security_invoker` exigiria ampliar acesso à ocorrência nominal subjacente;
- tabelas novas usam RLS e grants explícitos;
- funções `SECURITY DEFINER` candidatas fixam `search_path`;
- cinco funções internas antigas de presença/Fábio perdem `EXECUTE` de `public`, `anon` e `authenticated`, mantendo `service_role` e o funcionamento por trigger;
- logs operacionais novos usam IDs, estados e contagens, sem payload pessoal.

Risco residual conhecido: `vw_fabio_carteira_professor` é uma view viva sem `security_invoker` e possui grants diretos. Ela é consumida pelo fluxo atual do Fábio; alterar sua semântica sem um teste autenticado pode quebrar o agente. O risco deve ser tratado em mudança separada, não embutido no cutover de presença.

## Checklist de autorização e aprovação

| Gate | Estado | Escopo autorizado quando aprovado |
|---|---|---|
| Migration produtiva | pendente | aplicar somente migrations aditivas e manter superfícies em sombra |
| Reparação de roster | pendente | executar somente itens aprovados no dry-run da unidade; não criar presença/falta |
| Deploy de Edge | pendente | publicar somente as funções listadas e registrar versões antes/depois |
| Ativação de consumidores | pendente | mudar flags por unidade/superfície e em ondas; nunca inferida de outro gate |

### Aprovação do dry-run por unidade

| Unidade | Contagens/hashes entregues | Responsável | Aprovação | Data |
|---|---|---|---|---|
| Recreio | sim | — | pendente | — |
| Barra | sim | — | pendente | — |
| Campo Grande | sim | — | pendente | — |

## Próxima evidência exigida

Após autorização específica de migration: aplicar o lote governado, confirmar todas as versões, repetir advisors com foco no delta, provar RLS/grants/ACLs no remoto e manter todas as superfícies em `sombra`. A paridade real de dia, mês aberto e mês fechado só pode ser assinada depois dessa publicação técnica; até lá, há prova descartável e shadow read-only, não E2E de produção.

O dry-run reproduzível do lote e a correção da ordem de versões estão em [`2026-08-26-presenca-migration-release-dry-run.md`](./2026-08-26-presenca-migration-release-dry-run.md). O lote é não destrutivo para fatos e histórico, mas redefine funções/views e substitui crons sobrepostos; por isso deve ser aplicado como uma publicação técnica governada, e não descrito como DDL puramente aditivo.
