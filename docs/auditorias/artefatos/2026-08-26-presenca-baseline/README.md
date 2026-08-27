# Baseline remoto da presença

Snapshot somente leitura do projeto Supabase `ouqwbbermlzqqvtqwlul`, capturado em
`2026-08-26T16:03:44Z`. O servidor remoto estava em PostgreSQL 17.6 e a última
migration registrada era `20260826154800`.

Este artefato não contém nomes de alunos, telefones, mensagens ou payloads. Os
hashes abaixo são `md5(pg_get_functiondef(...))` para funções e
`md5(pg_get_viewdef(..., true))` para views.

| Assinatura | MD5 | Segurança | ACL viva |
|---|---|---|---|
| `app_minha_agenda_sessao(date)` | `5013fb1db60fcd7cc7999b7802369b6a` | definer, stable | `postgres`, `authenticated` |
| `app_registrar_chamada_agenda(jsonb)` | `85bae792ff64f1ebca383a6569ed1ec6` | definer, volatile | `postgres`, `authenticated`, `service_role` |
| `app_registrar_presencas_aula(integer,integer[])` | `eabddb8cbf7ff503ebbf4bf85f324625` | definer, volatile | `postgres`, `authenticated`, `service_role` |
| `fn_enfileirar_relatorio_presenca(date,boolean)` | `eebf73a2d1acb2b2d54e94b38d125b2b` | definer, volatile | `postgres`, `service_role` |
| `fn_presenca_fecha_chamada(text,text)` | `008ca4a72d663e7025d4d3fdb8b3f9c2` | invoker, immutable | `postgres`, `service_role` |
| `fn_presenca_pendencias_do_dia(uuid,date)` | `ee80db65dc37b671d21c266a14dc487d` | definer, stable | `postgres`, `authenticated`, `service_role` |
| `fn_registrar_presencas_core(integer,integer,integer[],text,boolean)` | `4e8ca3240a9ce9ef86f478138141ba16` | definer, volatile | `postgres`, `service_role` |
| `fn_sincronizar_gemeos_presenca(integer)` | `97e10c430fff729307bdba64a7939dd7` | definer, volatile | `postgres`, `service_role` |
| `fn_texto_relatorio_presenca(uuid,date)` | `f360f6771fed647ea176dc1f60fa0d93` | definer, stable | `postgres`, `authenticated`, `service_role` |
| `get_agenda_dia(date,uuid)` | `8383592690ec324ab2cdb5bca6ea331e` | invoker, stable | `postgres`, `authenticated`, `service_role` |
| `vw_aluno_frequencia_canonica_v1` | `4c9d8996a0581fc17243638338be7bfd` | view | `postgres`, `service_role`, agentes restritos, `authenticated` |
| `vw_aluno_presenca_semantica_v1` | `f2cbcaccb946bb152a8c81aad67b795c` | view | `postgres`, `service_role` |
| `vw_presenca_slot_canonica_v1` | `021e61dfa06dfaf0e709469d53086dfd` | view | `postgres`, `service_role` |

## Definições que estavam somente no banco

As funções `fn_enfileirar_relatorio_presenca(date,boolean)` e
`fn_texto_relatorio_presenca(uuid,date)` foram copiadas, sem troca de contrato,
para a migration `20260827030000_presenca_funcoes_vivas_baseline.sql`. A migration
também restaura explicitamente as ACLs observadas acima, evitando que os
privilégios padrão do schema abram `EXECUTE` para `anon`.

O replay em um PostgreSQL 17 descartável recriou as duas funções com os mesmos
MD5 do snapshot remoto (`eebf73...` e `f360f6...`) e as mesmas ACLs. O comando
`supabase migration list --local` não foi usado como prova porque ele exige a
stack local em `127.0.0.1:54322`; a validação foi feita diretamente no fixture
PostgreSQL, sem tocar no projeto remoto.

## Ambiente local de baseline

- Supabase CLI local: 2.40.7; a CLI informou 2.115.0 como versão disponível.
- Node local: 24.15.0; o LA Report declara Node 22.x. A suíte passou, mas o gate
  final deve repetir no runtime 22 suportado.
- LA Report: 371/371 testes passaram.
- LA Teacher: 116/116 testes passaram.

Nenhuma migration foi aplicada e nenhum DML foi executado em produção durante
esta captura.

## Baseline operacional de 30 dias

O auditor somente leitura foi executado para `2026-07-27..2026-08-25`. O JSON
com 90 recortes por unidade/data ficou fora do Git em
`D:\2026\LA-performance-report-worktrees-artifacts\presenca-baseline-2026-08-26T1608Z.json`.
Ele contém somente contagens, hashes e nomes de unidade; a verificação automática
não encontrou chaves de aluno, responsável, telefone ou payload. SHA-256 do SQL:
`ca86b1825b23a355bc3f35928dfa4748987b8dc707842f8b17b72f76a1c335bb`.

| Unidade | Aulas reais | Eventos presentes | Eventos falta | Indeterminados | Conflitos | Rosters ambíguos | Pendências Agenda | Pendências relatório |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Barra | 872 | 645 | 174 | 25 | 3 | 5 | 0 | 29 |
| Recreio | 1.164 | 1.091 | 286 | 11 | 1 | 3 | 5 | 23 |
| Campo Grande | 1.160 | 1.250 | 113 | 5 | 10 | 9 | 3 | 21 |

`sync_completo=false` em todos os recortes não afirma que todos os syncs
falharam: registra que o contrato v1 não possui ledger conclusivo por
unidade/data. A divergência medida entre a Agenda e o relatório confirma que as
duas superfícies ainda calculam pendência por caminhos diferentes; ela é
baseline para a comparação v2, não deve ser reparada diretamente nos dados.

O contrato vivo também possui um risco alto de autorização: a função
`fn_texto_relatorio_presenca` é `SECURITY DEFINER`, retorna nomes e pode ser
executada por `authenticated` sem validar o escopo da unidade. Este checkpoint
apenas versiona o comportamento observado. A revogação fica condicionada ao
cutover da Sol para a RPC canônica escopada, para não quebrar a operação antes
de existir substituto.
