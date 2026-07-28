# Contratos vencendo (Renovação de Matrículas via API Emusys) — desenho aprovado

## Objetivo

O Emusys tem a tela **Escola → Renovação de Matrículas** (`Relatórios → Alunos com período de contratação terminando`), que lista as matrículas cujo contrato está acabando nos próximos N dias, com o número de aulas restantes de cada uma. O Arthur usa muito essa tela no dia a dia para saber quem abordar para renovação, e hoje precisa sair do report e entrar no Emusys para vê-la.

O pedido é replicar essa lista dentro do LA Report, num item novo ao lado de **Entrada** — "Contratos" — para acompanhar contratos e aulas restantes sem trocar de sistema.

Validado ao vivo em 28/07/2026: a lista da unidade Barra ("próximos 30 dias") foi reproduzida pela API com **16 de 16 registros idênticos** (mesmos alunos, mesmas datas de última aula e de matrícula) usando só `GET /matriculas`.

## Escopo

Somente a aba **"Matrículas Vencendo"** da tela do Emusys, em modo leitura. As outras duas abas ficam de fora por limitação da API (ver "Fora de escopo").

Nada é persistido: sem tabela nova, sem migration, sem cron, sem escrita no Supabase. A tela consulta a API do Emusys na hora, através de uma edge function que serve de proxy.

**Grão = matrícula, não pessoa.** Mesma regra já canônica no projeto (`alunos` = matrículas). Um aluno com dois cursos aparece em duas linhas, com contratos e datas independentes. Confirmado no dado real: Mariana Herd Giglio (`aluno_id=773`, Barra) tem Teclado (`matricula_id=475`, última aula 21/11/2026) e Canto (`matricula_id=641`, última aula 15/08/2026) — só a de Canto entra na janela de 30 dias.

## Arquitetura

### 1. Edge function `contratos-vencendo`

Proxy read-only. Não escreve em lugar nenhum — nem no Supabase, nem no Emusys (a API do Emusys não tem endpoint de escrita para isso de qualquer forma; ver "Fora de escopo").

**Request:** `GET /contratos-vencendo?u=cg|barra|recreio&dias=30&incluir_faturas=true`

- `u` (obrigatório): resolve o secret `EMUSYS_TOKEN_CG` / `EMUSYS_TOKEN_BARRA` / `EMUSYS_TOKEN_RECREIO`. Nome do parâmetro é `u`, igual a `sync-matriculas-emusys` e `sync-inadimplencia-emusys` — escolha deliberada por consistência, não por acaso.
- `dias` (opcional, default `30`): tamanho da janela a partir de hoje (BRT). **Allowlist `30 | 60 | 90`** — qualquer outro valor é rejeitado com 400. Sem isso, um `dias=3650` faria a edge varrer a base inteira e buscar fatura de centenas de contratos.
- `incluir_faturas` (opcional): quando `false`, pula a busca de faturas e devolve `venc_ultima_fatura: null` — resposta bem mais rápida. **Default `true` quando `dias === 30`, `false` quando `dias` for 60 ou 90** (ver "Custo e rate limit").

**Fluxo:**

1. Pagina `GET /matriculas?status=ativa&limite=50` com `cursor` até `paginacao.tem_mais === false`. Na Barra são 268 matrículas ativas = 6 páginas; as outras unidades têm ordem de grandeza parecida.
2. Filtra em memória: mantém a matrícula quando `hoje <= contrato_atual.data_original_ultima_aula <= hoje + dias`, com `hoje` em BRT (UTC-3). **Ordena o resultado por `ultima_aula` crescente já aqui**, antes de buscar faturas — assim, se o teto de requisições for atingido, quem fica sem `venc_ultima_fatura` são os contratos que vencem mais tarde, não uma fatia arbitrária na ordem das páginas da API.
   Não existe filtro nativo para isso na API — `data_inicial`/`data_final` de `/matriculas` filtram pela **data da matrícula**, não pela data de fim do contrato. O recorte é obrigatoriamente feito do nosso lado.
