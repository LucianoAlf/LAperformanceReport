# Health Score Professor V3 - Calibracao do Gate 5

**Data:** 2026-07-17

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Status:** Gate 5 aberto; configuracao V1 em `rascunho`
**Publicacao produtiva:** nao realizada

## 1. Regra aprovada

Peso, meta, valor real e nota sao grandezas independentes:

- o slider altera somente o peso;
- o snapshot preserva o valor real, numerador, denominador e amostra;
- `nota = min(100, valor_real / meta * 100)`;
- meta nula produz nota nula e retira o peso do denominador;
- nenhum valor percentual vira nota automaticamente.

## 2. Estado remoto da configuracao V1

| Pilar | Peso | Meta | Estado |
|---|---:|---:|---|
| Media/turma | 15 | 1,44 | aprovada |
| Numero de alunos | 10 | 33 | aprovada |
| Conversao | 15 | null | em_calibracao |
| Permanencia | 25 | null | em_calibracao |
| Retencao | 25 | null | aguardando_dados_reais |
| Presenca | 10 | null | bloqueada_ate_inicio |

As seis linhas usam `normalizacao=meta_versionada`. A versao segue rascunho,
com peso total 100 e zero snapshots. A RPC de ativacao recusa a versao enquanto
conversao e permanencia nao tiverem meta aprovada.

## 3. Conversao trimestral

`get_professor_conversao_v3_sombra` ja calcula a coorte do trimestre inteiro a
partir de `p_competencia`. A calibracao primaria foi feita no grao
professor + unidade e exige pelo menos tres experimentais por linha.

### Resultado reproduzido em 17/07/2026

| Recorte | Linhas professor-unidade | Experimentais | Matriculas | Taxa ponderada | P50 | P75 | P90 | Publicaveis |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q2/2026 | 9 | 35 | 14 | 40,00% | 33,33% | 50,00% | 66,67% | 0 |
| Q3/2026 parcial | 3 | 9 | 4 | 44,44% | 33,33% | 66,665% | 86,666% | 0 |

O Q3 possui somente tres linhas elegiveis, todas com amostra 3, e distribuicao
`0%`, `33,33%`, `100%`. O P75 parcial de `66,67%` e instavel e nao foi gravado
como meta. O Q2 encerrou em 30/06, mas sua janela D+30 somente matura em
30/07/2026.

Conclusao: conversao permanece com meta nula. A decisao pode aguardar a coorte
Q3 completa ou, por decisao explicita do Alf, usar um periodo historico
trimestral maduro definido de forma versionada.

## 4. Permanencia: diagnosticos retraidos por historia incompleta

### Origem do antigo 10,80

```sql
select percentile_cont(0.75) within group (order by valor_bruto)
from public.get_professor_permanencia_v3_sombra(date '2026-07-01', null)
where valor_bruto is not null;
```

Resultado: `n=8`, `P75=10,80`. A consulta inclui seis agregados abaixo da
amostra minima ou nao publicaveis. Portanto, reproduz o numero antigo, mas nao
e uma calibracao valida nem um valor oficial.

### Query canonica recomendada

```sql
with base as (
  select *
  from public.vw_professor_periodos_efetivos_v3_sombra
  where status_periodo = 'encerrado'
    and elegivel_permanencia = true
    and publicavel = true
    and confianca in ('alta', 'revisado_aprovado')
), por_professor_unidade as (
  select
    professor_id,
    unidade_id,
    avg(duracao_meses) as media_meses,
    count(*) as vinculos
  from base
  group by professor_id, unidade_id
  having count(*) >= 3
)
select
  count(*) as n,
  percentile_cont(0.75) within group (order by media_meses) as p75
from por_professor_unidade;
```

Resultado: `n=52`, `P75=8,67859739256339`. Esse valor chegou a ser tratado como
candidato tecnico de `8,68 meses`, mas foi retraido depois da auditoria de
cobertura historica.

### Comparacao das metodologias

