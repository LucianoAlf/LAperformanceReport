# Anamnese por pessoa, não por curso — design

**Data:** 2026-09-01
**Task:** LAPE-19
**Status:** design aprovado, implementação não iniciada

## O problema

`anamneses.aluno_id` referencia `alunos.id`, e `alunos.id` é **matrícula**, não pessoa —
uma linha por curso. A anamnese, portanto, pertence hoje a um curso.

Quem faz dois ou três cursos aparece como "Anamnese não preenchida" nos demais, e seria
levado a responder o mesmo formulário de novo. O formulário, no entanto, **não pergunta
nada por curso**: "Nível de habilidade no instrumento" nunca diz qual instrumento, e o app
do convite sequer sabe de qual matrícula se trata. O que é por curso é só o vínculo no
banco.

### Medições em produção (2026-09-01)

| Medida | Valor |
|---|---|
| Pessoas ativas | 1.009 |
| Pessoas com 2+ matrículas ativas | 145 |
| Pessoas que preencheram e aparecem sem anamnese em outra linha | 18 |
| Linhas que passam a contar como "com anamnese" | 21 |
| Anamneses no total (desde jun/2026) | 219 |
| Pessoas ativas com anamnese | 207 |
| Anamneses preenchidas 2× pela mesma pessoa | 1 |
| Linhas ativas sem `emusys_student_id` | 3 |
| `alunos.anamnese_preenchida = true` sem anamnese vinculada (dado sujo) | 0 |

Evidência de que a família já responde pensando em todos os cursos: 9 anamneses listam mais
de um curso no campo de texto livre `cursos_escolhidos` — *"Canto e teclado"* está vinculada
à matrícula de **Teclado**, *"Violão, piano"* à de **Piano**. O curso em que a anamnese caiu
é arbitrário.

## Decisões

1. **Identidade = mesma pessoa dentro da unidade.** Par `(unidade_id, pessoa_chave)`, onde
   `pessoa_chave` é `emusys:<student_id>` ou `local:<aluno_id>` — a mesma chave que
   `vw_aluno_identidade_unidade_canonica` já usa. A regra fica isolada em
   `fn_pessoa_chave_aluno(aluno_id)`, para que estender à rede inteira um dia seja mudança
   em um lugar só.

   ⚠️ **`emusys_student_id` sozinho não identifica pessoa.** Medido: 91 ids aparecem em duas
   ou mais unidades, e **os 91 têm nomes diferentes** — é colisão entre bases separadas do
   Emusys, não a mesma pessoa. Comparar sempre junto com `unidade_id`.

   Pessoa que estuda em duas unidades preenche uma vez em cada. Hoje é 1 aluno em 1.009.

2. **Propaga o conteúdo inteiro**, com faixa de procedência no topo da ficha
   ("respondida em DD/MM, na matrícula de Violão").

   Selo campo a campo foi **descartado** depois de ler o formulário: como ele não pergunta
   nada por curso, marcar "respondido no contexto de Violão" ao lado do nível de habilidade
   seria inferência nossa apresentada como resposta da família. A procedência é fato; o
   contexto por campo não é.

3. **Aviso ao professor vale para todos os professores da pessoa** — mas **sem backfill**.
   Nenhuma mensagem é disparada sobre o histórico. Vale para anamnese nova e para curso novo.

4. **Modelo:** `anamneses` ganha `pessoa_chave`; `aluno_id` **permanece** e muda de sentido,
   de "de quem é" para "onde foi respondida" (procedência).

5. **Anamnese mais recente vence**, a anterior fica como histórico visível na ficha.

## Modelo de dados

Coluna nova em `anamneses`:

```sql
alter table anamneses add column pessoa_chave text;
create index on anamneses (unidade_id, pessoa_chave);
comment on column anamneses.aluno_id is
  'Matrícula onde a anamnese foi respondida (procedência). NÃO é o dono do dado — '
  'a anamnese pertence à pessoa, identificada por (unidade_id, pessoa_chave).';
```

`pessoa_chave` é **derivada, nunca escrita à mão** — trigger a preenche a partir de
`aluno_id`.

```
fn_pessoa_chave_aluno(aluno_id) → 'emusys:<student_id>'  quando há id do Emusys
                                  'local:<aluno_id>'     quando não há
```

