# Auto-disparo da pesquisa de 1ª aula (só ontem)

**Data:** 2026-07-06
**Contexto:** Pedido #2 da Fabi (Sucesso do Aluno). Adiado por receio de banimento; retomado com desenho de teto/kill switch.
**Módulo:** Sucesso do Aluno → Pós-1ª Aula + Mensagens Automáticas.

## Problema

A pesquisa NPS pós-1ª aula (calouro matriculado) é disparada 100% manualmente na aba
Pós-1ª Aula. A Fabi precisa lembrar de abrir a aba todo dia e disparar. Além disso, a
aba usa uma **janela deslizante** (Hoje / 3 / 7 dias) que puxa alunos de períodos
antigos, poluindo a lista.

Dois objetivos:
1. **Escopo:** a lista deve conter **apenas quem fez a 1ª aula ontem**. Período mais
   antigo é descartado (decisão do Hugo: só ontem, estrito).
2. **Automação:** além do disparo manual (que a Fabi mantém), um cron dispara sozinho
   a lista de ontem, com salvaguardas contra banimento.

## Fonte de dados

- **1ª aula do calouro** (aluno já matriculado), não experimental de lead.
- Tabela `aluno_presenca` (status `presente`), via RPC `get_candidatos_pesquisa_primeira_aula`.

## Componentes

### 1. RPC `get_candidatos_pesquisa_primeira_aula` — modo "só ontem"

Alterações (backward-compatible):

- **Novo parâmetro** `p_apenas_ontem boolean DEFAULT false`.
  - Quando `true`: filtra `data_primeira_aula = ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)`.
    Usa BRT explícito (não `CURRENT_DATE`, que é UTC) para "ontem" ser correto em qualquer hora.
  - Quando `false`: mantém o comportamento de janela atual (`p_janela_dias`), preservando
    os callers existentes (aviso #1 `notificar-primeira-aula-fabi`).
- **Correção de bug latente:** o CTE `primeira_aula` hoje calcula `MIN(data_aula)`
  **dentro da janela** (`data_aula >= CURRENT_DATE - janela`), o que pode rotular como
  "1ª aula" a aula recente de um veterano. Passa a calcular `MIN(data_aula)` sobre **toda**
  a presença do aluno (respeitando `>= data_matricula`), refletindo a 1ª aula real. O
  filtro de janela/ontem passa a ser aplicado sobre `data_primeira_aula` no nível externo.
  - Efeito colateral positivo: o aviso #1 fica mais preciso (menos falsos positivos).
  - Guardas existentes preservadas: `is_segundo_curso=false`, `status='ativo'`,
    `numero_renovacoes=0`, `data_primeira_aula <= data_matricula + 4 meses`,
    `NOT EXISTS pesquisa pos_primeira_aula enviada`.

### 2. Aba Pós-1ª Aula (frontend)

`src/components/App/SucessoCliente/PesquisaPrimeiraAulaTab.tsx` + hook `usePesquisaPrimeiraAula.ts`:

- **Remove** o seletor de janela (Hoje / 3 / 7 dias).
- Passa a chamar a RPC com `p_apenas_ontem: true`.
- Cabeçalho: "1ª aula de ontem (DD/MM) — N aluno(s)".
- Mantém: pré-seleção de todos com contato, botão "Enviar pesquisa (N)" (disparo em
  lote de 1 clique), idempotência (quem recebeu some da lista).
- O `hook.buscarCandidatos` deixa de receber `janelaDias`; passa `p_apenas_ontem: true`.

### 3. Kill switch — tabela `automacoes_config` (nova)

```
automacoes_config (
  slug        text PRIMARY KEY,
  ativo       boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
)
```

- Linha seed: `('auto_pesquisa_1a_aula', false)` — começa **desligado** (opt-in do Hugo).
- RLS: leitura por autenticados; escrita por admin/perfil de metas (mesmo padrão das
  outras configs do módulo). Detalhar no plano.

### 4. Toggle na UI — subaba Mensagens Automáticas

`src/components/App/SucessoCliente/AutomacoesTab.tsx` + `useAutomacoesSucessoAluno.ts`:

- Adiciona um controle liga/desliga "Auto-disparo da pesquisa de 1ª aula (11h)".
- Lê/escreve `automacoes_config` (slug `auto_pesquisa_1a_aula`).
- Texto de apoio explicando: cron 11h BRT, teto de 15/dia, e que acima disso a Fabi
  completa o resto na aba.

### 5. Edge orquestradora `disparar-pesquisa-1a-aula-auto` (nova) + cron

- **Cron pg_cron** `0 14 * * *` (= 11h BRT). Chama a edge via pg_net (padrão das
  outras edges agendadas do projeto).
- Lógica da edge:
  1. Lê `automacoes_config` slug `auto_pesquisa_1a_aula`. Se `ativo=false` → encerra
     sem enviar nada (Fabi usa o botão manual).
  2. Roda a RPC `get_candidatos_pesquisa_primeira_aula(p_unidade_id => null, p_apenas_ontem => true)`.
  3. Filtra os que têm `whatsapp_jid`.
  4. **Teto 15/dia:** ordena e pega os primeiros 15. Dispara chamando
     `enviar-pesquisa-pos-primeira-aula` com o lote (a edge de envio já faz 1/1 com 10s
     e é idempotente).
  5. Se havia mais de 15 candidatos, envia à Fabi (WhatsApp caixa 3, número
     `5521994696489`, mesmo padrão do aviso #1) um resumo: "Disparei 15 pesquisas
     automáticas. Restam N na aba Pós-1ª Aula — complete quando puder."
- **Idempotência:** reexecução no mesmo dia pula quem já recebeu (a RPC filtra
  `NOT EXISTS pesquisa enviada`). Seguro contra dupla execução do cron.
- **Deploy:** a edge não é webhook externo → deploy normal (verify_jwt padrão).

## Restrições e trade-offs

- **"Só ontem" estrito:** aluno cuja presença sincronizou atrasada (aula de segunda que
  só aparece no banco na quarta) **não** entra na lista de ontem e não recebe pesquisa
  automática. Decisão consciente do Hugo. Mitigação parcial: o disparo manual pela aba
  também usa "ontem", mas a Fabi pode disparar individualmente pelo inbox se precisar.
- **Teto de 15/dia:** protege contra banimento (volume) e contra timeout da edge de
  envio (15 × 10s = 150s, dentro do limite). Acima de 15, o excedente é manual.
- **Timezone:** "ontem" sempre calculado em BRT (`America/Sao_Paulo`), tanto na RPC
  quanto na edge, para não haver divergência entre a lista da aba e o que o cron dispara.
- **Kill switch começa desligado:** nada dispara automaticamente até o Hugo/Fabi ligarem
  o toggle. Sem risco de surpresa em produção.

## Fora de escopo

- Captura de resposta por TEXTO (só clique é capturado hoje) — inalterado.
- Pesquisa de aula experimental de lead — audiência diferente, não é este projeto.
- Backfill de alunos com 1ª aula anterior a ontem — descartados por decisão.

## Testes

- RPC: `p_apenas_ontem=true` retorna só quem tem 1ª aula = ontem; veterano com aula
  recente não vaza como calouro; caller antigo (janela) inalterado.
- Aba: lista mostra só ontem; botão de lote dispara; idempotência (sumir após envio).
- Cron/edge: com toggle desligado não envia; ligado dispara ≤15 e avisa Fabi se >15;
  reexecução não duplica. **Validar sempre contra o número de teste do Hugo
  (5521964171223), nunca clientes reais.**
