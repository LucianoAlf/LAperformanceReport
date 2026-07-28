# Contratos vencendo (Renovação de Matrículas) — desenho aprovado

> **Nota:** este documento substitui integralmente a primeira versão deste spec (commits `3201ee0` e `595bff3`), que desenhava a feature em cima de chamada ao vivo à API do Emusys. A investigação no banco mostrou que quase todo o dado já está sincronizado localmente, e o desenho mudou para uma view SQL. O histórico da versão anterior fica no git.

## Objetivo

O Emusys tem a tela **Escola → Renovação de Matrículas**, que lista as matrículas com contrato acabando nos próximos N dias e quantas aulas faltam para cada uma. O Arthur usa essa tela no dia a dia para saber quem abordar para renovação e hoje precisa sair do report para vê-la. O pedido é ter isso dentro do LA Report, num item ao lado de **Entrada** — "Contratos".

## Descoberta que definiu o desenho

O desenho inicial previa buscar tudo ao vivo na API do Emusys. Investigando o banco, ficou claro que **quase todo o dado já está sincronizado localmente**:

Rodando o recorte "Barra, próximos 30 dias" direto em `vw_jornada_aluno_atual` (view já em produção, alimentada pelo cron `sync-matriculas-*` de 02h), o resultado foi **os mesmos 16 alunos, mesmas datas** que a chamada ao vivo à API e que o print da tela do Emusys. A view estava fresca no momento da checagem (sync mais recente no mesmo dia; 16 de 1224 linhas com mais de 48h).

Logo: a feature é essencialmente **uma query SQL**, não uma integração nova. A única peça que de fato falta localmente é o vencimento da última fatura.

## Escopo

Só a aba **"Matrículas Vencendo"** da tela do Emusys, em modo leitura. As outras duas abas ficam fora por limitação da API (ver "Fora de escopo").

**Grão = matrícula, não pessoa** — regra já canônica no projeto. Um aluno com dois cursos aparece em duas linhas, com contratos independentes. Confirmado no dado real: Mariana Herd Giglio (Barra) tem Teclado terminando em 21/11/2026 e Canto em 15/08/2026; só a de Canto entra na janela de 30 dias.

## Fonte de cada coluna

| Coluna | Origem | Já existe? |
|---|---|---|
| Aluno | `vw_jornada_aluno_atual.aluno_nome` | ✅ |
| Curso | `vw_jornada_aluno_atual.curso_nome` | ✅ |
| Professor | `vw_jornada_aluno_atual.professor_nome` | ✅ |
| Data da Matrícula | `alunos.data_matricula` | ✅ |
| Última Aula | `vw_jornada_aluno_atual.data_ultima_aula` | ✅ |
| Nr. de Aulas Restantes | `vw_jornada_aluno_atual.nr_aulas_futuras` | ✅ |
| Valor | `alunos.valor_parcela` | ✅ |
| Telefone / WhatsApp | `alunos.telefone` / `alunos.whatsapp` | ✅ |
| **Venc. Última Fatura** | **derivada de campos do contrato (ver §2)** | ⚠️ 3 colunas novas na jornada |
| **Inadimplente** | `vw_jornada_aluno_atual.inadimplente_emusys` (coluna nova, ver §3) | ⚠️ 1 coluna nova na jornada |

### Por que `vw_jornada_aluno_atual` e não `alunos.data_fim_contrato`

`alunos.data_fim_contrato` **não é confiável** para esse recorte. Medição em 28/07/2026, cruzando por `(unidade_id, emusys_matricula_id)` — 1171 matrículas ativas casadas:

| Situação | Qtd |
|---|---|
| `data_fim_contrato` bate com o Emusys | 963 (82,2%) |
| **Diverge** | **208 (17,8%)** |
| — local atrasado (contrato já renovado no Emusys, não atualizado aqui) | 188 |
| — local adiantado | 20 |