Quem cai em `local:` **não propaga**: sem id do Emusys não há como afirmar que duas linhas
são a mesma pessoa, e deduzir por nome é o que a regra do domínio proíbe. São 3 linhas
ativas, com comportamento idêntico ao de hoje.

**Sem índice único por pessoa**, de propósito: uma pessoa já tem duas anamneses hoje, e a
criança que respondeu o formulário kids responderá o de adulto um dia. A leitura resolve por
"completa mais recente".

## Leitura

RPC única `get_anamnese_aluno(p_aluno_id)`: resolve a pessoa, devolve a anamnese vigente e a
procedência (curso e data da matrícula de origem) pronta para a faixa. É a fonte única — a
ficha, o link público e o texto de WhatsApp passam a chamá-la, em vez de cada consumidor
reimplementar a resolução. (Duas fontes de escrita com regras próprias para o mesmo campo foi
a causa-raiz das duplicatas de renovação; não repetir o padrão na leitura.)

`alunos.anamnese_preenchida` **continua existindo** — três consumidores o leem sem passar
pela ficha: filtro da Lista de Alunos, Conciliação e `features_churn_alunos_ativos`. Ele vira
espelho, mantido por `fn_sincronizar_anamnese_preenchida_pessoa(unidade_id, pessoa_chave)`,
disparada em três momentos:

1. anamnese criada ou completada (trigger `trg_anamnese_atualiza_aluno`, já existe);
2. matrícula nova inserida em `alunos` (trigger `trg_vincular_anamnese_na_matricula`, já
   existe — hoje só acha anamnese órfã, passa a achar a da pessoa);
3. **`UPDATE OF emusys_student_id` em `alunos`** — novo. O aluno pode nascer sem id do Emusys
   e receber o vínculo depois, pelo sync. Trigger só de INSERT deixaria essas linhas para
   trás em silêncio; é exatamente o bug que `motivo_saida_id` teve até 2026-08-20.

## Telas

- **Ficha:** faixa de procedência no topo; some o "Anamnese não preenchida" e o botão
  *Buscar anamnese* nas linhas que herdam. O botão continua para quem realmente não tem,
  inclusive as 6 anamneses com `vinculo_status = 'pendente'`.
- **Histórico:** quando houver anamnese anterior, a ficha indica "há 1 anamnese anterior" com
  acesso a ela — para não parecer que sumiu.
