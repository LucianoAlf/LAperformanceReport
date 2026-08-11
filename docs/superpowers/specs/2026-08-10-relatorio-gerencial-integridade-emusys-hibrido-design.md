# Relatório gerencial — integridade Emusys e destaques híbridos

**Data:** 10/08/2026

**Status:** desenho funcional aprovado em conversa; aguardando revisão deste documento antes do plano de implementação

**Escopo:** relatório gerencial mensal, metas operacionais, cobertura comercial, comparativos, destaques de professores, Lead ID, reconciliação de experimentais e preservação do histórico de aulas/presença

## 1. Objetivo

Fazer o relatório gerencial publicar somente números, comparações e classificações sustentados por uma fonte canônica, um grão explícito e uma cobertura mensurável. A implementação também deve completar a identidade Emusys que já existe nos payloads de matrícula e corrigir reconciliações que hoje geram lacunas falsas.

O caso de aceite principal é o fechamento do Recreio de julho/2026. Ele deve deixar de:

- usar metas do Fideliza como se fossem metas operacionais;
- afirmar crescimento, redução ou proximidade sem comparativo equivalente;
- somar histórico indisponível com lead realmente sem curso;
- omitir distribuições já presentes no payload;
- apresentar rankings vazios sem explicar o ciclo parcial;
- perder Lead ID disponível no Emusys ou manter experimental como pendente quando o ID da aula já coincide.

## 2. Decisões aprovadas

1. O ranking seguirá o modelo híbrido A:
   - ranking oficial somente para ciclo fechado, oficial e habilitado;
   - no mês, seção separada `Destaques mensais parciais (não oficiais)`;
   - destaque parcial nunca será chamado de ranking, premiação, campeão ou colocação oficial.
2. Snapshots fechados e configurações ativas do Health Score Professor V3 permanecem imutáveis.
3. Nenhum backfill remoto, retificação histórica, deploy ou publicação faz parte desta etapa local. Esses atos terão gate próprio depois da revisão dos resultados.
4. O relatório não inferirá curso de interesse declarado a partir do curso da experimental ou da matrícula.
5. Todo ID Emusys será tratado no escopo da unidade.
6. Ausência na API corrente não autoriza apagar aula, roster ou presença histórica já capturada.

## 3. Grãos e identidades

O contrato deve nomear o grão de cada número para impedir somas aparentemente contraditórias:

| Domínio | Grão canônico |
|---|---|
| Pessoa comercial | lead local, escopado por unidade |
| Aluno operacional | linha de `alunos`; não representa pessoa universal |
| Pessoa aproximada no relatório | pessoa consolidada pela chave canônica vigente do fechamento, nunca por nome isolado |
| Matrícula Emusys | `(unidade_id, emusys_matricula_id)` |
| Jornada | `(unidade_id, emusys_matricula_disciplina_id)` |
| Aula | `(unidade_id, emusys_aula_id)` |
| Presença | aluno local + aula Emusys; fallback legado apenas quando não existe ID de aula |
| Métrica de professor | professor + competência/ciclo + pilar + versão de regra |

No caso Recreio/julho, o relatório deve explicar separadamente:

- 17 novos alunos-base;
- 18 pessoas com matrícula comercial no recorte;
- 19 linhas operacionais de matrícula, incluindo cursos adicionais.

Uma distribuição por curso deve dizer qual desses grãos usa; não poderá ser comparada diretamente a outro total sem esse rótulo.

## 4. Arquitetura da entrega

A implementação será dividida em três gates versionados, testados e revisáveis.

### Gate 1 — contrato e renderização gerencial

O produtor canônico passa a expor estruturas separadas e aditivas:

- `metas.operacionais`: fonte `metas_kpi`, por unidade e competência;
- `metas.fideliza`: configuração do programa Fideliza+;
- `metas.matriculador`: configuração do Matriculador+;
- `comercial.cobertura_curso_interesse`;
- `comercial.leads_por_canal`;
- `comercial.matriculas_por_curso`;
- `comparativos.disponibilidade`, `comparativos.motivo` e, quando elegíveis, métricas comparáveis;
- `rankings.oficiais` e `rankings.destaques_mensais_parciais` como conceitos distintos.

Campos legados necessários a consumidores antigos podem permanecer durante a transição, mas não poderão ter semântica ambígua. O renderer novo consumirá somente os campos separados.

### Gate 2 — identidade e reconciliação Emusys

O sincronizador de matrículas passará a ler `mat.aluno.lead_id` do payload Emusys e conciliá-lo com `alunos.emusys_lead_id`.

Regras:

1. preencher automaticamente valor local nulo quando a matrícula Emusys casar exatamente no escopo da unidade;
2. manter valor local idêntico sem nova escrita;
3. quando o valor local não nulo divergir do Emusys, registrar divergência auditável e não sobrescrever silenciosamente;
4. nunca reconciliar por nome quando houver chave externa exata;
5. preservar múltiplos cursos e homônimos, sem consolidar linhas operacionais indevidamente.

