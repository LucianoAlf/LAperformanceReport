# Módulo Eventos — gestão de recital (LAPE-39)

**Estado:** as 7 fases do plano estão no ar. Nenhuma tela foi exercitada no navegador.
**Período:** 18–19/09/2026 · **Último commit:** `241c2292`
**Para quem pega daqui:** este documento é suficiente para continuar sem reler o plano.

---

## 1. O que é e de onde veio

A LA Music organizava o recital das três unidades fora do sistema. Na reunião de 17/09/2026
(Luciano, Hugo, Arthur Côrtes), o Arthur apresentou um **protótipo standalone** (artifact Adapta,
`localStorage` + importação CSV de 259 alunos) que já resolvia a montagem da grade, mas vivia
isolado, não conhecia a base do LA Report e morria a cada recital.

Este módulo é a portabilidade desse protótipo para dentro do LA Report, lendo a base real.

**Rota:** `/app/eventos` (lista) e `/app/eventos/:eventoId` (5 abas).
**Aberto a todos** desde 19/09, com aviso de "em desenvolvimento" na tela.

### Decisões fechadas (não reabrir sem falar com o Luciano ou o Arthur)

| Decisão | Valor |
|---|---|
| Escopo do evento | **Um evento por unidade**, data própria e independente |
| Grão da apresentação | **`(pessoa, curso)`** — 2 cursos = 2 apresentações; 2 matrículas no mesmo curso = 1 |
| Banda na grade | **Não entra** (decisão do Arthur). `banda_evento` é outra coisa e ficou intocado |
| Fonte de dados | LA Report (Supabase). Sem importação de CSV/XLSX |
| Tipo de evento | Só recital. Sem abstração para workshop/masterclass |

---

## 2. O que existe hoje

### Telas

```
src/components/App/Eventos/
  EventosPage.tsx          lista de eventos da unidade + criar
  EventoDetalhePage.tsx    as 5 abas
  AlunosTab.tsx            participação tri-state, KPIs, busca, filtros
  GradeTab.tsx             blocos e apresentações (drag-and-drop com @dnd-kit)
  SeletorApresentacao.tsx  combobox de aluno + curso
  PalcoTab.tsx             rider consolidado (a folha de montagem)
  PalcoApresentacao.tsx    instrumentos/equipamentos de UMA apresentação
  RevisaoTab.tsx           pendências + os três documentos
  CheckinTab.tsx           o dia do recital + certificado
  AvisoEmDesenvolvimento.tsx
```

### Regra de negócio (fora do componente, de propósito)

- **`src/lib/eventos.ts`** — elegibilidade, cálculo de horário, consolidação de palco,
  pendências da revisão, lista de chegada, seleção para certificado.
- **`src/lib/eventosImpressao.ts`** — programação, folha de palco, CSV e certificado.

🔴 **Não reimplementar nenhuma dessas regras no componente.** A tela e a impressão fazem as mesmas
perguntas; duas implementações divergem no primeiro ajuste — é a causa-raiz das duplicatas de
renovação deste mesmo projeto.

### Dados

- **`src/hooks/useEventos.ts`** — todos os hooks de leitura e as funções de escrita.
- **Migrations:** `20260918120000_modulo_eventos_recital.sql` (base: 5 tabelas + RLS + permissões)
  e mais 6 aditivas — `20260918140000` (FKs), `20260918170000` (view de elegíveis),
  `20260918173000` (motivo sem curso), `20260919020000` (intervalo + RPCs),
  `20260919030000` (resolver matrícula do curso), `20260919050000` (reordenar blocos).
- **3 RPCs:** `evento_apresentacao_adicionar_v1`, `evento_grade_reordenar_v1`,
  `evento_bloco_reordenar_v1`. O resto é PostgREST direto — as 5 tabelas têm policy por unidade.
- **Nenhuma edge function. Nenhum cron.**

---

## 3. 🔴 O módulo é ISOLADO — medido, não deduzido

Medido contra o banco em 19/09/2026, porque o Hugo perguntou se testar mexeria em alguma métrica:

| Pergunta | Resposta |
|---|---|
| Funções que leem `evento_participacao`/`_apresentacao`/`_bloco` | **5**, todas do próprio módulo |
| Views que leem as tabelas do módulo | **0** |
| Triggers nas tabelas `evento*` | 6, todas do módulo (`updated_at` + derivar `pessoa_chave`/`unidade_id`) |
| Funções do módulo que escrevem FORA dele | **0** |

Ele lê `alunos`, `cursos`, `professores` e `vw_aluno_pessoa_chave`, e só. **Nada entra em KPI,
carteira, health score, score de professor, `aluno_presenca` ou `movimentacoes_admin`** — por isso
dá para testar em produção à vontade.

