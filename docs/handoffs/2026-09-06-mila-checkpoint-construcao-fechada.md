# Mila do time comercial — construção fechada, começa a medição

**Data:** 06/09/2026 · **Decisão do Alf:** *"construímos toda a estrutura base, tá tudo pronto, tá tudo no ar. Agora é esperar, dia a dia, a galera usando."*
**Marco:** a medição começa **terça 08/09** (segunda é feriado e tudo fica em silêncio).

---

## 1. O que está no ar

| peça | estado | desde |
|---|---|---|
| Base de conhecimento — 12 blocos | gate em 2 camadas, busca OR, catálogo, log de uso | 06/09 |
| Briefing 08:30 e fechamento 18:30 — consultoras | entregando, formato completo | 04/09 |
| Briefing da liderança (Alf e Krissya) | rede contra o mesmo período do mês passado | **estreia 08/09** |
| Convite do dia | 1 por dia, no briefing da manhã, ancorado no dado | **estreia 08/09** |
| Contraponto + `registrar_eficacia` | no SOUL e como tool | 06/09 |
| Agenda da escola | feriado e domingo calam; **recesso não** | 06/09 |
| Sol: caixa, relatório e aviso prévio | mesma agenda, 20 linhas do crontab | 06/09 |
| Mila SDR | **intocada** — 4 blocos, md5 conferido | — |

PRs #358, #359, #360, #361, todos mergeados na `main`.

## 2. Os números que valem, medidos

**Comportamento** (por repetição, não por rodada única):

- *"a base não cobre isso"* — **5 de 5**
- campanha/calendário no início do mês — **3 de 5 → 5 de 5** depois de pôr o contexto do mês dentro do resultado da tool
- suíte de sombra completa — **25 cenários, 30 checagens, 0 falhas**

⚠️ A suíte é **não-determinística**: duas rodadas seguidas deram 4 falhas cada com conjuntos *diferentes*. Uma rodada verde não prova estabilidade. E **7 de 9** vermelhos investigados em 06/09 eram predicado do teste, não defeito do agente.

**Adoção** — é o que não fechou:

- 34 mensagens entrantes em três dias, quase todas *"Obrigada"* e *"Bom dia"*
- **uma** pergunta de verdade, no primeiro dia
- última mensagem de uma consultora para a Mila: **sábado 05/09, 11h37**
- base de conhecimento: **zero consultas reais**

## 3. Como medir, a partir de 08/09

```sql
-- uso real da base (ensaio da suíte está marcado e não conta)
select detalhes->>'quem' quem, detalhes->>'situacao' pergunta,
       detalhes->'devolvidos'->0->>'titulo' bloco_top, created_at
from automacao_log
where evento = 'base_conhecimento' and acao = 'consulta_base_comercial'
  and detalhes->>'origem' = 'producao'
order by created_at desc;

-- qual convite saiu para quem
select detalhes->>'convite' convite, aluno_nome, created_at::date
from automacao_log
where evento = 'mila_proativa' and acao = 'manha'
order by created_at desc;
```

E o cruzamento que importa: **convite oferecido × mensagem entrante no mesmo dia.** Como cada consultora recebe um convite diferente, uma semana já diz qual deles faz a pessoa responder.

## 4. O que ficou aberto

1. **Adoção da base** — medir na sexta 11/09. Se der zero, o problema é o convite, não a ferramenta.
2. **Estreia da liderança** — 08/09 08:30, com o contexto do mês junto.
3. 🔴 **O sinal "sem desfecho" está gerando ruído** — ver §5, é o item mais urgente.
4. Rotacionar a chave da OpenCode Zen (transitou em chat).
5. `src/types/database.types.ts` desatualizado (editado cirurgicamente, não regenerado).
6. Itens do checkpoint anterior não reconferidos: cashback de indicação, professor na experimental, elo estratégia→ação.

## 5. 🔴 O achado da Daiana — "sem desfecho" está errado, e ela está certa

A seção **"🔥 SINAIS DO DIA — AÇÃO"** manda *"Ligar HOJE, não mandar mensagem"* sobre leads que a consultora **já fechou**.

**O que ela disse** (áudios de 06/09):

> *"Quando tem alguma coisa ainda pra resolver, que dá pra tentar resgatar, eu **não resolvo** lá a conversa — deixo ali até pra eu não esquecer daquele cliente, porque ele fica na minha vista. Quando eu **encerro** é porque já acabou o assunto, não tem mais o que resgatar."*

Isso não é reclamação: é a **descrição de um protocolo**. O `aberta/resolvida` dela carrega a decisão.

**A causa, na fonte.** `radar_detectar_sinais_comercial_v1`, regra R15:

```sql
where j.etapa = 'experimental_realizada'
  and not j.converteu
  and j.dias_parado > 3 and j.dias_parado <= 30
  and j.motivo_nao_matricula is null      -- ← o único teste de "desfecho"
```

O sinal pergunta ao **CRM**. O desfecho dela mora no **Chatwoot**. Os dois nunca se falam.

**Verificado, caso a caso.** Conversa **20303** (Adam Braga Boarim): `status: resolved`, e a última mensagem é da própria Daiana, em 03/09 —

> *"Tá ok, sem problemas. Muito obrigada pelo retorno e fico no aguardo de vocês futuramente 🙏🤩"*

O desfecho existe, está escrito, e diz qual é. Os seis leads da lista têm `motivo_nao_matricula = null` no CRM.

⚠️ **Ruído com pessoa correta é o pior tipo de ruído.** Quem trabalha certo — fecha a conversa, deixa aberto só o que dá para resgatar — é exatamente quem mais recebe o alarme falso. Isso ensina o time a ignorar o canal, e aí o sinal verdadeiro morre junto.

### O que fazer

Não apagar o sinal: **trocar o pedido**, porque a lacuna real (o motivo) continua existindo.

| conversa no Chatwoot | hoje | proposto |
|---|---|---|
| **aberta** | "Ligar HOJE" | igual — está certo |
| **resolvida** | "Ligar HOJE" ❌ | *"você encerrou a conversa do Adam em 03/09 — me diz em uma palavra o que houve (achou caro / horário / vai pensar) que eu registro"* |

Isso converte ruído na `motivo_nao_matricula` que falta, usando as tools de escrita que já existem.

### O que falta para conseguir fazer

🔴 **Não dá para implementar hoje.** `leads.chatwoot_conversation_id` existe e está **0 de 9.857 preenchido**, e não há espelho do status do Chatwoot no banco. O R15 é SQL puro e não alcança a API.

O elo precisa ser construído antes da regra. Duas opções:

1. **Preencher o vínculo por telefone** e espelhar `status` numa varredura periódica (o padrão da `varrer-atribuicao-meta-ads`, que já lê `conversations/filter` por janela).
2. **Webhook `conversation_resolved`** do Chatwoot escrevendo direto — mais barato em chamadas, mas depende de configurar no Chatwoot e não cobre o histórico.

A (1) cobre o passado e o presente; a (2) é forward-only. Recomendo (1), com a mesma janela de 3 dias já usada em produção.
