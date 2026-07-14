# Auditoria de timestamps de presença e anotações do Emusys

**Data da auditoria:** 12/07/2026
**Repositório:** `LAperformanceReport`
**Projeto Supabase auditado:** `ouqwbbermlzqqvtqwlul`
**Objetivo:** determinar se os timestamps disponíveis hoje permitem calcular, de forma canônica, a métrica de governança do LA Teacher: **percentual de aulas com presença/registro realizado em até 24 horas**.
**Escopo:** auditoria somente leitura. Nenhum arquivo, dado, schema ou Edge Function foi alterado durante a investigação.

---

## 1. Resumo executivo

A coluna `aluno_presenca.respondido_em` possui semânticas diferentes conforme a origem do registro:

| `respondido_por` | Significado atual de `respondido_em` | Serve para a métrica de 24h? |
|---|---|---|
| `emusys` | Momento em que o sync do LA Report encontrou e inseriu a presença | **Não** |
| `professor_la_teacher` | Momento em que o professor submeteu a chamada no LA Teacher | **Sim** |
| `manual` | Momento em que a coordenação corrigiu o registro no LA Report | Sim para auditoria da correção, não como horário original da presença |
| `professor_whatsapp` | Momento em que a resposta foi processada pelo fluxo do WhatsApp | Depende do fluxo consumidor, mas não representa uma resposta originada no Emusys |
| `sistema` | Momento de uma materialização interna | Não deve ser tratado automaticamente como ação humana |

### Conclusão principal

Para registros com `respondido_por = 'emusys'`, `respondido_em` **não é o timestamp real em que a presença foi marcada no Emusys**. O campo recebe `new Date().toISOString()` durante o sync e representa apenas o instante em que o LA Report materializou o dado.

Consequentemente, a métrica de governança de 24 horas só pode usar diretamente os registros feitos pelo LA Teacher ou por outro canal que grave explicitamente o momento da ação humana. Misturar registros `emusys` na mesma métrica produzirá resultados historicamente incorretos.

---

## 2. Pergunta 1: origem de `aluno_presenca.respondido_em`

### 2.1 Escrita feita pelo sync do Emusys

Arquivo:

`supabase/functions/sync-presenca-emusys/index.ts`

Trecho relevante, linhas 1092-1114:

```ts
const { error: upsertError } = await supabase
  .from('aluno_presenca')
  .upsert(
    {
      aluno_id: alunoId,
      aula_emusys_id: aulaLocalId,
      professor_id: professorId,
      unidade_id: unidade.id,
      data_aula: dataAlvo,
      horario_aula: aluno.horario_presenca,
      status,
      status_presenca: status === 'presente' ? 'presente' : 'falta',
      curso_nome: aula.curso_nome,
      turma_nome: aula.turma_nome,
      sala_nome: aula.sala_nome,
      respondido_por: 'emusys',
      respondido_em: new Date().toISOString(),
    },
    {
      onConflict: 'aluno_id,aula_emusys_id',
      ignoreDuplicates: true,
    }
  );
```

O código demonstra diretamente que:

1. O payload do Emusys não fornece o valor usado em `respondido_em`.
2. O valor é criado localmente com o relógio da Edge Function.
3. O timestamp representa o momento da execução do sync.
4. `ignoreDuplicates: true` transforma o comportamento em **primeira materialização vence**: quando já existe `(aluno_id, aula_emusys_id)`, o sync não atualiza a linha.

Portanto, `respondido_em` não é regravado a cada sync da presença, mas continua não sendo um timestamp do evento original. Ele é o instante da primeira sincronização que conseguiu materializar aquela presença.

### 2.2 Evidência na Edge Function publicada

A função publicada `sync-presenca-emusys` foi consultada no projeto `ouqwbbermlzqqvtqwlul`. A versão remota contém os mesmos três comportamentos encontrados no repositório:

- `respondido_em: new Date().toISOString()`;
- `anotacoes: aula.anotacoes || null`;
- `ignoreDuplicates: true` no upsert de `aluno_presenca`.

Assim, o diagnóstico não se limita ao código local: ele corresponde à implementação atualmente publicada.

### 2.3 Evidência agregada no banco de produção

Consulta somente leitura utilizada:

```sql
select
  coalesce(respondido_por, '(null)') as respondido_por,
  count(*) as total,
  count(*) filter (where respondido_em is not null) as com_respondido_em
from public.aluno_presenca
group by respondido_por
order by total desc;
```

