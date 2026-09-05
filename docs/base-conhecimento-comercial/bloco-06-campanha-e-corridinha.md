# Bloco 6 — Campanha e corridinha: ataca um gargalo, nasce com desfecho previsto
**Escopo:** comercial · **Público:** Krissya (Mila da líder) · **Estado:** candidato v0.1 · **Decisor:** Krissya, com Alf

---

## Quando usar
- **Dias 1 a 5 do mês:** se não há campanha ou corridinha registrada, a Mila provoca. Se já há, acompanha o combinado — não cobra de novo.
- **Gargalo no funil:** `onde_focar` aponta captação, agendamento ou fechamento numa unidade.
- **Gatilho sazonal:** janeiro, volta às aulas (fev/ago), Semana das Crianças, Black Friday, recital.
- **Fim do mês:** a Mila fecha a leitura da ação e preenche `evidencia_eficacia`.

**Sinal medido:** matrículas do mês por unidade (`matriculas_comerciais_v1`) contra a meta; dia do mês sem ação registrada; gargalo por unidade.

## O princípio
Campanha não é "vender mais" — é atacar **um** gargalo com **uma** mudança. Duas camadas que não se misturam na leitura:
- **Campanha pro público:** oferta, condição, evento, indicação. Muda o que o cliente vê.
- **Corridinha pro time:** meta curta + prêmio imediato. Muda o que o consultor faz.

E a regra do Alf: **toda ação nasce com o desfecho previsto** — o que olhar, quando, contra o quê. *Bateu a meta ≠ a campanha funcionou*: setembro bate por volta às aulas. Compara-se com o mesmo mês do ano anterior ou com as unidades que não fizeram; quando não dá pra isolar, a Mila diz que não dá.

## Como fazer

### Anatomia de uma campanha (6 campos — se faltar um, não roda)
1. **Gargalo + evidência:** *"Barra: 74 experimentais sem matrícula nos últimos 90 dias"* — número canônico, com data.
2. **Público:** quem exatamente, quantos, em qual unidade (`radar_publico_reativacao_v1`).
3. **A mudança (uma só):** condição, evento, sorteio, retomada. Não empilhar desconto + criativo novo + corridinha e depois atribuir o resultado a um deles.
4. **Execução:** quem faz, até quando, qual peça (texto/arte), qual bloco da base usa.
5. **Meta e prêmio** (se tiver corridinha): ver abaixo.
6. **Desfecho previsto:** métrica, janela, comparador. Escrito antes de começar.

### Anatomia de uma corridinha (o sprint em cima do campeonato)
O Matriculador+LA é o campeonato mensal (estrelas: Matrícula Plus, Indicação/Family, Ticket, Show-Up, Hunter 360°). A corridinha é o **sprint**: curta, prêmio na hora, uma métrica.
- **Meta curta:** semanal ou até o dia X. Ex. do Alf, agosto: bateu 30 matrículas → R$ 1.000 no Pix na hora. ⚠️ *30 era por unidade ou do time? Confirmar pra virar regra.*
- **Regra canônica do que conta:** matrícula = `matriculas_comerciais_v1`, até o último dia inclusive (o fim do intervalo é exclusivo — passar dia 1 do mês seguinte). Mês fechado vem do snapshot.
- **O que NÃO conta:** rematrícula, mudança de canal do lead pra caber no critério, matrícula sem passaporte pago.
- **Critério de desempate** e **data do Pix** definidos antes.
- **Uma métrica por corridinha.** Show-up ou matrícula ou indicação — nunca as três.

### Cardápio de campanhas prontas (cada uma já tem bloco)
| gatilho | campanha | bloco |
|---|---|---|
| Semana das Crianças | *"Traga um amiguinho"*: aluno traz amigo pra Experiência, os dois concorrem a um prêmio (videogame) | 2 |
| Black Friday / janeiro | Retomada dos perdidos por **preço** com a condição do mês | 5 |
| Qualquer mês com público alto | Condição de ex-aluno no LA Pass | 10 |
| Show-up baixo numa unidade | Piloto da Experiência Musical paga | estratégia candidata |
| Recital | Família convida quem quiser pra assistir → lista de leads mornos | 2 + 3 |
| Turma nova aberta | Retomada dos perdidos por **horário** | 5 |

### Como a Mila traz pra Krissya
- **Dia 1:** *"Krissya, bom dia. Setembro começou e não tem corridinha registrada. Em agosto foi 30 matrículas = R$ 1.000 no Pix. O gargalo do mês passado foi agendamento na Barra (X leads, Y agendados). Quer que eu desenhe uma corridinha de show-up pra Barra e uma campanha de indicação pras três?"*
- **Elo estratégia → ação:** nunca só o número. *"74 pessoas na Barra — quer que eu monte a lista e prepare a mensagem?"*
- **Fim do mês:** *"A corridinha de setembro fechou com X matrículas. Setembro de 2025, sem corridinha, deu Y. Observado: X. Atribuído: a diferença que sobra depois da volta às aulas — não dá pra isolar. Vale repetir em outubro pra comparar sem sazonalidade?"*

## O que NÃO fazer
- Campanha + corridinha + criativo novo + desconto no mesmo mês e atribuir o resultado a um.
- "Bateu a meta = funcionou."
- Meta sem regra canônica (o que conta, até que dia, quem confere).
- Prêmio que paga jogo sujo: mudar origem de lead, contar rematrícula.
- Campanha sem peça e sem data — ideia não é campanha.
- Cron eterno cobrando corridinha depois de ela existir.
- Deixar `evidencia_eficacia` vazia no fim do mês (hoje: vazia nas 14 estratégias).

## Exemplo de mensagem (Krissya → time, corridinha)
*"Time, corridinha de setembro: quem levar a unidade a 12 experimentais realizadas até dia 20 ganha R$ 500 no Pix no dia 21. Conta experimental realizada com presença confirmada no LA Report — visita não conta. Desempate: quem chegou primeiro. Bora?"*
*(valores de exemplo — quem define é a Krissya com o Alf)*

## Como medir
- Matrículas (ou a métrica da corridinha) do público, no mês, contra: mesmo mês do ano anterior **e** unidades que não fizeram.
- Custo da ação (prêmio + desconto + peça) por matrícula atribuída.
- `evidencia_eficacia` preenchida em 100% das ações, com rótulo observado / atribuído / incremental.
- Corridinha: efeito na semana seguinte (caiu depois do prêmio? antecipou matrícula que viria de qualquer jeito?).

## Fonte
- Alf, 05/09/2026: corridinha de agosto (30 = R$ 1.000), tipos de meta (corridinha, semanal), sorteio "traga um amiguinho", provocar a Krissya no início do mês.
- Brainstorm 05/09/2026: toda ação nasce com desfecho previsto; bateu meta ≠ funcionou; comparador honesto; elo estratégia → ação.
- Programa Matriculador+LA (ago/2026): estrelas mensais, metas de Show-Up por unidade (CG 40, REC 40, BAR 35), premiação anual.
- Regras travadas (checkpoint 05/09/2026): `matriculas_comerciais_v1`, intervalo exclusivo, snapshot do mês fechado.
- Método absorvido em 05/09/2026: campanha ≠ incentivo interno; uma mudança por vez; início do mês checa se o plano já existe.

**Escrito por:** Alf + Claude · **Data:** 05/09/2026 · **Estado:** candidato · **Decisor:** Krissya com Alf
