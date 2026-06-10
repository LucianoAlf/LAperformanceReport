# Recreio - Auditoria bolsistas / nao pagantes / segundo curso

Data: 2026-06-09

Escopo: SELECT-only. Nenhum dado foi alterado.

## Resumo

As duas divergencias reportadas pela equipe do Recreio foram localizadas.

1. Bolsistas integrais: o numero 7 bate quando a regra considera somente bolsa integral de curso regular, excluindo Power Kids/GarageBand e excluindo 2o curso.
2. O sistema chega em 9 porque inclui dois alunos com 2o curso regular marcado como Bolsista Integral.
3. Segundo curso: o sistema mostra 24 porque conta vinculos/matriculas. A equipe informou 22 porque esta contando pessoas. Existem duas pessoas com dois vinculos de segundo curso cada.
4. Nao pagantes: os 12 sao 7 bolsistas integrais regulares + 2 parciais + 3 pessoas sem bolsa canonica que hoje nao entram como pagantes por estarem em banda/projeto/tipo de matricula de banda.

## 1. Bolsistas integrais

### Regra que bate com o numero da equipe: 7

Bolsista integral de curso regular, excluindo Power Kids/GarageBand e excluindo 2o curso:

| ID | Aluno | Curso | Professor |
|---:|---|---|---|
| 1498 | Ana Beatriz Paz de Almeida | Canto | Lohana Leopoldo de Araujo |
| 1013 | Arthur Quinteiro Artacho | Teclado | Isaque Mendes da Silva |
| 981 | Davi Lima Queiroz | Canto | Alexandre de Sa Ritta do Espirito Santo |
| 948 | Lorenzo dos Santos da Silva Palmeira | Bateria | Rafael Alves Souza (Akeem) |
| 994 | Luiz Henrique Ribeiro Gomes | Canto | Larissa Bheattriz Barbosa Santos |
| 1015 | Maria Eduarda Quinteiro Artacho | Teclado | Willer Arruda Machado |
| 986 | Noah Ciccarelli Artacho Pincelli | Guitarra | Israel Rocha da Silva |

### Dois nomes que explicam o 9

Estes dois estao como `Bolsista Integral`, mas em 2o curso regular. Se a regra operacional excluir 2o curso da contagem de bolsistas integrais, eles nao devem entrar no numero 7:

| ID | Aluno | Curso | Professor | Observacao |
|---:|---|---|---|---|
| 1012 | Isis Mayumi Fujiwara Lima | Canto | Lohana Leopoldo de Araujo | Bolsista integral em 2o curso |
| 1000 | Leticia Ferreira Vasconcelos | Canto | Larissa Bheattriz Barbosa Santos | Bolsista integral em 2o curso |

Observacao: Davi Lima Queiroz tambem tem um 2o vinculo como bolsista integral, mas ele ja entra na lista dos 7 pelo curso regular de Canto. Por isso ele nao aumenta a contagem de pessoas de 7 para 8.

## 2. Nao pagantes

Hoje a leitura canonica encontra 12 pessoas sem MRR/ticket pagante.

### 7 bolsistas integrais regulares

Sao os mesmos 7 nomes da lista principal acima.

### 2 bolsistas parciais

| ID | Aluno | Curso | Parcela | Observacao |
|---:|---|---|---:|---|
| 1011 | Daniel Eustaquio de Jesus | Bateria | 192.50 | Bolsista parcial |
| 1720 | Larissa Bheattriz Barbosa Santos | Canto | 190.00 | Bolsista parcial |

### 3 nao pagantes sem bolsa canonica

Esses sao os nomes que explicam a diferenca entre 9 e 12:

| Aluno | Vinculos encontrados | Motivo provavel |
|---|---|---|
| Laura Almada Teixeira Neto | GarageBand / Matricula em Banda / R$ 0; Canto / Matricula em Banda / R$ 464.46 | Tipo de matricula esta como banda; nao entra como pagante canonico |
| Manuela Souza Soares | GarageBand / Matricula em Banda / R$ 0 | Banda/projeto sem parcela pagante |
| Olivia Freire Rodrigues Oliveira | Power Kids / Matricula em Banda / R$ 350 | Cadastro aparenta incompleto/incorreto; equipe ja indicou que falta Bateria |

## 3. Segundo curso

O banco tem 24 linhas/vinculos marcados como segundo curso, mas 22 pessoas distintas.

As duas pessoas que explicam a diferenca:

| Aluno | Vínculos de 2o curso |
|---|---|
| Caio Vinicius Vieira de Castro | Teclado; Contrabaixo |
| Maria Clara Monteiro de Carvalho | Teclado; Teatro Musical |

Decisao de regra pendente:

- Se o card for "Matriculas de 2o Curso", 24 esta coerente porque conta vinculos.
- Se a equipe espera 22, o indicador deveria ser "Alunos com 2o Curso" e contar pessoas.

## 4. Hipotese de correcao

Nao fazer UPDATE ainda.

Antes, confirmar com a equipe:

1. Bolsista integral deve excluir sempre 2o curso?
2. Bolsista integral deve excluir Power Kids/GarageBand quando esses cursos forem projeto/banda?
3. Segundo curso deve ser mostrado como vinculos/matriculas ou pessoas?
4. Olivia deve receber o vinculo correto de Bateria, mantendo o historico do Power Kids?
5. Laura Almada deve mesmo estar com Canto como Matricula em Banda, ou isso e erro de tipo de matricula?