Resultado no momento da auditoria:

| Origem | Total | Com `respondido_em` |
|---|---:|---:|
| `emusys` | 46.453 | 46.453 |
| `manual` | 1 | 1 |

Não havia, naquele snapshot, registro com `respondido_por = 'professor_la_teacher'`.

### 2.4 Medianas que confirmam o carimbo em lote

Consulta agregada:

```sql
select
  to_char(date_trunc('month', data_aula), 'YYYY-MM') as mes_aula,
  count(*) as total,
  round((percentile_cont(0.5) within group (
    order by extract(epoch from (respondido_em - data_aula::timestamp)) / 86400.0
  ))::numeric, 2) as mediana_dias,
  min(respondido_em)::date as primeira_escrita,
  max(respondido_em)::date as ultima_escrita
from public.aluno_presenca
where respondido_em is not null
  and respondido_por = 'emusys'
group by 1
order by 1;
```

Resultados:

| Mês da aula | Registros | Mediana entre aula e `respondido_em` |
|---|---:|---:|
| 2026-02 | 727 | 5,94 dias |
| 2026-03 | 11.329 | 91,79 dias |
| 2026-04 | 9.763 | 61,81 dias |
| 2026-05 | 11.258 | 31,80 dias |
| 2026-06 | 9.851 | 7,07 dias |
| 2026-07 | 3.525 | 3,95 dias |

O padrão decrescente é compatível com materialização tardia em lote, e não com o momento em que cada professor registrou a presença.

### 2.5 Lotes encontrados

Também foram agrupados os registros por minuto de `respondido_em`. Exemplos:

| Minuto do sync, UTC | Registros gravados | Intervalo das aulas |
|---|---:|---|
| 23/06/2026 01:17 | 1.029 | 06/06 a 13/06 |
| 20/06/2026 19:07 | 1.000 | 12/05 a 19/05 |
| 20/06/2026 19:29 | 948 | 06/05 a 15/05 |
| 20/06/2026 19:26 | 925 | 06/04 a 15/04 |
| 20/06/2026 18:59 | 914 | 18/03 a 25/03 |

Centenas de aulas históricas receberam o mesmo minuto de resposta. Isso é evidência objetiva de timestamp de sync/backfill.

### 2.6 Escrita pelo LA Teacher

Arquivo:

`supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql`

Trecho da RPC que registra a chamada, linhas 308-340:

```sql
insert into public.aluno_presenca (
  aluno_id,
  aula_emusys_id,
  professor_id,
  unidade_id,
  data_aula,
  horario_aula,
  status,
  status_presenca,
  curso_nome,
  turma_nome,
  sala_nome,
  respondido_por,
  respondido_em
)
select distinct
  r.aluno_id,
  v_aula.id,
  v_professor_id,
  v_aula.unidade_id,
  v_aula.data_aula,
  (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
  case when r.aluno_id = any(coalesce(p_alunos_ausentes, '{}'::integer[]))
    then 'ausente' else 'presente' end,
  case when r.aluno_id = any(coalesce(p_alunos_ausentes, '{}'::integer[]))
    then 'falta' else 'presente' end,
  v_aula.curso_nome,
  v_aula.turma_nome,
  v_aula.sala_nome,
  'professor_la_teacher',
  now()
from public.aula_alunos_emusys r
where r.aula_emusys_id = v_aula.id
  and r.aluno_id is not null
on conflict (aluno_id, aula_emusys_id) do nothing;
```

Nesse fluxo, `now()` é executado durante a ação de envio da chamada pelo professor. Portanto, esse timestamp pode representar o momento real da ação no LA Teacher.

### 2.7 Correção manual

Na mesma migration, linhas 475-480:

```sql
update public.aluno_presenca
set
  status_presenca = p_status_presenca,
  status = case p_status_presenca when 'falta' then 'ausente' else 'presente' end,
  respondido_por = 'manual',
  respondido_em = now()
where id = v_registro.id;
```

Nesse caso, `respondido_em` é o horário real da correção administrativa. A tabela `aluno_presenca_retificacoes` preserva os valores anteriores, inclusive `respondido_por_anterior` e `respondido_em_anterior`.

---

## 3. Pergunta 2: o que a API Emusys oferece

### 3.1 Endpoint auditado

Endpoint oficial:

```text
GET https://api.emusys.com.br/v1/aulas
```

