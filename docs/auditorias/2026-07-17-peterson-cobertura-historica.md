# Auditoria cruzada - permanencia do Peterson Biancamano

**Data:** 17/07/2026

**Escopo:** Barra e Campo Grande, de 01/01/2018 a 16/07/2026
**Veredito:** cobertura temporal aceita; KPI V3 em sombra aprovado para Peterson

## 1. Regra confirmada

A permanencia oficial usa somente vinculos encerrados no grao:

`professor + unidade + matricula + disciplina`.

Formula oficial:

`soma dos meses dos vinculos encerrados elegiveis / quantidade desses vinculos`.

Vinculos com menos de quatro meses permanecem no historico, mas ficam fora da
media. Vinculos ativos nao entram nessa divisao e aparecem separadamente como
idade da carteira ativa. A mediana e apenas diagnostico tecnico: nao compoe
nota, card principal ou meta.

O recorte comeca em 2018, quando a LA adotou o Emusys. A coleta historica esta
completa para o periodo aceito e a reconstrucao continua em sombra, sem alterar
`aulas_emusys`, relatorios produtivos ou o Health Score V2.

## 2. Reconstrucao V1.18

A versao
`periodos-professor-v1.18-confianca-renovacao-substituicao-20260717` reutilizou
o manifesto congelado da V1.17 e promoveu confianca somente quando a evidencia
historica era completa. Ela preservou as correcoes de dois tipos de corte falso:

- aula cancelada no inicio de uma renovacao agora pode provar continuidade,
  mas continua fora da contagem de aulas e da duracao do periodo;
- um ID curto sobreposto nao esconde mais a continuidade entre o periodo longo
  anterior e a renovacao seguinte.

| Unidade | Eventos processados | Periodos da rede | Reconstrucao |
|---|---:|---:|---|
| Barra | 62.695 | 1.429 | `ddefcbc7-dce6-4a85-85b1-f6c4055b9fd2` |
| Campo Grande | 222.293 | 4.067 | `17b4edcd-69b5-4923-9fe0-385c92ce6424` |
| Recreio | 149.205 | 3.045 | `809f8fad-fa27-46fc-a044-3656ef01f0e5` |

As tres execucoes terminaram com status `concluido`, sem codigo de erro e com
a versao-fonte V1.17 registrada no cabecalho de auditoria. V1.17 e V1.18
possuem exatamente 8.541 periodos; a V1.18 alterou confianca/publicabilidade,
nao o universo reconstruido.

## 3. Casos de controle

Na Barra, a regra preservada na V1.18 removeu dois encerramentos falsos do Peterson:

- Pedro Henrique Moreno Godinho: renovacoes sucessivas foram unificadas em um
  unico vinculo ativo iniciado em 03/06/2023;
- Pedro Vasconcellos Tourinho Garcia: um ID curto sobreposto deixou de cortar
  o periodo principal, que agora permanece ativo desde 16/12/2023.

Em Campo Grande, o caso Rafael Alves de Souza permaneceu corretamente separado:

- vinculo encerrado de 01/03/2023 a 28/05/2025, com 26,90 meses;
- novo vinculo ativo iniciado em 12/03/2026.

A interrupcao de aproximadamente nove meses nao foi colada artificialmente.

## 4. Peterson no historico reconstruido e revisado

| Unidade | Periodos | Ativos | Encerrados | Encerrados >= 4 meses |
|---|---:|---:|---:|---:|
| Barra | 34 | 10 | 24 | 14 |
| Campo Grande | 109 | 26 | 83 | 43 |
| **Total** | **143** | **36** | **107** | **57** |

Todos os 57 vinculos encerrados com pelo menos quatro meses foram aprovados ou
corrigidos com evidencia. O resultado efetivo e:

| Unidade | Soma dos meses | Vinculos | Media oficial em sombra |
|---|---:|---:|---:|
| Barra | 174,00 | 14 | 12,43 meses |
| Campo Grande | 653,04 | 43 | 15,19 meses |
| **Consolidado** | **827,04** | **57** | **14,51 meses** |

