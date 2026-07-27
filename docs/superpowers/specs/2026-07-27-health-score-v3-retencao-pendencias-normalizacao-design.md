# Design - Retencao, pendencias e normalizacao percentual do Health Score V3

**Data:** 2026-07-27
**Status:** aprovado pelo Alf para implementacao
**Escopo:** backend, simulacao e homologacao; sem troca de consumidor ou tela nesta etapa

## 1. Objetivo

Corrigir o Health Score Professor V3 para que:

- a retencao use o mesmo universo no numerador e no denominador;
- vinculos historicos limpos pontuem sem serem bloqueados por pendencias separadas;
- pendencias tecnicas confirmadas pela jornada atual sejam conciliadas automaticamente;
- somente ambiguidades reais dependam de decisao humana;
- retencao, conversao e presenca usem o percentual real como nota;
- metas percentuais continuem visiveis como objetivos, sem funcionar como teto;
- os resultados sejam recalculados nas tres unidades antes de qualquer mudanca na UI.

## 2. Problema confirmado

O motor atual possui quatro desvios:

1. `vinculos_expostos` e `vinculos_em_revisao` sao conjuntos disjuntos, mas o
   estado `revisar` bloqueia todo o pilar quando existe qualquer pendencia.
2. O numerador de saidas vem de `movimentacoes_admin` sem vinculo explicito com
   o periodo publicavel usado no denominador.
3. A implementacao mais recente da metrica de retencao perdeu a regra temporal
   aprovada em 17/07/2026.
4. A normalizacao `valor / meta * 100`, limitada a 100, faz percentuais acima
   da meta empatarem artificialmente.

## 3. Grao canonico

O grao da retencao continua sendo:

```text
unidade
+ matricula
+ matricula-disciplina
+ professor
+ periodo pedagogico
```

Pessoa, matricula, disciplina e professor nao podem ser consolidados antes da
identificacao do periodo correspondente.

## 4. Universo da retencao

### 4.1 Denominador

O denominador contem somente periodos publicaveis que estiveram expostos no
recorte.

Periodos nao publicaveis:

- ficam fora do denominador;
- aparecem separadamente como pendencias;
- nao invalidam os periodos limpos do mesmo professor.

### 4.2 Numerador

Uma saida somente entra no numerador quando puder ser vinculada, sem
ambiguidade, a um periodo publicavel do mesmo:

- professor;
- unidade;
- aluno ou pessoa canonica;
- matricula e disciplina, quando disponiveis;
- recorte temporal.

Saida sem periodo publicavel correspondente fica em diagnostico e nao e
penalizada silenciosamente.

### 4.3 Regra temporal

Preservar a decisao aprovada:

- encerramento ate 02/08/2026: todo encerramento confirmado do vinculo conta;
- encerramento a partir de 03/08/2026: somente motivo atribuivel confirmado
  penaliza;
- motivo posterior ao corte ainda nao conciliado fica pendente.

## 5. Estados da retencao

- `sem_base`: nenhum vinculo limpo.
- `sem_base_amostra`: menos de 10 vinculos limpos.
- `ok`: amostra minima atingida e nenhuma pendencia.
- `ok_com_pendencias`: amostra minima atingida; calculo feito somente com os
  vinculos limpos; quantidade pendente exibida separadamente.

`ok_com_pendencias` pode compor o Health Score parcial. Fechamento oficial e
ranking continuam sujeitos aos gates de publicacao do ciclo.

## 6. Conciliacao das pendencias

### 6.1 Automatica

Um periodo ativo de confianca media pode ser promovido quando:

- unidade coincide;
- `emusys_matricula_disciplina_id` coincide;
- professor local ou `emusys_professor_id` coincide;
- a jornada atual esta ativa;
- nao ha conflito de titularidade;
- os identificadores estruturais estao completos.

A auditoria de 27/07/2026 encontrou 207 candidatos:

- Barra: 75;
- Campo Grande: 71;
- Recreio: 61.

### 6.2 Humana

Permanecem cinco casos:

- Barra: Beatriz von Glehn Herkenhoff, Erick para Jeyson, Teclado;
- Barra: Gabriela de Lima Sodre, Gabriel Santos para Gabriel Antony,
  Musicalizacao;
- Barra: Gabriela Dornas com Lohana, Teclado;
- Campo Grande: Sirley Jorge Martins Dantas com Israel, Violao;
- Recreio: Lohan Marques Boente, Ana Beatriz para Erick.

Esses casos nao recebem aprovacao automatica sem evidencia suficiente.

## 7. Normalizacao das notas

### 7.1 Pilares percentuais

Para retencao, conversao e presenca:

```text
nota = percentual real
```

Exemplos:

- valor 93% gera nota 93;
- valor 100% gera nota 100;
- meta 90% indica objetivo atingido, mas nao transforma 93 em 100.

### 7.2 Pilares com meta quantitativa

Permanencia, media de alunos por turma e numero de alunos continuam usando a
normalizacao versionada definida para suas metas.

## 8. Base minima

A base minima da retencao permanece absoluta em 10 vinculos limpos.

Professor abaixo da base:

- nao recebe nota zero;
- nao e penalizado;
- exibe o valor observado como diagnostico;
- tem o peso retirado temporariamente do score.

Nao sera criada base minima diferente por unidade ou professor.

## 9. Publicacao e consumidores

Nesta etapa:

- nenhuma view ou tela produtiva troca de fonte;
- ranking e premiacao permanecem bloqueados;
- snapshots fechados nao sao reescritos;
- a competencia aberta pode receber nova revisao auditada;
- a simulacao deve mostrar `Parcial`, `Sem base` ou estado diagnostico correto.

A UI so sera alterada depois da apresentacao e aprovacao dos resultados
recalculados.

## 10. Validacao

Validar obrigatoriamente:

1. saida com periodo publicavel correspondente;
2. saida sem periodo correspondente;
3. periodo limpo acompanhado de periodo pendente;
4. professor com 9, 10 e 11 vinculos limpos;
5. regra temporal antes e depois de 03/08/2026;
6. promocao automatica por jornada exata;
7. conflito que permanece humano;
8. nota percentual abaixo, igual e acima da meta;
9. snapshots fechados imutaveis;
10. comparacao das tres unidades.

Professores de referencia:

- Isaque Mendes da Silva;
- Erick Cosme da Silva;
- Peterson Biancamano;
- Gabriel Antony Alves de Araujo.

## 11. Criterio de aceite

A etapa termina quando:

- numerador e denominador compartilham o mesmo universo;
- os 207 casos automaticos forem reconciliados de forma reproduzivel;
- os cinco casos humanos estiverem isolados;
- percentuais reais forem usados como nota;
- as tres unidades forem recalculadas;
- Isaque nao aparecer abaixo de Erick por falta de base fabricada;
- os resultados forem apresentados ao Alf antes de qualquer cutover de UI.