Documentação:

<https://emusys.gitbook.io/emusys/api-emusys/referencia/aulas>

O sync consulta o endpoint por dia, com paginação:

```ts
async function fetchAulasDia(token: string, data: string): Promise<AulaEmusys[]> {
  const todas: AulaEmusys[] = [];
  let cursor: string | null = null;
  let temMais = true;

  while (temMais) {
    let url = `${EMUSYS_API}/aulas/?data_hora_inicial=${data}T00:00:00&data_hora_final=${data}T23:59:59&limite=100`;
    if (cursor) url += `&cursor=${cursor}`;

    const resp = await fetch(url, { headers: { token } });
    const json = await resp.json();
    todas.push(...(json.items || []));

    const pag = json.paginacao || {};
    temMais = pag.tem_mais === true;
    cursor = pag.proximo_cursor || null;
  }

  return todas;
}
```

Arquivo: `supabase/functions/sync-presenca-emusys/index.ts`, linhas 167-193.

### 3.2 Campos relacionados à presença

O objeto de aluno atualmente possui:

```ts
interface AlunoEmusys {
  nome_aluno: string;
  presenca: string;
  horario_presenca: string | null;
  data_nascimento_aluno?: string;
  email_aluno?: string;
  telefone_aluno?: string;
  nome_responsavel?: string;
  email_responsavel?: string;
  telefone_responsavel?: string;
  id_lead?: number | null;
  id_aluno?: number | null;
}
```

Arquivo: `supabase/functions/sync-presenca-emusys/index.ts`, linhas 57-70.

A documentação oficial apresenta, por exemplo:

```json
{
  "presenca": "presente",
  "horario_presenca": "09:58:00"
}
```

`horario_presenca` é apenas um horário (`HH:mm:ss`). O payload não apresenta:

- data completa do registro;
- timezone;
- timestamp de criação ou alteração;
- usuário que marcou;
- indicador de que o valor é um timestamp de auditoria da escrita.

Portanto, não é seguro promover `horario_presenca` diretamente a `presenca_registrada_em` sem confirmação formal da semântica pela Emusys.

### 3.3 Auditoria do payload real

Foi consultada uma amostra de 100 aulas reais de Campo Grande, sem imprimir nomes, contatos ou anotações. Campos encontrados:

**Aula:**

```text
alunos, anotacoes, cancelada, categoria, curso_id, curso_nome,
data_hora_fim, data_hora_inicio, duracao_minutos, id, justificada,
matricula_disciplina_id, nr_da_aula, professores, qtd_aulas_contrato,
sala_id, sala_nome, tipo, turma_nome
```

**Aluno na aula:**

```text
data_nascimento_aluno, data_nascimento_responsavel, email_aluno,
email_responsavel, horario_presenca, id_aluno, id_lead, nome_aluno,
nome_responsavel, presenca, telefone_aluno, telefone_responsavel
```

**Professor na aula:**

```text
email, horario_presenca, id, nome, presenca, telefone
```

Valores distintos encontrados em `alunos[].presenca`:

```text
ausente, presente
```

Não foi encontrado campo de autor da marcação nem timestamp completo da escrita.

### 3.4 O horário está sendo trazido?

Sim, mas é gravado em `aluno_presenca.horario_aula`:

```ts
horario_aula: aluno.horario_presenca,
```

Isso cria uma ambiguidade de nomenclatura:

- `aulas_emusys.data_hora_inicio`: horário agendado da aula;
- `aluno_presenca.horario_aula`: recebe atualmente `horario_presenca` do aluno.

O dado de horário da presença não está sendo descartado, mas também não está armazenado em uma coluna explicitamente nomeada como horário da marcação/presença.

### 3.5 A API informa quem marcou?

Não, no contrato atual auditado.

O array `professores[]` descreve os professores associados à aula e a presença do próprio professor. Ele não identifica o usuário, atendente ou professor que executou a ação de marcar a presença do aluno.

O sync usa o primeiro professor da aula para localizar o professor local:

```ts
const profNome = aula.professores?.[0]?.nome || null;
const professorId = profNome ? matchProfessor(profNome, profMapa, profNomes) : null;
```

Arquivo: `supabase/functions/sync-presenca-emusys/index.ts`, linhas 875-878.

Esse professor é o responsável/associado à aula, não uma prova de autoria da marcação.