A RPC `get_professor_permanencia_v3_sombra` retorna para Peterson:

- `valor_bruto = 14,51`;
- `numerador = 827,0390750474521827` meses;
- `denominador = 57` vinculos;
- `estado_base = ok`;
- `publicavel = true`;
- `confianca = alta`;
- `elegiveis_nao_publicaveis = 0`.

O valor e oficial dentro da camada V3 em sombra. Ele ainda nao substitui cards,
rankings ou relatorios produtivos enquanto a V3 nao passar pelos gates de
homologacao e virada.

## 5. Carteira que continua ativa

| Unidade | Vinculos ativos | Idade media em jul/2026 |
|---|---:|---:|
| Barra | 10 | 28,25 meses |
| Campo Grande | 26 | 11,39 meses |
| **Consolidado** | **36** | **16,07 meses** |

Esse indicador responde ha quanto tempo os alunos atuais estao com o professor.
Ele e contexto operacional, nao entra no score e nao e misturado com a media
dos vinculos encerrados.

## 6. Contraprova administrativa

Foram auditados os arquivos:

- `relatorio_exportado (6).xlsx`: Barra, 26 blocos do Peterson, sendo 16
  encerrados, 10 ativos e 14 encerrados com pelo menos quatro meses;
- `relatorio_exportado (7).xlsx`: Campo Grande, 60 blocos do Peterson, sendo
  38 encerrados, 22 ativos e 35 encerrados com pelo menos quatro meses.

As planilhas confirmam professor, situacao administrativa e datas da matricula.
Elas nao definem sozinhas quando o vinculo com Peterson comecou, pois a data da
matricula pode ser anterior a entrada do professor. As aulas historicas seguem
como evidencia temporal principal; a planilha e contraprova de status e fim.

## 7. Revisoes e trilha de auditoria

A evidencia reconstruida permaneceu imutavel. As decisoes foram gravadas de
forma append-only em `professor_periodos_revisoes_v1` e aplicadas somente pela
view `vw_professor_periodos_efetivos_v3_sombra`:

- 15 periodos conciliados pelas aulas historicas e pelas planilhas exportadas:
  3 da Barra e 12 de Campo Grande;
- 8 periodos restantes conciliados pela sequencia integral de aulas, professor
  anterior/posterior, renovacao, hiato e disciplina;
- total revisado nesta auditoria: 23 periodos;
- nenhum periodo bruto foi apagado ou sobrescrito.

As revisoes preservam autor, data, decisao, justificativa, snapshot anterior e
snapshot posterior. Um caso com identidade local do sucessor ainda nao
resolvida foi corrigido somente no encerramento comprovado do Peterson; a
lacuna de identidade do sucessor permaneceu documentada, sem contaminacao.

## 8. Trava de publicacao validada

A RPC continua bloqueando qualquer professor com historia parcialmente
revisada. Como contraprova, Alexandre de Sa permanece com:

- `estado_base = aguardando_revisao_historica`;
- `valor_bruto = null`;
- `publicavel = false`;
- 71 vinculos elegiveis nao publicaveis;
- aviso explicito de que valor parcial nao pode virar KPI.

Para Peterson, o mesmo aviso agora e `null`, pois os 57 vinculos elegiveis
estao publicaveis. A correcao e apenas semantica: nao alterou formula, periodos,
amostra ou trava de qualidade.

## 9. Conclusao

O numero historico defensavel para Peterson, desde a adocao do Emusys em 2018
ate a competencia de julho/2026, e **14,51 meses** por vinculo encerrado
elegivel. Os 36 vinculos ativos continuam apresentados separadamente e nao
inflam nem reduzem essa media.

Este resultado valida a metodologia com um professor veterano, mas nao define
sozinho a meta da rede. A calibracao de permanencia deve usar a distribuicao
dos professores que alcancarem cobertura historica equivalente ou forem
revisados com o mesmo nivel de evidencia.
