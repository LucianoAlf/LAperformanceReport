# Health Score V3 - recalculo governado das tres unidades

**Data:** 27/07/2026

**Projeto:** `ouqwbbermlzqqvtqwlul`

**Competencia:** julho/2026, mensal

**Configuracao:** V4
`4f34ac12-8a6a-4adc-9910-c60aebe2be89`

**Estado:** Task 8 Step 4; parado antes de qualquer mudanca de tela

## Veredito

O backend governado foi recalculado com revisoes provisorias novas e
encadeadas. Nenhum snapshot anterior foi atualizado, nenhum snapshot foi
fechado e nenhum ranking foi liberado.

A V4 corrigiu tres desvios centrais:

- retencao usa somente periodos do mesmo universo governado no numerador e no
  denominador;
- os 207 candidatos exatos foram promovidos por revisoes append-only;
- percentuais usam o valor real como nota, sem transformar a meta em teto.

Durante o recalculo foi encontrado e corrigido um quarto desvio: o
materializador ainda permitia nota para `em_maturacao`. A migration
`20260727127000_health_score_v3_estados_nao_pontuaveis.sql` passou a bloquear
`em_maturacao`, `revisar`, `sem_base_*`, `regra_ausente`,
`segmentacao_incompleta`, `em_auditoria` e demais estados nao pontuaveis antes
da formula.

## Resultado por unidade

| Unidade | Avaliados | Parcial | Sem base | Cobertura media | Score medio dos parciais | Faixa dos parciais |
|---|---:|---:|---:|---:|---:|---:|
| Barra | 20 | 11 | 9 | 53,50% | 75,78 | 60,47 a 90,44 |
| Campo Grande | 33 | 17 | 16 | 55,30% | 84,81 | 69,95 a 96,27 |
| Recreio | 26 | 14 | 12 | 51,92% | 80,25 | 61,90 a 95,51 |

Os 37 professores sem base nao receberam zero. Em todos os casos, o bloqueio
veio de cobertura inferior a 60%; 14 deles tambem nao tinham pilar de
fidelizacao disponivel.

| Unidade | Cobertura + fidelizacao ausentes | Somente cobertura insuficiente |
|---|---:|---:|
| Barra | 4 | 5 |
| Campo Grande | 5 | 11 |
| Recreio | 5 | 7 |

## Distribuicao dos scores parciais

| Unidade | 90-100 | 80-89 | 70-79 | 60-69 | Abaixo de 60 | Sem base |
|---|---:|---:|---:|---:|---:|---:|
| Barra | 2 | 1 | 5 | 3 | 0 | 9 |
| Campo Grande | 6 | 5 | 5 | 1 | 0 | 16 |
| Recreio | 1 | 6 | 5 | 2 | 0 | 12 |

## Disponibilidade dos seis pilares

| Unidade | Pilar | Disponiveis | Total | Nota media disponivel | Contribuicao media |
|---|---|---:|---:|---:|---:|
| Barra | Retencao | 11 | 20 | 97,45 | 24,36 |
| Barra | Permanencia | 15 | 20 | 82,41 | 20,60 |
| Barra | Conversao | 0 | 20 | - | - |
| Barra | Media/turma | 12 | 20 | 67,72 | 10,16 |
| Barra | Numero de alunos | 12 | 20 | 28,59 | 2,86 |
| Barra | Presenca | 12 | 20 | 69,44 | 6,94 |
| Campo Grande | Retencao | 21 | 33 | 92,96 | 23,24 |
| Campo Grande | Permanencia | 27 | 33 | 88,30 | 22,07 |
| Campo Grande | Conversao | 0 | 33 | - | - |
| Campo Grande | Media/turma | 25 | 33 | 78,61 | 11,79 |
| Campo Grande | Numero de alunos | 25 | 33 | 45,05 | 4,50 |
| Campo Grande | Presenca | 0 | 33 | - | - |
| Recreio | Retencao | 15 | 26 | 97,96 | 24,49 |
| Recreio | Permanencia | 20 | 26 | 82,93 | 20,73 |
| Recreio | Conversao | 0 | 26 | - | - |
| Recreio | Media/turma | 13 | 26 | 69,07 | 10,36 |
| Recreio | Numero de alunos | 13 | 26 | 38,29 | 3,83 |
| Recreio | Presenca | 15 | 26 | 66,56 | 6,66 |

