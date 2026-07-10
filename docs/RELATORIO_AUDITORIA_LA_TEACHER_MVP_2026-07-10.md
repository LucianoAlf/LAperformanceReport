# Relatorio de auditoria e proposta preliminar: LA Teacher MVP

Data: 10/07/2026
Projeto: LA Performance Report / LA Teacher
Supabase auditado: `ouqwbbermlzqqvtqwlul`
Prazo informado: 21/07/2026
Status: Gate 0 fechado. Backend da Feature 1, espelho de disponibilidade e tela da coordenacao executados em 10/07/2026. Feature 2 condicionada a fonte comprovada.

## 1. Objetivo deste documento

Este relatorio consolida o que foi encontrado no repositorio, no banco de producao e nos payloads reais da API Emusys para as tres frentes do MVP:

1. presenca escrita pelo professor e ponto derivado;
2. aulas a repor, somente leitura para o professor;
3. grade e disponibilidade do professor com aprovacao da coordenacao.

Ele tambem registra as decisoes D1-D6 fechadas para a Fase 3. O objetivo e servir de handoff para Alf, Claude Code e Claude Web sem transformar hipoteses do Emusys em schema definitivo.

## 2. Divisao de responsabilidade

### Codex / LA Report

- migrations versionadas e espelhadas no repo;
- syncs do Emusys;
- RPCs e RLS;
- tela da coordenacao no LA Report;
- testes de banco, edge functions e frontend do LA Report;
- atualizacao de `docs/MAPA-SISTEMA.md` e `docs/MAPA-INTEGRACAO-EMUSYS.md`.

### Claude Code / LA Teacher

- telas do professor;
- consumo exclusivo das RPCs aprovadas;
- nenhum acesso direto a tabelas de contato ou financeiro;
- nenhum schema ou sync no LA Report sem alinhamento do contrato.

### Claude Web

- validacao final do contrato de banco;
- confirmacao das decisoes abertas deste relatorio;
- validacao cruzada antes da publicacao.

## 3. Resumo executivo

As tres features sao viaveis, mas nao estao igualmente prontas para execucao.

### Feature 1: viavel, com dois pre-requisitos novos

O sync atual de presenca realmente sobrescreve a linha existente. A mudanca para first-write-wins e necessaria.

Entretanto, existem duas contradicoes no desenho inicial:

1. o LA Teacher nao tem uma lista estruturada de alunos da aula separada da propria presenca;
2. a situacao administrativa precisa continuar mudando no Emusys mesmo quando a presenca ja foi gravada pelo professor.

Recomendacao:

- criar uma tabela leve de participantes da aula, sem contato e sem financeiro;
- aplicar first-write-wins somente ao fato pedagogico de presenca;
- manter a camada administrativa em tabela fisicamente separada.

### Feature 2: bloqueada por fonte de dados

O payload real de `GET /aulas` traz `justificada: boolean`, mas nenhum dos tres endpoints auditados trouxe:

- direito a reposicao;
- pendente de avaliacao;
- autorizada;
- negada;
- identificador ou data da aula de reposicao;
- vinculo entre falta original e reposicao.

Investigacao adicional apos o Gate 0:

- a documentacao oficial nao lista endpoint de reposicoes;
- as rotas de leitura plausiveis testadas retornaram `Endpoint invalido`;
- `justificada=true` identifica a falta, mas nao informa a reposicao marcada;
- `categoria=extra` aparece em aulas reais, mas nao traz vinculo com a falta original nem identificador de reposicao.

Conclusao D2: nao existe fonte comprovada para a lista de reposicoes marcadas. A Feature 2 fica fora da implementacao ate o Emusys fornecer endpoint, webhook ou campo identificador. Nao derivar reposicao apenas de `justificada=true`.

### Feature 3: nao nasce do zero

Ja existe disponibilidade em producao:

```text
public.professores_unidades.disponibilidade jsonb
```

Ela esta preenchida em 70 de 80 vinculos professor-unidade e ja e usada no cadastro de professor, aluno e turma. Portanto, ela deve permanecer como a fonte vigente da Feature 3. Nao e necessario criar outra tabela principal de disponibilidade nem migrar os 171 intervalos para um novo modelo no MVP.

Decisao D1: o Emusys continua sendo a fonte de edicao e a Mila continua lendo o Emusys. O LA Report mantem um espelho manual por enquanto; o espelhamento automatico por webhook de professor fica para uma fase posterior.

O trabalho necessario fica restrito a:

- preservar e consumir o JSON atual;
- corrigir a gravacao destrutiva do cadastro de professor;
- cruzar disponibilidade com `aulas_emusys` para derivar livre/com aula;
- criar a operacao de coordenacao sem transformar o LA Report na fonte primaria.

A API publica do Emusys oferece leitura de horarios disponiveis para experimental, mas nao foi encontrado endpoint de escrita de disponibilidade. Portanto, uma aprovacao no LA Report nao deve atualizar silenciosamente a disponibilidade vigente: a coordenacao primeiro efetiva a mudanca no Emusys e depois atualiza o espelho manual.

## 4. Como a auditoria foi feita

Foram lidos, sem escrita:

- codigo do sync `supabase/functions/sync-presenca-emusys/index.ts`;
- migrations e funcoes relacionadas a professores, aulas e presenca;
- tela `src/components/App/Professores/TabAgendaProfessores.tsx`;
- cadastro de professor e consumidores da disponibilidade legada;
- catalogo, constraints, indices, policies, grants, views e funcoes do Supabase;
- payloads reais de `GET /aulas`, `GET /professores` e `GET /matriculas`;
- documentacao publica oficial do Emusys.

Nenhum token, telefone, email, CPF ou valor financeiro e reproduzido neste documento.

## 5. Evidencias do banco de producao

