# Sol · Metodologia de virada V3 → V4 (regra permanente)

> Decisão do Alf, 29/09/2026. Registrada pelo Alfredo depois da regressão da virada de 28/09.

## O que aconteceu
Em 28/09 a V4 (agente com ferramentas) foi ligada nas 3 unidades de uma vez, sem a régua combinada
(Recreio → Barra → CG, 3 dias úteis limpos em cada). Em 29/09 a equipe bateu em regressões que a V3
não tinha. Exemplos:
- segurança virou despesa pela ferramenta;
- aluno com 2 cursos foi tratado como 2 alunos;
- card de R$ 900 contra fatura de R$ 500 pedindo "pode";
- card duplicado do mesmo comprovante;
- "pode" do lote recusado por janela diferente do preview.

Em 29/09 às 17:01 UTC as 3 unidades voltaram para a V3 (`SOL_CAIXA_V4_CANARIO=""`,
`SOL_CAIXA_TOOLS_CANARIO=""`). A V4 segue em **sombra**: registra o que faria (`roteador_v4_shadow`)
e não mexe em nada.

## Regras
1. **Um único writer na Sol.** Hoje é o Alfredo. Outros agentes só revisam PR. Dois writers no mesmo
   caixa foi parte da causa.
2. **O modelo conversa; o código decide.** Categoria, aluno, valor, fatura e forma saem de regra
   determinística sobre as palavras humanas e a fonte oficial. O palpite do modelo só entra quando a
   pessoa não disse, e a divergência vai para o log. (Padrão ouro: "Maria por dentro", em
   `LucianoAlf/alfredo-backup/governance/agent-playbook/`.)
3. **Bateria antes da virada.**
   - O `caixa.log` real vira casos de teste: para cada mensagem, o que a V3 fez, o que a V4 faria e
     qual era o certo (conferido no caixa e no Emusys).
   - Os casos de 29/09 são obrigatórios (Mayra/CG passaportes, Wenny/Recreio, segurança/CG).
   - Nomes trocados; nenhum dado pessoal no repo.
4. **Placar por tipo de caso:** recebimento, lojinha, saída, lote multi-aluno, correção, estorno,
   abertura/fechamento. A V4 só assume um tipo quando **ganha da V3** nele **sem perder nenhum caso
   que a V3 acertava**.
5. **Virada por unidade, nunca as três.** Recreio → 3 dias úteis limpos → Barra → 3 dias → CG. Cada
   passo exige o ok explícito do Alf e tem rollback pronto (restaurar os drop-ins 30/31 e reiniciar
   só a Sol).
6. **Função nova nasce na V3, com teste.** A V4 herda depois. Exemplos da fila:
   - adiantamento/excedente;
   - aluno com 2 cursos identificado pela pessoa (emusys_student_id), não pela linha de curso;
   - vários comprovantes de um mesmo pagamento.
7. **Preview e revalidação usam a mesma janela e a mesma regra.** Card que o "pode" não consegue
   gravar não pode ser publicado.
8. **Card que não fecha não pede "pode".** Divergência de valor vira explicação e pergunta, nunca
   aprovação.

## Decisões de negócio registradas
- **29/09/2026 (Alf):** excedente pago além das faturas vira item **"adiantamento parcela <próxima
  competência>"**, declarado pela equipe, sem vínculo de fatura, e é vinculado quando a fatura nascer.
  Caso de origem: Wenny/Recreio, R$ 1.650 = passaporte R$ 550 + 2 parcelas de outubro de R$ 500 +
  R$ 100 de adiantamento para novembro.
