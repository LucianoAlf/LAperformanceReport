# Marcos da Jornada (Sucesso do Cliente) — falsos calouros, datas de renovação erradas e filtro de período

**Data:** 2026-06-16
**Levantado por:** Fabíola (Sucesso do Cliente)
**Documentado por:** Hugo (via análise de código + banco)
**Para:** Luciano
**Status:** diagnóstico — **nenhuma alteração foi feita**. Documento para decisão.

---

## 1. Os problemas, na voz da Fabíola

A Fabíola está usando a aba **Marcos da Jornada** (Sucesso do Cliente) para disparar pesquisas de boas-vindas, marco de aula e renovação, e levantou três pontos.

### Áudio 1 — Marco de aula puxando aluno antigo
> "Essa parte aqui é marco de aula, acho que não está atualizando. Porque, por exemplo, essa Sofia de Lima Castro, eu coloquei número de aula 4, né? Aí não sei se não está atualizando mesmo... porque, vamos supor, 4 seriam um mês. Aí entraria em 'contato com o aluno após um mês de aula'. Essa Sofia, ela já é aluna antiga, então não sei se renovou o contrato dela há um mês e aí ela está entrando aqui. Esse Vinícius Palmieri também é antigo."

### Áudio 2 — Datas de "Prestes a renovar" inconsistentes
> "Essa parte aqui de 'prestes a renovar', não entendi esse 'vence em'... por exemplo, esse Rafael Souto, do professor Mateus Lana, está aqui: 'vence em 31/08/2019'. Eu acho que essa data foi a data que ele matriculou. Ele ainda é aluno ativo... não sei por que ele está aqui vencido com essa data."

### Áudio 3 — Falta filtro de data nas primeiras aulas
> "Aqui nessa parte para pesquisar os alunos que tiveram a primeira aula, é possível colocar uma data? O mês, ou do dia tal ao dia tal? Porque aqui está aparecendo dos próximos sete dias, mas eu não consigo ver retroativo. Os deste mês eu não consigo."

---

## 2. O que apuramos

### 2.1 Problema 1 — "Falsos calouros" no Marco de aula

O bloco **Marco de aula** mostra "apenas calouros (1º contrato)". Para decidir quem é calouro, o sistema usa o campo `numero_renovacoes` do aluno: se for `0`, trata como calouro.

**A causa raiz é um bug no webhook de matrícula.** A edge `processar-matricula-emusys`, quando processa uma **renovação**, atualiza a data de contrato e a data da última renovação — **mas nunca incrementa o `numero_renovacoes`**. Esse campo só é lido, nunca escrito. Resultado: aluno que já renovou continua marcado como `numero_renovacoes = 0` e aparece como "calouro".

Confirmado nos dados:
- **Sofia Lima de Castro** tem 2 matrículas (uma de abr/2024 já vencida + uma de fev/2026), as duas com `numero_renovacoes = 0`. É aluna antiga, mas o sistema a lê como calouro.
- Quando o aluno renova, o Emusys **reinicia a contagem das aulas** (volta para aula 1, 2, 3, 4…). Por isso a Sofia, na 4ª aula do novo ciclo, cai no marco como se fosse nova.

**Escala do problema:** 366 alunos ativos matriculados há mais de 14 meses ainda estão com `numero_renovacoes = 0`.

**Detalhe importante: o sistema já tem uma mecânica de "veterano", mas o Marco de aula não a usa.** Na tela de Alunos existe um selo "Veterano" baseado em `tempo_permanencia_meses >= 12` — um campo calculado por trigger a partir da `data_matricula`, que **não depende do webhook** e por isso está correto. Os três alunos que a Fabíola reclamou já têm esse campo certo:

| Aluno | tempo_permanencia | numero_renovacoes (furado) |
|---|---|---|
| Rafael Souto (2018) | 93 meses | 0 |
| Sofia (2024) | 26 meses | 0 |
| Vinícius (2025) | 12 meses | 0 |

Ou seja: o sistema **já sabe** que eles são antigos por outro campo — o Marco de aula só está olhando para o sinal errado.

### 2.2 Problema 2 — Data "Vence em" congelada (Rafael Souto)

A Fabíola está certa. O **Rafael Souto Machado** (professor Matheus Lana) foi matriculado em **25/08/2018** e está com `data_fim_contrato = 31/08/2019`, mas segue **ativo**. A data 31/08/2019 é o fim do **contrato original de 2018** e nunca foi atualizada.

O webhook **atualiza** a `data_fim_contrato`, mas só quando a renovação passa por ele (de dez/2025 em diante). Renovações antigas, feitas antes do sistema ou fora do fluxo do webhook, ficaram com a data congelada.

**Escala:** 19 alunos ativos com data de fim anterior a 2024, e 664 ativos sem nenhuma data de fim preenchida.

**Não há como buscar isso do Emusys automaticamente.** Confirmei na documentação da API: o Emusys **não tem endpoint para consultar o contrato do aluno** (a API só expõe leads, aula experimental, professores, cursos e aulas). O dado de contrato só chega quando o Emusys **empurra** um webhook de matrícula/renovação — não existe "puxar" retroativo.

### 2.3 Problema 3 — Sem filtro de período nas primeiras aulas