| Metodologia | N | P75 |
|---|---:|---:|
| Media por professor + unidade, minimo 3 vinculos | 52 | 8,68 |
| Media por professor na rede, minimo 3 vinculos | 36 | 8,61 |
| P75 direto dos vinculos | 887 | 10,11 |
| RPC Q3 com todos os valores, inclusive sem base | 8 | 10,80 |
| RPC Q3 somente publicaveis | 2 | 9,11 |

As linhas acima preservam a reproducao dos diagnosticos, nao uma recomendacao.
O recorte historico aceito pela direcao comeca em 2018, ano de adocao do
Emusys. A reconstrucao V1.18 cobriu integralmente esse recorte e passou a
publicar somente vinculos com evidencia completa ou revisao aprovada.

Como caso de controle, Peterson Biancamano foi conciliado ate zerar suas
pendencias elegiveis. O resultado oficial na camada V3 em sombra e:

- soma historica: `827,04` meses;
- vinculos encerrados elegiveis: `57`;
- media: `14,51` meses;
- estado: `ok`, publicavel, confianca alta;
- vinculos ativos: `36`, apresentados separadamente.

Esse caso valida formula, recorte e processo de revisao. Ele nao define sozinho
a meta da rede. Permanencia continua com meta nula ate existir uma amostra
comparavel de professores historicamente completos/revisados e a direcao
aprovar o alvo.

### Amostra ampliada em 18/07/2026

A metodologia do Peterson foi aplicada a mais 12 professores, quatro por
unidade, usando a reconstrucao
`periodos-professor-v1.23-disciplina-mesmo-vinculo-20260718`. Todos os 12
retornaram `ok`, publicaveis, com confianca alta e sem bloqueio historico.

| Recorte | N | P50 | P75 | P90 |
|---|---:|---:|---:|---:|
| Amostra auditada | 12 | 11,16 | 13,51 | 14,32 |
| Rede atualmente publicavel | 55 | 10,36 | 12,01 | 14,58 |

A contraprova com os exports administrativos confirmou que a data inicial da
matricula nao pode ser atribuida retroativamente ao professor atual. Os
professores antigos encontrados nas aulas foram preservados; nenhum alias
historico artificial foi criado.

O resultado sustentou `> 12 meses` como meta operacional tecnicamente
defensavel, pois coincide aproximadamente com o P75 atual da rede publicavel.
Alf aprovou a meta em 18/07/2026. A configuracao V1 em sombra registra
`meta = 12`, comparador `>` e exibicao `> 12 meses`, permanecendo em
`rascunho`. Evidencias completas:
`docs/auditorias/2026-07-18-permanencia-amostra-12-professores.md`.

## 5. Pilares sem calibracao atual

- **Retencao:** os 76 resultados estao em 100% porque a confirmacao humana dos
  motivos ainda nao gerou variacao real. Meta nula e estado
  `aguardando_dados_reais`.
- **Presenca:** a pontuacao comeca em 03/08/2026. Meta nula e estado
  `bloqueada_ate_inicio`.

Esses pilares permanecem presentes na configuracao; nao sao omitidos e nao
recebem zero fabricado.

## 6. Pendencias para fechar o Gate 5

1. Aprovar uma meta trimestral de conversao com base suficiente.
2. Meta de permanencia aprovada e registrada na configuracao versionada em
   sombra: `> 12 meses`.
3. Gravar as demais metas aprovadas, justificativa e vigencia na configuracao
   versionada.
4. Reexecutar ativacao e smokes sem publicar consumidores.

O Gate 6 nao deve iniciar antes dessas decisoes.

## 7. Fontes

- `get_professor_conversao_v3_sombra`;
- `get_professor_permanencia_v3_sombra`;
- `vw_professor_periodos_efetivos_v3_sombra`;
- `health_score_professor_v3_config_versoes`;
- `health_score_professor_v3_config_metricas`;
- migration `20260717180000_health_score_v3_normalizacao_meta.sql`.