### 5.1 `aluno_presenca`

Volume encontrado:

```text
total: 45.969
respondido_por=emusys: 45.968
respondido_por=manual: 1
status=presente: 30.061
status=ausente: 15.908
```

Unicidade existente:

```sql
UNIQUE (aluno_id, aula_emusys_id)
```

O campo `aula_emusys_id` aponta para o ID local `aulas_emusys.id`, nao para o ID externo `aulas_emusys.emusys_id`.

Campos atuais relevantes:

```text
aluno_id
professor_id
unidade_id
data_aula
horario_aula
status
respondido_por
respondido_em
aula_emusys_id
curso_nome
turma_nome
sala_nome
```

O schema atual ainda nao possui:

```text
status_presenca
situacao_administrativa
```

O constraint atual de `respondido_por` aceita apenas:

```text
professor_whatsapp
manual
sistema
emusys
```

Portanto, a migration da Feature 1 tambem precisa incluir `professor_la_teacher`; sem isso, a RPC solicitada falha mesmo que toda a logica esteja correta.

### 5.2 Dependencias de `aluno_presenca`

Foram encontradas 20 funcoes/views dependentes da tabela. Entre as mais sensiveis:

```text
app_minha_agenda_sessao
atualizar_percentual_presenca
get_candidatos_pesquisa_primeira_aula
get_dados_relatorio_coordenacao
get_faltas_periodo
get_kpis_professor_periodo
rpc_analise_turmas
vw_absenteismo_aluno
vw_jornada_aluno_com_presenca
vw_fabio_aulas_contexto
```

Varias ainda comparam diretamente:

```sql
status = 'presente'
status = 'ausente'
```

Conclusao: renomear ou trocar os valores de `status` em uma unica migration teria blast radius alto. Para o MVP, a mudanca deve ser aditiva e compativel.

### 5.3 RLS atual de presenca e um risco

`aluno_presenca` tem RLS habilitado, mas a policy atual permite `ALL` para qualquer usuario autenticado:

```text
Authenticated users can manage attendance
qual: auth.role() = 'authenticated'
```

Isso nao atende ao requisito de professor limitado a si mesmo. A escrita do LA Teacher deve acontecer somente por RPC `SECURITY DEFINER`, guardada por `fn_professor_do_usuario()` e sem `professor_id` arbitrario vindo do cliente.

### 5.4 Funcoes do LA Teacher existentes somente no banco

As funcoes abaixo existem em producao, mas nao foram localizadas nas migrations do repositorio:

```text
fn_professor_do_usuario()
app_minha_agenda_sessao(p_data date)
```

Isso e schema drift e precisa ser corrigido antes de novas RPCs dependerem delas.

`fn_professor_do_usuario()` faz o vinculo correto:

```text
auth.uid()
  -> usuarios.auth_user_id
  -> professores.usuario_id
  -> professores.id
```

Porem ela ainda aparece com permissao de execucao para `anon`. Mesmo retornando `NULL` sem usuario autenticado, o grant deve ser revogado e versionado.

### 5.5 A agenda atual do LA Teacher ja existe parcialmente

`app_minha_agenda_sessao` ja retorna aulas do professor autenticado, nomes dos alunos quando existem linhas de presenca e uma estrutura anonima para o futuro.

Dois problemas impactam a nova feature:

1. para aulas futuras sem presenca, ela retorna `A confirmar`, pois `aulas_emusys` nao guarda a lista estruturada de alunos;
2. em alguns pontos usa `coalesce(ap.status, 'presente')`, o que transforma status nulo em presenca e merece correcao.

### 5.6 `aulas_emusys`

O espelho atual possui cerca de 43 mil aulas nas categorias:

```text
normal: 42.311
experimental: 692
extra: 23
reposicao: 0
```

O campo `justificada` ainda nao existe em `aulas_emusys`, apesar de vir no payload real da API.

### 5.7 Disponibilidade legada ja existente

Estado real:

```text
vinculos professor-unidade: 80
com disponibilidade JSON: 70
intervalos cadastrados: 171
intervalos com hora invalida: 0
chaves nao canonicas: 1 x "Sexta-feira"
```

Formato atual:

```json
{
  "Segunda": { "inicio": "15:00", "fim": "20:00" },
  "Quarta": { "inicio": "14:00", "fim": "21:00" }
}
```

Limitacoes:

- somente um intervalo por dia;
- nao representa pausa ou mais de um turno;
- nao distingue livre de bloqueado;
- nao tem versao;
- nao tem proposta pendente;
- nao tem aprovacao/rejeicao;
- nao guarda quem aprovou;
- possui nomes de dia inconsistentes.

Consumidores atuais:

```text
ProfessoresPage.tsx
ModalProfessor.tsx
ModalNovoAluno.tsx
ModalNovaTurma.tsx
```

### 5.8 Risco adicional no cadastro de professor

Ao editar um professor, `ProfessoresPage.tsx` atualmente:

1. apaga todos os registros de `professores_unidades` do professor;
2. reinsere apenas `professor_id`, `unidade_id` e `disponibilidade`.

Esse fluxo pode apagar metadados de identidade Emusys existentes na mesma linha:

```text
emusys_id
emusys_nome
emusys_nome_normalizado
validacao_status
payload_emusys
last_seen_em
```

A Feature 3 deve substituir essa escrita destrutiva por RPC transacional. Nao se deve manter o padrao delete/reinsert.

## 6. Evidencias do sync de presenca

### 6.1 Trecho atual

O sync atual sobrescreve conflito:

```ts
await supabase
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
      respondido_por: 'emusys',
      respondido_em: new Date().toISOString(),
    },
    {
      onConflict: 'aluno_id,aula_emusys_id',
      ignoreDuplicates: false,
    }
  );
```