⚠️ **Isso é consequência, não trava.** Vale porque ninguém lê aquelas tabelas. No dia em que alguém
escrever uma view de KPI que junte recital com frequência, a propriedade se perde **em silêncio**:
nenhum teste quebra, nenhum alarme dispara. Por isso a afirmação está datada no `CLAUDE.md`.

⚠️ A varredura devolveu um falso positivo — `evento_grade_reordenar_v1` "escrevendo em
`simplesmente`", que era a palavra `update` dentro de um comentário em português. Ao repetir a
medição, **olhe a linha** antes de concluir.

---

## 4. As armadilhas que custaram medição

### 4.1 🔴 A RLS de `evento_participacao` FILTRA, não recusa

Provado nos 3 perfis com `set local role authenticated` + JWT real (BEGIN/ROLLBACK, **nunca**
`service_role`), atualizando `checkin_em` do evento 11 (Barra):

| Perfil | UPDATE |
|---|---|
| admin (Quintela) | 1 linha, gravou |
| Barra (Duda, dona do evento) | 1 linha, gravou |
| Campo Grande (Jerêh) | **0 linhas, NENHUM erro** |

Do lado do cliente, um check-in fora de escopo volta como **sucesso mudo**. Por isso
`marcarChegada` faz `.select('id')` e confere o retorno, desfazendo a marca otimista quando nada
gravou. **Vale para qualquer escrita nova nessas tabelas.**

⚠️ E **nenhuma RPC da grade cria linha em `evento_participacao`** — quem foi alocado sem ninguém
marcar participação não tem o que atualizar. O INSERT seguinte é o que separa "não existe linha"
(normal) de "a policy escondeu" (erro real, com mensagem).

### 4.2 A UNIQUE é o coração do schema

`UNIQUE (evento_id, pessoa_chave, curso_id)` em `evento_apresentacao` implementa "2 cursos = 2
apresentações, 2 matrículas do mesmo curso = 1" **sem nenhum `if` no código** — é o caso
Juliana Meinar / Jeremias-Amê da ata, resolvido pela chave.

`pessoa_chave` é derivada por trigger de `fn_pessoa_chave_aluno(aluno_id)`, **nunca escrita à mão**;
`aluno_id` é **procedência**, o mesmo padrão da anamnese.

### 4.3 Horário é CALCULADO, nunca persistido

`calcularHorariosDaGrade`: `inicio(N+1) = fim(N) + intervalo` (2700s = os 45 min do protótipo,
configurável por evento). `evento_bloco.horario_inicial` guarda só o que o humano **digitou**
(`inicio_manual`).

⚠️ Persistir o derivado daria duas verdades, e qualquer caminho de escrita que esquecesse de
recalcular deixaria a programação impressa mentindo.

### 4.4 O recorte por bloco na impressão é de EXIBIÇÃO, depois do cálculo

`soEsteBloco()` filtra os blocos **depois** de `calcularHorariosDaGrade` rodar sobre a grade
inteira. Filtrar antes faria o bloco 3 começar às 09:00 — e a folha diria a hora errada justamente
para quem vai montar o palco. Travado por teste.

### 4.5 Check-in é da PESSOA, nunca da apresentação

`checkin_em` mora em `evento_participacao`, cuja UNIQUE é `(evento_id, pessoa_chave)`. Quem faz
Violão e Canto sobe ao palco duas vezes e chega ao teatro **uma**. Se morasse na apresentação
existiriam duas respostas para "o João chegou?", e a segunda seria escrita horas depois, por
outra pessoa.