Conversao nao pontua em julho: as linhas estao `sem_base`,
`sem_base_amostra`, `revisar` ou `em_maturacao`. Essa ausencia reduz cobertura,
mas nao fabrica zero.

Campo Grande permanece sem presenca pontuavel: 32 professores estao
`em_auditoria` e um esta `sem_base`. Barra e Recreio usam somente as amostras
que passaram pelos gates da camada semantica.

## Retencao e pendencias

Os candidatos automaticos exatos foram promovidos assim:

| Unidade | Promovidos automaticamente |
|---|---:|
| Barra | 75 |
| Campo Grande | 71 |
| Recreio | 61 |
| **Total** | **207** |

Restaram cinco casos humanos, fora da amostra limpa: tres na Barra, um em Campo
Grande e um no Recreio. Eles continuam visiveis em
`docs/auditorias/2026-07-27-health-score-v3-pendencias-humanas.md`.

Na retencao atual:

- Barra: 11 professores pontuaveis; dois em `ok_com_pendencias`;
- Campo Grande: 21 pontuaveis; um em `ok_com_pendencias`;
- Recreio: 15 pontuaveis; a pendencia restante pertence a um professor ainda
  abaixo da base minima.

## Quatro professores-piloto - antes e depois

O "antes" usa a ultima revisao preservada da V2. O "depois" usa a ultima
revisao da V4. A V2 e apenas referencia comparativa: ela ainda continha notas
capadas pela meta e estados que pontuavam indevidamente.

### Isaque Mendes da Silva

| Estado | Score | Cobertura | Retencao | Permanencia | Conversao | Media/turma | Carteira | Presenca |
|---|---:|---:|---|---|---|---|---|---|
| V2 | 93,39 | 60% | 100; revisar; 22 + 5 pendentes | 10,66; nota 88,83 | sem base | regra ausente | regra ausente | 70,59; nota 88,24 |
| V4 | 90,44 | 60% | 100; ok; 27 + 0 pendentes | 10,66; nota 88,83 | sem base amostra | segmentacao incompleta | segmentacao incompleta | 70,59; nota 70,59 |

Isaque continua com score parcial. Sua presenca agora vale o percentual real.
Os cinco candidatos exatos entraram na amostra de retencao.

### Erick Cosme da Silva

| Estado | Score | Cobertura | Retencao | Permanencia | Conversao | Media/turma | Carteira | Presenca |
|---|---:|---:|---|---|---|---|---|---|
| V2 | Sem base | 25% | 100; 6 + 2 pendentes; sem amostra | sem base | 100 em maturacao, pontuava | regra ausente | regra ausente | 88,89; nota 100 |
| V4 | Sem base | 10% | 85,71; 7 + 1 pendente; sem amostra | sem base | 100 em maturacao, fora da nota | segmentacao incompleta | segmentacao incompleta | 88,89; nota 88,89 |

Erick nao recebe 100 artificial. Sua conversao permanece visivel, mas
`em_maturacao` nao pontua. A retencao continua abaixo da base minima de dez.

### Peterson Biancamano

| Estado | Score | Cobertura | Retencao | Permanencia | Conversao | Media/turma | Carteira | Presenca |
|---|---:|---:|---|---|---|---|---|---|
| V2 | Sem base | 35% | 100; 3 limpos + 7 pendentes | 12,41; nota 100 | sem base | regra ausente | regra ausente | 75; nota 93,75 |
| V4 | 90,34 | 85% | 100; 10 limpos + 0 pendentes | 12,41; nota 100 | sem base | 1,43; nota 95,24 | 10; nota 50 | 75; nota 75 |

Os sete periodos exatos foram promovidos sem alterar o baseline. Peterson agora
atinge a amostra minima da retencao e recebe score parcial.

