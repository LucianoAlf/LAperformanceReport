# Health Score V3 - Carteira proporcional a disponibilidade

**Data:** 2026-07-28  
**Status:** aprovado para implementacao e simulacao, sem cutover de consumidores

## 1. Decisao canonica

A disponibilidade oficial do professor por unidade vem de
`professores_unidades.disponibilidade`.

O LA Report e a fonte de verdade desta informacao. O payload Emusys armazenado em
`professores_unidades.payload_emusys` nao contem agenda ou disponibilidade e nao
participa da regra.

## 2. Formula do pilar numero de alunos

O valor observado continua sendo a quantidade de pessoas canonicas unicas na
carteira do professor e da unidade. Bandas e projetos permanecem na carteira.

```text
meta_carteira = horas_semanais_disponiveis * meta_alunos_por_hora_da_unidade
nota = min(100, alunos_observados / meta_carteira * 100)
```

Taxas versionadas para o ciclo Jun-Ago/2026:

| Unidade | P50 diagnostico | P75 aplicado |
|---|---:|---:|
| Barra | 0,946 | 1,143 |
| Campo Grande | 1,300 | 1,607 |
| Recreio | 0,921 | 1,141 |

O P50 e preservado apenas como referencia diagnostica. O P75 e a taxa
pontuavel.

### 2.1 Base de horas da politica V1

A politica V1 usa a **disponibilidade total** cadastrada em
`professores_unidades.disponibilidade`.

Esse campo e mantido pela recepcao e pela coordenacao na Gestao de Professores.
O professor avaliado nao edita a propria disponibilidade. Portanto, a meta
crescer junto com a agenda aberta representa a oportunidade comercial
disponibilizada pela escola, nao um incentivo para o professor manipular a
propria nota.

`carga_comprometida` fica registrada apenas como evolucao futura. Ela somente
deve ser reconsiderada se dois ou tres ciclos completos, com cadastros
conferidos, mostrarem uma distorcao negativa consistente. Nao criar campo,
workflow ou aprovacao adicional nesta versao.

## 3. Regras de publicabilidade

- Vinculo professor-unidade com menos de seis meses: `em_maturacao`.
- Disponibilidade ausente ou sem horas validas: `sem_base_disponibilidade`.
- Carteira observada igual a zero: `sem_base_zero_carteira`.
- Nos tres estados, valor e evidencia permanecem visiveis, mas a nota e o peso
  ficam fora do Health Score.
- `sem_base_disponibilidade` tambem bloqueia a publicacao do score completo;
  seus pesos nao podem ser redistribuidos para produzir nota.
- Ausencia de base nunca vira zero.

## 4. Metas por curso

As metas por unidade, curso e modalidade permanecem como diagnostico e seguem
governando `media_turma`.

Elas nao sao somadas para formar a meta total de carteira. O pilar
`numero_alunos` usa uma unica meta por professor e unidade, proporcional a sua
disponibilidade.

Atribuicoes marcadas como nao pontuaveis:

- permanecem disponiveis para auditoria;
- nao geram `regra_ausente`;
- nao geram `segmentacao_incompleta`;
- nao bloqueiam `media_turma` nem `numero_alunos`.

## 5. Evidencia congelada no snapshot

Cada metrica de `numero_alunos` deve registrar:

- horas semanais aplicadas;
- P50 diagnostico da unidade;
- P75 aplicado;
- meta de carteira resultante;
- hash deterministico da disponibilidade;
- inicio do vinculo professor-unidade;
- meses do vinculo;
- versao e vigencia da politica.

Assim, uma futura edicao do JSON nao reescreve a explicacao de um snapshot ja
materializado.

## 6. Escopo da entrega

Esta etapa pode:

- criar politica versionada;
- criar funcoes auxiliares;
- corrigir o materializador V3;
- rematerializar snapshots provisorios de julho/2026;
- gerar simulacoes e folhas de conferencia.

Esta etapa nao pode:

- mudar telas, cards, rankings ou relatorios;
- trocar RPCs consumidoras;
- alterar snapshots fechados;
- usar disponibilidade proposta ou pendente;
- consultar disponibilidade no Emusys;
- mudar a formula segmentada de `media_turma`.

## 7. Criterios de aceite

1. A meta de carteira nao soma metas de cursos.
2. Pessoas sao deduplicadas por professor e unidade.
3. Os tres estados de excecao retiram o pilar da nota.
4. O hash e os parametros aplicados ficam no snapshot.
5. Atribuicao nao pontuavel nao bloqueia o agregador.
6. A simulacao cobre as tres unidades e compara com a V4 anterior.
7. Isaque, Erick, Peterson e Gabriel Antony aparecem nominalmente no relatorio.
8. Nenhum consumidor produtivo muda nesta etapa.