O mesmo cuidado vale para `aulas_emusys.professor_presenca`. O valor `ausente` não prova falta funcional do professor. Na prática auditada, ele também aparece quando o aluno faltou, quando ninguém registrou a chamada, quando a aula não possui professor atribuído e em linhas repetidas de uma mesma aula de turma. Portanto:

- o campo é um sinal operacional bruto da origem;
- ele não pode alimentar sozinho Health Score, RH ou conversa disciplinar;
- qualquer indicador futuro precisa deduplicar o evento e cruzar alunos presentes, professor atribuído, cancelamento e relatório da aula.

### 3.6 Existe estado “não registrado” distinto de “falta”?

Não no payload atual. A API retornou somente:

- `presente`;
- `ausente`.

O sync converte qualquer valor diferente de `presente` em `ausente`:

```ts
const status = aluno.presenca === 'presente' ? 'presente' : 'ausente';
```

Arquivo: `supabase/functions/sync-presenca-emusys/index.ts`, linha 1084.

Existe uma proteção local de maturidade de 24 horas:

```ts
function podeMaterializarFalta(aula: AulaEmusys, agora = new Date()): boolean {
  if (aula.cancelada) return false;

  const fimIso = aula.data_hora_fim
    ? parseDataHoraEmusys(aula.data_hora_fim)
    : parseDataHoraEmusys(aula.data_hora_inicio);
  const fimAula = new Date(fimIso);
  const limite = new Date(agora.getTime() - MATUREZA_FALTA_HORAS * 60 * 60 * 1000);
  return fimAula <= limite;
}
```

Arquivo: `supabase/functions/sync-presenca-emusys/index.ts`, linhas 94-102.

Essa espera reduz faltas prematuras, mas não cria informação que não existe na origem. Depois de 24 horas, o LA Report ainda não consegue distinguir canonicamente:

- falta efetivamente confirmada;
- presença ainda não registrada no Emusys;
- valor padrão `ausente` devolvido antes de uma ação humana.

---

## 4. Pergunta 3: `aulas_emusys.anotacoes`

### 4.1 Estrutura recebida

O objeto `AulaEmusys` possui somente:

```ts
anotacoes: string | null;
```

Não existem no payload atual:

- `anotacao_criada_em`;
- `anotacao_atualizada_em`;
- `anotacao_autor_id`;
- histórico de versões da anotação.

A documentação oficial também mostra apenas o texto:

```json
{
  "anotacoes": "Trabalho de dinâmica e articulação"
}
```

### 4.2 Comportamento do sync

O sync executa upsert da aula em todas as rodadas:

```ts
const { data: aulaDB, error: aulaError } = await supabase
  .from('aulas_emusys')
  .upsert(
    {
      emusys_id: aula.id,
      unidade_id: unidade.id,
      data_aula: dataAlvo,
      data_hora_inicio: parseDataHoraEmusys(aula.data_hora_inicio),
      data_hora_fim: aula.data_hora_fim
        ? parseDataHoraEmusys(aula.data_hora_fim)
        : null,
      duracao_minutos: aula.duracao_minutos,
      tipo: aula.tipo,
      categoria: aula.categoria,
      turma_nome: aula.turma_nome,
      curso_emusys_id: aula.curso_id,
      curso_nome: aula.curso_nome,
      sala_nome: aula.sala_nome,
      professor_nome: profNome,
      professor_id: professorId,
      cancelada: aula.cancelada,
      nr_da_aula: aula.nr_da_aula,
      matricula_disciplina_id: aula.matricula_disciplina_id ?? null,
      qtd_aulas_contrato: aula.qtd_aulas_contrato,
      qtd_alunos: aula.alunos?.length || 0,
      anotacoes: aula.anotacoes || null,
    },
    { onConflict: 'emusys_id,unidade_id', ignoreDuplicates: false }
  )
  .select('id')
  .single();
```

Arquivo: `supabase/functions/sync-presenca-emusys/index.ts`, linhas 899-930.

Consequências:

1. O upsert não verifica se `anotacoes` mudou.
2. `ignoreDuplicates: false` faz a linha conflitante seguir pelo caminho de atualização.
3. O texto é enviado novamente mesmo quando é idêntico ao já armazenado.
4. Se a API devolver string vazia ou valor falsy, o sync envia `null`.
5. Não existe hoje um timestamp canônico de criação ou edição da anotação.

### 4.3 Triggers atuais

A verificação mais recente encontrou em produção o trigger:

```text
trg_proteger_anotacoes_fabio
BEFORE UPDATE ON public.aulas_emusys
EXECUTE FUNCTION public.fn_proteger_anotacoes_fabio()
```

Esse trigger protege exclusivamente o conteúdo interno do Fábio. Quando `OLD.anotacoes_fabio` já possui texto e um update tenta substituir o campo por vazio ou `null`, ele restaura o valor anterior antes de concluir o update. Uma falha no log de auditoria é capturada para nunca derrubar a atualização da aula.

O upsert do sync também já está corretamente separado: o objeto enviado contém `anotacoes: aula.anotacoes || null`, mas **não contém `anotacoes_fabio`**. Como o PostgREST atualiza no conflito somente as colunas presentes no payload do upsert, o sync não tenta alterar a anotação interna do Fábio.

Essa separação foi confirmada tanto no arquivo local quanto na Edge Function publicada `sync-presenca-emusys`:

| Coluna | Presente no upsert do sync? | Responsabilidade |
|---|---|---|
| `anotacoes` | Sim | Espelho do texto vindo do Emusys |
| `anotacoes_fabio` | Não | Registro interno produzido pelo Fábio/LA Report |

Assim, não foi necessário retirar nenhuma coluna do código. Há duas proteções complementares: ausência de `anotacoes_fabio` no payload do sync e trigger defensivo no banco.

**Governança regularizada:** o trigger, a função de proteção, os logs e a RPC do Fábio foram versionados em `supabase/migrations/20260712125644_isolar_anotacoes_fabio_emusys.sql` e a migration foi aplicada no projeto remoto. A reconstrução do banco pelas migrations passa a recriar essa defesa.

Um trigger genérico adicional de `AFTER UPDATE` em `aulas_emusys` ainda dispararia a cada upsert conflitante, mesmo que o texto do Emusys não tivesse mudado.

Para reagir somente a mudanças reais de anotação, a condição mínima seria:

```sql
when (old.anotacoes is distinct from new.anotacoes)
```

Alternativamente, a própria lógica de sync poderia consultar/comparar o valor anterior antes de gerar um evento pedagógico. O ponto fundamental é que um `UPDATE` da tabela não pode ser interpretado automaticamente como “nova anotação escrita”.

### 4.4 Auditoria completa de escritores de `aulas_emusys`

A busca foi feita no repositório e nas Edge Functions/RPCs publicadas no projeto `ouqwbbermlzqqvtqwlul`.

| Escritor | Operação | Toca `anotacoes` | Toca `anotacoes_fabio` | Resultado |
|---|---|---:|---:|---|
| `sync-presenca-emusys` | upsert da aula | Sim | Não | Seguro |
| `sync-grade-futura-emusys` | upsert em lote da grade futura | Sim | Não | Seguro |
| `sync-grade-futura-emusys` | soft-cancel de aula futura | Não | Não | Seguro; atualiza somente `cancelada` |
| `registrar_aula_fabio` | update do registro interno | Não | Sim | Porta canônica do Fábio |
| `fabio-registro-aula` | fila e envio de áudio | Não | Não | Não escreve diretamente em `aulas_emusys` |
| `processar-matricula-emusys` | matrícula/jornada | Não | Não | Não referencia `aulas_emusys` |
| `sync-matriculas-emusys` | matrícula/jornada | Não | Não | Não referencia `aulas_emusys` |

No banco, `registrar_aula_fabio` foi a única função armazenada encontrada com DML em `aulas_emusys`. A função executa:

```sql
update public.aulas_emusys
set anotacoes_fabio = v_texto_novo
where id = p_aula_id;
```

Ela não possui `set anotacoes = ...` e grava a trilha normal em `aula_registros_fabio_log`.

A ficha escopada do LA Teacher, `app_aluno_ficha`, usa a preferência canônica:

```sql
coalesce(nullif(btrim(ae.anotacoes_fabio), ''), ae.anotacoes)
```

### 4.5 Validação independente do trigger

Foram executados em produção, dentro de uma transação encerrada com `ROLLBACK`, cinco cenários:

1. sync/Emusys atualizando `anotacoes`: preservou o texto do Fábio;
2. update operacional de sala/horário: preservou o texto do Fábio;
3. Fábio substituindo por texto novo: permitiu a alteração;
4. tentativa de esvaziar `anotacoes_fabio`: restaurou o texto e criou log dentro da transação;
5. aula sem anotação do Fábio: continuou vazia, sem inventar conteúdo.