E o efeito direto no recorte que interessa:

- **14 matrículas** estão vencendo nos próximos 30 dias segundo o Emusys e **não apareceriam** filtrando por `data_fim_contrato`;
- **14 matrículas** o campo local diz "vencido" quando o contrato segue ativo;
- **zero falsos positivos** — quando o campo local aponta vencimento em 30 dias, ele está certo. O problema é só de omissão.

A causa é conhecida: o `sync-matriculas-emusys` **nunca escreve `data_fim_contrato` sozinho** — ele chama `sugerirCampoRevisao('data_fim_contrato', …)`, ou seja, propõe para aprovação humana na Conciliação. Renovação que ninguém aprovou na fila fica com a data velha indefinidamente.

Casos concretos verificados contra o print do Emusys: Caique Feijó de Lima Vieira (`alunos` diz 16/07/2026; Emusys e print dizem 04/08/2026) e Natan Pereira Calvo Demidoff (`alunos` diz 04/07/2026; Emusys e print dizem 08/08/2026 — e essa linha ainda está com `emusys_matricula_id` NULL, sem vínculo).

Por isso a view nova lê a jornada, que é reconstruída do Emusys a cada sync.

### Curso: divergência esperada com a tela do Emusys

`vw_jornada_aluno_atual.curso_nome` traz a **disciplina atual**; `alunos.curso_id` traz o curso original, que congela quando o aluno troca de instrumento — comportamento já documentado no `CLAUDE.md`. Exemplo real: Carlos Vitor Pinheiro da Silva aparece como **Violão** na tela do Emusys e em `alunos`, e como **Guitarra** na jornada.

Decisão: **exibir a disciplina atual** (jornada), porque é o que o aluno de fato estuda hoje e é a informação útil para quem vai ligar. Consequência a registrar: nesses casos a coluna Curso **não vai bater** com a tela do Emusys, e isso é esperado — não é bug.

## Arquitetura

### 1. View `vw_contratos_vencendo`

Uma view nova, sem materialização, juntando o que já existe:

```
vw_jornada_aluno_atual  (base: aluno, curso, professor, última aula, aulas restantes)
  └─ LEFT JOIN alunos  ON (unidade_id, emusys_matricula_id::text)
       → data_matricula, valor_parcela, telefone, whatsapp
       → (colunas de contrato §2/§3 vêm da propria jornada, nao daqui)
WHERE status_matricula = 'ativa'
```

Um único join. Como as colunas de contrato da §2/§3 passam a viver na própria jornada, o `inadimplencia_emusys_cache` **sai do desenho** — ver §3. De `alunos` só vêm os campos de cadastro que o Emusys não fornece nesse recorte.

⚠️ **A chave de join é `(unidade_id, emusys_matricula_id)`, nunca só `emusys_matricula_id`.** Duas armadilhas reais, ambas medidas:

1. **Tipo diverge:** `vw_jornada_aluno_atual.emusys_matricula_id` é `bigint`; em `alunos` é `text`. Precisa de cast explícito.
2. **O ID do Emusys só é único dentro da unidade** — regra já canônica no projeto. Exemplos reais: o id `288` é Daniel Freire na Barra **e** Victor Alexandre no Recreio; o `475` é Mariana Herd na Barra **e** Guilherme Muniz no Recreio. Juntar só por `emusys_matricula_id` faz a view de 1224 linhas virar **1361** — mistura aluno de unidades diferentes silenciosamente, sem erro nenhum, só entregando dado errado.

Sem filtro de janela dentro da view: ela expõe `data_ultima_aula` e um `dias_ate_vencimento` calculado, e **quem filtra 30/60/90 dias é a query da tela**. Assim a mesma view serve todas as janelas e não precisa ser tocada se o time pedir uma janela nova.

Segue o padrão de segurança das views do projeto (`security_invoker`, RLS herdada de `alunos`).