`ignoreDuplicates: false` gera `ON CONFLICT DO UPDATE`. Portanto, a auditoria confirma o risco de sobrescrita.

### 6.2 Ajuste estrito proposto para a camada de presenca

Mantendo first-write-wins literal:

```ts
await supabase
  .from('aluno_presenca')
  .upsert(
    {
      aluno_id: alunoId,
      aula_emusys_id: aulaLocalId,
      professor_id: professorId,
      unidade_id: unidade.id,
      data_aula: dataAlvo,
      status_presenca: status === 'presente' ? 'presente' : 'falta',
      respondido_por: 'emusys',
      respondido_em: new Date().toISOString(),
    },
    {
      onConflict: 'aluno_id,aula_emusys_id',
      ignoreDuplicates: true,
    }
  );
```

`ignoreDuplicates: true` corresponde a `ON CONFLICT DO NOTHING`.

### 6.3 Contradicao entre first-write-wins e camada administrativa

Se `situacao_administrativa` ficar na mesma linha e o professor gravar primeiro, um `DO NOTHING` posterior tambem impede o Emusys de atualizar justificativa ou autorizacao.

Existem duas solucoes coerentes:

#### Opcao A: separacao fisica, recomendada se first-write-wins for literal

```text
aluno_presenca
  - status_presenca
  - respondido_por
  - respondido_em

aluno_presenca_administrativo
  - situacao_administrativa
  - fonte
  - atualizado_em
```

Uma view combina os dois campos para LA Teacher e LA Report.

#### Opcao B: ownership por coluna

O conflito nunca altera `status_presenca`, `respondido_por` ou `respondido_em`, mas permite ao Emusys atualizar apenas `situacao_administrativa`.

Esta opcao e mais simples fisicamente, mas exige aprovar que first-write-wins vale para a presenca, nao para a linha inteira.

### 6.4 O cron atual nao prepara o roster futuro

O `sync-presenca-emusys` recebe uma data final e processa essa data ou uma janela retroativa. Sem parametros, processa somente o dia atual:

```text
data final: hoje em BRT
dias: 1 por default
janela: hoje e dias anteriores
```

Ele nao possui hoje uma janela futura recorrente para preparar a lista de alunos antes da aula. Assim, apenas criar `aula_alunos_emusys` nao basta; e necessario um produtor pre-aula.

Opcoes:

1. criar um sync de agenda/roster futuro, recomendado por separar agenda de frequencia;
2. adicionar um modo futuro ao sync atual, com cuidado para nao criar presencas antecipadas;
3. carregar roster sob demanda quando o professor abre o dia, menos resiliente e dependente do Emusys em tempo real.

Recomendacao preliminar: sync futuro idempotente de `aulas_emusys` + `aula_alunos_emusys`, sem tocar em `aluno_presenca`; o sync de presenca continua responsavel somente pelo fato ocorrido.

### 6.5 Credenciais Emusys hardcoded

Os tokens das tres unidades estao no array `UNIDADES` da edge atual. Eles nao sao reproduzidos aqui, mas precisam sair do codigo antes de ampliar o sync.

Recomendacao:

- carregar tokens por Supabase secrets/env;
- manter no codigo somente nome/codigo/ID local da unidade;
- rotacionar os tokens existentes apos a retirada do repositorio;
- garantir que logs e fixtures nunca gravem headers de autenticacao.

## 7. Auditoria dos payloads reais do Emusys

### 7.1 `GET /professores`

Payload real observado:

```json
{
  "professores": [
    { "id": 32, "nome": "[redigido]" }
  ]
}
```

Nao trouxe:

```text
disponibilidade
grade
reposicoes
justificativas
```

### 7.2 `GET /matriculas`

Shape real observado:

```json
{
  "id": 123,
  "data_matricula": "2026-01-01",
  "status": "ativa",
  "qtd_contratos": 1,
  "aluno": { "...": "dados pessoais redigidos" },
  "responsavel": { "...": "dados pessoais redigidos" },
  "contrato_atual": {
    "id": 456,
    "disciplinas": [
      {
        "id": 789,
        "disciplina_id": 27,
        "nome": "Bateria",
        "id_professor": 48,
        "nr_aulas_contratadas": 12,
        "nr_aulas_passadas": 6,
        "nr_aulas_futuras": 6,
        "agendamentos": []
      }
    ]
  }
}
```

Nao trouxe justificativa nem reposicao.

Observacao: o payload real ainda retornou `disciplina.id`; isso diverge da referencia interna que esperava `matricula_disciplina_id`. O parser deve ser tolerante enquanto o contrato da API nao estiver estabilizado.

### 7.3 `GET /aulas`

Exemplo real redigido de uma falta justificada:

```json
{
  "id": 679289,
  "matricula_disciplina_id": 0,
  "categoria": "normal",
  "cancelada": false,
  "justificada": true,
  "data_hora_inicio": "2026-06-11 10:00",
  "data_hora_fim": "2026-06-11 10:50",
  "curso_id": 27,
  "curso_nome": "Bateria T",
  "professores": [
    { "id": 48, "nome": "[redigido]", "presenca": "ausente" }
  ],
  "alunos": [
    { "id_aluno": 2166, "nome_aluno": "[redigido]", "presenca": "ausente" }
  ]
}
```

Auditorias realizadas:

```text
amostra paginada Campo Grande: 2.000 itens
campo justificada presente: 2.000
justificada=true: 80

01/07 a 10/07, tres unidades:
Campo Grande: 862 itens
Barra: 719 itens
Recreio: 881 itens
categoria reposicao encontrada: 0
```

O espelho inteiro do LA Report tambem nao possui categoria `reposicao` neste momento.

### 7.4 Disponibilidade de experimental

A documentacao oficial expoe:

```text
GET /v1/crm/aula_experimental/disponibilidade
```

Ela retorna horarios livres para uma data e disciplina, com filtro opcional de professor. Nao foi encontrado endpoint publico de escrita da disponibilidade do professor.

Referencias oficiais:

- [Professores](https://emusys.gitbook.io/emusys/api-emusys/referencia/professores)
- [Aulas](https://emusys.gitbook.io/emusys/api-emusys/referencia/aulas)
- [Disponibilidade de aula experimental](https://emusys.gitbook.io/emusys/api-emusys/referencia/aula-experimental/buscar-disponibilidade-para-aula-experimental)

## 8. Contrapontos criticos

### 8.1 `ausente` exige janela de maturidade

Em `GET /aulas`, a presenca possui somente `presente` ou `ausente`. Nao existe `nao_registrada`.

Semantica confirmada pelo Emusys:

```text
aula futura = nada
aula passada sem registro = ausente/falta
```

Consequencia D4: o sync nunca materializa falta imediatamente apos a aula. A janela do professor e de 24 horas; o sync so pode inserir `falta` quando `data_hora_fim <= now() - interval '24 hours'`. Como o cron e diario, a maturidade efetiva tende a ficar entre 24 e 48 horas.

Dentro da janela, o professor escreve primeiro. Depois da maturidade, se nenhuma fonte escreveu, o Emusys materializa a falta.

Aula cancelada e um terceiro estado operacional: nao vira presenca nem falta e nao entra no ponto. Todas as views canonicas devem excluir `aulas_emusys.cancelada=true`.

### 8.2 Falta uma lista de participantes independente da presenca

`aulas_emusys` guarda quantidade de alunos, mas nao os participantes. Os nomes aparecem hoje porque o sync ja criou linhas em `aluno_presenca`.

Isso inviabiliza o fluxo literal:

```text
professor e o primeiro escritor
  -> recebe a lista da aula
  -> marca todos presentes, exceto ausentes
```

Sem uma lista separada, o professor so conhece os alunos depois que o Emusys ja escreveu presenca.

Pre-requisito recomendado:

```text
public.aula_alunos_emusys
```

Essa tabela deve guardar somente identificadores operacionais:

```text
aula_emusys_id local
unidade_id
aluno_id local, nullable enquanto houver divergencia
emusys_aluno_id
aluno_nome_snapshot, somente para diagnostico/roster
status_vinculo
sincronizado_em
```

Quando houver vinculo, o nome deve vir por join com `alunos`; o snapshot serve apenas para nao perder o participante durante conciliacao. Nao guardar telefone, email, CPF, responsavel ou financeiro.

Como `aluno_presenca.aluno_id` e obrigatorio, uma aula com participante nao conciliado deve voltar para o app com bloqueio operacional explicito, em vez de gravar um lote parcial ou inventar um aluno. O match primario deve usar `(unidade_id, emusys_student_id)`.

O roster deve ser populado antes da aula por um sync futuro dedicado. O cron de presenca atual nao faz essa preparacao por default.

### 8.3 Correcao administrativa auditada

Decisao D6:

- professor nunca edita depois do primeiro envio;
- correcao excepcional somente por RPC administrativa da coordenacao;
- toda correcao exige motivo;
- a mudanca grava uma trilha append-only com valor anterior, valor novo, autor e data;
- a RPC e a unica excecao controlada ao first-write-wins.

### 8.4 O calculo de ponto precisa usar horario da aula

`aluno_presenca.horario_aula` recebe atualmente `aluno.horario_presenca`. Para faltas esse valor costuma ser nulo e, para presentes, e o horario real de registro, nao necessariamente o inicio da aula.

A view de ponto deve usar:

```text
aulas_emusys.data_hora_inicio
aulas_emusys.data_hora_fim
aulas_emusys.duracao_minutos
```

Tambem deve agrupar por `aula_emusys_id`, pois uma turma pode ter varios alunos e nao pode multiplicar horas.

### 8.5 Regra fechada do ponto

Decisao D5:

- `minutos_creditados` e a soma das duracoes das aulas distintas entre a primeira e a ultima presenca;
- pontas presentes entram;
- faltas cercadas entram;
- falta na ponta so entra com confirmacao positiva do Fabio;
- sem resposta, a ponta fica fora;
- uma unica aula presente credita a duracao integral dela;
- inicio exibido = inicio da primeira aula creditada;
- fim exibido = fim da ultima aula creditada;
- aulas canceladas ficam fora.

Casos canonicos:

```text
14h falta, 15h presente, 16h presente -> credita 15h e 16h
14h presente, 15h falta, 16h presente -> credita as tres
15h presente -> credita a duracao da aula
```

## 9. Arquitetura recomendada

### 9.1 Opcao recomendada: ownership claro com compatibilidade

```text
Emusys GET /aulas
  -> aulas_emusys
  -> aula_alunos_emusys (roster)
  -> aluno_presenca (first-write-wins pedagogico)
  -> aluno_presenca_administrativo (estado administrativo)

LA Teacher
  -> app_minha_agenda_sessao
  -> app_registrar_presencas_aula
  -> app_listar_reposicoes
  -> app_ler_disponibilidade
  -> app_propor_disponibilidade

LA Report / Coordenacao
  -> rpc_agenda_professores_geral
  -> rpc_agenda_professor_detalhe
  -> rpc_aprovar_disponibilidade
  -> rpc_rejeitar_disponibilidade
```

Beneficios:

- ownership claro;
- first-write-wins real;
- administrativo pode evoluir sem sobrescrever professor;
- zero contato/financeiro no contrato do app;
- migracao segura da disponibilidade legada;
- menor acoplamento com o Emusys.

### 9.2 Alternativa: tudo em `aluno_presenca`

Menos tabelas, mas exige permitir update administrativo na linha e reinterpretar first-write-wins como ownership por coluna.

### 9.3 Alternativa nao recomendada: LA Teacher chama Emusys diretamente

Problemas:

- duplica autenticacao e regras;
- expande exposicao de payload com contato/financeiro;
- perde conciliacao local;
- dificulta RLS e auditoria;
- aumenta dependencia de rate limit e disponibilidade externa.

## 10. Contrato preliminar por feature

Os nomes abaixo sao proposta de contrato, nao SQL pronto para aplicacao.

### 10.1 Feature 1: roster de aula

```sql
create table public.aula_alunos_emusys (
  id uuid primary key,
  aula_emusys_id integer not null references public.aulas_emusys(id),
  unidade_id uuid not null references public.unidades(id),
  aluno_id integer references public.alunos(id),
  emusys_aluno_id text not null,
  aluno_nome_snapshot text not null,
  status_vinculo text not null,
  sincronizado_em timestamptz not null,
  unique (aula_emusys_id, emusys_aluno_id)
);
```

Observacao: IDs do Emusys sao namespaced por unidade. Qualquer unicidade de ID externo deve incluir `unidade_id`.

### 10.2 Feature 1: presenca canonica

Migracao aditiva:

```sql
alter table public.aluno_presenca
  add column status_presenca text,
  add column fonte_presenca text;
```

Backfill conceitual:

```text
presente -> presente
ausente -> falta
pendente -> null
remarcou -> migrar para camada administrativa, apos validacao
```

O campo legado `status` deve permanecer temporariamente ate os 20 consumidores migrarem.

### 10.3 Feature 1: administrativo separado

```sql
create table public.aluno_presenca_administrativo (
  aluno_presenca_id uuid primary key references public.aluno_presenca(id),
  situacao_administrativa text not null,
  fonte text not null default 'emusys',
  atualizado_em timestamptz not null,
  sincronizado_em timestamptz not null
);
```

Estados preliminares, ainda dependentes da fonte real:

```text
sem_informacao
nao_justificada
justificada_sem_direito
justificada_pendente_avaliacao
justificada_autorizada
justificada_negada
```

Hoje so e possivel preencher com seguranca `nao_justificada` ou `justificada`; os demais estados continuam bloqueados.

### 10.4 Feature 1: RPC de lote

Assinatura sugerida:

```text
app_registrar_presencas_aula(
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[]
) returns jsonb
```

Regras:

- nao recebe `professor_id`;
- deriva professor por `fn_professor_do_usuario()`;
- valida `aulas_emusys.professor_id`;
- bloqueia a aula se houver participante sem `aluno_id` conciliado;
- valida que todos os ausentes pertencem a `aula_alunos_emusys`;
- insere presente para o roster inteiro, falta para os IDs informados;
- usa `ON CONFLICT DO NOTHING`;
- responde quantos foram inseridos e quantos ja estavam travados;
- nao retorna telefone, email, CPF, responsavel ou financeiro.

### 10.5 Feature 1: ponto derivado

Estruturas sugeridas:

```text
professor_ponto_confirmacoes
vw_ponto_professor_aulas
vw_ponto_professor_diario
```

`professor_ponto_confirmacoes`:

```text
id
professor_id
unidade_id
aula_emusys_id
data_aula
resposta boolean
toque_hermes_id
respondido_em
created_at
unique (professor_id, aula_emusys_id)
```

RPC:

```text
app_responder_confirmacao_ponto(p_aula_emusys_id, p_estava_na_escola)
```

Sem resposta ou resposta negativa nao gera credito.

### 10.6 Feature 2: tabela proposta, bloqueada

Somente criar depois de confirmar a fonte:

```sql
create table public.aulas_reposicao (
  id uuid primary key,
  unidade_id uuid not null references public.unidades(id),
  emusys_id bigint not null,
  aluno_id integer references public.alunos(id),
  professor_id integer references public.professores(id),
  aula_origem_id integer references public.aulas_emusys(id),
  emusys_aula_origem_id bigint,
  matricula_disciplina_id bigint,
  data_reposicao date,
  horario time,
  curso_nome text,
  status text not null,
  sincronizado_em timestamptz not null,
  unique (unidade_id, emusys_id)
);
```

RPC de leitura:

```text
app_listar_reposicoes(p_status text default null)
```

Ela deriva o professor autenticado e nunca aceita outro professor como parametro.

### 10.7 Feature 3: reutilizar a disponibilidade existente

Fonte vigente:

```text
public.professores_unidades.disponibilidade jsonb
```

O formato atual deve continuar sendo o contrato do MVP:

```json
{
  "Segunda": { "inicio": "10:00", "fim": "21:00" },
  "Terca": { "inicio": "15:00", "fim": "18:00" }
}
```

Nao criar no MVP:

```text
disponibilidade_professor como nova fonte
professor_disponibilidade_versoes
professor_disponibilidade_slots
backfill dos 171 intervalos
```

Os horarios livres e ocupados devem ser derivados em leitura:

```text
disponibilidade vigente
  - aulas_emusys nao canceladas
  = janelas livres para exibicao/encaixe
```

Assim, `livre` e `com_aula` nao viram dados duplicados persistidos.

### 10.8 Operacao e espelhamento manual

Se o professor propuser mudanca pelo LA Teacher, e necessario guardar a proposta sem alterar o JSON espelhado. Tabela de suporte sugerida:

```text
professor_disponibilidade_solicitacoes
```

Campos preliminares:

```text
id
professor_id
unidade_id
disponibilidade_atual_snapshot jsonb
disponibilidade_proposta jsonb
status: pendente_aprovacao | aprovada_aguardando_emusys | efetivada | rejeitada | cancelada
proposta_por
proposta_em
justificativa
decidido_por
decidido_em
motivo_decisao
created_at
updated_at
```

Regras:

- o professor somente cria proposta para si;
- a proposta nunca altera `professores_unidades.disponibilidade` diretamente;
- aprovacao nao muda automaticamente o espelho;
- a coordenacao efetiva a mudanca no Emusys;
- depois confirma o espelhamento manual no LA Report;
- a efetivacao faz `UPDATE` no vinculo existente, dentro da mesma transacao;
- nunca apagar e reinserir `professores_unidades`;
- rejeicao preserva integralmente a disponibilidade vigente;
- o snapshot permite comparar vigente x proposta e mantem historico das decisoes;
- no maximo uma solicitacao pendente por professor/unidade no MVP;
- toda leitura do professor usa `fn_professor_do_usuario()`.

### 10.9 Compatibilidade dos cadastros existentes

Nao ha migracao estrutural nem backfill dos 70 vinculos/171 intervalos.

Ajustes pontuais:

1. preservar todos os JSONs existentes;
2. normalizar somente a chave inconsistente `Sexta-feira` para `Sexta`, com validacao nominal;
3. fazer a ficha atual atualizar o vinculo em vez de delete/reinsert;
4. manter `ModalNovoAluno` e `ModalNovaTurma` lendo a mesma disponibilidade;
5. expor RPC/view de leitura para LA Teacher, coordenacao, recepcao e comercial;
6. impedir o professor de escrever diretamente na coluna vigente.

## 11. RLS e autorizacao

### Professor

- leitura apenas de suas aulas, reposicoes, ponto e disponibilidade;
- escrita somente via RPC guardada;
- nenhum parametro permite escolher outro professor;
- nenhum acesso direto a contato/financeiro;
- nenhuma permissao para aprovar a propria proposta.

### Coordenacao

O banco ja possui:

```text
professores.ver
professores.editar
professores.carteira
professores.avaliar
```

Recomendacao para menor privilegio:

```text
professores.disponibilidade.ver
professores.disponibilidade.editar
professores.disponibilidade.aprovar
```

As policies/RPCs devem validar permissao no banco e unidade do usuario. Esconder botao no frontend nao e autorizacao.

### Service role

- syncs de Emusys e backfills aprovados de outras features;
- sem grant de escrita para `anon` ou `authenticated` nas tabelas de integracao;
- `REVOKE EXECUTE FROM PUBLIC, anon` em todas as RPCs autenticadas.

## 12. Proposta de tela da coordenacao

A aba atual `Agenda` nao e grade de aulas. Ela gerencia:

```text
professor_acoes
treinamentos
metas
kanban/lista/calendario de acoes
```

Recomendacao visual escolhida para o plano:

```text
Agenda
  -> Acoes
  -> Grade e disponibilidade
```

Dentro de `Grade e disponibilidade`:

```text
Agenda geral
  - semana por unidade
  - filtros por professor, curso e status
  - livre, com aula, bloqueado, proposta pendente
  - painel de aprovacoes

Por professor
  - vigente x proposta
  - diff de dias/horarios
  - cadastrar pela coordenacao
  - aprovar ou rejeitar com motivo
```

Nao misturar no mesmo calendario:

- aula do professor;
- disponibilidade recorrente;
- reuniao/treinamento/meta da coordenacao.

Os conceitos podem compartilhar navegacao, mas devem ter subvisoes distintas.

## 13. Mini plano ate 21/07

### Gate 0: decisoes, 10-11/07

- Alf decide onde Mila le disponibilidade;
- Emusys confirma significado de `ausente`;
- fonte de reposicao e identificada;
- Claude Web valida separacao fisica da camada administrativa;
- regra de minutos do ponto e fechada.

### Lote 1: fundacao e seguranca, 11-12/07

- espelhar `fn_professor_do_usuario` e `app_minha_agenda_sessao` no repo;
- revogar grants indevidos;
- retirar tokens Emusys hardcoded e rotacionar as credenciais;
- criar roster de alunos por aula;
- criar o sync futuro de agenda/roster sem presenca;
- sincronizar `aulas_emusys.justificada`;
- criar fixtures redigidas dos payloads reais.

### Lote 2: presenca e ponto, 12-15/07

- testes first-write-wins nos dois sentidos;
- RPC de lote guardada;
- camada administrativa;
- tabela de confirmacao de ponta;
- views de ponto;
- compatibilidade com consumidores de `status` legado.

### Lote 3: disponibilidade, 14-17/07

- manter `professores_unidades.disponibilidade` como fonte vigente;
- criar apenas solicitacoes e RLS, se a proposta pelo professor estiver no MVP;
- RPCs ler, propor, aprovar e rejeitar;
- trocar escrita destrutiva do cadastro de professor;
- manter o cadastro de aluno/turma lendo o JSON atual;
- derivar livre/com aula sem persistir uma segunda disponibilidade.

### Lote 4: tela da coordenacao, 16-19/07

- subvisoes `Acoes` e `Grade e disponibilidade`;
- agenda geral;
- agenda por professor;
- comparacao vigente/proposta;
- aprovar/rejeitar;
- estados vazio, loading, erro e conflito.

### Lote 5: reposicao, condicionado a fonte, 17-19/07

- implementar somente se endpoint/webhook real for confirmado;
- caso contrario, manter fora do release em vez de criar tabela vazia ou inferir autorizacao.

### Lote 6: validacao e handoff, 19-21/07

- testes SQL transacionais;
- testes das edges com fixtures;
- testes de autorizacao e RLS;
- typecheck e build;
- screenshots desktop/mobile da coordenacao;
- contrato final entregue ao Claude Code;
- smoke de producao somente apos OK explicito.

## 14. Matriz minima de testes

### Presenca

- Emusys primeiro, professor depois: Emusys permanece;
- professor primeiro, Emusys depois: professor permanece;
- professor A tenta aula do professor B: `42501`;
- ausente fora do roster: rejeita o lote inteiro;
- turma com varios alunos: uma aula, varios fatos de presenca;
- retries identicos: idempotentes;
- administrativo atualiza sem alterar presenca;
- sem contato/financeiro no retorno.

### Ponto

- `14 falta, 15 presente, 16 presente`: 14 nao creditado;
- `14 presente, 15 falta, 16 presente`: 15 creditado;
- todas faltas: zero credito;
- uma unica aula presente: credita a duracao da aula;
- turma com cinco alunos: horario nao multiplica por cinco;
- confirmacao positiva de ponta: credita conforme regra aprovada;
- confirmacao ausente/negativa: conservador.

### Disponibilidade

- os 70 vinculos e 171 intervalos permanecem inalterados;
- `Sexta-feira` normaliza sem duplicar;
- professor propoe mas nao aprova;
- coordenacao fora da unidade nao aprova;
- rejeicao preserva vigente;
- aprovacao atualiza o JSON vigente atomicamente;
- livre/com aula e derivado corretamente a partir de `aulas_emusys`;
- edicao de professor preserva IDs e payload Emusys.

### Reposicao

- unicidade inclui unidade;
- retry do sync nao duplica;
- professor so le as proprias;
- vinculo com falta original e opcional, nunca inventado;
- status desconhecido fica explicito, nao e inferido.

## 15. Arquivos previstos para a Fase 3

Backend e banco:

```text
supabase/migrations/<timestamp>_la_teacher_presenca_roster.sql
supabase/migrations/<timestamp>_la_teacher_ponto_professor.sql
supabase/migrations/<timestamp>_disponibilidade_professor_solicitacoes.sql
supabase/migrations/<timestamp>_aulas_reposicao.sql        # somente apos fonte
supabase/functions/sync-presenca-emusys/index.ts
supabase/functions/sync-reposicoes-emusys/index.ts         # somente apos fonte
```

LA Report:

```text
src/components/App/Professores/TabAgendaProfessores.tsx
src/components/App/Professores/agenda/TabAcoesCoordenacao.tsx
src/components/App/Professores/agenda/TabGradeDisponibilidade.tsx
src/components/App/Professores/agenda/AgendaGeralProfessores.tsx
src/components/App/Professores/agenda/AgendaPorProfessor.tsx
src/hooks/useDisponibilidadeProfessores.ts
src/types/database.types.ts
```

Testes e docs:

```text
tests/laTeacherPresencaBackend.test.mjs
tests/disponibilidadeProfessoresBackend.test.mjs
tests/reposicoesProfessorBackend.test.mjs              # somente apos fonte
docs/MAPA-SISTEMA.md
docs/MAPA-INTEGRACAO-EMUSYS.md
```

## 16. Gate 0 fechado: decisoes da Fase 3

### D1. Disponibilidade

- Mila continua lendo o Emusys;
- fonte de edicao atual = Emusys;
- LA Report = espelho manual, visualizacao e operacao;
- webhook Emusys para LA Report fica para fase posterior.

### D2. Fonte oficial de reposicao

Fonte nao comprovada. Feature fora da execucao ate existir endpoint, webhook ou campo identificador. `justificada=true` nao e suficiente para afirmar que uma reposicao foi marcada.

### D3. First-write-wins e administrativo

Tabela administrativa separada de `aluno_presenca`.

### D4. Semantica de `ausente` no Emusys

Passado sem registro = falta, mas somente depois de 24 horas de maturidade. Futuro = nenhum fato. Cancelada = terceiro estado, excluido de falta e ponto.

### D5. Regra exata do ponto

Minutos = soma das duracoes distintas dentro do intervalo comprovado. Uma aula presente credita sua duracao. Ponta ambigua so entra com confirmacao positiva do Fabio.

### D6. Correcao excepcional de presenca

RPC administrativa da coordenacao, motivo obrigatorio e trilha append-only. Professor nunca edita depois do envio.

## 17. Recomendacao final

Ordem recomendada:

```text
1. Corrigir drift e seguranca das funcoes existentes.
2. Corrigir o update de `professores_unidades` sem delete/reinsert.
3. Criar roster separado e sync futuro.
4. Entregar presenca, maturidade, administrativo e correcao.
5. Entregar ponto derivado e confirmacao de ponta.
6. Reutilizar a disponibilidade espelhada e entregar a operacao da coordenacao.
7. Manter reposicao fora ate existir fonte comprovada.
```

O maior risco nao e o volume de codigo. E consolidar no schema uma interpretacao errada do Emusys ou apagar estruturas que ja estao em uso. A abordagem acima preserva os dados existentes, fecha o acesso do professor e mantem cada decisao sob responsabilidade da fonte correta.

## 18. Addendum de execucao da Fase 3 - 10/07/2026

### 18.1 Banco e RPCs aplicados

Foram aplicadas no projeto Supabase `ouqwbbermlzqqvtqwlul`:

```text
20260710120000_la_teacher_presenca_ponto.sql
20260710121000_cron_sync_agenda_professor_emusys.sql
20260710130000_disponibilidade_professor_espelho.sql
20260710140000_hardening_la_teacher_rls_indices.sql
20260710141000_corrige_contratos_la_teacher.sql
20260710142000_corrige_encoding_dias_disponibilidade.sql
```

Entregas confirmadas:

- `aluno_presenca.status_presenca` aditivo, com backfill completo de `presente|ausente` para `presente|falta`;
- roster separado em `aula_alunos_emusys`, sem telefone, e-mail ou financeiro;
- justificativa separada em `aluno_presenca_administrativo`;
- confirmacao de ponta em `professor_ponto_confirmacoes`;
- retificacao append-only em `aluno_presenca_retificacoes`;
- RPC de chamada em lote guardada por `fn_professor_do_usuario()`;
- RPC administrativa de correcao com motivo e permissao da unidade;
- views de ponto por aula e por dia;
- ponto diario consolidado em uma linha mesmo quando o professor atua em mais de uma unidade;
- workflow de disponibilidade `pendente_aprovacao -> aprovada_aguardando_emusys -> efetivada`;
- RLS em todas as tabelas novas, escrita direta negada e policy explicita para `service_role`;
- advisors de seguranca sem alertas para as novas tabelas apos o hardening.
- variantes acentuadas das chaves `Terca`/`Sabado` reconhecidas por bytes UTF-8, evitando dependencia do encoding do terminal de migration.

### 18.2 Sync Emusys publicado

A Edge Function `sync-presenca-emusys` foi publicada com:

- tokens das unidades lidos de secrets, sem novos tokens hardcoded;
- modo `agenda`, que sincroniza aulas, roster e justificativa sem criar presenca;
- modo `presenca`, que insere `presente` imediatamente e so materializa `falta` 24 horas apos o fim da aula;
- `ON CONFLICT DO NOTHING` para `aluno_presenca`;
- canceladas apenas espelhadas em `aulas_emusys`, sem falta e sem ponto.

Tres jobs diarios foram criados, um por unidade, usando token armazenado no Vault e janela futura de sete dias.

Carga inicial confirmada em producao:

```text
periodo do roster: 10/07/2026 a 16/07/2026
linhas de roster: 2.356
linhas administrativas conciliadas: 2.274
presencas criadas pelo modo agenda: 0
presencas com canonico pendente apos backfill: 0
```

A diferenca entre roster e administrativo corresponde a alunos do payload que ainda nao obtiveram vinculo local seguro; a RPC bloqueia chamada com roster incompleto em vez de atribuir aluno por palpite.

### 18.3 Disponibilidade existente preservada

O fluxo de edicao de professor deixou de apagar e recriar todos os registros de `professores_unidades`.

Agora:

- vinculo existente recebe `UPDATE` somente em `disponibilidade`;
- unidade realmente nova recebe `INSERT`;
- unidade explicitamente removida remove apenas o ID daquele vinculo;
- `emusys_id`, `payload_emusys`, `validacao_status`, `match_score`, `origem` e `last_seen_em` permanecem intactos nos vinculos mantidos.

### 18.4 Tela da coordenacao implementada no branch

A aba `Agenda` ganhou duas subvisoes:

```text
Acoes
Grade e disponibilidade
```

`Grade e disponibilidade` oferece:

- agenda geral e por professor;
- disponibilidade espelhada por unidade;
- aulas reais vindas de `aulas_emusys`;
- estimativa de minutos livres;
- aprovacao, rejeicao e efetivacao das propostas;
- confirmacao obrigatoria de que a alteracao foi feita no Emusys antes de efetivar o espelho.

O frontend esta implementado no branch `feat/la-teacher-mvp` e ainda precisa passar pelo fluxo normal de revisao/merge/publicacao do LA Report.

### 18.5 Validacao executada

- migration completa compilada em PostgreSQL/Supabase local descartavel;
- first-write-wins testado com segunda chamada conflitante;
- ponto testado nos casos 14h falta / 15h presente / 16h presente, falta cercada e aula unica;
- ponta confirmada testada ampliando corretamente o intervalo;
- correcao administrativa testada com trilha append-only;
- aprovacao de disponibilidade testada sem alterar o espelho antes do Emusys;
- `deno check` aprovado;
- testes Node aprovados;
- build Vite aprovado;
- o `tsc --noEmit` continua bloqueado por erro preexistente em `scripts/importar_historico_ltv.js`, fora deste escopo.

### 18.6 Reposicao permanece bloqueada

Nenhuma tabela de reposicao foi criada. A decisao D2 continua valida: `justificada=true` identifica a falta de origem, mas nao prova que uma reposicao foi marcada nem informa sua data e horario.

### 18.7 Fechamento dos Lotes 3 e 4

A auditoria final confirmou:

- `mila_check_disponibilidade_visita` esta ativa no sub-workflow n8n de agendamento de visitas;
- a RPC consulta apenas `visitas_config`, `feriados` e `visitas`, sem `INSERT`, `UPDATE` ou `DELETE`;
- ela nao consulta disponibilidade de professores e nao e chamada pela Edge Function ativa `mila-processar-mensagem`, por crons ou por outras funcoes do banco;
- portanto, o uso atual nao coloca a Mila no caminho de disponibilidade do LA Report e nao diverge da decisao D1;
- nao existe delete-and-reinsert na edicao de disponibilidade: vinculos mantidos usam `UPDATE`; deletes ficam restritos a unidade explicitamente removida ou exclusao integral do professor;
- a grade deriva `livre / com aula` em memoria, cruzando o espelho com `aulas_emusys`, sem persistir uma segunda disponibilidade;
- a coordenacao ve o fluxo `Pendente -> Aguardando Emusys -> Efetivada`, compara o snapshot vigente com a proposta e recebe um estado de conflito quando o espelho mudou para um terceiro valor;
- em conflito, aprovar e efetivar ficam bloqueados ate a revisao no Emusys; rejeitar continua disponivel quando a proposta ainda esta pendente;
- loading, vazio e erro com tentativa novamente estao representados na tela.

A fonte canonica da carteira tambem foi recuperada do historico de migrations do Supabase: `20260709213803_la_teacher_009_carteira_fonte_unica`. O espelho versionado cria `app_minha_carteira()` sobre `vw_jornada_professor_atual`, guardada por `fn_professor_do_usuario()`, sem expor contato ou financeiro.
