# Health Score V3 - rematerializacao apos revisao da disponibilidade

**Data:** 2026-07-28  
**Competencia:** julho/2026  
**Configuracao:** V3, versao 4  
**Estado:** snapshots parciais rematerializados; ranking e premiacao continuam bloqueados  
**Consumidores alterados nesta etapa:** nenhum

## Veredito

A revisao da coordenacao foi incorporada com sucesso.

- os 74 vinculos ativos considerados possuem disponibilidade;
- nao existe sobreposicao de horario entre unidades;
- Jeyson possui vinculo atual somente na Barra;
- as 174 chaves de dia foram auditadas;
- a unica chave fora do dominio era `Sexta-feira`, no vinculo de Matheus
  Sterque em Campo Grande;
- a chave orfa foi removida;
- uma constraint validada impede novas chaves fora de Segunda-Sabado;
- o formulario agora normaliza a disponibilidade ao carregar e ao salvar;
- julho foi rematerializado nas tres unidades em cadeia append-only.

## Correcao da disponibilidade

Antes:

```json
{
  "Sexta": { "inicio": "14:00", "fim": "16:00" },
  "Sabado": { "inicio": "09:00", "fim": "15:00" },
  "Sexta-feira": { "inicio": "15:00", "fim": "16:00" }
}
```

Depois:

```json
{
  "Sexta": { "inicio": "14:00", "fim": "16:00" },
  "Sabado": { "inicio": "09:00", "fim": "15:00" }
}
```

O materializador V3 ja considerava somente as chaves canonicas e, por isso, o
snapshot do Matheus Sterque ja usava 8 horas antes do saneamento. A limpeza nao
alterou seu score, mas removeu a ambiguidade do JSON e protege consumidores que
somassem todas as chaves sem normalizacao.

## Protecoes implementadas

### Frontend

- `ModalProfessor` normaliza os dias ao abrir a edicao;
- o payload e normalizado novamente antes de `onSave`;
- `ProfessoresPage` normaliza defensivamente antes de INSERT ou UPDATE;
- unidades removidas nao permanecem no mapa enviado;
- intervalos incompletos nao sao persistidos.

### Banco

- nova funcao estrita:
  `fn_disponibilidade_professor_canonica_valida(jsonb)`;
- nova constraint validada:
  `professores_unidades_disponibilidade_canonica_check`;
- dominio aceito: `Segunda`, `Terca`, `Quarta`, `Quinta`, `Sexta`, `Sabado`,
  com os acentos canonicos de `Terca` e `Sabado` no dado real;
- aliases como `Sexta-feira`, `Domingo` ou qualquer chave desconhecida sao
  rejeitados;
- `null` continua permitido para vinculos historicos/inativos.

## Estado operacional apos a coordenacao

| Indicador | Resultado |
|---|---:|
| Vinculos ativos considerados | 74 |
| Vinculos ativos sem disponibilidade | 0 |
| Sobreposicoes entre unidades | 0 |
| Chaves de dia cadastradas | 173 |
| Chaves fora do dominio canonico | 0 |
| Unidades atuais do Jeyson | Barra |

Os oito cadastros ativos anteriormente vazios foram preenchidos. Vinculos
historicos ou inativos continuam preservados sem exigir horario atual.

## Rematerializacao

Foram criadas novas revisoes append-only para:

| Unidade | Snapshots finais criados |
|---|---:|
| Barra | 20 |
| Campo Grande | 34 |
| Recreio | 28 |

Cada snapshot final aponta para o snapshot-base intermediario, que aponta para
a revisao final anterior. Nenhum snapshot anterior foi sobrescrito ou apagado.

## Resumo antes x depois

| Unidade | Scores antes | Scores depois | Cobertura media antes | Cobertura media depois | Score medio antes | Score medio depois | Vinculos com delta |
|---|---:|---:|---:|---:|---:|---:|---:|
| Barra | 14 | 15 | 59,75% | 60,25% | 80,19 | 80,13 | 3 |
| Campo Grande | 20 | 20 | 55,59% | 55,88% | 87,27 | 88,00 | 7 |
| Recreio | 17 | 17 | 56,25% | 56,25% | 81,99 | 82,08 | 6 |

## Distribuicao final

| Unidade | 60-69 | 70-79 | 80-89 | 90-100 | Sem base |
|---|---:|---:|---:|---:|---:|
| Barra | 1 | 7 | 5 | 2 | 5 |
| Campo Grande | 0 | 3 | 6 | 11 | 14 |
| Recreio | 1 | 4 | 10 | 2 | 11 |

Esses totais representam a coorte historica materializada. A coorte ativa que
deve ser exibida pelos consumidores atuais e:

| Unidade | Professores ativos atuais |
|---|---:|
| Barra | 19 |
| Campo Grande | 31 |
| Recreio | 24 |

O recorte ativo nao deve ser substituido pela contagem bruta de snapshots.

## Delta por professor

### Barra

| Professor | Alunos | Horas antes | Horas depois | Meta antes | Meta depois | Nota carteira antes | Nota carteira depois | Score antes | Score depois |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Erick Cosme da Silva | 9 | 39 | 18 | 44,58 | 20,57 | sem nota | sem nota | sem base | sem base |
| Jeyson Gaia Ramos | 5 | sem base | 7 | sem base | 8,00 | sem nota | 62,49 | sem base | 79,36 |
| Matheus Reis | 11 | 13 | 14 | 14,86 | 16,00 | sem nota | sem nota | sem base | sem base |

Erick e Matheus Reis continuam em maturacao; a alteracao de horario nao fabrica
nota. O Jeyson passa a ter o pilar de carteira porque seu vinculo oficial da
Barra agora possui disponibilidade.

### Campo Grande

| Professor | Alunos | Horas antes | Horas depois | Meta antes | Meta depois | Nota carteira antes | Nota carteira depois | Score antes | Score depois |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Adriana Mesquita | 9 | sem base | 7 | sem base | 11,25 | sem nota | sem nota | sem base | sem base |
| Alexandre de Sa | 27 | sem base | 14 | sem base | 22,50 | sem nota | 100,00 | 95,27 | 95,90 |
| Ana Beatriz | 2 | sem base | 5 | sem base | 8,04 | sem nota | sem nota | sem base | sem base |
| Fabricio Costa | 14 | sem base | 8 | sem base | 12,86 | sem nota | sem nota | sem base | sem base |
| Jeyson Gaia Ramos | 5 | sem base | fora da unidade | sem base | sem meta | sem nota | sem nota | sem base | sem base |
| Ramon Pina Morais | 13 | 14 | 3 | 22,50 | 4,82 | 57,78 | 100,00 | 85,48 | 91,11 |
| Renan Amorim Guimaraes | 16 | 27 | 8 | 43,39 | 12,86 | 36,88 | 100,00 | 88,25 | 96,67 |

O Jeyson permanece no snapshot historico de julho porque existem 18 aulas nao
canceladas dele em Campo Grande no mes. Ele nao possui jornada ativa nem vinculo
formal atual na unidade e deve ficar fora da coorte ativa da tela.

### Recreio

| Professor | Alunos | Horas antes | Horas depois | Meta antes | Meta depois | Nota carteira antes | Nota carteira depois | Score antes | Score depois |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Alexandre de Sa | 19 | 25 | 21 | 28,53 | 23,96 | 66,61 | 79,30 | 80,02 | 81,51 |
| Ana Beatriz | 4 | sem base | 11 | sem base | 12,55 | sem nota | sem nota | sem base | sem base |
| Erick Cosme da Silva | 22 | 34 | 28 | 38,79 | 31,95 | sem nota | sem nota | sem base | sem base |
| Matheus Reis | 1 | sem base | 6 | sem base | 6,85 | sem nota | sem nota | sem base | sem base |
| Ramon Pina Morais | 34 | 30 | 24 | 34,23 | 27,38 | 99,33 | 100,00 | 93,24 | 93,33 |
| Renan Amorim Guimaraes | 14 | 8 | 9 | 9,13 | 10,27 | 100,00 | 100,00 | 86,65 | 86,65 |

## Casos nominais de controle

| Caso | Resultado final |
|---|---|
| Isaque / Barra | score 85,09; cobertura 85%; 25 alunos; 36h; meta 41,15; nota carteira 60,76 |
| Erick / Barra | sem base; em maturacao; 9 alunos; 18h; meta 20,57 |
| Peterson / Barra | score 96,22; cobertura 85%; 10 alunos; 7h; meta 8,00; nota carteira 100 |
| Gabriel Antony / Barra | score 83,37; cobertura 75%; 43 alunos; 45h; meta 51,44; nota carteira 83,60 |
| Matheus Sterque / Campo Grande | sem base por cobertura de 50%; 9 alunos; 8h; meta 12,86; nota carteira 70,01 |

## Conclusao para o cutover

O backend esta pronto para a etapa de validacao dos consumidores. A virada nao
deve usar a coorte bruta de snapshots: Performance, cards, Dashboard, Analytics
e relatorios precisam manter o filtro de vinculo ativo do LA Report para o
recorte atual, preservando historicos apenas quando o relatorio pedir
explicitamente uma competencia passada.

Ranking e premiacao continuam fora de escopo ate o fechamento oficial do ciclo.

