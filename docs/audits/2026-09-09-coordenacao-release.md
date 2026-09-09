# Coordenação — retificação e verificação de 09/09/2026

## Estado da liberação

**Em validação, sem liberação para premiação.** Branch `fix/coordenacao-confiabilidade-total`, HEAD inicial `19878d577266921ff3719484318bf32deda436a9`. Sem commit, push, merge ou deploy de frontend. Edge publicada em versão 97 após autorização explícita.

Duas decisões foram confirmadas explicitamente pelo usuário nesta continuação:

1. Manter **D+30**: Jun–Ago oficial apenas a partir de **30/09**, após reapuração e fechamento explícito. Regularização dos 117 registros publicada às 17:38:40 UTC; notas/evidências e documentos anteriores preservados, retirando somente a oficialidade corrente. Não foi criado novo job de fechamento/premiação automática.
2. Autorizar a integração existente com OpenAI, envio de nomes/prioridades, deploy e teste real. Edge 95 substituída por 96 e depois 97 (última inclui apresentação compartilhada da carteira). Autorização customizada existente preservada; nenhum novo dado financeiro enviado à IA. A sessão Playwright encerrou durante a primeira tentativa; navegador reaberto na tela de login e usuário solicitado a autenticar novamente. Ainda não contar o quinto relatório como validado no navegador.

O usuário também determinou retirar MRR dos cinco relatórios de Coordenação. Valores, totais e pendências financeiras foram removidos da apresentação; documentos de origem e relatórios gerenciais permanecem intactos. O menu já não promete MRR. Carteiras fracionárias de ciclos usam o mesmo formatador nos cinco relatórios, sem arredondar a média para pessoas inteiras.

### Evidência da continuação autorizada

- RED/GREEN para remoção financeira e restrição do payload OpenAI; mais testes de menu e precisão fracionária. Última execução focada: 23 Node + 19 Deno aprovados, zero falhas. Os três testes V2 com rótulos antigos foram atualizados para os contratos de apresentação vigentes, preservando o teste de ausência sem zero artificial.
- Fixture PostgreSQL com setembro/outubro/novembro já carregados: cortes progressivos retornam **8/10 = 80%**, **35/40 = 87,5%**, **45/50 = 90%**. Denominadores propositalmente diferentes comprovam soma de eventos, não média simples de percentuais. Cinco testes de períodos/fontes/paridade passaram.
- Edge 97 ativa: `546385f199651f9d0ed9b11eb965906571dd58a3538036ad7d033d9cb756e0a3`. Publicação não substitui geração autenticada e inspeção final.
- Suíte específica completa nesta continuação: **243 Node + 29 Deno**, zero falhas/skips. Os sete testes V2 passaram separadamente e foram acrescentados ao comando da suíte. Testes da regularização D+30 ainda não estão incluídos nesta contagem.
- Os cinco renderizadores atuais passaram com **24 documentos reais: 120 relatórios e 168 comparações exatas das sete seções de destaques**, sem requisições externas. Mesmos nomes, posições, valores e amostras entre relatório completo e Health Score. Cópia temporária removida, documentos originais preservados. Prova offline, não de geração autenticada.
- Auditoria READ ONLY repetida às **17:21:12 UTC**: 80/80 verificações, 720 métricas iguais e os mesmos 129 documentos/hashes nos oito domínios alheios. Às 17:31, os 117 pares score de snapshot/documento também estavam idênticos.
- `npm run build`: exit 0, 4.791 módulos, 14,73 s. O launcher local de Vite havia sido substituído pelo Deno durante os testes; `npm rebuild vite --ignore-scripts` restaurou o launcher npm, sem alterar dependências versionadas.
- Revisão independente da remoção financeira, formatador compartilhado e menu: nenhum bloqueador encontrado; revisor repetiu 23 Node + 19 Deno, zero falhas. Identificou necessidade de prova de atualização D+30 antes do fechamento futuro, em implementação na migration separada.
- D+30: 30/30 testes PostgreSQL reais reexecutados pelo principal, exit 0, 19,48 s. Revisão independente final sem Critical/Important. A DDL preservou ACL/OIDs e fixou dia civil de São Paulo; fonte e conversão precisam estar atualizadas após a maturidade antes de fechar.
- Ensaio remoto às 17:37:55 UTC: 117 revisões/702 métricas/4 documentos criados dentro de RR e **80/80** verificações aprovadas; `ROLLBACK`. Leitura posterior confirmou zero revisões/documentos persistidos e ciclo anterior intacto.
- Execução definitiva às **17:38:40 UTC**: mesmas 80 verificações dentro da transação, com exceção obrigatória antes do commit se qualquer uma falhasse. Equipe diagnóstica e 720 métricas painel/documento iguais; outros oito domínios intactos.
- Suíte final incluindo D+30 e V2: **280 Node + 29 Deno**, zero falhas/skips; Node 202,61 s. Nova renderização offline após D+30: **120/120 relatórios e 168/168 seções de destaque**, sem rede e sem MRR, mantendo o estado diagnóstico; arquivo temporário removido.
- Auditoria independente READ ONLY às **17:42:54 UTC**: **119/119** verificações (80 anteriores + 39 D+30), zero divergências; 117 clones/702 métricas preservados, quatro antecessores congelados íntegros, comparáveis 43/31/19/24.
- Sessão autenticada recuperada no Chrome habitual. Primeiro relatório completo real gerado em produção às **14:43 BRT**: versão 13, 44 professores, conversão pontuando 28, Valdo 9 matrículas, presença 74,6%, sem MRR, classificação diagnóstica. Sem erro de console; aviso Tailwind preexistente. Os quatro relatórios locais ainda dependem da publicação da interface atual.