Todos passaram. O `ROLLBACK` removeu os textos e o log de teste. Após a validação, `fabio_protecao_log` permaneceu com **0 linhas reais**.

### 4.6 Versionamento aplicado

A proteção, que existia apenas no banco remoto, foi versionada em:

```text
supabase/migrations/20260712125644_isolar_anotacoes_fabio_emusys.sql
```

A migration foi aplicada com sucesso e registrada no remoto como `isolar_anotacoes_fabio_emusys`. Ela documenta as duas colunas, versiona a RPC, as tabelas de log, a função e o trigger defensivo.

---

## 5. Impacto na métrica de governança do LA Teacher

### 5.1 Métrica desejada

```text
% de aulas com presença/registro realizado em até 24 horas
```

Uma implementação correta exige dois tempos diferentes:

1. `aula_encerrada_em`: instante em que a aula terminou;
2. `presenca_registrada_em`: instante real da ação humana que registrou a chamada.

O LA Report possui o primeiro por meio de `aulas_emusys.data_hora_fim`. Para registros originados no Emusys, não possui o segundo.

### 5.2 Registros que podem entrar hoje

Podem entrar na métrica:

```sql
respondido_por = 'professor_la_teacher'
```

Nesses casos, `respondido_em` corresponde à submissão da chamada pelo professor no LA Teacher.

### 5.3 Registros que não podem entrar como timestamp real

Não devem ser interpretados como ação humana em até 24 horas:

```sql
respondido_por = 'emusys'
```

Para esses registros, `respondido_em` é apenas `sincronizado/materializado pela primeira vez em`.

Também não é correto substituir `respondido_em` por `horario_presenca` sem confirmação da Emusys, pois esse campo:

- contém somente hora;
- não possui data ou timezone;
- não documenta autoria;
- não está formalmente descrito como timestamp de persistência da presença.

### 5.4 Regra segura provisória

Até existir timestamp canônico na origem:

```text
Métrica oficial do LA Teacher = somente chamadas submetidas pelo LA Teacher.
```

Os registros do Emusys podem ser usados para mostrar o resultado final da presença, mas não para medir pontualidade de registro.

---

## 6. Campos necessários na origem

Para permitir uma métrica canônica independente do canal de registro, a API Emusys precisaria expor pelo menos:

```text
presenca_status
presenca_registrada_em
presenca_registrada_por_id
presenca_registrada_por_nome
presenca_registrada_por_tipo
```

Estados recomendados para `presenca_status`:

```text
nao_registrada
presente
ausente
justificada
```

Para anotações:

```text
anotacao_criada_em
anotacao_atualizada_em
anotacao_autor_id
anotacao_autor_nome
```

Idealmente, a Emusys também forneceria um identificador/versionamento da anotação ou um webhook específico de alteração pedagógica.

---

## 7. Custo estimado para trazer os campos

### 7.1 Se a Emusys disponibilizar os campos

O custo dentro do LA Report é baixo a médio:

1. Migration aditiva com colunas explícitas de origem.
2. Atualização das interfaces TypeScript da Edge Function.
3. Mapeamento no `sync-presenca-emusys`.
4. Separação clara entre `registrado_em_origem` e `sincronizado_em`.
5. Testes de timezone, idempotência e atualização tardia.
6. Ajuste da RPC/view usada pela métrica de governança.

Sugestão de separação semântica:

```text
presenca_registrada_em_origem  -> momento real informado pela Emusys
presenca_sincronizada_em       -> momento em que o LA Report recebeu o dado
respondido_em                  -> ação realizada diretamente no LA Teacher/LA Report
```

### 7.2 Backfill histórico

O histórico só poderá ser recuperado se a Emusys disponibilizar retroativamente os metadados de registro.

Se o endpoint passar a fornecer o timestamp somente para eventos futuros, não será tecnicamente seguro reconstruir o passado usando:

- data da aula;
- `created_at` do LA Report;
- `respondido_em` atual;
- horário de execução dos lotes.

Esses valores não demonstram quando a ação humana aconteceu.

### 7.3 Dependência externa

A maior dependência não está no LA Report, mas no contrato da API Emusys. Atualmente a origem não fornece os metadados necessários para uma auditoria de SLA de registro.

---

## 8. Riscos adicionais encontrados

### 8.1 Presença alterada depois da primeira sincronização

