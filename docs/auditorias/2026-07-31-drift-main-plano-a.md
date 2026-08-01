# Plano A — auditoria do avanço da `main`

Data: 31/07/2026

Escopo: integração da `origin/main` na branch do PR #16 e verificação somente
leitura de eventual defasagem do ensaio DDL `didpawhgvkarzntvktzu`. Nenhuma
migration, função, dado ou configuração de produção foi alterada.

## Conclusão executiva

- A base original do PR era `4e2584a775b59c5e5a4ee5c6d99233af3d1dd93a`.
- A `main` recebeu 55 commits depois dessa base.
- O único conflito de conteúdo ocorreu em `supabase/config.toml` e foi
  resolvido preservando os dois contratos: `enviar-pesquisa-evasao` com
  `verify_jwt = true` e `sync-presenca-emusys` com `verify_jwt = false`.
- A `main` adicionou 22 arquivos de migration. Desses, 19 migrations já
  estavam em produção quando o schema usado no ensaio foi extraído; 3
  migrations da `main` não estão em produção.
- A leitura atual do histórico remoto continua com as mesmas 1.151 versões de
  14 dígitos e o mesmo último registro, `20260731200406`, observados antes do
  ensaio.
- Portanto, o ensaio `didpawhgvkarzntvktzu` não ficou defasado e não precisa
  ser repetido antes do rollout. As mudanças de banco que chegaram à produção
  pela `main` já faziam parte do schema ensaiado.

## Evidência de schema e migrations

O histórico remoto foi consultado novamente em modo somente leitura. A mesma
normalização usada no ensaio encontrou 1.151 versões únicas de 14 dígitos, de
`20260106025222` até `20260731200406`. A contagem e o último registro são
idênticos aos anotados no runbook quando o dump de `didpawhgvkarzntvktzu` foi
produzido.

As 19 migrations da `main` já presentes em produção naquele momento são:

1. `snapshot_experimentais_emusys`;
2. `conciliacao_experimentais_snapshot_ativo`;
3. `lead_experimentais_aula_unica_por_unidade`;
4. `fila_relatorios_whatsapp_tipo`;
5. `sync_presenca_authorization`;
6. `snapshot_experimentais_consumidores_ids_materializados`;
7. `snapshot_experimentais_minimiza_payload`;
8. `snapshot_experimentais_admissao_refresh`;
9. `snapshot_experimentais_acl_payload_duravel`;
10. `sync_presenca_cron_token_interno`;
11. `fix_get_jornada_professor_permissao_carteira`;
12. `fix_get_jornada_professor_aceitar_perfil_legado`;
13. `relatorio_admin_canonico_multicurso_trancamentos`;
14. `restringe_kpis_admin_operacional`;
15. `perfil_sucesso_do_aluno_departamento`;
16. `get_user_unidade_ids_plural_com_piloto`;
17. `policies_unidade_plural_in_get_user_unidade_ids`;
18. `carteira_professores_ticket_por_tipo_matricula`;
19. `carteira_professores_mrr_canonico_e_sem_arquivado`.

As 3 migrations versionadas na `main` que não estão em produção são:

1. `20260731220000_relatorio_admin_trancamentos_detalhados.sql`;
2. `20260731223000_snapshot_experimentais_fencing_lease.sql`;
3. `20260731224500_snapshot_experimentais_metadados_coordenados.sql`.

Um novo dump `public` somente-schema foi obtido apenas para checagem, sem
dados. Ele manteve o mesmo tamanho do dump do ensaio: 3.198.746 bytes no
original e 3.198.699 bytes após o saneamento das URLs estruturais. Os hashes
brutos não são comparáveis entre execuções porque o `pg_dump` gera a cada
chamada um token aleatório nos comandos `\\restrict` e `\\unrestrict`.
Assim, a prova determinante de atualidade é a identidade do histórico remoto,
não a igualdade binária entre dois dumps independentes. O dump de checagem foi
examinado pelo Gitleaks 8.30.1 e não apresentou segredo.

## Sobreposição de arquivos

Comparando os arquivos alterados pelo PR até o head anterior ao merge com os
arquivos alterados na `main` desde a base, existem exatamente cinco caminhos
em comum:

- `.claude/memory/integracao-infra.md`;
- `docs/MAPA-INTEGRACAO-EMUSYS.md`;
- `docs/MAPA-SISTEMA.md`;
- `docs/METRICAS.md`;
- `supabase/config.toml`.

Os quatro documentos foram integrados automaticamente. Somente
`supabase/config.toml` apresentou conflito. Não houve sobreposição adicional
em migration, Edge Function, componente ou hook de produção do Plano A.

## Commits que entraram na `main` depois da base do PR