Hoje a tela só busca **para frente**: de hoje até hoje + a janela escolhida (3, 7 ou 14 dias). Não existe modo retroativo nem seleção de mês/intervalo. É uma limitação de design da edge `marcos-jornada`, que calcula a janela sempre a partir de "hoje".

### 2.4 Lentidão ao trocar filtro

A Fabíola também notou que a tela demora a carregar quando mexe nos filtros. A edge consulta o **Emusys ao vivo** (nas 3 unidades, com paginação) e refaz a busca do zero a cada mudança de filtro — inclusive quando se muda só o "Nº da aula", que nem precisaria rebuscar.

---

## 3. O que eu (Hugo) acho que deve ser feito

### Problema 1 — falsos calouros (3 camadas, não uma)

A solução tem três camadas que se complementam — uma resolve o sintoma agora, as outras duas são a correção de fundo. **Nenhuma substitui as outras.**

**Camada 1 — Atalho imediato (barato): usar o `tempo_permanencia_meses` no Marco de aula.**
A mecânica de veterano por tempo já existe e é confiável (vem da `data_matricula`, não do webhook). Trocar o filtro do Marco para considerar calouro só quem tem pouco tempo de casa **já tira os antigos da lista**, sem depender de corrigir o webhook. É o conserto rápido do que a Fabíola vê.
   - Ressalva: "tempo ≥ 12 meses" é um *proxy* de antiguidade, não a verdade sobre "já completou um contrato". O Vinícius (12 meses, 1º contrato) é um caso de borda — por isso essa camada é atalho, não solução definitiva.

**Camada 2 — Corrigir o webhook (obrigatório, independente do atalho).**
Fazer a renovação incrementar o `numero_renovacoes` no aluno. O campo furado **não afeta só o Marco de aula** — ele é lido em outros pontos do sistema (carteira de professores, ficha do aluno, etc.). O atalho da camada 1 só mascara o problema num lugar; a origem precisa ser consertada para todos os consumidores. Conserta **do presente em diante**.
   - **Sem backfill.** O Hugo **não quer** recalcular/reescrever o `numero_renovacoes` dos alunos antigos. A correção do webhook resolve o futuro; o passado fica como está.

**Camada 3 — Criar o histórico de contratos/cursos do aluno (estrutural).**
Hoje **não existe** uma tabela que registre os contratos/cursos que cada aluno fez ao longo do tempo. O que há é parcial: `alunos_historico` (passagens entrada/saída pela escola, para LTV — granularidade de pessoa, não de curso), `renovacoes` (só renovações, a partir de dez/2025, sem o contrato inicial) e `movimentacoes_admin` (eventos soltos). Nenhum responde com precisão "este aluno já completou um contrato antes".
   - Esse histórico é a **fonte de verdade real** do que define veterano (o critério do Hugo: "já completou algum curso/contrato antes"), resolve o caso de borda do Vinícius e ainda corrige LTV e retenção de quebra. É a base que sustenta as camadas 1 e 2 a longo prazo.

### Problema 2 — data de renovação congelada

- **Não há solução automática por enquanto** (o Emusys não permite puxar o contrato).
- A correção é **manual, caso a caso**: a ficha do aluno já tem os campos "Início do Contrato" e "Fim do Contrato" editáveis. Para o Rafael e os demais com data antiga, basta ajustar na ficha.
- Daqui pra frente, conforme as renovações passam pelo webhook, a data se atualiza sozinha.

### Problema 3 — filtro de período

- **Aprovado implementar.** Adicionar um seletor de período (escolher mês ou "do dia X ao dia Y", inclusive retroativo) na tela, e ensinar a edge a aceitar um intervalo de datas arbitrário (ela já sabe buscar aulas por intervalo — é só expor o parâmetro).

### Lentidão

- Otimizar a busca de aulas (cache do resultado e não rebuscar o Emusys quando muda só o "Nº da aula"). O Hugo está de acordo em melhorar a velocidade dessa busca.

---

## 4. TL;DR para o Luciano

- **Falsos calouros:** o webhook de renovação nunca incrementa `numero_renovacoes`, então alunos antigos aparecem como calouros no Marco de aula (366 ativos afetados). A mecânica de "veterano" por tempo (`tempo_permanencia_meses ≥ 12`) **já existe** e está correta — o Marco só não a usa. Proposta em **3 camadas, sem backfill**:
  1. **Atalho imediato:** usar `tempo_permanencia_meses` no Marco para tirar os antigos da lista já.
  2. **Corrigir o webhook:** incrementar `numero_renovacoes` (o campo furado afeta outros pontos, não só o Marco).
  3. **Criar histórico de contratos/cursos do aluno:** fonte de verdade real de "veterano" (hoje não existe) — resolve casos de borda e ainda corrige LTV/retenção.
- **Data "vence em" errada (Rafael Souto):** a data ficou congelada no contrato de 2018. O Emusys **não tem endpoint para puxar isso**; correção é **manual** na ficha (campos já existem). Sem solução automática hoje.
- **Filtro de período:** aprovado — adicionar seleção de mês/intervalo (com retroativo) nas primeiras aulas.
- **Lentidão:** otimizar a busca (cache + não rebuscar à toa).
- **Nada foi alterado.** Aguardando sua avaliação.