**Grão:** a view herda o grão da jornada, que é matrícula/disciplina. Existem 15 pares `(unidade, matrícula)` com mais de uma linha (mesmo contrato, duas disciplinas) — nesses casos a mesma data de fatura se repete nas N linhas. É o comportamento pretendido (a fatura é do contrato, não da disciplina), e está registrado aqui para não ser confundido com duplicata na verificação.

**O join com `alunos` é LEFT, não INNER, e NÃO filtra `alunos.status`.** Sob `inner join`, matrícula sem vínculo local ou com status local divergente sumiria da tela — exatamente o defeito que esta tela existe para corrigir. Medido:

| Critério do join | Casam | Sumiriam em 30d | Sumiriam em 90d |
|---|---|---|---|
| `inner join`, sem filtro de status | 1216/1224 | 1 | 3 |
| `inner join` + `alunos.status='ativo'` | 1184/1224 | 3 | 6 |
| **`left join`, sem filtro de status** | **1224/1224** | **0** | **0** |

Os casos perdidos são reais e relevantes: Natan Pereira Calvo Demidoff (`emusys_matricula_id` nulo em `alunos`) cairia fora do primeiro critério; Julia e Bento Cabral do Nascimento (Campo Grande, fim 20/08) cairiam fora do segundo, porque `alunos.status` diz `trancado` enquanto a jornada — fonte Emusys — diz `ativa`.

**Quem manda no "está ativo" é `vw_jornada_aluno_atual.status_matricula`** (reconstruído do Emusys a cada sync), não `alunos.status`. O `WHERE status_matricula = 'ativa'` da view já resolve isso; repetir o filtro do lado de `alunos` só reintroduziria a defasagem local que a §"Por que não `data_fim_contrato`" documenta.

**A view aplica `distinct on (unidade_id, emusys_matricula_disciplina_id)`.** Existem 2 casos de duas linhas ativas em `alunos` com o mesmo `emusys_matricula_id` **e** o mesmo `curso_id` na mesma unidade — João Pedro Costa (Barra, matrícula 744) e Leonardo Imperial (Barra, matrícula 784). Pelo `CLAUDE.md` isso é duplicata de cadastro, não segundo curso, e sob `left join` viraria linha repetida na tela. A view não corrige a duplicata (isso é trabalho de Conciliação), só evita propagá-la para a interface.

### 2. Venc. Última Fatura — derivada, sem sync novo

A primeira versão deste desenho previa uma tabela nova, uma edge nova, um cron novo e ~218 chamadas diárias a `GET /faturas`. Nada disso é necessário: **o vencimento da última fatura é derivável de campos que o Emusys já entrega no `contrato_atual`**, que o `sync-matriculas-*` já busca hoje.

```
venc_ultima_fatura = data_primeira_fatura + (nr_faturas - 1) meses,
                     com o dia substituído por dia_vencimento
                     (clampado ao último dia do mês quando necessário)

nr_faturas = 0 ou NULL  →  resultado NULL (sem parcela a projetar)
data_primeira_fatura NULL  →  resultado NULL
dia_vencimento > último dia do mês  →  clampar ao último dia (ex.: dia 31 em fevereiro)
```

`nr_faturas` NULL e `0` são estados distintos e ambos alcançáveis (o parser do sync usa `numeroOuNull`), mas para esta fórmula os dois levam ao mesmo resultado: coluna vazia.

**Validação contra o print real do Emusys (Barra, 28/07/2026): 11 de 11 corretos**, incluindo o caso do Rafael Mello dos Santos, que tem `nr_faturas = 0` e aparece com a coluna **vazia** na tela do Emusys — a fórmula devolve nulo, batendo também.

O detalhe que faz a fórmula funcionar é usar `dia_vencimento`, e não o dia de `data_primeira_fatura`: os dois divergem com frequência (Mariana Herd tem 1ª fatura em 02/08 mas vence dia 5; Caique e Gabriela têm 1ª fatura em 11/08 e vencem dia 5). Usando o dia da primeira fatura, 3 dos 11 saíam errados.