3. Para cada matrícula filtrada (e só para essas), quando `incluir_faturas=true`, chama `GET /faturas?contrato_id=<contrato_atual.id>&limite=50` e pega o **maior** `data_vencimento` da lista, **paginando por cursor** enquanto `paginacao.tem_mais` (um contrato anual tem ~12 parcelas, bem abaixo do limite de 50 por página, mas contrato com parcelas avulsas/taxa de matrícula pode passar — sem paginar, o máximo sairia errado em silêncio).
   O filtro `contrato_id` **não consta na referência pública** de `/faturas` (a doc lista `matricula_id`, `aluno_id`, `status` e as datas de vencimento), mas foi verificado ao vivo em 28/07/2026: `GET /faturas?contrato_id=834&limite=50` devolveu exatamente as 12 parcelas daquele contrato. Reconfirmar na implementação; se falhar, o fallback é `matricula_id` + filtrar `contrato_id` em memória.
4. Devolve o JSON montado.

**Response:**

```jsonc
{
  "unidade": "barra",
  "gerado_em": "2026-07-28T14:32:00-03:00",
  "janela": { "inicio": "2026-07-28", "fim": "2026-08-27", "dias": 30 },
  "total_ativas_varridas": 268,
  "itens": [
    {
      "matricula_id": 238,
      "aluno_id": 408,
      "aluno_nome": "Natan Pereira Calvo Demidoff",
      "curso": "Bateria T",
      "data_matricula": "2023-05-22",
      "ultima_aula": "2026-08-08",
      "venc_ultima_fatura": "2026-05-05",
      "aulas_restantes": 1,
      "professor": "Peterson Biancamano",
      "valor_mensalidade": 385,
      "flag_nao_vai_renovar": false,
      "inadimplente": false
    }
  ],
  "avisos": [
    { "tipo": "fatura_falhou", "matricula_id": 641, "detalhe": "HTTP 500 em /faturas" }
  ],
  "faturas_truncadas": false
}
```

`avisos[]` é sempre uma lista de objetos `{ tipo, matricula_id?, detalhe }` — nunca string solta. `tipo` é um enum curto (`fatura_falhou`, `fatura_truncada`, `unidade_falhou`) para a tela poder agrupar; `detalhe` é texto livre para diagnóstico.

**Mapeamento de cada campo para a API (todos verificados em chamada real, 28/07/2026):**

| Campo da tela | Origem |
|---|---|
| Aluno | `aluno.nome` |
| Curso | `contrato_atual.disciplinas[].nome` (junta com `, ` quando houver mais de uma disciplina no mesmo contrato) |
| Data da Matrícula | `data_matricula` |
| Última Aula | `contrato_atual.data_original_ultima_aula` |
| Venc. Última Fatura | `max(data_vencimento)` de `GET /faturas?contrato_id=X` |
| Nr. de Aulas Restantes | `contrato_atual.nr_aulas_contratadas - contrato_atual.nr_aulas_passadas` |
| Professor | `contrato_atual.disciplinas[].nome_professor`, mesma regra do curso: junta com `, ` e deduplica quando o contrato tem mais de uma disciplina |
| Valor | `contrato_atual.valor_mensalidade` |
| Não vai renovar | `contrato_atual.flag_nao_vai_renovar` |
| Inadimplente | `contrato_atual.inadimplente` |

São **10 colunas** no total — as 6 que existem na tela do Emusys mais 4 que a API já entrega junto, sem chamada extra, e que ajudam na abordagem: professor, valor da mensalidade, marcação de "não vai renovar" e situação de inadimplência.

⚠️ **A coluna Valor é informativa, não canônica.** O `CLAUDE.md` do projeto já registra que a API às vezes embute o `desconto_fixo` dentro do `valor_mensalidade` (líquido negativo) e que o flag `bolsa` não é confiável — foi exatamente por isso que `valor_divergente` vai para fila humana na Conciliação Emusys, em vez de aplicar sozinho. Numa tela usada para abordar aluno sobre renovação, mostrar esse número cru pode exibir preço errado. Exibir com tooltip "valor como está na API do Emusys, pode estar bruto — confira na Conciliação", e nunca usar essa coluna como base de cálculo de nada.

