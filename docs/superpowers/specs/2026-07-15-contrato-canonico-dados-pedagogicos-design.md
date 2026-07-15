# Contrato Canonico de Dados Pedagogicos

**Data:** 2026-07-15
**Status:** aprovado para implementacao incremental
**Responsavel por escrita:** Codex
**Revisores:** Claude e Alfredo

## 1. Objetivo

Impedir que o LA Report, o LA Teacher ou o Fabio publiquem conclusoes pedagogicas
como fatos quando a fonte nao sustenta essa certeza. Este contrato define identidade,
granularidade, proveniencia, confianca e consumidores para carteira, turmas, presenca,
faltas, Health Score, churn e KPIs de professor.

## 2. Principios obrigatorios

1. Dado bruto nunca e reescrito para parecer mais preciso do que a origem.
2. Evidencia da origem e interpretacao pedagogica ficam em camadas separadas.
3. `alunos.id` identifica uma linha operacional local, nao uma pessoa universal.
4. Identidade Emusys e sempre escopada por unidade.
5. Jornada e por matricula/disciplina; carteira e por pessoa; ocupacao e por pessoa/turma.
6. Ausencia bruta do Emusys so equivale a falta confirmada quando houver resposta
   humana explicita ou politica temporal de confiabilidade versionada para a unidade.
7. Metricas temporais declaram inicio, fim, competencia e timezone.
8. Toda metrica derivada declara fonte, confianca, versao e regra de exclusao.
9. Objetos legados so sao aposentados depois do inventario de consumidores.
10. Nenhuma nova feature do Fabio usa fonte ainda classificada como ambigua.

## 3. Graos canonicos

| Dominio | Grao | Chave operacional recomendada |
|---|---|---|
| Pessoa/aluno na unidade | uma pessoa por unidade | `(unidade_id, emusys_aluno_id)`; fallback local sinalizado |
| Jornada | matricula/disciplina | `(unidade_id, emusys_matricula_disciplina_id)` |
| Carteira do professor | pessoa/professor/unidade/periodo | pessoa canonica + professor + unidade + recorte |
| Ocupacao de turma | pessoa/turma/professor/unidade/periodo | pessoa canonica + turma canonica |
| Aula | evento Emusys | `(unidade_id, emusys_id)` |
| Presenca bruta | aluno/aula/fonte | aluno canonico + aula + fonte |
| Presenca semantica | aluno/aula/versao da regra | evidencia + classificacao + confianca |

## 4. Identidade de aluno

`(unidade_id, emusys_aluno_id)` e a melhor identidade operacional para dados
cobertos pelo Emusys, mas nao e um cadastro mestre universal. Linhas sem ID, conflitos
e transferencias entre unidades entram em uma fila de qualidade e nunca sao mesclados
silenciosamente por nome.

Regras:

- carteira conta pessoa unica;
- aluno com dois cursos no mesmo professor continua uma pessoa na carteira;
- o mesmo aluno em duas turmas regulares conta uma vez em cada turma na ocupacao;
- jornada preserva os dois cursos separadamente;
- fallback por `aluno_id` deve expor `identidade_confianca = 'baixa'`.

## 5. Presenca e falta

### 5.1 Evidencia bruta

O Emusys entrega `presente` ou `ausente`, mas nao fornece um estado confiavel de
"chamada nao registrada". O sync atual ainda converte todo nao-presente maduro em
`ausente/falta`. Por isso, `aluno_presenca` permanece evidencia operacional bruta ate
a camada semantica ser implantada.

### 5.2 Dimensoes semanticas

Cada leitura canonica deve carregar separadamente:

- `estado_origem`: presente, ausente, vazio, desconhecido;
- `situacao_chamada`: registrada, nao_registrada, indeterminada;
- `resultado_pedagogico`: presente, falta_confirmada, falta_justificada, indeterminado;
- `proveniencia`: la_teacher, emusys, manual, inferido;
- `confianca`: confirmada, provavel, desconhecida;
- `regra_versao` e justificativa da classificacao.

