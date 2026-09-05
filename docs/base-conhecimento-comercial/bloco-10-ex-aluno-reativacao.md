# Bloco 10 — Ex-aluno: "lembrei de você"
**Escopo:** comercial · **Público:** Krissya (quem decide a campanha) e consultor (quem liga) · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf

---

## Quando usar
- **Consultor:** quando a Mila entrega a lista de ex-alunos elegíveis com motivo de saída e frase original, ou quando um ex-aluno volta a falar sozinho.
- **Krissya:** nos gatilhos sazonais — janeiro/volta às aulas, agosto, Semana das Crianças, Black Friday — e quando o público de reativação (`radar_publico_reativacao_v1`) mostra volume numa unidade.

**Sinal medido:** ex-alunos que voltaram a procurar a escola sozinhos fecharam **68%** — mas são **28 leads**, e quem volta sozinho já decidiu. Não vale como previsão pra base inteira; vale como prova de que a porta está aberta. Carteira de ex-alunos é grande, principalmente em Campo Grande; muitos saíram na pandemia e estão voltando aos poucos (Playbook).

## O princípio
Ex-aluno já confiou uma vez — o que precisa é de um motivo real pra voltar agora e da certeza de que o motivo da saída foi resolvido. A abordagem é pessoal ("lembrei de você"), nunca disparo igual pra todo mundo. E a conversa começa pela história dele, não pela oferta.

## Como fazer

### Krissya — desenhar a campanha (início do mês ou gatilho sazonal)
1. A Mila traz o público por unidade, **separado por motivo de saída**: horário · financeiro · mudança/pandemia · reclamação · conclusão/idade.
2. Cada motivo tem uma resposta diferente — ver tabela. Reclamação **não** recebe oferta antes de receber cuidado.
3. Define a condição de retorno do mês (⚠️ ver ponto de discussão sobre o LA Pass).
4. Fecha o desfecho previsto antes de começar (ver Como medir).

### Consultor — a conversa (script do Playbook, encurtado pro WhatsApp)
1. **Preparação:** instrumento, tempo de casa, professor, conquista (recital, banda) e motivo de saída. Sem isso, não liga.
2. **Abertura pessoal:** *"Oi [nome], aqui é a [consultora] da LA. Lembrei de você — você fez bateria com o [professor] e tocou no Julina de 2024. Como está a música na sua vida hoje?"*
3. **Escuta o que mudou.** Bumerangue: *"O que faria sentido pra você agora — voltar no mesmo instrumento ou experimentar outro?"*
4. **Resolve o motivo de saída** (tabela) antes de falar em valor.
5. **Convite:** visita ou aula de volta, com a condição de ex-aluno do mês. *"Tenho a turma de [dia/hora] — quer vir fazer uma aula e sentir?"*
6. **Registra** retorno, recusa ou nova data (`lead_retomada` com a frase dele).

| motivo da saída | o que resolver antes da oferta | gancho |
|---|---|---|
| horário | turma nova que caiba | *"Abriu turma de sábado de manhã — era isso que faltava, né?"* |
| financeiro | condição de ex-aluno do mês | *"Esse mês quem volta tem [condição]. Ajuda?"* |
| mudança / pandemia | novidade real (unidade, curso, evento) | *"Agora temos [novidade]. Ficou mais perto de vocês?"* |
| reclamação | pedir desculpa e mostrar o que mudou — sem oferta na 1ª mensagem | *"Você saiu por [motivo]. Queria te contar o que mudou desde então."* |
| conclusão / idade | próximo passo pedagógico | *"Você parou no [nível]. Tem a turma de [banda/avançado] pra quem quer seguir."* |

## Como a Mila traz pra Krissya
*"Krissya, na Barra tem [N] ex-alunos elegíveis: [x] saíram por horário, [y] por financeiro, [z] por mudança. Com a Semana das Crianças chegando, quer que eu monte a lista com a frase de saída de cada um e um rascunho por motivo?"*

## 💬 Pra discutir
- **LA Pass do ex-aluno.** A regra do Playbook diz: quem sai e volta paga LA Pass novo. É a primeira barreira de quem volta. Proposta: a "condição de ex-aluno" ser desconto ou isenção do LA Pass, em vez de mexer na parcela — cabe no financeiro e não cria precedente de mensalidade menor.
- **Ritmo.** Não convidar a base inteira de uma vez: 20–30 por semana por unidade. O que sobra vira controle natural.

## O que NÃO fazer
- Disparo em massa com o mesmo texto pra 300 ex-alunos.
- Ligar oferecendo desconto pra quem saiu por reclamação.
- Prometer novidade que não existe.
- Projetar os 68% de quem voltou sozinho sobre quem vai ser convidado.
- Tratar silêncio como autorização pra insistir toda semana: duas tentativas e retomada em data.
- Culpa (*"você sumiu"*) ou cobrança do passado.

## Exemplo de mensagem
*"Oi Rafael! Aqui é a Daiana, da LA Recreio. Lembrei de você: você fez guitarra com o Peds e parou em 2023 quando mudou de horário no trabalho. Como está a música por aí? Abriu uma turma de sábado às 10h que talvez encaixe agora — quer vir tocar uma aula e ver como está a mão?"*

## Como medir
- Convidados → responderam → vieram → rematricularam, por motivo de saída e unidade.
- Comparador: ex-alunos elegíveis **ainda não convidados** no mesmo período (o ritmo semanal cria o controle sozinho).
- Continuidade: quantos seguem matriculados 3 meses depois.
- Rótulo: observado / atribuído / incremental.

## Fonte
- *Ecossistema de Vendas do Grupo LA — Playbook*: "Contato com ex-alunos — pró-ativo" (preparação, abordagem, explorar experiência, oferta personalizada, CTA), seção "Ex-alunos" (carteira robusta em CG, saída na pandemia), regra do LA Pass.
- Medição no banco (handoff 05/09/2026, PC3): 28 leads de ex-alunos, 68,2% de conversão — público auto-selecionado.
- Alf, 05/09/2026: "lembrei de você"; gatilhos sazonais (janeiro, volta às aulas, Semana das Crianças, Black Friday).
- Público de reativação: `radar_publico_reativacao_v1` (Mila estratégica).

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
