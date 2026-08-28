# Presença canônica — preflight do hardening retrocompatível

Data do checkpoint: `2026-08-27 21:47:06 -03:00`

Projeto Supabase: `ouqwbbermlzqqvtqwlul`

Este checkpoint foi executado em modo somente leitura. Não houve aplicação de
migration, alteração de flag, deploy de Edge Function, escrita de fixture nem
mudança em dados reais.

## Fontes oficiais atuais

- [Supabase Changelog](https://supabase.com/changelog)
- [Supabase CLI](https://supabase.com/docs/reference/cli/introduction)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Database lint/advisors](https://supabase.com/docs/reference/cli/supabase-db-advisors)

Conclusões aplicáveis ao pacote:

- o banco remoto já está em PostgreSQL 17; os testes descartáveis devem usar a
  mesma major version;
- funções `SECURITY DEFINER` precisam de `search_path` fixo e ACL explícita;
- `EXECUTE` não pode ficar herdado de `PUBLIC` para portas internas;
- credencial `service_role` permanece exclusivamente no backend;
- as Edge Functions continuam em TypeScript compatível com Deno;
- o CLI compara migrations pelo timestamp; divergência de ledger não será
  contornada com `--include-all` nem `migration repair`;
- `db lint` será executado no gate final e seus achados novos serão separados
  do baseline preexistente.

Entradas atuais do changelog relevantes ao ambiente: PostgreSQL 17 é a major
padrão dos projetos novos; suporte do CLI a Node 20 foi encerrado em favor de
Node 22 ou superior; mudanças de exposição automática do schema `public` não
autorizam ampliar grants neste projeto; retry transitório do PostgREST para
`GET`/`HEAD` não constitui retry de mutações de presença.

## Ferramentas medidas

| Ferramenta | Versão |
|---|---|
| Supabase CLI | `2.116.0` |
| PostgreSQL remoto | `17.6` (`170006`) |
| Deno | `2.5.1` |
| TypeScript do Deno | `5.9.2` |
| Node.js | `v24.15.0` |
| Docker | `29.2.1`, build `a5c7197` |

Foram redescobertos pelo próprio CLI os contratos de `migration new`,
`migration list`, `db push --dry-run` e `db lint --linked`. O release não usará
sintaxe presumida nem `--include-all`.

## Ledger remoto no checkpoint

| Versão remota | Nome |
|---|---|
| `20260827213234` | `fideliza_e_retificacao_gerencial_excluem_bolsista` |
| `20260827211544` | `bolsista_e_banda_fora_de_todos_os_kpis` |
| `20260827205259` | `evasoes_excluem_banda_e_bolsista` |
| `20260827185039` | `vw_alunos_sem_fatura_mes_venc_ultima_fatura` |
| `20260827183253` | `repescagem_cancelada_pode_ser_reenviada` |
| `20260827181235` | `repescagem_texto_neutro_de_genero` |
| `20260827174741` | `repescagem_irmaos_guarda_e_texto` |
| `20260827151832` | `agenda_chamada_volta_do_fechamento_de_bypass` |
| `20260827140002` | `la_teacher_agenda_sai_do_caminho_da_sombra_descartada` |
| `20260827135555` | `la_teacher_agenda_e_chamada_voltam_do_hardening` |

O nome da migration remota mais recente está representado localmente como
`20260827220000_fideliza_e_retificacao_gerencial_excluem_bolsista.sql`, mas o
timestamp difere porque frentes concorrentes publicaram migrations pela API.
As migrations remotas `20260827135555` e `20260827140002` não têm arquivos
locais individuais; a restauração cumulativa e versionada posterior é
`20260827151832_agenda_chamada_volta_do_fechamento_de_bypass.sql`.

Portanto, o checkout completo não é uma entrada segura para `db push` direto.
O dry-run final será montado sobre staging vazio obtido por `migration fetch`
do próprio remoto, com sobreposição somente dos candidatos deste pacote. Não
será feita normalização destrutiva do ledger.

## Assinaturas e ACLs vivas

Todas as assinaturas abaixo são `SECURITY DEFINER` no checkpoint.

| Assinatura | ACL executável |
|---|---|
| `app_aplicar_comando_presenca_v1(uuid)` | `postgres`, `authenticated`, `service_role` |
| `app_criar_comando_presenca_v1(uuid,text,uuid,integer,jsonb)` | `postgres`, `authenticated`, `service_role` |
| `app_registrar_presencas_aula(integer,integer[])` | `postgres`, `authenticated`, `service_role` |
| `app_registrar_presencas_aula(integer,integer[],uuid)` | `postgres`, `authenticated`, `service_role` |
| `fabio_registrar_presencas_aula(integer,integer,integer[])` | `postgres`, `service_role` |
| `fabio_registrar_presencas_aula(integer,integer,integer[],uuid)` | `postgres`, `service_role` |
| `reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)` | `postgres`, `service_role` |

Resultado do gate: os overloads antigo e novo do LA Teacher coexistem; a porta
de dois argumentos continua disponível para `authenticated`; Fábio permanece
restrito a `service_role`.

`app_status_comando_presenca_v1(uuid)` existe no remoto para `authenticated` e
`service_role`. A tabela de arbitragem
`presenca_comando_nao_recebidos` ainda não existe, logo a migration local
`20260827223000_presenca_request_id_arbitragem.sql` é um candidato real de
release e não pode ser omitida do dry-run.

## Edge Functions vivas

| Função | Versão | `verify_jwt` | Status |
|---|---:|---:|---|
| `sync-presenca-emusys` | 102 | `false` | `ACTIVE` |
| `sync-grade-futura-emusys` | 34 | `true` | `ACTIVE` |
| `processar-alertas-lia` | 13 | `true` | `ACTIVE` |
| `previsualizar-reconciliacao-grade-emusys` | 5 | `false` | `ACTIVE` |

Nenhum `verify_jwt` será alterado por inferência. O deploy dual futuro deve
preservar o valor vivo de cada função.

## Flags e ordem de release

- `presenca_rollout_config`: `21` linhas em `sombra`, `0` em `canonico_v2`;
- WIPs `20260827143000` a `20260827143300`: proibidos e ausentes do release;
- candidatos locais anteriores à Fase 4:
  `20260827223000_presenca_request_id_arbitragem.sql` e
  `20260828001259_presenca_ausencia_bruta_fail_closed.sql`;
- a ordem correta do dry-run é, portanto, seis migrations do domínio:
  arbitragem da Fase 2, correção fail-closed da Fase 3 e quatro migrations novas
  da Fase 4;
- qualquer migration não relacionada que apareça no staging final reprova o
  gate.

## Resultado

- documentação e ferramentas atuais: conferidas;
- ledger e deriva histórica: medidos e isolados;
- compatibilidade das portas antigas: aprovada;
- flags canônicas alteradas: não;
- migrations/Edge Functions publicadas neste checkpoint: não;
- writes remotos: `0`.