A conciliação de experimentais será ordenada por força da chave:

1. `(unidade_id, emusys_aula_id)` exato;
2. `emusys_lead_id` + data e demais campos estáveis, quando não houver ID de aula;
3. horário como fallback tolerante e auditável, nunca como veto a um ID exato.

Os casos reais com diferenças de 240 e 30 minutos devem deixar de aparecer como pendentes quando o ID da aula coincide.

### Gate 3 — comparabilidade e preservação histórica

Comparativos mensais só serão publicados quando os dois lados forem fechamentos equivalentes. A elegibilidade exigirá:

- ambos os snapshots fechados e íntegros;
- mesma unidade e mesmo domínio;
- mesma definição de população e grão;
- mesma versão de regra, ou migração de equivalência explicitamente versionada;
- mesma semântica de competência;
- cobertura mínima exigida pela métrica.

O contrato deverá guardar um fingerprint de comparabilidade ou os componentes necessários para calculá-lo deterministicamente. Se qualquer requisito falhar, a saída será `indisponível` com motivo estruturado; não haverá linguagem temporal na narrativa.

Para aulas, roster e presença, a API corrente será tratada como estado atual, não como autoridade para apagar história. O modelo deverá distinguir ao menos:

- visto no snapshot corrente;
- ausente no snapshot corrente;
- movido de competência/data;
- cancelado, justificado ou reagendado;
- histórico preservado do fechamento.

Qualquer proposta de backfill ou tombstone será aditiva, começará em modo `dry-run` e dependerá de aprovação separada antes de gravar dados reais.

## 5. Metas e programas

O relatório deve comparar cada indicador à fonte correta:

- gestão/comercial usa `metas.operacionais`;
- bloco Fideliza+ usa somente `metas.fideliza`;
- bloco Matriculador+ usa somente `metas.matriculador`.

Para Recreio/julho, o reajuste médio de 8,13% deve ser avaliado contra a meta operacional de 10%, não contra os 7% do programa Fideliza+. As duas leituras podem coexistir em blocos diferentes, com títulos e fontes explícitos.

Meta ausente será publicada como `meta não cadastrada`. Zero não será usado como substituto de ausência.

## 6. Cobertura de curso de interesse

`comercial.cobertura_curso_interesse` deverá conter, no mínimo:

- `total_leads`;
- `detalhamento_disponivel`;
- `detalhamento_indisponivel`;
- `curso_declarado_informado`;
- `curso_declarado_ausente`;
- percentuais calculados sobre denominadores nomeados;
- versão e fonte da regra.

No fechamento principal, o contrato esperado é:

- total: 297;
- detalhamento disponível: 296;
- detalhamento histórico indisponível: 1;
- curso declarado informado: 120;
- curso declarado ausente: 176.

O renderer mostrará cobertura e ausência separadamente. O item indisponível não será somado aos 176 leads realmente sem curso.

## 7. Distribuições já disponíveis

O relatório passará a renderizar:

- leads por canal;
- matrículas por curso;
- as distribuições já existentes de interesse por curso e matrícula por canal.

Cada lista mostrará seu total e grão. Soma diferente de outro indicador não será tratada automaticamente como divergência; será validada contra o grão declarado.

## 8. Ranking oficial e destaques mensais parciais

### 8.1 Ranking oficial

Só existe quando o contrato do ciclo informa simultaneamente:

- ciclo fechado;
- `estado_publicacao = oficial`;
- `ranking_habilitado = true`;
- snapshot publicável e íntegro.

O relatório usa exclusivamente esse snapshot fechado. Configuração ativa posterior não recalcula nem reordena o ciclo encerrado.

### 8.2 Destaques mensais parciais

Durante ciclo em acompanhamento, o relatório pode mostrar valores mensais observados, desde que:

- a métrica individual seja publicável;
- a amostra e a cobertura sejam exibidas;
- a regra e a competência estejam identificadas;
- não exista numeração ordinal competitiva;
- o título contenha explicitamente `parciais` e `não oficiais`;
- ausência de base não vire zero.

Permanência, conversão, presença e média de alunos por turma podem ter coberturas diferentes. Cada destaque usa seu próprio conjunto elegível e informa `N de 24 professores` ou denominador equivalente. O relatório não misturará uma leitura viva de presença com o snapshot mensal usado nos demais pilares.

## 9. Narrativa determinística e IA

Os números, estados de meta, cobertura, elegibilidade e comparabilidade serão calculados antes da chamada ao modelo. A IA poderá somente redigir a narrativa dentro das evidências fornecidas.

Quando `comparativos.disponibilidade` não for `disponível`, o prompt e o pós-processamento bloquearão expressões temporais não sustentadas, incluindo afirmações de aumento, redução, crescimento, queda, melhora, piora e proximidade ao previsto. Conquistas, pontos de atenção e plano de ação devem citar fatos presentes no payload, sem criar tendência.

O fallback determinístico também obedecerá ao mesmo gate. Uma validação final rejeitará narrativa incompatível e usará o fallback seguro em vez de publicar texto inventado.