### Documentos de Jun–Ago após regularização D+30

| Escopo | Versão | Documento | Hash |
| --- | ---: | --- | --- |
| Consolidado | 13 | a264b7be-82cb-4fe8-a282-f821fdb4e5b4 | 26a4e12e5f07bef97f9bf142a2081a53e4bc8afc6dbfa13a41d71f961a1d1478 |
| Campo Grande | 13 | 8df93698-7632-42bb-b430-71cf8eae7a41 | d2bdc1cef444afacd12b775dbfb615e544ed3eab8d270d95d59b8aeafdde3b84 |
| Barra | 11 | 7d731242-3176-4ff4-a00c-7da0e40fda5a | bb90ef4695c8494712477c31ef49d7ab2efe640027b70f6d60f8c94904541224 |
| Recreio | 11 | 91e2a644-75d3-47ca-8d7a-beda36103cac | c7ba0b8d76f5f477daedbe1acb74c021a414a378cc72577f6c1f346165418beb |

Todos são documentos retificados imutáveis, mas **não** publicação oficial do Health Score. A data de 30/09 é condição mínima, não liberação automática de premiação.

## Migrations aplicadas

- `20260909142301_coordenacao_confiabilidade_total`.
- `20260909143251_coordenacao_presenca_amostra_observada`.
- `20260909150854_coordenacao_presenca_universo_historico`.
- `20260909152432_coordenacao_conversao_fonte_unica`.
- `20260909153158_coordenacao_conversao_comprovacao_matricula`.
- `20260909154828_coordenacao_batch_diario_atomico`: funções preparadas sem ativação embutida. Após dois ensaios reais bem-sucedidos, configurador ativado separadamente: job 257 diário às 08:00 UTC (05:00 BRT); jobs 249–256 desativados, com IDs/configurações/histórico preservados. Os 11 jobs de HS, alertas e captura mensal conferidos permaneceram ativos e inalterados.
- `20260909160323_health_score_v3_diario_estado_persistencia`: adapta somente os rótulos abertos ao estado persistível, sem ampliar CHECK ou publicar ranking.
- `20260909163722_coordenacao_presenca_aberta_evidencia_corrente`: preserva e captura contadores detalhados em novos documentos abertos; exige período/corte/código de evidência correntes e igualdade por professor entre fonte e documento. Corpo anterior conferido antes do DDL; ACL permanece restrita a postgres/service_role. Sem backfill na migration.
- `20260909173658_coordenacao_d30_regularizacao_governanca`: DDL curta com gates D+30/frescor/timezone; regularização privada em chamada posterior explicitamente autorizada e testada. Nome local alinhado ao remoto sem alterar os bytes aplicados.