- **`vincular_anamnese_aluno`:** hoje recusa qualquer segundo vínculo ("evita roubar
  vínculo"). A recusa **continua** quando a outra matrícula é de outra pessoa. Vincular a
  outra matrícula da mesma pessoa passa a responder "já vale", em vez de erro.
- **Conciliação e filtro da Lista:** sem código novo — leem o espelho, que passa a estar
  certo. Ajuste preventivo: o `sync-matriculas-emusys` cria `anamnese_pendente` por
  matrícula, então pessoa sem anamnese com 3 cursos geraria 3 tarefas idênticas; passa a
  deduplicar por pessoa. Hoje há 0 pendências abertas desse tipo — é blindagem, não conserto.
- **`gerar_convite_anamnese`:** hoje reaproveita convite vivo procurando por `aluno_id`;
  passa a procurar por pessoa, senão a secretaria gera dois links para o mesmo aluno.
- **Link público (`get_anamnese_publica`):** hoje resolve o professor por
  `alunos.professor_atual_id` da linha vinculada — o professor de Bateria abriria o link e
  leria o nome do professor de Violão. **Deixa de exibir professor.** Não há alternativa: a
  página é aberta por token e não sabe quem está do outro lado, então não existe "professor
  do contexto de quem abriu". O campo `professor_nome` do retorno passa a vir nulo; a página
  segue mostrando aluno, unidade e data.

## Aviso ao professor

A edge `notificar-anamnese` **vive no repositório `la-teacher`** e é deployada de lá. Não
recriar o diretório aqui: um `supabase functions deploy` a partir deste repo sobrescreveria a
fronteira de privacidade em silêncio (ver `supabase/functions/notificar-anamnese/LEIA-ANTES-DE-DEPLOYAR.md`).

Mudança: o destinatário deixa de ser o professor da matrícula de origem e passa a ser todos
os professores distintos das matrículas ativas da pessoa. A fila `fila_anamnese_sol_hermes`
já tem índice único parcial `(anamnese_id, professor_id)` — repetir é inofensivo. A varredura
de privacidade e seus 12 casos de teste **não são tocados**: muda quem recebe, não o que se
escreve.

### Por que uma varredura, e não só o evento

Hoje existe **um** gatilho: o app do formulário chama a edge no instante em que a anamnese é
salva (`anamnese-la-music/src/components/FormWizard.tsx:187` e `:294`), em fire-and-forget
(`.catch(e => console.warn(...))`). Não há cron de anamnese (`cron.job`: zero jobs).

Consequências: "aluno entrou em curso novo" não é evento para ninguém — se preencheu em março
e entra em Bateria em setembro, o gatilho já passou. E falha de envio morre num
`console.warn` no navegador da recepção.

Portanto: **varredura diária** que pergunta "existe professor ativo deste aluno sem briefing
da anamnese vigente, a partir da data de corte?" e enfileira. Auto-curativa — cobre curso
novo, falha de envio e **troca de professor** (hoje um buraco puro).

⚠️ **Data de corte obrigatória.** Sem ela, a varredura descobre o passado inteiro e dispara
justamente o que foi vetado — inclusive os 26 casos pré-existentes descritos abaixo.

### Backfill: nada é enviado

Dos 16 pares professor-anamnese que a propagação criaria, apenas **7** têm informação de
saúde real (6 com diagnóstico) — o resto é perfil, temperamento e objetivos. Mandar 16
mensagens sobre alunos que esses professores já acompanham há meses é ruído.

Entregável no lugar do disparo: a lista dos 7, para a coordenação decidir caso a caso pelo
botão *"Enviar ao professor"*, que já existe na ficha.

⚠️ Ao contar "informação de saúde", `diagnosticos` guarda o literal **"NÃO"** como item do
array em 174 das 219 anamneses. `jsonb_array_length(diagnosticos) > 0` **não** significa ter
diagnóstico — filtrar o valor. Diagnósticos reais hoje: 23 TDAH, 14 TEA, 10 "investigando
TDAH", 5 TAG, 3 TOC, 2 TOD, 1 borderline.

## Migração e backfill

Uma migration aditiva: coluna, `fn_pessoa_chave_aluno`, `fn_sincronizar_anamnese_preenchida_pessoa`,
os três triggers, índice, backfill de `pessoa_chave` nas 219 linhas e recálculo do espelho.

Contagens antes/depois no próprio arquivo, e as 21 linhas que mudam listadas uma a uma. O
recálculo é seguro: 0 linhas com flag `true` sem anamnese vinculada, então ele só liga.

Reversão: dropar a coluna e restaurar os dois triggers antigos.

## Testes

1. pessoa com 2 e 3 cursos → uma anamnese, N fichas;
2. matrícula nova criada **depois** da anamnese → herda na hora;
3. **mesmo `emusys_student_id` em duas unidades → NÃO propaga** (caso dos 91; falso positivo
   aqui vaza dado de saúde entre unidades);
4. aluno sem `emusys_student_id` (`local:`) → não propaga;
5. `UPDATE OF emusys_student_id` → recalcula;
6. pessoa com 2 anamneses → a completa mais recente vence, a anterior aparece como histórico;
7. varredura com data de corte → não enfileira nada anterior ao corte;
8. tudo validado com `set local role authenticated` nos três perfis (admin, unidade,
   professor), **nunca** como `service_role` — que ignora RLS e foi o que escondeu os bugs da
   Agenda em 02 e 03/08/2026.

## Riscos e fora de escopo

- A feature `anamnese_preenchida` de `features_churn_alunos_ativos` **muda de semântica** (21
  linhas). O modelo foi treinado com "anamnese desta matrícula" e passa a receber "anamnese
  desta pessoa". Roda diário e não quebra; o valor novo é o correto. Fica registrado como
  mudança consciente de insumo.
- Pessoa que estuda em duas unidades continua preenchendo duas vezes (1 caso).
- O app `anamnese-la-music` **não muda** — ele já pergunta sobre a pessoa.
- `TabRetencao.tsx` e afins não são tocados.

## Achado lateral — não é desta mudança

**26 professores da própria matrícula de origem nunca receberam o briefing.** A anamnese
existe, o vínculo está certo, e a mensagem não saiu. Cheira a resquício da fila que falhou por
21 dias em agosto/2026, agravado pelo fato de a falha de envio ser muda (`console.warn` no
navegador). Precisa de investigação própria — e a varredura desta spec, se rodasse sem data de
corte, os despacharia todos de uma vez.
