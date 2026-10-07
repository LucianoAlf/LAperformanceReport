# Frente 1 — UI da Bilheteria (com M9) — desenho para aprovação

> Status: **APROVADO COM AJUSTES (2026-09-29) e IMPLEMENTADO**. Ajustes do Alf
> incorporados: todos pagam meia (sem checkbox), canal+forma+"Já pago agora" no
> mesmo dialog (porta nunca nasce pendente), Painel separa Faturado × A receber,
> preço sem histórico de vigência (audit_log cobre), placeholder "Convidado N de
> <comprador>" editável até o dia, quantidade sem teto fixo (só a lotação limita).
> Design system: o que a aba Eventos já usa — fundo escuro, `slate` como base
> (`text-slate-300/400/500`, `border-slate-700`), acentos `amber` (pendente),
> `emerald` (pago/ok), `rose` (erro/cancelado/divergente), `sky` (info),
> `rounded-xl`/`rounded-lg`, componentes Radix existentes (Dialog, Tabs, Select,
> Input, Button, Badge). Nada de token novo.

## Onde mora

Nova aba **"Bilheteria"** dentro de `EventoDetalhePage` (ao lado de Grade, Palco,
Alunos, Revisão, Check-in). Visível só para equipe (mesma regra das demais abas).

A aba tem **3 seções internas** (Tabs ou scroll único? — proposta: sub-abas):

| Sub-aba | Conteúdo |
|---|---|
| **Painel** | KPIs + lotação por bloco + pendências de conciliação |
| **Vendas** | Lista de vendas + botão "Nova venda" (Dialog) |
| **Configuração** | Preços, pacotes, cota de cortesias, capacidade dos blocos |

## 1. Painel (sub-aba)

KPIs no topo (cards, padrão dos demais painéis):

- **Cortesias distribuídas** — `X de Y` (soma das cotas × alunos participantes)
- **Ingressos vendidos** — total, por status (`pendente` em amber, `pago` em emerald)
- **Faturado** — soma de `valor_final` APENAS das vendas `pago`
- **A receber** — soma de `valor_final` APENAS das vendas `pendente`
  (⚠️ nunca somar os dois num total único — o "faturado" não inclui pendente)
- **Pendentes de conciliação** — contador; vira alerta se > 0 após D+1

Tabela **Lotação por bloco** (da `vw_evento_bloco_lotacao`):

| Bloco | Data/hora | Capacidade | Cortesias | Vendidos | Livres | Barra |
|---|---|---|---|---|---|---|
| Bloco 1 | 20/12 10:00 | 120 | 58 | 40 | 22 | ▓▓▓▓▓░░░ |

Barra de progresso: `bg-emerald` até 80%, `amber` até 100%, `rose` lotado.

## 2. Vendas (sub-aba)

### Lista

Filtros: bloco, status, forma de pagamento, busca por comprador.

Colunas:

| Comprador | Bloco | Qtd | Valor | Forma/Canal | Pago em | Status | Conciliação | Ações |
|---|---|---|---|---|---|---|---|---|
| Maria Silva | B1 | 3 | R$ 270 | Pix · balcão | 28/09 14:32 | pago | pendente | ⋮ |

Badges de status: `pendente` amber, `pago` emerald, `cancelado` slate-500,
`reembolsado` rose, `estornado` rose-700. Conciliação: `pendente` slate,
`conciliado` emerald, `divergente` rose, `estornado` rose.

Ações (menu ⋮):
- **Marcar pago** — abre dialog pedindo `forma_pagamento`, `pagamento_identificador`
  (obrigatório exceto dinheiro — validação zod espelhando o CHECK) e `pago_em`
  (default agora);
- **Cancelar** — confirmação simples (libera lugar);
- **Reembolsar** — confirmação + se já `conciliado`, aviso: "vai para a fila de
  estornos da Sol".

Linha expandível: convidados nominais da venda (nome — **editável até o dia**,
lápis inline na linha — e check-in feito?).

### Dialog "Nova venda" (a tela que a recepcionista usa)

Campos:
1. **Bloco** (Select) — obrigatório; mostra "X livres de Y" ao lado; desabilita
   bloco lotado;
2. **Comprador** (Input, nome livre);
3. **Contato do comprador** (Input, telefone/e-mail — necessidade operacional;
   **não** sai em planilha de professor — LGPD);
4. **Quantidade** (número, **sem teto fixo** — quem limita é a lotação do bloco);
5. **Canal** (Select: online / balcão / porta);
6. **Forma de pagamento** (Select: pix / cartão crédito / débito / dinheiro / outro);
7. **Nomes dos convidados** — um Input por ingresso; em branco vira placeholder
   "Convidado N de <comprador>" (a RPC grava isso) para não travar a fila;
8. **Meia-entrada** — ❌ **NÃO EXISTE checkbox**: decisão do Alf = todos pagam o
   preço cobrado (`preco_meia` quando cadastrado); o `preco_unitario` fica só
   como referência na Config e no resumo;
9. **Vínculo com aluno** (opcional — Select de participante; preenche
   `participacao_id` quando a família avisa "sou do fulano");