A primeira retificação corrigiu o recorte que terminava antes de 31/08 e publicou os comparáveis. A segunda incorporou a guarda de conversão declarada sem matrícula comprovada. Nenhum registro anterior foi sobrescrito em seus números/evidências.

## Preservação histórica

- Primeira retificação: 12/12 snapshots antigos conservaram score, configuração, cobertura, criação e métricas.
- Segunda retificação: 117/117 snapshots substituídos conservaram os mesmos campos e todas as métricas. Somente a invalidação formal retirou sua publicação corrente; `publicado` histórico permaneceu verdadeiro.
- Evidências comparadas por `md5(string_agg(to_jsonb(m)::text, ',' order by m.metrica))`.
- Oito domínios alheios à Coordenação conservaram contagens/hashes no primeiro checkpoint: alunos_admin, alunos_executivo, comercial, programa_fideliza, programa_matriculador, relatorio_admin_mensal, relatorio_comercial_mensal e relatorio_gerencial.
- Comparação documental: `md5(string_agg(id::text || payload_hash, ',' order by id))`, mesmo trimestre.

## Versões de Jun–Ago conferidas no navegador

| Escopo | Versão | Equipe / comparáveis | Presenças / elegíveis | Saídas | MRR com valor informado |
| --- | ---: | ---: | ---: | ---: | ---: |
| Campo Grande | 12 | 32 / 31 | 3.533 / 4.907 | 84 | R$ 31.165,00 |
| Barra | 10 | 20 / 19 | 2.036 / 2.719 | 19 | R$ 6.776,00 |
| Recreio | 10 | 24 / 24 | 3.331 / 4.311 | 49 | R$ 15.589,95 |
| Consolidado | 12 | 44 / 43 | 8.900 / 11.937 | 152 | R$ 53.530,95 |

Os seis eventos de vínculos locais históricos antes omitidos foram recuperados no universo de presença: Leonardo em CG (0/1) e Jonathan no Recreio (1/5). Não foram reativados vínculos nem promovidos professores ao ranking local.

- Presença consolidada: 74,6%, com 12.756 ocorrências observadas; 819 fora do cálculo, 161 incompletas e 160 com conflito. Sinalizações podem se sobrepor; não são falsa ausência de aulas nem pendência zerada.
- Conversão: 124/302 = 41,1%; 31 professores com amostra mínima, 28 efetivamente pontuando, seis sem experimental e sete abaixo da amostra mínima. A expectativa antiga de 27 foi superada pelo recorte integral, não fixada artificialmente.
- Média comparável: 80,2. As notas mudaram por retificação de período/evidência, não para reproduzir o relatório anterior.
- Matrículas comerciais: 162 no trimestre; Valdo 9 (6 CG + 3 Recreio), Erick 19. Indicador distinto de conversão pós-experimental.
- Saídas: 119 evasões + 33 não renovações = 152, sendo 15 atribuíveis. Há 14 valores de MRR não informados, quatro atribuíveis. R$ 4.365,00 é a soma atribuível conhecida, não total completo.
- Carteira: 1.189,01 vínculos médios de acompanhamento; 3.006 turmas operacionais e 2.667 amostras de turmas nas médias individuais. Os recortes recebem rótulos distintos.
- Os quatro documentos de ciclo têm hash válido. Os 24 documentos mais recentes (quatro escopos × quatro meses + dois ciclos) também passaram na integridade após a primeira captura conjunta. Setembro mensal/ciclo: 120 pares professor/escopo, 720 métricas numéricas sem divergência, nenhum score divergente, nenhuma flag oficial e nenhuma competência futura na presença.

## Verificação executada

