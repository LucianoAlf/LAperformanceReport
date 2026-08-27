# Runbook — presença canônica

Status em 26/08/2026: implementação candidata validada localmente; ainda não publicada nem ativada em produção.

## 1. Contrato e arquitetura

O grão canônico é uma ocorrência de aluno em um slot de aula: unidade + data/hora + aula operacional + pessoa resolvida. O espelho Emusys continua bruto e auditável. Roster, decisão humana, registro do LA Teacher/Fábio e retificação são evidências com proveniência; nenhum consumidor deve recomputar a regra por conta própria.

Princípios:

- presença humana terminal e retificação não são sobrescritas por um sync posterior;
- `Emusys: ausente` é evidência bruta, não falta terminal, enquanto cobertura ou roster estiverem inseguros;
- gêmeas, duas matrículas e eventos concorrentes convergem para uma ocorrência sem apagar o raw;
- dado incompleto retorna estado de publicação e valor nulo, nunca zero silencioso;
- snapshots fechados permanecem imutáveis.

Fluxo operacional:

```text
Emusys raw + roster + decisões humanas + LA Teacher/Fábio
  -> ocorrência canônica v2
  -> frescor/cobertura e pendências
  -> Agenda, Sol, Lia, Mila, Fábio, relatórios e KPIs
```

## 2. Fonte, precedência e frescor

`vw_presenca_ocorrencia_canonica_v2` resolve a ocorrência. `presenca_sync_execucoes`, `presenca_sync_eventos` e `presenca_sync_cobertura` registram request, lease, heartbeat, hash, contagens e resultado por unidade/modo/data. Só é publicável uma cobertura `concluida` com `snapshot_hash` válido.

A ordem de decisão preserva evidência humana e retificações. Um retorno tardio do Emusys pode completar o raw, mas não pode reabrir nem inverter uma decisão terminal mais forte. Ausência de cobertura, lease expirada, roster em revisão ou identidade ambígua bloqueiam a publicação da pendência como falta confirmada.

## 3. Escritas e recibos

Agenda, professor e Fábio escrevem pelas portas canônicas de comando. Cada intenção recebe `request_id`; `presenca_comandos`, `presenca_comando_itens` e `presenca_acao_eventos` formam o recibo durável. Retry com o mesmo request e payload é idempotente; reutilizar o request com payload diferente falha.

Consulta de recibo:

```sql
select public.app_status_comando_presenca_v1('<request_id>'::uuid);
```

Investigue `recebido`, resultado por item e conclusão. Não corrija estado escrevendo diretamente em `aluno_presenca`.

## 4. Consumidores e superfície de rollout

| Superfície | Consumidor | Contrato esperado |
|---|---|---|
| `agenda` | Agenda > Chamada | agenda do dia, frescor, decisão e recibo |
| `sol` | lembrete/relatório operacional | mesma pendência da Agenda, bloqueada sem cobertura |
| `la_teacher` | professor e agente Fábio | sessão e período com decisão canônica, frescor e duplicidade bloqueada |
| `lia` | agente Lia | sinais de risco autorizados com metadados de publicação |
| `mila` | agente Mila | contexto autorizado, sem regra paralela de presença |
| `relatorios` | relatórios gerenciais e detalhes | ocorrências por período e estado de publicação |
| `kpis` | cards, gráficos e rankings | presentes / eventos confirmados no mesmo universo |

Os modos são `legado`, `sombra` e `canonico_v2`. A publicação técnica cria todas as unidades/superfícies em `sombra`. A ativação é feita somente por `admin_alterar_presenca_rollout_v1`, com `request_id`, motivo e evidência. Para entrar em `canonico_v2`, a função exige sete dias operacionais e todos os gates objetivos verdes.

## 5. Horários candidatos

Os horários abaixo são BRT e só passam a valer após a migration autorizada:

| Horário | Job | Objetivo |
|---|---|---|
| 00:10, seg–sáb | Campo Grande | fechar explicitamente o dia anterior |
| 00:25, seg–sáb | Barra | fechar explicitamente o dia anterior |
| 00:40, seg–sáb | Recreio | fechar explicitamente o dia anterior |
| 03:15, diário | backlog | revisar até 14 dias, encerrando em ontem |
| 07:30, diário | catch-up | executar apenas unidade com aula e sem cobertura concluída |
| 09:00, diário | relatório | enfileirar somente se todas as unidades com aula estiverem cobertas |

A lease deduplica corridas entre fechamento, retry e catch-up. Não reative os crons legados sobrepostos após o cutover técnico.

## 6. Rotina diária e alarmes

Saúde sanitizada por unidade/data:

```sql
select *
from public.get_saude_cobertura_presenca_v1(current_date - 1);
```

Monitorar diariamente:

- cobertura concluída para 100% das unidades com aula;
- lease expirada e tentativas deduplicadas;
- relatório bloqueado por frescor;
- comandos parciais, falhos ou sem recibo;
- conflito Emusys × humano;
- roster em revisão;
- divergência Agenda × Sol;
- delta de KPI sem explicação.

Alarme é acionável quando houver sync incompleto sem bloqueio de publicação, divergência entre consumidores, decisão humana sobrescrita, comando sem recibo, vazamento de ACL ou delta numérico sem explicação.

## 7. Conflito e conciliação

1. Confirme unidade, data da aula, slot canônico e estado de cobertura.
2. Consulte proveniência e recibo; diferencie Emusys raw, humano, retificação e Fábio.
3. Verifique roster operacional e identidade. Nome não é chave de escrita.
4. Se o raw estiver incompleto, reexecute o sync pela rota normal com novo request; não fabrique presença/falta.
5. Se houver decisão humana terminal, preserve-a e registre a divergência para conciliação.
6. Reparação de roster é sempre dry-run, aprovação por unidade e soft-inativação; presença histórica não é apagada.

## 8. Rollout e rollback

Ordem planejada:

1. Recreio: Agenda + Sol.
2. Recreio: LA Teacher/Fábio + Lia + métricas abertas.
3. Barra: mesmas superfícies.
4. Campo Grande: mesmas superfícies.
5. Consolidado, relatórios e agentes analíticos.

Cada onda exige banco, Edge, navegador e agente, seguida de sete dias operacionais verdes antes da próxima. HTTP 200, cron concluído ou deployment pronto não substituem E2E autenticado.

Rollback é mudar a superfície para `legado` com motivo prefixado por `rollback:` e um gatilho governado. Não executar DDL destrutivo, não apagar eventos e não reverter decisões humanas. Depois do rollback, registrar versão, unidade, superfície, request, evidência e horário.

## 9. Responsabilidades

| Papel | Responsabilidade |
|---|---|
| Administrativo da unidade | fechar chamada e revisar pendências operacionais |
| Professor / LA Teacher | registrar conteúdo e chamada pelo fluxo normal |
| Fábio | consumir e registrar via portas autorizadas do LA Teacher; não manter regra paralela |
| Sol | cobrar pendências canônicas e mostrar bloqueio de frescor |
| Lia e Mila | consumir apenas contexto autorizado e estado de publicação |
| Engenharia/dados | sync, cobertura, roster, recibos, ACLs, rollout e observabilidade |
| Responsável de negócio | aprovar dry-run por unidade e cada ativação de onda |

## 10. Gates antes de produção

São autorizações separadas:

1. aplicar migrations produtivas;
2. reparar roster aprovado;
3. publicar Edge Functions modificadas;
4. ativar consumidores por flag.

O preflight e as evidências ficam em [`docs/audits/2026-08-26-presenca-preflight-producao.md`](../audits/2026-08-26-presenca-preflight-producao.md) e [`docs/audits/2026-08-26-presenca-shadow-30d.md`](../audits/2026-08-26-presenca-shadow-30d.md). Segredos, payloads do Emusys e dados pessoais não entram nesses documentos nem nos logs novos.

### Staging obrigatório das migrations

O histórico desta branch não contém todas as migrations do ledger remoto. Portanto, não executar `db push` diretamente do checkout e nunca usar `--include-all` ou `migration repair` para contornar a divergência.

1. Criar uma pasta temporária vazia com `supabase/migrations`.
2. Executar `supabase migration fetch --project-ref ouqwbbermlzqqvtqwlul` nessa pasta.
3. Confirmar a última versão remota e que todas as 22 versões candidatas são posteriores.
4. Copiar somente o lote fechado da presença.
5. Executar `supabase db push --dry-run --project-ref ouqwbbermlzqqvtqwlul --skip-vault`.
6. Exigir exatamente as 22 migrations do manifesto, sem seeds ou roles.
7. Somente após autorização específica, repetir o preflight e trocar `--dry-run` pela aplicação governada.

Evidência atual: [`docs/audits/2026-08-26-presenca-migration-release-dry-run.md`](../audits/2026-08-26-presenca-migration-release-dry-run.md).

### Pacote Edge

Depois das migrations e somente com autorização separada, publicar exatamente: `sync-presenca-emusys`, `sync-grade-futura-emusys`, `previsualizar-reconciliacao-grade-emusys`, `relatorio-admin-whatsapp`, `processar-alertas-lia`, `bi-agent-lamusic`, `gerar-plano-aluno` e `gerar-relatorio-aluno`. Preservar o `verify_jwt` vivo de cada função e registrar versão/hash antes e depois. O manifesto está em [`docs/audits/2026-08-26-presenca-edge-release-preflight.md`](../audits/2026-08-26-presenca-edge-release-preflight.md).