Ausencia registrada pelo LA Teacher e confirmada. Ausencia justificada na origem e
falta justificada. Ausencia Emusys sem corroboracao ou politica aplicavel e
indeterminada. O historico nao sera reescrito em massa para fabricar confianca.

### 5.3 Politica temporal de junho e julho de 2026

Decisao de negocio confirmada por Alf em 15/07/2026:

- Barra, Recreio e Campo Grande tratam `ausente` do Emusys como
  `falta_confirmada` entre `2026-06-01` e `2026-07-31`, inclusive;
- a decisao e materializada em `presenca_politicas_confiabilidade`, com unidade,
  periodo, evidencia e versao, sem alterar a evidencia bruta em `aluno_presenca`;
- Barra foi atestada operacionalmente por Arthur e Recreio por Fernanda;
- Campo Grande publica o resultado imediatamente, mas marca
  `revisao_operacional_exigida = true` e envia a ausencia para a conciliacao;
- a revisao de Campo Grande acontece depois da publicacao e nao bloqueia KPI;
- confirmacoes ficam em `aluno_presenca_revisoes_operacionais`; correcoes para
  presente tambem usam a retificacao auditada existente;
- fora desse periodo, volta a classificacao conservadora ate nova politica
  explicita e versionada.

## 6. Contratos por metrica

| Metrica | Numerador | Denominador | Regra critica |
|---|---|---|---|
| Carteira | pessoas unicas | n/a | dedup por identidade escopada |
| Media por turma | pares pessoa/turma elegiveis | turmas regulares elegiveis | bandas excluidas; multi-turma conta em cada turma |
| Frequencia | presencas confirmadas | chamadas classificaveis | indeterminadas fora do denominador |
| Faltas recorrentes | faltas confirmadas nao justificadas | janela declarada | ausencia bruta nao entra |
| Cobertura de registro | aulas ocorridas elegiveis com anotacao | aulas ocorridas elegiveis | `anotacoes_fabio OR anotacoes` |
| Churn | features versionadas | n/a | previsao publica exige features com confianca aprovada |
| Health Score | componentes versionados | pesos declarados | componente ambiguo nao pode parecer confirmado |

## 7. Classificacao das fontes

- **Canonica bruta:** payload ou evento preservado sem interpretacao.
- **Canonica semantica:** leitura com regra versionada, proveniencia e confianca.
- **Derivada/KPI:** calculo reproduzivel sobre fontes canonicas.
- **Snapshot certificado:** resultado fechado e assinado para uma competencia; nao e
  fonte generativa universal.
- **Legada:** objeto ainda existente, sem permissao para novos consumidores.

## 8. Contencao imediata

1. `fabio_pente_fino_unidade` fica indisponivel para `fabio_agent` ate liberacao.
2. `service_role` mantem acesso para diagnostico controlado.
3. Churn atual e preservado, mas recebe confianca baixa e aviso de auditoria.
4. Nenhum score historico e apagado ou recalculado antes da nova feature engineering.
5. Rankings de presenca/falta e alertas recorrentes so sao fatos oficiais quando a
   competencia estiver coberta por evidencia humana ou politica temporal ativa.

## 9. Portoes de liberacao

Uma metrica so recebe status canonico quando:

- o grao e a identidade estao documentados;
- o periodo e a unidade estao isolados;
- casos ouro das tres unidades passam;
- indeterminado nunca e convertido em falta sem evidencia humana ou politica
  temporal versionada;
- taxas e contagens respeitam invariantes;
- consumidores ativos foram inventariados;
- comparacao sombra antigo/novo foi revisada;
- coordenacao validou os casos de negocio relevantes.

## 10. Responsabilidade operacional

- Codex escreve migrations, Edge Functions, testes e cutover.
- Claude trabalha em SELECT-only e revisa contratos/RPCs consumidoras.
- Alfredo faz validacao adversarial independente.
- Alf e coordenacao confirmam regras de negocio, nunca detalhes tecnicos de implementacao.