10. **"Já pago agora"** (Switch) + **NSU/E2E** (obrigatório se pago e forma ≠
    dinheiro) — ⚠️ canal **porta** força o switch ligado: a venda não pode nascer
    pendente senão o check-in barra quem acabou de pagar;
11. **Observação** (opcional);
12. Resumo ao vivo: `qtd × preço cobrado − desconto do pacote = valor_final`
    (pacote automático — maior desconto que a qtd habilita; "inteira R$ X" só
    como referência).

Botão **"Registrar venda"** → chama `evento_bilheteria_vender_v1` (lock + lotação
+ meia automática + placeholders). Sem "Já pago agora" a venda nasce `pendente`;
com ele (ou canal=porta) nasce `pago` com `pago_em` + `pagamento_identificador`
na mesma gravação — **uma** chamada, sem estado intermediário.

## 3. Configuração (sub-aba)

Quatro cards:

- **Cota de cortesias**: `cortesias_por_aluno` (número, já existe no evento — M3);
- **Capacidade por bloco**: lista de blocos com input `capacidade` (nullable =
  sem limite) — aviso se lotação atual > nova capacidade;
- **Preços**: **preço inteira (referência)** + **preço cobrado** (`preco_meia`)
  — **uma linha por evento** (upsert; ❌ sem histórico de vigência — o
  `audit_log` já guarda quem mudou e quando);
- **Pacotes**: lista de (qtd mínima → % desconto) com add/remove.

Edição restrita a admin/equipe do evento (RLS já cobre; a tela esconde a sub-aba
para perfil sem permissão).

## Fluxo da recepcionista — venda de balcão, passo a passo

1. Família chega no balcão → recepcionista abre o evento → aba **Bilheteria →
   Vendas → "Nova venda"**;
2. Escolhe o **bloco** (o select já diz "Bloco 1 — 22 livres");
3. Digita **nome do comprador** (+ contato se a família der), **quantidade**
   (ex.: 3); os 3 inputs de convidado aparecem já com placeholder — deixar vazio
   vira "Convidado N de Maria", sem travar a fila;
4. Escolhe **canal** (balcão) e **forma de pagamento** (pix);
5. Se cobrou na hora: liga **"Já pago agora"** e digita o **NSU/E2E** (na **porta**
   o switch vem travado ligado — venda de porta nunca nasce pendente);
6. Sistema mostra o resumo: `3 × R$50 (meia) − 10% pacote = R$135` (inteira R$100
   aparece só como referência);
7. Clica **Registrar venda** → RPC trava o bloco, confere lugares e grava **paga**
   numa chamada só. Se não couber: toast rose "Bloco lotado: 0 livres, 1 pedidos"
   e a tela relê a lotação antes de tentar de novo;
8. Se ficou pendente (balcão/on-line sem pagar na hora): depois, ⋮ → **Marcar
   pago** → forma + NSU/ID Pix → confirma;
9. Os 3 convidados nominais já existem com `bloco_id` — no dia do recital entram
   pela aba **Check-in** (vendido não pago aparece com badge "pagamento pendente"
   e o trigger do banco não deixa entrar).

Tempo estimado por venda: ~30–40s.

## Estados-limite — o que aparece

| Situação | Onde | Aparência |
|---|---|---|
| Bloco lotou | Nova venda (select + submit) | Option desabilitada "lotado"; se furar no submit, toast rose "Só restam N lugares neste bloco" com o N exato do erro da RPC |
| Cortesia estourou | Check-in/aba Convidados (insert na ponte) | Toast rose "Fulano já chegou à cota de N cortesias — o restante é ingresso vendido" + botão "Registrar como venda" que abre Nova Venda pré-preenchida com o aluno |
| Venda divergente | Lista (badge rose) + Painel (contador) | Linha destacada `border-rose`; expansão mostra `conciliacao_obs` da Sol e data; contador no Painel "N divergências — verificar com o financeiro" |
| Reembolso pós-conciliação | Lista | Ação "Reembolsar" mostra aviso "já conciliada — vai para a fila de estornos"; status vira `reembolsado` com `conciliado` e entra no feed `estornos_v1` |
| Check-in de vendido não pago | Aba Check-in | O trigger do banco barra; a lista de check-in mostra o convidado com badge amber "pagamento pendente" e o check-in não registra |

## O que NÃO entra

- Nenhuma integração de gateway/link de pagamento gerado pelo sistema;
- Nenhum cálculo de MDR/taxa/antecipação (é do Super Folha);
- Nenhuma cobrança automática/lembrete;
- M9 não aplica `cron` nenhum — status é 100% manual.

## Ordem de implementação (depois do ok)

1. Aplicar M9 no banco (migration já pronta e testada);
2. `useEventos.ts`/`eventos.ts`: funções de leitura (vendas, lotação, preços,
   pacotes) + chamadas das RPCs;
3. Aba Bilheteria com as 3 sub-abas + Dialog Nova Venda + Marcar Pago;
4. Badge "pagamento pendente" + estado divergente nas abas existentes;
5. Testes: render da aba, máscara do dialog, estados-limite (mock das RPCs).