1. `8e51824` — fix(professores): destravar carteira do professor para perfil unidade
2. `523ef2c` — feat(rbac): popular usuario_perfis e criar perfil do Sucesso do Aluno
3. `83cb5d9` — feat(rbac): policies aceitam N unidades por pessoa
4. `a79bf1e` — docs(daily-notes): fecha o registro do dia com plano e riscos da migracao RBAC
5. `4a09e39` — docs+feat(observador): daily-note de 30/07 e lead_arquivado em modo sombra
6. `a3f7b54` — fix(professores): ticket da carteira usa tipos_matricula.entra_ticket_medio
7. `bf77917` — docs+fix(migrations): versiona correcao de 2o/3o curso do relatorio admin
8. `0343f69` — fix(professores): MRR da carteira segue a regra canonica e ignora arquivado
9. `7f7c8c7` — docs: especificar experimentais frescas no relatorio comercial
10. `75753fc` — docs: planejar correcao das experimentais comerciais
11. `a85b18d` — docs: unificar relatorio comercial canonico
12. `443c544` — docs: ampliar plano do relatorio comercial
13. `327a395` — test: definir contrato do snapshot de experimentais
14. `89bcfa8` — test: provar preservacao de cursos paginados
15. `0c56b4e` — fix: endurecer contrato do snapshot experimental
16. `6bbe49f` — feat: versionar snapshot vigente de experimentais
17. `61b90dc` — fix: validar identidade e cobertura do snapshot
18. `6b77483` — fix: exigir identidade raw e normalizada simetrica
19. `484821a` — fix: aceitar sentinela zero na identidade Emusys
20. `ee91fae` — fix: restringir leitura do snapshot por unidade
21. `449844c` — fix: serializar snapshot experimental por unidade
22. `be3df49` — fix: versionar historico do snapshot experimental
23. `89daef0` — docs: registrar contrato do snapshot experimental
24. `9055a8d` — fix: autorizar agregado experimental por escopo
25. `0a91e89` — fix: isolar lock do snapshot por advisory
26. `fc85c11` — feat: atualizar experimentais sob demanda
27. `2be0ddf` — fix: corrigir reconciliacao de experimentais
28. `145b6b5` — fix: preservar identidade de experimentais
29. `edf0f3d` — fix: preservar status terminal no cancelamento
30. `5095f64` — fix: conciliar apenas experimentais vigentes
31. `4eb2785` — fix: usar identidade canonica na conciliacao
32. `41bef95` — test: definir relatorio comercial unificado
33. `f4bd86a` — fix: endurecer relatorio comercial unificado
34. `ab34f7f` — fix: arredondar tickets com decimal exato
35. `b9f62f8` — fix: gerar relatorio comercial canonico unificado
36. `7124f65` — fix: endurecer relatorio comercial canonico
37. `c0b336e` — refactor: unificar relatorio diario comercial
38. `9abd1e7` — fix: vincular relatorio comercial ao contexto
39. `09a3080` — fix: invalidar envio ao editar relatorio
40. `0df882c` — fix: respeitar data do relatorio comercial
41. `17a8058` — fix: separar data e instante do relatorio
42. `d0e1137` — fix: minimizar payload de experimentais
43. `9cc4aa6` — fix: autorizar sync de presenca
44. `485641b` — fix: rejeitar body invalido no sync
45. `4c0dba1` — fix: tornar refresh experimental idempotente
46. `621c531` — test: atualizar contratos textuais do sync
47. `3ae2343` — fix: preservar consumidores do snapshot experimental
48. `f64aeb6` — fix: preservar marcador zero no snapshot
49. `89418a8` — fix: restaurar autenticacao interna dos crons
50. `b579e5a` — fix: integrar relatorio administrativo canonico
51. `7c8258f` — docs: normalizar fim dos planos administrativos
52. `376d939` — fix: evitar colisao na versao da migration
53. `a6a1b20` — fix: cercar snapshot por admissao vigente
54. `7dacec5` — fix: coordenar snapshot durante leitura
55. `853f86e` — Merge pull request #17 from LucianoAlf/fix/relatorios-canonicos-integrados

## Baseline da bateria ampla

A bateria global de testes Node da branch executou 855 testes: 843 passaram,
5 foram ignorados e 7 falharam em domínios alheios ao Plano A. Os seis arquivos
que contêm essas sete falhas foram executados novamente em uma worktree
destacada: as mesmas 7 falhas foram reproduzidas em `origin/main` (`853f86e`),
com 81 testes aprovados de 88. Portanto, elas não são regressão da integração
nem do PR #16 e não foram corrigidas neste escopo.

As falhas de baseline estão em testes de Health Score Professor V3, passagem
de bastão, lifecycle/sync de matrícula e artefato vivo da carteira do
professor. Em contraste, passaram integralmente:

- 111 testes Node focados no Plano A e hardening de caixas (110 aprovados e 1
  fixture opcional ignorada);
- 56 testes Deno da Edge `enviar-pesquisa-evasao`;
- 30 testes das entregas da `main` selecionados para sync de presença,
  snapshot comercial e relatório administrativo;
- o build de produção do Vite.

## Item independente: conversas sem caixa

As duas conversas antigas de Campo Grande sem `caixa_id`, o risco de fallback
para a caixa da Barra e a correção proposta permanecem fora do Plano A e estão
registrados em
[`2026-07-31-pre-atendimento-caixa-undefined.md`](2026-07-31-pre-atendimento-caixa-undefined.md).
Nada foi corrigido ou alterado em produção neste trabalho.