### Gabriel Antony Alves de Araujo

| Estado | Score | Cobertura | Retencao | Permanencia | Conversao | Media/turma | Carteira | Presenca |
|---|---:|---:|---|---|---|---|---|---|
| V2 | Sem base | 50% | 93,75; revisar; 32 + 14 pendentes | 11,12; nota 92,67 | sem base amostra | regra ausente | regra ausente | sem base cobertura |
| V4 | 78,26 | 75% | 89,13; ok; 46 + 0 pendentes | 11,12; nota 92,67 | sem base amostra | 1,19; nota 58,11 | 43; nota 45,26 | sem base cobertura |

Os 14 candidatos exatos foram incorporados sem descartar os 32 periodos
validos. Gabriel passou a ter score parcial governado.

## Metas segmentadas e Aula Experimental

O inventario bloqueante retornou lista vazia nas tres unidades:

```text
segmentos pedagogicos pontuaveis sem meta = 0
```

`Aula Experimental` (`curso_id = 45`) esta classificada como `comercial`,
possui zero meta na V4 e nao entra em carteira ou media por turma. Sua fonte
comercial continua disponivel para conversao.

## Ressalva descoberta para o proximo gate

Existem 29 atribuicoes formais sem meta que sao explicitamente
**nao pontuaveis**:

| Unidade | Atribuicoes | Professores afetados |
|---|---:|---:|
| Barra | 9 | 7 |
| Campo Grande | 6 | 4 |
| Recreio | 14 | 10 |

Essas linhas nao bloquearam a configuracao, porque nao pertencem ao universo
pontuavel. Entretanto, o agregador atual marca `media_turma` e
`numero_alunos` inteiros como `segmentacao_incompleta` quando uma delas existe.
Isso afeta, por exemplo, Isaque e Erick.

O proximo gate precisa decidir entre:

1. manter a atribuicao como diagnostico sem contaminar os segmentos pontuaveis;
2. elevar a confianca e criar meta, quando a atribuicao for verdadeira;
3. encerrar a atribuicao pela trilha governada, quando for legado incorreto.

Nao foi aplicado fallback global, meta zero ou alteracao silenciosa para
esconder o problema.

## Imutabilidade e isolamento

- 79 snapshots unitarios V4 foram recalculados e todos possuem
  `snapshot_anterior_id`;
- as ultimas revisoes unitarias estao entre 6 e 7;
- snapshots anteriores foram preservados;
- nenhum snapshot foi fechado;
- `ranking_habilitado=false`;
- o baseline efetivo de periodos, exposto por
  `vw_professor_periodos_baseline_v3_sombra`, continuou com 8.273 linhas; a
  tabela fisica preserva 126.631 linhas de reconstrucoes historicas e nao foi
  usada como contagem do baseline vigente;
- V2 foi preservada como historico;
- V3 de setembro continua ativa;
- nenhum consumidor, view de tela, card, ranking ou relatorio foi alterado.

## Verificacao tecnica

- 110 testes focados passaram;
- `git diff --check` passou sem erro;
- as nove migrations desta execucao constam no projeto remoto;
- o advisor de seguranca nao retornou nivel `ERROR`;
- os avisos do advisor no escopo V3 sao os controles intencionais ja
  existentes: tabelas com RLS sem policy direta, acessadas por RPC/service role,
  e RPCs `SECURITY DEFINER` expostas a `authenticated` com guard interno de
  `professores.editar`;
- o advisor de performance manteve avisos informativos de indices sem uso ou
  FKs sem indice. Nenhum deles bloqueia esta homologacao e nenhum foi alterado
  fora do escopo aprovado.

## Arquivo reproduzivel

As consultas usadas nesta comparacao estao em:

`scripts/compare-health-score-v3-2026-07-tres-unidades.sql`

## Decisao solicitada

O Task 8 para aqui, antes de qualquer troca de tela.

Para o proximo gate, a decisao principal e como tratar as 29 atribuicoes
diagnosticas sem permitir que uma linha nao pontuavel retire 25% de cobertura
de um professor inteiro.