Como o upsert de `aluno_presenca` usa `ignoreDuplicates: true`, uma presença já materializada não é atualizada automaticamente pelo sync em caso de mudança posterior no Emusys.

Exemplo de risco:

1. Após a maturidade de 24 horas, o Emusys retorna `ausente`.
2. O LA Report insere falta.
3. Depois alguém corrige a presença no Emusys para `presente`.
4. O sync encontra conflito e ignora a duplicata.
5. A linha local pode continuar como falta.

Esse comportamento não foi alterado nesta auditoria, mas deve ser considerado em uma futura revisão de reconciliação. Qualquer correção precisa respeitar a regra `first-write-wins` do LA Teacher e não pode sobrescrever silenciosamente uma chamada realizada pelo professor.

### 8.2 Ambiguidade de `horario_aula`

O sync do Emusys grava `alunos[].horario_presenca` em `aluno_presenca.horario_aula`. O nome da coluna sugere horário agendado, enquanto o payload sugere horário relacionado à presença.

Para novos consumidores, usar preferencialmente:

- horário da aula: `aulas_emusys.data_hora_inicio`;
- horário da presença: somente após definir coluna e semântica canônicas.

### 8.3 Anotação sem histórico

Como `aulas_emusys.anotacoes` é um espelho mutável, não deve ser tratado como prontuário versionado. O texto anterior pode ser sobrescrito ou limpo sem deixar histórico.

---

## 9. Caminho recomendado para o Claude Code

Ao implementar a governança no LA Teacher:

1. Calcular inicialmente o SLA somente para `respondido_por = 'professor_la_teacher'`.
2. Agrupar por `aula_emusys_id`, não simplesmente por cada linha de aluno.
3. Usar `aulas_emusys.data_hora_fim` como início do prazo.
4. Usar o primeiro `respondido_em` da chamada do LA Teacher como fim do prazo.
5. Não usar `respondido_em` de registros `emusys`.
6. Não usar `aulas_emusys.created_at` como horário da ação pedagógica.
7. Não criar trigger genérico em `aulas_emusys` para detectar novas anotações.
8. Caso seja necessário reagir a anotação, exigir `OLD.anotacoes IS DISTINCT FROM NEW.anotacoes` e reconhecer que isso mede mudança observada pelo sync, não momento real de escrita na origem.
9. Manter separadas as métricas:
   - cobertura de presença final importada do Emusys;
   - pontualidade da chamada submetida no LA Teacher.

---

## 10. Veredito final

| Pergunta | Resposta auditada |
|---|---|
| `aluno_presenca.respondido_em` é real para origem Emusys? | **Não. É horário da primeira materialização pelo sync.** |
| A API expõe horário relacionado à presença? | **Sim, `horario_presenca`, apenas como hora.** |
| A API expõe timestamp completo da marcação? | **Não no contrato/payload atual.** |
| A API expõe quem marcou? | **Não.** |
| A API distingue não registrado de falta? | **Não; foram encontrados apenas `presente` e `ausente`.** |
| O sync traz `horario_presenca`? | **Sim, atualmente para `aluno_presenca.horario_aula`.** |
| A API expõe data de escrita da anotação? | **Não.** |
| O sync atualiza `anotacoes` a cada rodada? | **Sim, via upsert com atualização no conflito.** |
| Um trigger comum de UPDATE dispararia em falso? | **Sim. Deve comparar `OLD` e `NEW`.** |
| A métrica de 24h pode usar registros Emusys hoje? | **Não de forma canônica.** |
| A métrica pode usar chamadas do LA Teacher? | **Sim, usando `respondido_por = 'professor_la_teacher'`.** |

---

## 11. Arquivos centrais para continuidade

- `supabase/functions/sync-presenca-emusys/index.ts`
- `supabase/migrations/20260214_sucesso_aluno_fase1_tabelas.sql`
- `supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql`
- `supabase/migrations/20260710141000_corrige_contratos_la_teacher.sql`
- `supabase/migrations/20260710143000_la_teacher_validacao_claude_code.sql`

---

## 12. Estado da auditoria

- Projeto Supabase confirmado: `ouqwbbermlzqqvtqwlul`.
- Código local auditado.
- Edge Function publicada auditada.
- Schema e triggers consultados em produção, somente leitura.
- Payload real da API inspecionado sem exposição de dados pessoais.
- Nenhuma alteração aplicada.