Sobre aulas restantes: `disciplinas[].nr_aulas_futuras` devolve o mesmo número (conferido em 13 matrículas). Usar a subtração no nível do contrato porque é o total do contrato, e o `nr_aulas_futuras` é por disciplina — em contrato multi-disciplina somar as disciplinas daria o mesmo, mas a subtração é uma leitura só.

**Autenticação:** `verify_jwt: true`. Sem gate extra de e-mail — o dado é operacional interno, não tem a sensibilidade de custo de mídia que justificou o gate da `meta-ads-insights`. A restrição por unidade acontece no frontend (só oferece as unidades que o usuário pode ver). Fica registrado que um usuário autenticado consegue, chamando a edge direto, pedir uma unidade que não veria na tela — aceitável para o dado em questão; se virar problema, o gate de unidade entra na edge depois.

### 2. Hook `useContratosVencendo`

Segue a convenção do projeto: hook customizado com fetch direto, sem React Query.

Cache em memória a nível de módulo (fora do componente), chaveado por `unidade + dias + incluir_faturas`, com **TTL de 5 minutos**. Sair da tela e voltar dentro do TTL serve do cache, sem nova chamada ao Emusys. F5 limpa o cache (é memória do módulo, não `localStorage` — proposital, para não servir dado velho depois de um reload).

Expõe `refetch()` que ignora o cache, ligado a um botão "Atualizar" na tela.

### 3. Página `/app/entrada/contratos`

Tabela com as 10 colunas do mapeamento acima. As duas booleanas (`flag_nao_vai_renovar`, `inadimplente`) são exibidas como badge, não como texto. O `flag_nao_vai_renovar` é o mesmo marcador que a aba "Renovação em Lote" do Emusys usa — dá para **ler**, não para escrever.

Controles: seletor de janela (30 / 60 / 90 dias), checkbox "buscar vencimento das faturas" (marcado por padrão em 30 dias, desmarcado acima disso, com aviso de demora — ver "Custo e rate limit"), filtro de unidade (respeitando `canViewConsolidated()` / permissões do `AuthContext`), botão "Atualizar", indicação de "atualizado há X min" a partir do `gerado_em`, e banner de amostra parcial quando `faturas_truncadas` vier `true`.

Ordenação padrão por `ultima_aula` crescente (quem vence primeiro no topo), que é a ordem útil para a operação.

**Modo consolidado** (usuário com `canViewConsolidated()`): a edge responde por unidade, então o hook chama as três em sequência e funde no cliente — concatena `itens` (com uma coluna de unidade), soma `total_ativas_varridas`, faz OR de `faturas_truncadas`, concatena `avisos`, e usa o **menor** `gerado_em` das três para o "atualizado há X min" (é o dado mais velho da tela; mostrar o mais novo daria falsa sensação de frescor).

**Renderização progressiva:** cada unidade aparece na tabela assim que a sua resposta chega, sem esperar as três. Com até ~81s por unidade no pior caso, prender a tela inteira até a última terminar seria ruim demais. Se uma unidade falhar, as outras seguem renderizadas e a que falhou entra em `avisos` (`tipo: "unidade_falhou"`) com banner e opção de tentar de novo só aquela — melhor que derrubar a tela inteira.

### 4. Card no `EntradaMenu`

Card novo "Contratos" em [EntradaMenu.tsx](../../../src/components/App/Entrada/EntradaMenu.tsx), seção **Retenção** (ao lado de Renovação / Evasão / Aviso Prévio), ícone `CalendarClock`, descrição "Contratos vencendo e aulas restantes". Rota nova em [router.tsx](../../../src/router.tsx) com lazy loading, igual às outras rotas de `entrada/`.

## Custo e rate limit

O rate limit do Emusys é de **60 req/min por IP**. A edge processa **uma unidade por invocação** (mesma decisão de `sync-matriculas-emusys` e `sync-inadimplencia-emusys`); o frontend chama as três em sequência quando o usuário está em modo consolidado.