- `npm test` completo terminou com exit 0, incluindo testes PostgreSQL descartáveis. A última suíte específica de Coordenação terminou com **242 testes Node e 26 testes Deno aprovados**, zero falhas/skips (Node: 194,727 s).
- Batch diário: 40 testes PostgreSQL aprovados, zero falhas/skips; duas conexões comprovam fotografia única, rollback integral, locks, preservação de finais, fallback de baseline e ativação separada.
- Revisão independente TS/Edge: nenhum novo achado Critical/Important; 23 testes Deno e 70 Node aprovados pelo revisor.
- Auditoria independente às 16:00:20 UTC: 80/80 verificações passaram em `scripts/verify-coordenacao-jun-ago-paridade.sql`; 720/720 métricas exatas (valores, amostras, pesos e detalhes), IDs/scores sem faltantes/excedentes e nove origens comerciais íntegras. Os oito domínios alheios mantiveram 129 registros e hashes iguais à baseline capturada nesta auditoria.
- Auditoria repetida pelo agente principal às **16:29:45 UTC**, após o batch diário: novamente 80/80, zero divergências nas 720 métricas, mesmos quatro documentos de Jun–Ago e mesmos 129 registros/hashes nos oito domínios alheios.
- Última repetição pelo agente principal às **16:51:32 UTC**, após a captura final dos detalhes de presença: 80/80 novamente, mesmas 720 métricas e mesmos IDs/hashes/contagens dos oito domínios alheios. A comparação é contra a baseline capturada nesta auditoria, não uma prova anterior a todas as retificações.
- Renderizador completo executado offline com os quatro documentos reais: 44/32/20/24 professores completos, 5/5/5/4 prioridades cobertas uma vez e contador de conversão 28/15/10/16. Zero requisições remotas. A cópia temporária local foi removida; documentos originais preservados.
- Após corrigir as mensagens operacionais, renderizador completo passou com **24 documentos reais** (quatro meses + dois ciclos × quatro escopos), preservando equipe, prioridades e contadores exatos em todos. Zero requisições remotas; cópia temporária removida. Essa execução offline não substitui deploy/geração autenticada da Edge.
- Build Vite final após correção do seletor e mensagem operacional: 4.790 módulos, exit 0, 16,55 s; avisos de bundle/importação preexistentes.
- Navegador real autenticado no preview: **16 gerações de Jun–Ago** (quatro relatórios × quatro escopos) e **48 gerações mensais de junho/julho/agosto** passaram, após reload. Conferidos conteúdo não vazio, versão, equipe e estados; ausência de ranking oficial mensal.
- Setembro: após a captura conjunta, passaram **32 gerações** (quatro relatórios × mensal/ciclo × quatro escopos), igualdade integral das quatro tabelas mensal/ciclo e conferência de competência/equipe/versão/estado. Após reload: zero erros de console/runtime e zero HTTP >= 400. São 96 combinações de relatório/período/escopo verificadas somando as rodadas de Jun–Ago e mensais históricos; o relatório completo com IA continua fora dessa prova.
- Screenshot de Jun–Ago capturada e inspecionada; a tela renderiza normalmente. Isso não é prova de deploy de frontend.
- `git diff --check` sem erros; avisos CRLF não representam falhas.
- Produtores/retificador/batch privados: sem execução por anon/authenticated. Nenhuma ampliação de acesso público.

## Falha encontrada pelo ensaio diário real

O batch em REPEATABLE READ foi testado com rollback e limite de 110 s. Falhou em 13,55 s no primeiro HS mensal de CG; nada parcial persistiu. Causa isolada: o produtor devolve `estado=em_andamento`, mas o materializador diário tenta gravar esse valor diretamente no campo cujo CHECK permite apenas `provisorio/em_maturacao/fechado/invalidado`. O campo próprio `estado_publicacao` aceita o acompanhamento.

Adaptador corrigido, com 18 testes PostgreSQL reais aprovados, incluindo controle negativo antigo, mensal/ciclo, chamada direta/preparada e preservação de CHECK/ACL/flags. Novo ensaio com rollback passou em 81,174 s. Execução definitiva passou em 69,301 s (67,871 s medidos no SQL), com commit conjunto dos oito documentos preview e 240 snapshots de HS. Nenhum ciclo aberto foi publicado. Só então o agendamento foi ativado.

## Defeito adicional encontrado no navegador