⚠️ **A contagem do bloco não é um pedaço do total**: quem toca em 2 blocos conta nos 2, porque cada
bloco precisa saber se a pessoa dele está no teatro. Somar os blocos **não** devolve o total, e as
duas contas estão certas — são perguntas diferentes ("quantas pessoas esperamos hoje" × "quem tem
de estar aqui agora").

### 4.6 A tela do dia não adivinha onde o recital está

O horário exibido é o **previsto** da grade. Recital atrasa; destacar "acontecendo agora" pelo
relógio anunciaria a pessoa errada com a confiança de um sistema. Quem sabe onde o recital está é
quem está na sala.

### 4.7 Instrumento sai do CURSO, e curso desconhecido devolve `null`

`instrumentoDoCurso()` tem um mapa explícito. Medido nos 43 cursos do banco: **Canto é o 2º maior
(233 matrículas ativas) e não põe objeto no palco** — quem canta precisa de microfone, que é
equipamento e não se deduz do curso. Musicalização (3 cursos, 132 matrículas), Harmonia, Teoria
Musical e Home Studio idem. O sufixo `" IND"` é **modalidade** (aula individual), não outro
instrumento.

⚠️ Curso fora do mapa devolve `null`, **nunca o nome do curso**: faltar item é omissão (a pessoa vê
a lista curta e digita), inventar "Teatro Musical" na lista de montagem é comissão — entra na lista
e ninguém percebe.

### 4.8 Quantidade de item de palco é o PICO, nunca a soma

As apresentações de um bloco são sequenciais — é a própria grade que garante isso —, então o item
se reveza: seis apresentações pedindo "1 violão" precisam de **1 violão** no palco, não de 6. O caso
que decide entre as duas leituras é o dueto: uma apresentação pedindo 2 estantes num bloco onde
outras cinco pedem 1 devolve **2**, contra 7 da soma.

### 4.9 O limite de 22:00 é RECOMENDADO

`LIMITE_TERMINO_SEGUNDOS`. É uma das cinco "REGRAS FUNDAMENTAIS" escritas no protótipo
(`MAX_FINISH_MINUTES = 22 * 60`). Entra como pendência de **atenção**, nunca impedimento — o
protótipo diz "recomendado", e quem decide esticar o recital é a coordenação. Terminar
**exatamente** às 22:00 não acusa: alarme que dispara no limite exato é alarme que se aprende a
ignorar.

### 4.10 CSV, não `.xlsx`

O protótipo embute o SheetJS inteiro (é por isso que o arquivo dele tem 498 KB). Trazer a lib
somaria **~800 KB ao bundle do app inteiro**, carregado por todo mundo, por um botão que roda
algumas vezes por semestre.

⚠️ Duas armadilhas de CSV que falham **sem erro aparente** — o arquivo abre, só que errado: sem
**BOM UTF-8** o Excel pt-BR lê como ANSI ("Violão" vira "ViolÃ£o"); com **vírgula** em vez de ponto
e vírgula, a linha inteira cai numa coluna só.

### 4.11 Os documentos abrem para VER, não para imprimir

Nenhum dispara `window.print()` sozinho — a barra de ações vive dentro do próprio documento e some
no `@media print`. A versão anterior chamava `print()` no `onload`, e quem só queria conferir a
programação caía num diálogo de impressão que não pediu.

⚠️ Impressão é por **Blob URL** → `window.open`. `document.write` em `about:blank` faz o evento de
carga nunca disparar e a impressão não sai.

### 4.12 Data por extenso nunca passa por `new Date`

`dataPorExtenso()` usa regex sobre a string `AAAA-MM-DD`. `new Date('2026-09-21')` é interpretado
como **UTC** e, em BRT, volta um dia — o recital de 21/09 sairia impresso como 20/09, e ninguém
confere a data de um papel que já foi para a gráfica.

---

## 5. Certificado — 🔴 o que está pendente de decisão

O certificado existe e é **genérico de propósito** (pedido do Hugo em 19/09: *"crie um genérico
mesmo, provavelmente vamos alterar depois"*): um por página, A4 **deitado**, sem carga horária,
sem número de registro, sem nome de diretor. Cada um desses seria **dado inventado** num papel que
vai para a família do aluno — e isso está travado por teste, porque o formato ser provisório não
autoriza inventar conteúdo.

🔴 **`certificado_status` existe na tabela e NÃO é escrita.** A decisão em aberto:

> **Quantos certificados recebe quem faz dois cursos?**

- Hoje a coluna está em `evento_participacao`, que é por **pessoa** = **um** certificado, e o papel
  traz os dois cursos no repertório. É o formato que atende as duas leituras sem escolher nenhuma.
- Se a resposta for **"um por curso"**, o grão muda para `(pessoa, curso)` e a coluna muda para
  `evento_apresentacao`.

Por isso nada é gravado: documento gerado é descartável, linha no banco com a semântica errada
custa migration depois. O comentário da migration base já antecipava essa dúvida.

**Público do certificado:** *quem fez check-in* (padrão) ou *todos os esperados*. Quem marcou "não
participa" só entra pelo check-in — certificar quem declarou que não viria é afirmar no papel uma
participação que ninguém observou; mas se apareceu e alguém marcou a chegada, a evidência vence a
declaração antiga.

---

## 6. O que falta

### Buracos de UI (o schema suporta, a tela não faz)

- **Editar evento** — título, data, local, duração padrão, intervalo entre blocos.
- **Excluir evento** — 🔴 `excluirEvento` **existe no hook e nenhuma tela o chama**.
- **Mudar status** — rascunho → publicado → realizado. O CHECK já aceita os quatro valores.
- **Renomear bloco** — nasce "Bloco 1" e assim fica.

### Do protótipo, ainda em aberto

- **Convidados especiais e participações em conjunto.** O grão é `(pessoa, curso)` da base, e
  convidado não tem matrícula — não cabe no modelo atual. Exige decisão de produto.

### Dívidas

- 🔴 **Nenhuma tela foi exercitada no navegador.** Desde a fase 1. Só os documentos de impressão
  foram validados visualmente (Playwright, servidos por HTTP local, incluindo
  `emulateMedia({media:'print'})` e largura A4 de 794px). Testar as telas exige login.
- **`escapeHtml` está duplicado** — o original em `ModalFichaAluno.tsx` e uma cópia em
  `eventosImpressao.ts`. ⚠️ A duplicação é **deliberada**: a primeira tentativa foi extrair para
  `src/lib/html.ts` e fazer o módulo Alunos importar, o que mexeu numa tela com consumidor ativo em
  produção sem necessidade. Foi revertido. A pergunta certa antes de extrair não é "isso está
  duplicado?" e sim **"quem mais usa isso hoje?"**.
- **Acesso ainda é `return true`.** `podeVerEventos()` em `src/lib/menuVisibilidade.ts` é **fonte
  única** (guard da rota + `AppSidebar` + `MobileLayout`). A virada para produção é trocar o corpo
  por `hasPermission('eventos.ver')` **e mais nada** — as permissões `eventos.ver` e
  `eventos.editar` já existem na tabela desde a migration base, então a liberação passa a ser feita
  pela tela de Permissões, sem deploy. É o oposto do Tráfego Pago, que tem a resposta escrita em
  três lugares (LAPE-32).

---

## 7. Como validar

```bash
npm test          # 970 testes, 927 passando, 0 falhas (43 pulados = Postgres em Docker)
npx tsc --noEmit  # limpo (o erro em scripts/importar_historico_ltv.js é pré-existente)
```

**Testes do módulo:** `eventosAcesso` (8), `eventosElegibilidade` (12), `eventosHorario` (13),
`eventosPalco` (30), `eventosRevisao` (20), `eventosImpressao` (42), `eventosCheckin` (26).

### Como esses testes foram provados

Por **mutação**: aplicar um defeito controlado no código real e confirmar que o teste cai. Duas
lições vieram daí, e valem para qualquer teste deste repo:

🔴 **Um teste passou com o código mutado.** Removi o `.select('id')` do UPDATE e os 16 testes
continuaram verdes — a busca procurava a string no corpo INTEIRO da função e achava o `.select` do
INSERT logo abaixo. **Teste que examina texto de código precisa delimitar o trecho pelo que a
asserção fala.**

⚠️ **A guarda de âncora precisa declarar o número esperado, nunca assumir 1.** Ao mutar
`a.nome.localeCompare(b.nome, 'pt-BR')` o script abortou: havia **duas** ocorrências no arquivo (a
outra em `consolidarItensDoPalco`). Sem a guarda, eu teria mutado o lugar errado e concluído que o
teste não segurava.

⚠️ **`'\n}\n'` não casa CRLF no Windows** — `indexOf` devolve `-1`, o `slice` entrega uma letra e o
teste reprova o código certo.

---

## 8. Onde mais está documentado

- **`CLAUDE.md`** (raiz) — seção "Módulo de Eventos — recital", com o que um agente precisa saber
  antes de tocar no módulo.
- **`docs/sistema/aluno.md`** — detalhe por aba, RPCs, modelo, acesso.
- **`docs/MAPA-SISTEMA.md`** — índice de rotas.
- **`daily-notes/2026-09-18.md` e `2026-09-19.md`** — o log cronológico, fase a fase, com os erros
  cometidos no caminho e como foram diagnosticados.
- **Lume LAPE-39** — histórico de decisões.

## 9. Commits

```
c2b65111  schema, participacao e grade (fases 1-3)
89372956  fase 4 — palco por apresentacao e lista de montagem por bloco
0eeb16d8  observacao a vista, palco em linhas, cursos agrupados por pessoa
0df55b3d  abre o modulo a todo usuario, com aviso de em desenvolvimento
1d7c7107  aba Palco — a folha de montagem do recital
dd3ecd1c  fase 5 — revisao e resumo do recital
87703587  fase 6 — programacao e folha de palco para impressao
9c77ffb1  documentos abrem para VER, com botao de PDF e identidade visual
66d94cf0  limite de 22h, impressao por bloco e planilha CSV
6ffa84c1  fase 7 — check-in do dia do recital, separado por bloco
9d4cb19d  certificado de participacao, modelo generico
241c2292  registrar o modulo no CLAUDE.md e no mapa do sistema
```
