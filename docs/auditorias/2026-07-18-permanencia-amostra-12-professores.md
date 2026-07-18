# Auditoria historica - permanencia de 12 professores

**Data:** 18/07/2026

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Escopo temporal:** 01/01/2018 a 16/07/2026

**Estado:** aprovado na camada V3 em sombra; nenhum consumidor produtivo alterado

## 1. Objetivo

Generalizar a auditoria feita com Peterson Biancamano para uma amostra de 12
professores, quatro por unidade, preservando o grao canonico:

`professor + unidade + matricula + disciplina`.

A permanencia usa somente vinculos encerrados e elegiveis com pelo menos quatro
meses. A formula e:

`soma dos meses encerrados / quantidade de vinculos encerrados`.

Vinculos ativos sao apresentados separadamente. A planilha administrativa e
contraprova; a linha do tempo oficial do professor vem das aulas historicas do
Emusys resolvidas por `emusys_professor_id + unidade_id`.

## 2. Reconstrucao V1.23

A versao
`periodos-professor-v1.23-disciplina-mesmo-vinculo-20260718` reutilizou o
manifesto congelado
`periodos-professor-v1.17-continuidades-renovacao-20260717`. Nenhuma aula foi
baixada novamente e nenhuma linha de `aulas_emusys` foi alterada.

| Unidade | Reconstrucao | Eventos | Periodos | Diagnosticos |
|---|---|---:|---:|---:|
| Barra | `ce1a0883-c7a6-4dac-8e4d-b6d8da66caa0` | 62.695 | 1.328 | 34.108 |
| Campo Grande | `c58b138c-e248-4d49-8abb-d9fb2a35950b` | 222.293 | 3.991 | 118.120 |
| Recreio | `392e3a49-4a04-4772-a1c7-aa98a2d4fbf3` | 149.205 | 2.953 | 79.662 |
| **Total** |  | **434.193** | **8.272** | **231.890** |

As tres execucoes terminaram com status `concluido`, `inicio_completo=true` e
o mesmo hash de entrada das versoes anteriores da fonte congelada.

### Correcao da V1.23

O reconstrutor podia encerrar indevidamente um periodo quando o mesmo
`emusys_matricula_disciplina_id` permanecia ativo com o mesmo professor, mas o
nome/ID da disciplina havia mudado no cadastro. A V1.23 verifica primeiro o
apoio exato da jornada ativa por pessoa, matricula-disciplina e professor; a
mudanca de disciplina dentro do mesmo vinculo nao encerra mais o periodo.

O comportamento foi coberto por teste de regressao antes da nova reconstrucao.

## 3. Revisoes humanas preservadas

As evidencias reconstruidas continuam imutaveis. As decisoes foram gravadas em
`professor_periodos_revisoes_v1`, de forma append-only:

- 23 revisoes do Peterson foram carregadas da V1.22 para a V1.23 somente depois
  de um precheck `1 origem -> 1 destino`;
- as 23 origens permaneceram preservadas;
- seis periodos adicionais da amostra foram revisados pontualmente: dois
  corrigidos, um aprovado e tres rejeitados como duplicacao/segmento espurio;
- nenhum intervalo corrigido ficou invertido ou invalido;
- nenhum periodo bruto foi atualizado ou apagado.

## 4. Resultado dos 12 professores

| Unidade | Professor | Soma de meses | Vinculos encerrados | Media historica | Vinculos ativos | Encerrados < 4 meses |
|---|---|---:|---:|---:|---:|---:|
| Barra | Matheus Lana | 1.046,11 | 96 | **10,90** | 28 | 77 |
| Barra | Daiana Pacifico | 560,01 | 50 | **11,20** | 18 | 29 |
| Barra | Gabriel Antony | 633,58 | 57 | **11,12** | 41 | 39 |
| Barra | Jeyson Gaia | 444,55 | 31 | **14,34** | 3 | 15 |
| Campo Grande | Pedro Sergio | 2.837,78 | 237 | **11,97** | 23 | 134 |
| Campo Grande | Jordan Barbosa | 1.752,72 | 109 | **16,08** | 18 | 61 |
| Campo Grande | Gabriel Otavio | 1.422,81 | 107 | **13,30** | 24 | 49 |
| Campo Grande | Rodrigo Pinheiro | 503,41 | 49 | **10,27** | 35 | 43 |
| Recreio | Ramon Pina | 1.527,99 | 108 | **14,15** | 39 | 90 |
| Recreio | Alexandre de Sa | 737,29 | 67 | **11,00** | 21 | 97 |
| Recreio | Rafael Akeem | 310,78 | 35 | **8,88** | 51 | 29 |
| Recreio | Lucas Guimaraes | 204,88 | 23 | **8,91** | 45 | 25 |