**Reaproveitar o `GlobalRateLimiter` de [`_shared/faturasSync.ts`](../../../supabase/functions/_shared/faturasSync.ts)** — já é `export`, intervalo de 1200ms, não precisa de alteração nenhuma no arquivo.

O retry de 429 fica numa função **local da edge nova**, não extraída do compartilhado. O `fetchPage` de lá é privado, é caminho de produção do sync de faturas, tem a string `Emusys /faturas` fixa nas mensagens de erro, e faz `throw` em qualquer `!response.ok` — enquanto aqui é preciso o caso extra do 400 `"token invalido!"`. Exportar e alterar aquele `fetchPage` mudaria o comportamento de retry de uma sync em produção para atender uma tela nova; replicar ~15 linhas de retry sai mais barato que esse risco. O `coletarFaturasUnidade` também não serve: busca por competência (`data_vencimento_inicial/final` de um mês), e aqui a busca é por `contrato_id`.

Contagem por unidade, com `incluir_faturas=true`:

| Janela | Matrículas filtradas (Barra, 28/07) | Chamadas | Tempo a 1200ms |
|---|---|---|---|
| 30 dias | 16 | ~22 | ~27s |
| 60 dias | ~32 | ~38 | ~46s |
| 90 dias | ~48 | ~54 | ~65s |

Nenhuma invocação isolada chega perto do timeout de 150s do Supabase — o pior caso é 65s (90 dias, uma unidade) — e o próprio `GlobalRateLimiter` a 1200ms trava em ~50 req/min, abaixo do limite de 60, então invocações sequenciais não somam pressão de rate limit. **O problema é de espera do usuário:** em modo consolidado as três chamadas são sequenciais, e 90 dias com faturas deixaria a tela carregando por mais de 3 minutos. Isso não se resolve fatiando a edge; resolve-se não buscando fatura que ninguém pediu.

**Regra, por isso:** `incluir_faturas` tem default `true` só na janela de 30 dias, e `false` em 60/90 (ver contrato da edge acima). O usuário pode ligar as faturas manualmente numa janela grande (checkbox na tela, com aviso de demora), e nesse caso vale um **teto rígido de 60 requisições a `/faturas` por invocação** — contando requisições, não contratos, já que um contrato pode paginar. Atingido o teto, os itens restantes vêm com `venc_ultima_fatura: null`, a resposta marca `faturas_truncadas: true` e a tela mostra banner de amostra parcial, mesmo padrão de `chatwoot-atendimento-insights`. Truncar em silêncio seria pior: a coluna vazia leria como "não tem fatura" em vez de "não consultei".

## Erros e casos de borda

- **Falha no meio da paginação de `/matriculas`**: aborta e retorna erro. Diferente das syncs, aqui não há estado parcial a preservar — devolver metade da lista como se fosse a lista inteira seria pior que falhar, porque o usuário decide contato com aluno em cima disso.
- **Falha ao buscar faturas de um contrato**: não derruba a resposta. Aquele item vem com `venc_ultima_fatura: null` e a ocorrência entra em `avisos[]`; a tela mostra "—" na célula.
- **Contrato sem nenhuma fatura**: `venc_ultima_fatura: null`, mesmo tratamento. Já visto na tela do Emusys (Rafael Mello dos Santos aparece com a coluna vazia no print de referência), então é estado normal, não erro.
- **`data_vencimento` inválida** (`"0000-00-00"` em registros antigos): descartar ao calcular o máximo.
- **Matrícula sem `contrato_atual`**: pular, não entra na lista.
- **Rate limit**: o caminho documentado e o que o repo já trata é **`HTTP 429`**, com respeito ao header `Retry-After` e até 5 tentativas (`_shared/faturasSync.ts`). Esse é o tratamento principal.
  Existe também um caso observado de `HTTP 400 {"status":"erro","msg":"token invalido!"}` em rajada de chamadas sem pausa — rate limit disfarçado de erro de token. **Não** transformar isso num retry genérico de todo 400: um token de fato inválido/expirado devolve o mesmo 400 e ficaria preso num loop de backoff em vez de falhar rápido. Retry só quando o 400 traz exatamente essa mensagem, com no máximo 2 tentativas; qualquer outro 400 falha na hora. A mensagem exibida na tela não deve dizer "token inválido" — confunde quem for diagnosticar.
