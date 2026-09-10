# Matrículas de banda distintas — plano de correção

> Execução autorizada pelo usuário em 09/09/2026: corrigir, commit, push e deploy.

**Objetivo:** contar separadamente matrículas ativas de banda da mesma pessoa, preservando alunos, pagantes, cursos adicionais, permissões e fechamentos históricos.

**Decisão aprovada:** corrigir o produtor compartilhado, não somar uma unidade fixa no relatório nem duplicar cadastros. O grão da banda é unidade + matrícula Emusys; uma linha local sem matrícula sincronizada continua valendo um vínculo enquanto ativa. Renovação/disciplinas da mesma matrícula não multiplicam a contagem.

**Arquitetura:** migration aditiva altera somente a expressão de bandas em `get_kpis_alunos_admin_operacional_impl_v2`. O wrapper autenticado, os outros campos do JSON, o relatório diário e a tela continuam usando os contratos existentes. Matrículas sincronizadas usam o estado operacional resolvido de cada matrícula. Nenhum cadastro, presença, cobrança ou snapshot será atualizado.

**Stack:** PostgreSQL, teste Node com PostgreSQL 17 em Docker, Supabase e navegador autenticado.

## Execução

- [x] Criar `tests/kpisAdminBandasMatriculasDistintasPostgres.test.mjs` com schema mínimo e função real anterior.
- [x] Reproduzir em PostgreSQL: dois cursos acadêmicos e duas bandas ligados a três linhas locais devem resultar em 1 pessoa, 1 curso adicional, 2 bandas e 4 matrículas; a função anterior retorna 3.
- [x] Implementar a migration `20260910003947_kpis_admin_bandas_por_matricula_distinta.sql`, com guarda de formato, idempotência e preservação dos privilégios (arquivo alinhado ao timestamp registrado pelo deploy).
- [x] Testar IDs iguais em duas unidades, homônimos, duas bandas, encerramento/trancamento independente, duplicação de vínculo local, fallback local e histórico sem escrita.
- [x] Executar `node --test tests/kpisAdminBandasMatriculasDistintasPostgres.test.mjs tests/relatorioAdminCanonicoMulticursoTrancamento.test.mjs tests/kpisAlunosSnapshotFechadoContract.test.mjs tests/kpisAlunosDadosMensaisNullSafety.test.mjs` (22 testes passaram).
- [x] Comparar consulta candidata e função vigente nas três unidades antes do deploy. Recreio 418 → 419 e bandas 52 → 53; Campo Grande 468 → 469 e bandas 42 → 43; demais indicadores intactos.
- [x] Revisar diff, fazer commit, push, PR e merge; publicar apenas a migration autorizada.
- [x] Conferir ACL, somas e painel após recarga; gerar relatório diário em `dry_run` sem enviar WhatsApp.
- [x] Registrar evidências e regenerar o mapa do banco; informar commit/produção e limites da validação.

## Evidência anterior à publicação

Comparação somente leitura em 10/09/2026 00:25 UTC (09/09 à noite no Brasil), usando o corpo candidato da função sobre os dados reais, sem substituir a função de produção:

| Unidade | Pessoas ativas | Pagantes | Adicionais | Bandas antes → depois | Matrículas antes → depois |
|---|---:|---:|---:|---:|---:|
| Barra | 256 | 252 | 13 | 13 → 13 | 282 → 282 |
| Campo Grande | 400 | 371 | 26 | 42 → 43 | 468 → 469 |
| Recreio | 338 | 328 | 28 | 52 → 53 | 418 → 419 |

Recreio: duas matrículas distintas de banda estavam projetadas na mesma linha local. Consulta paginada de todas as matrículas ativas no Emusys confirmou 419 IDs distintos em 09/09 23:53 UTC.

Campo Grande: uma matrícula ativa de banda estava ligada à projeção de outra matrícula encerrada. Consulta nominal ao Emusys em 10/09 00:29 UTC confirmou a banda ativa e o curso acadêmico separados; não é uma duplicidade nem uma matrícula encerrada sendo reativada.

Nenhuma matrícula ativa candidata classificada como banda possui curso não-banda na jornada consultada. A contagem é por unidade e matrícula, não por renovação ou disciplina. Nenhum cadastro ou snapshot histórico é alterado. Revisão auxiliar indisponível por limite de uso; revisão local e CI continuam obrigatórios.

## Publicação e conferência final

- PR [#412](https://github.com/LucianoAlf/LAperformanceReport/pull/412), commit integrado `89db739bc1b961223cdfbfce7e0f8679af77e205` em 10/09/2026 00:39:32 UTC.
- CI aprovado: PostgreSQL (22 testes), typecheck-refs com suíte de regressão e gitleaks; build de preview aprovado.
- Migração aplicada uma única vez, versão remota `20260910003947`. Renomeação local apenas alinha o histórico; SQL idêntico, sem reaplicação nem edição da tabela de migrações.
- Pós-deploy às 00:40:07 UTC: corpo da função e JSON completo idênticos ao candidato validado. ACL interna preservada: apenas `postgres` executa; wrapper público não foi alterado.
- Vercel produção `dpl_BXpye899Hi4aieprtiLA5Y5xNf26`, estado Ready, alias `https://la-performance-report.vercel.app`.
- Navegador autenticado após recarga: consolidado com 1.170 matrículas; Recreio com 419 = 338 base + 53 bandas + 28 adicionais, 338 alunos e 328 pagantes.
- Relatório diário de Recreio gerado pelo botão da tela em 09/09/2026 às 21:42 BRT: 419 matrículas, 53 bandas, 28 adicionais, 338 ativos e 328 pagantes. Console sem erros. Nenhum envio de WhatsApp efetuado.
- `npm run mapa:banco` concluído por conexão ao pooler: 554 tabelas/views e 1.395 funções. A alteração do corpo da função não muda o inventário; descartadas somente as diferenças geradas de estatísticas, datas e trabalho paralelo, preservando a documentação versionada. Credencial fornecida usada apenas em configuração temporária ignorada pelo Git, removida ao concluir; nenhum segredo versionado.

Escopo: correção da agregação de matrículas de banda. Não constitui nova auditoria de todos os relatórios da coordenação. Os dois casos recuperados foram confirmados na origem; alunos, pagantes, adicionais e os demais campos permaneceram iguais na comparação completa.