## 10. Motivos de saída

Motivos serão agrupados por identificador canônico ou rótulo normalizado, não pelo texto bruto com diferença de caixa e acentuação. O relatório preservará um rótulo de apresentação único e a soma rastreável dos registros de origem.

No caso principal, `Dificuldade financeira` e `Dificuldade Financeira` devem formar uma única linha com total 4.

## 11. Falhas e auditoria

- Fonte ausente gera estado explícito, não zero.
- Divergência de Lead ID gera registro de auditoria, não sobrescrita silenciosa.
- Chave externa exata prevalece sobre horário e nome.
- Cobertura abaixo da política bloqueia classificação competitiva, mas pode manter evidência parcial identificada.
- Falha da IA usa narrativa determinística segura.
- Snapshot/hash inválido bloqueia comparativo e ranking oficial.
- Toda migration será aditiva, com ACL nominal revisada; funções recriadas não poderão reabrir `EXECUTE` para `anon`.
- Retificação futura deverá encadear a versão corrigida mais recente e nunca partir do payload original quando já houver outra retificação.

## 12. Testes obrigatórios

### Contrato e renderer

- reproduzir o payload real de Recreio/julho com ciclo parcial e metas Fideliza separadas das operacionais;
- provar que reajuste 8,13% falha contra 10% em Gestão e supera 7% somente no Fideliza+;
- provar a divisão 120/176/1 e os percentuais de cobertura;
- renderizar leads por canal e matrículas por curso;
- distinguir 17 alunos-base, 18 pessoas e 19 linhas operacionais;
- consolidar os dois textos de dificuldade financeira em uma linha;
- não publicar linguagem temporal quando o comparativo é indisponível;
- publicar comparativo somente com fingerprints equivalentes;
- publicar destaques parciais sem ordinalidade e ranking oficial apenas no ciclo fechado.

### Emusys e domínio do aluno

- matrícula com Lead ID e campo local nulo preenche o valor correto;
- matrícula com Lead ID idêntico é idempotente;
- Lead ID divergente é auditado e preserva o valor local;
- dois cursos do mesmo aluno permanecem duas linhas operacionais;
- mesmo ID externo em duas unidades não cruza dados;
- homônimos não são conciliados por nome;
- experimental com ID de aula exato casa apesar de diferença de 240 minutos;
- experimental com ID de aula exato casa apesar de diferença de 30 minutos;
- fallback sem ID de aula continua exigindo evidência temporal suficiente.

### Histórico e banco

- snapshot fechado permanece byte a byte inalterado;
- ausência na API corrente não apaga aula/presença histórica;
- aula movida é classificada, não duplicada nem removida sem trilha;
- presença de aluno com dois cursos não é duplicada entre disciplinas;
- ACL de RPC/migration nega `anon` e mantém somente os papéis esperados;
- scripts de backfill executam em `dry-run` por padrão e não escrevem sem confirmação explícita.

## 13. Documentação e observabilidade

O mesmo commit que alterar produtor, renderer, RPC ou Edge atualizará:

- `docs/REGRAS-DE-NEGOCIO.md`;
- `docs/METRICAS.md`;
- `docs/MAPA-INTEGRACAO-EMUSYS.md`;
- `docs/MAPA-SISTEMA.md`, quando o consumidor ou fluxo de página mudar.

O payload incluirá fontes, versões de regra, denominadores e motivos de indisponibilidade suficientes para auditar cada bloco sem depender do texto da IA.

## 14. Rollout em gates

1. Especificação e plano aprovados.
2. RED/GREEN local do Gate 1, sem banco remoto.
3. RED/GREEN local do Gate 2, incluindo payloads reais anonimizados.
4. RED/GREEN local do Gate 3 e testes PostgreSQL em ambiente isolado.
5. Auditoria do diff, migration dry-run e comparação com definições remotas vigentes.
6. Aprovação humana separada para aplicar migration/backfill.
7. Aprovação humana separada para publicar Edge e frontend.
8. Validação pós-publicação, primeiro por contrato e depois ponta a ponta em caso real.

Falha em um gate interrompe o avanço; não haverá `--include-all`, reescrita de snapshot fechado nem correção produtiva improvisada.

## 15. Critérios de aceite

- os seis itens recomendados estão cobertos por testes reproduzíveis;
- o relatório de Recreio/julho apresenta metas corretas, cobertura honesta e blocos existentes antes omitidos;
- nenhuma tendência é afirmada sem fechamento comparável;
- ranking oficial e destaque parcial são visual e semanticamente distintos;
- os 24 professores podem ter evidências mensais sem promoção indevida a ranking oficial;
- Lead ID novo é capturado no sync, com identidade escopada pela unidade e divergência auditável;
- falsas pendências de experimental por horário deixam de existir quando há ID exato;
- histórico de aulas e presença não é destruído pela fotografia corrente da API;
- nenhuma configuração ativa ou snapshot fechado é alterado;
- nenhuma escrita remota ou publicação ocorre sem o próximo gate explícito.