**O que precisa mudar:** quatro colunas novas em **`aluno_jornada_matricula_disciplina`** (a tabela por trás da `vw_jornada_aluno_atual`), preenchidas pelo `sync-matriculas-emusys`, que **já lê `contrato_atual` e portanto não faz nenhuma chamada a mais à API**:

| Coluna nova | Origem no payload |
|---|---|
| `nr_faturas` (integer) | `contrato_atual.nr_faturas` |
| `data_primeira_fatura` (date) | `contrato_atual.data_primeira_fatura` |
| `dia_vencimento_emusys` (integer) | `contrato_atual.dia_vencimento` |
| `inadimplente_emusys` (boolean) | `contrato_atual.inadimplente` (ver §3) |

⚠️ **Na jornada, não em `alunos` — e isso não é detalhe.** O `sync-matriculas-emusys` tem dois caminhos de escrita bem diferentes:

- **`alunos`**: passa por `setCampo`/`sugerirCampoRevisao`, que **não escrevem nada** — enfileiram sugestão para aprovação humana na Conciliação (decisão registrada no `CLAUDE.md`: "nada é alterado sem aprovação humana"). É exatamente por isso que `data_fim_contrato` está velho em 17,8% dos casos: ninguém aprovou a fila. Colocar as quatro colunas aqui significaria **1224 aprovações manuais** antes de a tela funcionar.
- **`aluno_jornada_matricula_disciplina`**: escrita **direta**, via `upsertJornadasEmLote` (`onConflict: unidade_id,emusys_matricula_disciplina_id`), sem fila. É o espelho bruto do Emusys, e já guarda campo de contrato (`qtd_contratos`) ao lado dos de disciplina.

A jornada é o destino certo pelos dois motivos: escreve sozinha e é a camada de dado bruto da origem, como manda o princípio 1 do Contrato Canônico. As quatro colunas são de contrato, então repetem nas N linhas de uma matrícula multi-disciplina — mesmo padrão do `qtd_contratos` que já está lá.

⚠️ **Por que `dia_vencimento_emusys` e não o `dia_vencimento` que já existe.** O campo atual **não é dado do Emusys** — é default de formulário. Está preenchido em 1187 de 1187 ativos, o que parece cobertura perfeita, mas **91,2% estão no dia 5** porque `ModalNovoAluno` grava `5` fixo (com `|| 5` no save) e `FormMatricula` usa `10`; nenhuma edge escreve esse campo. Comparando com o `contrato_atual.dia_vencimento` da API na Barra: **16 de 256 divergem (6,3%), e em 100% desses o local é 5 e o Emusys tem outro valor** (20, 8, 29, 9, 15, 30, 1, 6, 16…).

Isso invalida parcialmente a validação 11/11 acima: os 11 casos testados vencem todos no dia 5, então o teste não distinguia "valor real" de "default do formulário". A fórmula segue correta — errado era supor que o insumo já existia.

**Coluna nova em vez de sobrescrever**, por dois motivos: (1) `dia_vencimento` tem **vários escritores humanos** na UI (`TabelaAlunos` edição inline, `ModalFichaAluno`, `ComercialPage`, `ModalVincularAlunoTurma`), e um sync noturno passando por cima de edição manual — ou o contrário — é conflito sem precedência definida; (2) o princípio 1 do Contrato Canônico de Dados Pedagógicos é que dado bruto da origem não é reescrito por cima de dado local. Guardando lado a lado, a divergência fica **visível** e pode virar item de Conciliação depois, em vez de ser resolvida em silêncio a favor de um dos lados.

Consequência: a fórmula usa `dia_vencimento_emusys`, com fallback para `dia_vencimento` quando o Emusys não trouxer valor. Corrigir o `dia_vencimento` legado dos 16 alunos da Barra fica **fora de escopo** — vira achado, não tarefa desta feature.

