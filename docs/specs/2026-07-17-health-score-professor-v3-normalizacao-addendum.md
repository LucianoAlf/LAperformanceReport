# Addendum do Health Score Professor V3 - Normalizacao do Gate 5

**Data:** 2026-07-17

**Autoridade da decisao:** Alf, diretor pedagogico

**Status:** aprovado para implementacao em sombra
**Documento-base:** `2026-07-16-contrato-health-score-professor-v5-final.md`

## 1. Decisao conceitual

Peso, meta, valor real e nota sao grandezas diferentes:

- o slider altera somente o peso do pilar no Health Score;
- o valor real permanece armazenado no snapshot;
- toda nota depende de uma meta versionada;
- `nota = min(100, valor_real / meta * 100)`;
- meta nula produz nota nula e retira o peso do denominador;
- nenhuma metrica percentual usa mais o valor bruto como nota automaticamente.

## 2. Estado das metas da configuracao V1

| Pilar | Meta | Estado da meta | Motivo |
|---|---:|---|---|
| Media/turma | 1,44 | aprovada | P75 professor-unidade validado |
| Numero de alunos | 33 | aprovada | P75 de `alunos_fechamento` validado |
| Conversao | null | em_calibracao | Q3 parcial e amostra insuficiente |
| Permanencia | null | em_calibracao | candidato correto aguarda aprovacao |
| Retencao | null | aguardando_dados_reais | transicoes sem motivos humanos confirmados |
| Presenca | null | bloqueada_ate_inicio | pontuacao somente a partir de 03/08/2026 |

As seis linhas permanecem presentes na configuracao. Retencao e presenca nao
sao omitidas nem recebem valor provisorio.

## 3. Conversao trimestral

`get_professor_conversao_v3_sombra` ja recorta pelo trimestre de
`p_competencia`. Julho, agosto e setembro retornam o mesmo conteudo do Q3; o
campo `competencia` identifica o snapshot mensal, nao muda a coorte trimestral.

Em 17/07/2026, o Q3 esta incompleto:

- somente 3 linhas professor-unidade atingem 3 experimentais;
- 9 experimentais e 4 matriculas nessas linhas;
- P75 parcial: 66,665%;
- nenhuma linha esta publicavel antes do fechamento do trimestre e D+30.

O valor `66,67%` e candidato diagnostico de baixa confianca e nao entra na
configuracao. A meta oficial depende de nova decisao do Alf. O ultimo trimestre
calendario completo, Q2, possui 9 linhas professor-unidade, 35 experimentais,
14 matriculas e P75 de 50%, mas permanece em maturacao D+30 ate 30/07/2026.

## 4. Permanencia bloqueada por cobertura historica

O antigo `10,80` foi reproduzido por:

```sql
select percentile_cont(0.75) within group (order by valor_bruto)
from public.get_professor_permanencia_v3_sombra(date '2026-07-01', null)
where valor_bruto is not null;
```

Essa consulta usa somente oito medias do Q3 e inclui seis professores abaixo da
amostra minima. Ela serve apenas para reproduzir a origem do numero antigo e
nao pode calibrar nem publicar permanencia.

Tambem foi testada a seguinte distribuicao no grao professor+unidade:

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

Resultado em 17/07/2026: `n = 52`, `P75 = 8,67859739256339`. Esse resultado foi
**retraido como candidato**. A consulta filtra o que conseguiu ser reconstruido,
mas nao corrige os vinculos cujo inicio e anterior ao limite da origem.

O P75 `8,61` tambem e reproduzivel, mas agrega primeiro apenas por professor
(`n = 36`) e mistura unidades. Nenhum dos dois valores e homologavel enquanto a
origem historica estiver incompleta.

A auditoria do Peterson demonstrou o bloqueio concretamente: o `GET /aulas` de
Campo Grande devolve historico a partir de 2018 e zero eventos no intervalo
2010-2017. Como o professor possui historia anterior a esse limite, qualquer
media calculada agora seria parcial. A RPC deve retornar `valor_bruto = null`,
mantendo eventual media parcial somente no diagnostico interno.

## 5. Condicao de fechamento

O Gate 5 permanece aberto ate:

1. Alf aprovar uma meta trimestral de conversao;
2. obter e reconciliar fonte historica complementar para permanencia;
3. recalcular a distribuicao de permanencia somente depois da cobertura;
4. retencao e presenca permanecerem explicitamente sem meta;
5. a ativacao e os smokes finais passarem sem publicar consumidores.