A troca de Agosto mensal para Ciclo mostrava Jun–Ago mas consultava a chave documental `2026/8`, inexistente. O modal agora normaliza a chave pelo início do período usando o calendário compartilhado, inclusive dezembro do ano anterior em janeiro/fevereiro. Controle negativo: três testes falharam antes; cinco testes específicos passaram depois. Navegador confirmou RPC 200 com `p_ano=2026,p_mes=6,p_periodicidade=ciclo` e relatório de presença versão 12 completo. Screenshot do modal capturada e inspecionada. Os dois erros de console da reprodução antiga não são falhas novas; verificar novamente após reload para a evidência final.

## Detalhes identificados na inspeção final de setembro

- A mensagem técnica `fonte_canonica_sem_evidencia` não tinha tradução no helper público e vazava o motivo interno. Adicionada tradução operacional sem alterar valores/estado: controle negativo falhou antes; 38 testes de frontend/Performance/seletor passaram depois.
- No renderizador completo, ausência de dado não é descrita como ausência de aulas; permanência sem vínculo encerrado não recebe descrição de retenção. Teste negativo reproduziu os dois ruídos; 26 testes Deno passaram após ajustar somente a apresentação, sem requisições remotas nos testes da Edge.
- O agregador de evidência corrente preserva valores e competências da presença, mas não carrega os contadores de ocorrências fora do cálculo/incompletas/conflito. O wrapper documental tratava essa ausência como desconhecida, porém os dados existem na mesma fonte. Correção adicional aplicada ao produtor; 19 testes PostgreSQL e revisão independente aprovados. Benchmark com rollback: **84,170 s**. Execução definitiva: **73,822 s**, com guarda adicional exigindo os quatro contadores numéricos e ambas as flags oficiais falsas nos oito documentos antes do commit.
- Versões abertas finais mensal/ciclo: Campo Grande **14/15**, Barra **12/12**, Recreio **12/14**, Consolidado **11/12**. Renderizador completo offline passou novamente nos oito documentos finais, sem requisições remotas; cópia temporária removida.
- Auditoria independente READ ONLY às **16:45:40 UTC**: 240/240 registros professor/documento com numeradores e denominadores iguais à fonte; 2.160/2.160 contadores detalhados numéricos e exatos; nenhum ID ausente ou duplicado. As oito agregações estão corretas e sem flags oficiais. Integridade: 24/24 hashes válidos e 16/16 documentos históricos Jun–Ago com IDs/versões/hashes inalterados.
- Contadores finais fora do cálculo / incompletos / conflitos: CG **123/44/44**, Barra **13/1/1**, Recreio **9/0/0**, Consolidado **145/45/45**. Sinalizações podem se sobrepor. Presenças elegíveis mensais/ciclo: CG **376/391**, Barra **214/285**, Recreio **308/391**, Consolidado **898/1.067**; os três escopos somam exatamente o consolidado.
- Repetição final no navegador após o último commit documental: **32/32 gerações**, **4/4 tabelas mensal/ciclo idênticas**, zero erros de console/runtime e zero HTTP >= 400 após reload. Verificados os contadores preenchidos, as versões finais, os 44 professores no consolidado e o estado em acompanhamento. Capturas `output/playwright/coordenacao-set-nov-presenca-final.png` e `output/playwright/coordenacao-set-nov-tabela-final.png` inspecionadas. Isso encerra a repetição de setembro dentro das 96 combinações; não é prova de deploy nem do quinto relatório com IA.
- O catálogo cresceu por uma migration concorrente alheia a esta tarefa (`20260909163318`, função `sol_caixa_resolver_pagamento_v1`). Nenhuma alteração foi feita nessa frente; o wrapper de presença conserva assinatura única/OID e ACL privada.
- Destaque vazio não prova ausência de registros. O renderizador completo agora informa apenas que não há destaque disponível; caso negativo reproduzido antes de ajustar a mensagem.

## Ainda não comprovado / não liberado

- Repetição autenticada dos cinco relatórios atuais em todos os escopos/períodos selecionados, após publicar a interface; o primeiro completo já gerou corretamente na sessão Chrome recuperada.
- Commit/PR/merge/deploy e validação do frontend publicado.
- Não declarar “100% concluído” antes de fechar esses gates.