**Por que não usar `emusys_faturas`.** Aquela tabela é peça de reconciliação financeira (Contas a Receber): tem trava no banco que rejeita qualquer fatura fora da competência do mês sincronizado (`FINANCEIRO_SYNC_PAYLOAD_INVALIDO`) e um detector de sumiço que **aborta a publicação** se o novo sync vier com mais de 20 (ou 5%) faturas a menos que o anterior. Serve para fechar o mês corrente, não para guardar parcela futura de contrato anual.

**Limite conhecido da fórmula:** ela projeta o cronograma contratado, não o extrato real. Se uma parcela for renegociada, cancelada ou adiada individualmente no Emusys, a fórmula não enxerga — continua devolvendo o vencimento previsto pelo contrato. Para o uso desta tela (saber quando a cobrança do contrato termina, para conversar sobre renovação) isso é suficiente, e é exatamente o que a tela do Emusys mostra. Se algum dia for preciso o extrato real fatura a fatura, aí sim entra consulta a `/faturas` — outra feature.

### 3. Inadimplente — fonte hoje quebrada

`inadimplencia_emusys_cache` **não está sendo alimentada**. Medido em 28/07/2026:

| Unidade | Linhas | Última escrita |
|---|---|---|
| Barra | 260 | 2026-07-15 |
| Recreio | 422 | 2026-07-15 |
| **Campo Grande** | **0** | **nunca** |

São 13 dias sem escrita, e Campo Grande nunca teve uma linha sequer. Os 9 crons (`sync-inadimplencia-{cg,barra,recreio}-{manha,tarde,noite}`) disparam e constam como `succeeded` em `cron.job_run_details` — ou seja, a edge `sync-inadimplencia-emusys` **está falhando em silêncio**. Do recorte de 218 matrículas com contrato acabando em 90 dias, só 128 (59%) têm linha no cache.

**Decisão: esta tela não usa o cache.** `contrato_atual.inadimplente` já é lido pelo `sync-matriculas-emusys` hoje (`index.ts:237`), no mesmo payload de onde vêm as três colunas da §2. Gravá-lo como `inadimplente_emusys` na jornada sai junto, elimina a dependência de um cache que não funciona e **resolve a lacuna de Campo Grande de imediato** — sem esperar o conserto.

Quando o campo vier nulo (matrícula sem vínculo local), exibir "—", nunca "em dia": ausência de registro não é prova de adimplência.

O `inadimplencia_emusys_cache` fica **fora do desenho** desta tela. Consertar a `sync-inadimplencia-emusys` continua necessário para quem já consome aquele cache, e vai para os achados abaixo — mas não bloqueia esta feature.

O conserto da `sync-inadimplencia-emusys` vai para a lista de achados (ver "Achados em produção").

### 4. Página `/app/entrada/contratos`

Tabela com as colunas da tabela de fontes acima, ordenada por `data_ultima_aula` crescente (quem vence primeiro no topo). Controles: seletor de janela (30 / 60 / 90 dias), filtro de unidade respeitando `canViewConsolidated()` / permissões do `AuthContext`, e busca por nome.

Como tudo vem do Postgres, o carregamento é instantâneo e não há limite de usuários simultâneos — não precisa de cache no cliente, de throttle, nem de tratamento de rate limit.

Indicar a frescura do dado a partir de `vw_jornada_aluno_atual.ultima_sincronizacao_emusys`, para o usuário saber que está vendo a foto do último sync e não o instante atual. Como todas as colunas passam a vir do mesmo sync de matrículas, uma única data serve para a tela inteira.

⚠️ **A coluna Valor é informativa.** O `CLAUDE.md` registra que a API às vezes embute o `desconto_fixo` no `valor_mensalidade` e que o flag `bolsa` não é confiável — é por isso que `valor_divergente` vai para fila humana na Conciliação. Exibir com tooltip e nunca usar como base de cálculo.