Todos os 12 retornam `estado_base=ok`, `publicavel=true`, `confianca=alta` e
`motivo_sem_base=null` na RPC `get_professor_permanencia_v3_sombra` por
unidade. Esses valores continuam oficiais apenas dentro da camada V3 em sombra.

## 5. O que a planilha administrativa prova e o que nao prova

O script `scripts/auditar-professores-amostra-exports-emusys.ps1` auditou as
planilhas das tres unidades. O campo `Nº do Aluno` foi tratado como numero do
aluno no export, nao como `emusys_aluno_id`.

A planilha associa o professor atualmente listado a uma matricula cuja data de
inicio pode ser muito anterior a entrada daquele professor. Por isso, usar
`data_matricula -> professor atual` como periodo pedagogico inflaria o KPI.

Contraprovas nominais no historico bruto:

- Akeem so aparece com seu ID atual no Recreio a partir de dezembro/2024. Em
  matriculas antigas hoje listadas com ele, as aulas anteriores foram dadas por
  Natan, Davi, Ramon, Arthur e outros professores;
- Lucas Guimaraes aparece a partir de outubro/2024. Alunos cuja matricula
  administrativa comeca em 2021/2022 tiveram antes Alexandre, Quintela, Willian
  e Joel como titulares;
- Gabriel Antony aparece na Barra a partir de junho/2023. Alunos com matricula
  iniciada em 2021/2022 tiveram antes Arthur, Victor e Willian;
- Gabriel Otavio aparece em Campo Grande a partir de maio/2019. As datas de
  2018 encontradas no export pertencem a matriculas que, no historico de aulas,
  tinham outros professores e ate outra disciplina naquele trecho;
- Ramon e Alexandre ja possuem evidencia bruta desde 2018; nesses casos nao
  havia lacuna de identidade historica a corrigir.

Conclusao: nao foi criado nenhum alias retroativo e nenhum ID de professor
antigo foi ligado ao professor atual. O historico de aulas prevalece para
inicio/fim do vinculo; o export permanece util para status e fim administrativo.

## 6. Distribuicao apos a auditoria

| Recorte | Linhas | P50 | P75 | P90 | Minimo | Maximo |
|---|---:|---:|---:|---:|---:|---:|
| Amostra auditada de 12 professor-unidade | 12 | 11,16 | 13,51 | 14,32 | 8,88 | 16,08 |
| Rede atualmente publicavel | 55 | 10,36 | 12,01 | 14,58 | 6,64 | 20,33 |

A distribuicao tornou a meta operacional `> 12 meses` tecnicamente defensavel:
ela fica praticamente no P75 da rede hoje publicavel. A direcao aprovou a meta
em 18/07/2026. A configuracao V1 em sombra registra `meta = 12`, comparador
operacional `>` e exibicao `> 12 meses`.

Esse registro nao ativa a configuracao nem migra consumidores produtivos. A V3
continua em `rascunho` ate os demais gates de homologacao.

## 7. Veredito

- a formula historica foi aplicada no grao correto;
- a V1.23 corrigiu o encerramento falso por mudanca de disciplina no mesmo
  vinculo;
- os 12 professores possuem base publicavel e sem bloqueio historico;
- a planilha nao autoriza retroagir o professor atual ate a data da matricula;
- nenhum card, ranking, relatorio V2 ou consumidor produtivo foi migrado;
- a meta operacional `> 12 meses` foi aprovada e registrada somente na V3 em
  sombra;
- nenhum card, ranking ou relatorio passou a consumir essa meta.