- **Encoding**: nomes vêm em Latin-1 em alguns campos (`"S�bado"`, `"B_S�_15"` apareceram na varredura). Normalizar na edge antes de devolver.

## Verificação

O critério de aceite é comparar a tela contra o Emusys **no mesmo dia**: abrir Escola → Renovação de Matrículas no Emusys (modo "Usar Data da Última Aula", próximos 30 dias) e conferir contagem e linhas contra a nossa tela.

Comparar prints de dias diferentes não vale: `nr_aulas_passadas` sobe a cada aula realizada, então "aulas restantes" é um contador vivo. No print de referência do Arthur, Mariana Herd Giglio (Canto) tinha 6 aulas restantes; em 28/07/2026 a API devolvia 2 para a mesma matrícula. Não é divergência de campo — é o tempo passando.

Gates padrão do projeto antes de considerar pronto:

- `node --check` no bundle da edge antes do deploy.
- `get_edge_function` via MCP após o deploy, comparando o código deployado com o do repositório (git ≠ produção é premissa do projeto).
- `npm run build` limpo.

## Fora de escopo

**Aba "Matrículas Renovadas"** (projeção de valores): as colunas *Data Primeira Aula Pós Renovação*, *Faturas Antes*, *Faturas Pós Renovação* e *Variação* dependem da **Tabela de Valores** da escola (versões de preço, reajustes, planos de pagamento), que **não tem endpoint na API** — os lookups de configuração expostos são só `/disciplinas`, `/professores`, `/salas`, `/usuarios`, `/instrumentos` e `/crm/campos`, nenhum deles com preço. Além disso, o contrato "pós renovação" ainda não existe no sistema; é uma projeção que só a tela do Emusys calcula. Não é replicável com fidelidade.

**Aba "Renovação em Lote"** (ação de marcar): mesma limitação de valores, mais a ausência de escrita — a API só expõe `GET /matriculas`, não há `PATCH`/`POST` de matrícula ou contrato. Dá para **ler** quem está marcado como "Não Será Renovada" (`flag_nao_vai_renovar`), mas marcar continua sendo manual no Emusys.

**Integração com o fluxo de renovação existente**: esta tela não escreve em `movimentacoes_admin` nem alimenta `TabelaRenovacoes` / `ModalRenovacao`. É um painel de leitura e nada mais. Conectar as duas coisas é decisão separada, depois de a equipe usar a tela e dizer se compensa.

**Persistência / histórico**: não guarda snapshot diário de quem estava vencendo. Se um dia a equipe quiser série histórica ("quantos venceram e não renovaram em agosto"), aí sim entra tabela e cron — mas isso é outra feature, e a fonte canônica de renovação continua sendo `movimentacoes_admin`.

## Impacto em produção

O frontend inteiro (página, hook, rota, card) fica numa branch e não afeta nada até o merge. A edge function `contratos-vencendo` é **nova e aditiva**: não tem cron apontando para ela e nada no sistema a chama até o frontend mergear — então pode ser deployada durante o desenvolvimento sem risco.

**Nenhum arquivo compartilhado é alterado.** O `_shared/faturasSync.ts` é só **lido** (importa o `GlobalRateLimiter`, que já é `export`); o retry de 429 é local da edge nova, justamente para não mexer no caminho de produção do sync de faturas — ver "Custo e rate limit". Nenhuma edge existente muda de comportamento, nem no próximo deploy dela.

Não há migration, então não há alteração de schema para reverter.

Rollback: remover o card do menu esconde a funcionalidade; deletar a edge remove o resto. Nenhum dado a limpar.