### 5. Card no `EntradaMenu`

Card "Contratos" em [EntradaMenu.tsx](../../../src/components/App/Entrada/EntradaMenu.tsx), seção **Retenção** (ao lado de Renovação / Evasão / Aviso Prévio), ícone `CalendarClock`. Rota nova em [router.tsx](../../../src/router.tsx) com lazy loading, igual às demais de `entrada/`.

## Achados em produção (fora de escopo, mas precisam ser registrados)

Dois problemas pré-existentes vieram à tona na investigação. Nenhum é causado por esta feature, nenhum é corrigido por ela, e os dois merecem decisão própria.

### A. A régua de renovação de Sucesso do Aluno está perdendo alunos

A view **`vw_renovacoes_proximas`** está **em uso em produção**: alimenta o `useMarcosJornada` ([useMarcosJornada.ts:61](../../../src/components/App/SucessoCliente/hooks/useMarcosJornada.ts)), que monta a régua de "prestes a renovar".

Ela é construída sobre `alunos.data_fim_contrato` — o campo que diverge do Emusys em 17,8% dos casos. Consequência prática: a régua hoje **deixa de fora 14 alunos** com contrato de fato vencendo em 30 dias. Falso positivo não é problema (são zero); o defeito é puramente de omissão — o time não é avisado de quem precisa renovar.

Duas saídas possíveis: (a) migrar a view para ler a jornada, corrigindo a régua de uma vez; ou (b) corrigir o preenchimento de `alunos.data_fim_contrato` na sync/webhook de renovação. A (a) é menor e mais direta, mas mexe em view com consumidor ativo — exige inventário de consumidores antes, conforme o princípio 9 do Contrato Canônico de Dados Pedagógicos.

### B. `sync-inadimplencia-emusys` falha em silêncio

Detalhado na §3: 13 dias sem escrita, Campo Grande com zero linhas desde sempre, e os 9 crons reportando `succeeded`. Uma edge que falha sem que nada acuse é o pior tipo de falha — vale investigar os logs dela e, de quebra, revisar se o alarme de saúde de crons (`useSaudeCrons`) cobre "cron rodou mas não gravou nada", que é o caso aqui.

## Riscos

O risco caiu bastante em relação ao desenho anterior, e de novo com a derivação da §2:

- **Zero chamada nova ao Emusys.** A tela lê Postgres; as colunas novas vêm de um payload que o sync já busca. Não há rate limit, não há timeout, não há limite de usuários simultâneos, não há edge nova nem cron novo. Todo o problema de concorrência do desenho anterior desapareceu.
- **A migration é 100% aditiva:** uma view nova e **quatro colunas novas** em `aluno_jornada_matricula_disciplina` (`nr_faturas`, `data_primeira_fatura`, `dia_vencimento_emusys`, `inadimplente_emusys`). Nenhuma sobrescreve campo existente — em particular, o `dia_vencimento` legado em `alunos` e seus vários escritores na UI ficam intocados (§2). Reverter é dropar a view e as quatro colunas.
- **O único ponto de atenção real é o `sync-matriculas-emusys`**, que precisa passar a gravar essas quatro colunas. É uma edge **em produção**, com cron ativo, e é o único lugar deste plano onde um erro atinge algo que já funciona. A alteração é aditiva (quatro campos a mais no upsert, todos já presentes no payload lido), mas exige o cuidado padrão do projeto: comparar o código deployado com o do repositório **antes** de editar, porque git ≠ produção.
- **Dado é foto do último sync, não tempo real.** "Aulas restantes" cai a cada aula realizada, então pode estar até um dia atrás do Emusys. Aceitável para decidir quem abordar, desde que a tela mostre a data do sync.
- **Uma coluna nasce com ressalva:** Valor pode vir bruto (§4), e precisa de tooltip e de nunca ser base de cálculo. Inadimplente deixou de ser ressalva ao sair do cache quebrado (§3).

## Verificação

Critério de aceite: comparar a tela contra o Emusys **no mesmo dia** (Escola → Renovação de Matrículas, modo "Usar Data da Última Aula", próximos 30 dias), nas três unidades.

Divergências **esperadas**, que não invalidam:

1. **Curso** pode diferir quando o aluno trocou de instrumento (jornada mostra a disciplina atual; o Emusys mostra a original) — ver §"Curso".
2. **Aulas restantes** pode estar 1 menor/maior conforme aulas ocorridas entre o sync e a conferência.
3. **Colunas de contrato vazias** ("—") em matrícula sem vínculo local — é o comportamento pretendido do LEFT join (§1), não falha.

⚠️ **Testar obrigatoriamente pelo menos 3 alunos cujo `dia_vencimento` real ≠ 5.** A validação 11/11 da fórmula caiu inteira em alunos que vencem dia 5 e por isso não distinguia valor real de default de formulário — o erro só apareceu quando o campo foi comparado contra a API. Repetir a conferência só com alunos do dia 5 reproduziria exatamente o mesmo ponto cego. Na Barra há 16 alunos nessa condição (dias 20, 8, 29, 9, 15, 30, 1, 6, 16), listáveis comparando `alunos.dia_vencimento` com `alunos.dia_vencimento_emusys` depois do primeiro sync.

Reproduzir a medição de divergência: agregar `vw_jornada_aluno_atual` (`status_matricula='ativa'`) por `(unidade_id, emusys_matricula_id)` com `max(data_ultima_aula)`, e juntar a `alunos` por **`(unidade_id, emusys_matricula_id::text)`** com `status='ativo'` — 1171 pares casados.

⚠️ Duas armadilhas que alteram o resultado, ambas cometidas na primeira medição deste spec: juntar **sem `unidade_id`** infla para 1361 pares, dos quais 177 (13%) casam com aluno de outra unidade; e não agregar por matrícula infla de novo, porque contrato multi-disciplina rende mais de uma linha. Com o critério errado a divergência aparentava 28% e 30 perdidos; com o correto é 17,8% e 14 perdidos.

Gates padrão do projeto: `node --check` no bundle da edge alterada antes do deploy, `get_edge_function` via MCP comparando o deployado com o repositório (antes e depois), e `npm run build` limpo.

## Fora de escopo

**Aba "Matrículas Renovadas"** (projeção de valores): as colunas *Data Primeira Aula Pós Renovação*, *Faturas Antes*, *Faturas Pós Renovação* e *Variação* dependem da **Tabela de Valores** da escola (versões de preço, reajustes, planos), que **não tem endpoint na API** — os lookups de configuração expostos (`/disciplinas`, `/professores`, `/salas`, `/usuarios`, `/instrumentos`, `/crm/campos`) não trazem preço. Além disso o contrato "pós renovação" ainda não existe no sistema: é uma projeção que só a tela do Emusys calcula.

**Aba "Renovação em Lote"** (ação de marcar): mesma limitação de valores, mais a ausência de escrita — a API só expõe `GET`. Dá para **ler** quem está marcado como "Não Será Renovada" (`contrato_atual.flag_nao_vai_renovar`, disponível via sync de matrículas), mas marcar continua manual no Emusys.

**Correção da `vw_renovacoes_proximas`** — ver "Achado em produção". Tem consumidor ativo em produção e merece decisão própria.

**Integração com o fluxo de renovação existente**: esta tela não escreve em `movimentacoes_admin` nem alimenta `TabelaRenovacoes` / `ModalRenovacao`. É painel de leitura. Conectar as duas coisas é decisão separada, depois de a equipe usar a tela.

**Histórico**: não guarda snapshot diário de quem estava vencendo. A fonte canônica de renovação continua sendo `movimentacoes_admin`.
