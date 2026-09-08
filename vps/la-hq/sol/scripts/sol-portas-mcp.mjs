#!/usr/bin/env node
// AS PORTAS DA SOL — servidor MCP do time administrativo (07/09/2026).
//
// Substitui, para o time, a porta larga `query` do `sol-acesso-restrito`. Doze
// ferramentas nomeadas por TRABALHO, todas visiveis em todo turno.
//
// 🔴 "TUDO VISIVEL E CABE". E a licao que o agente do TOM mediu e que derrubou
//    a hipotese anterior: o TOM tem descricao 26x maior que a da Maria e vive
//    quebrando, porque um roteador escolhe UMA competencia por turno
//    (`BLOCK 4 — SKILL ATIVA, max 1`). A Maria mostra as 66 sempre, em 17 KB.
//    Aqui sao 12 em ~4 KB. **Nunca acrescentar roteador que escolhe porta.**
//
// 🔴 O ESCOPO NAO E ARGUMENTO. Nenhuma tool aceita `unidade_id`. Quem resolve a
//    unidade e `sol_resolver_escopo_v1`, no servidor, pelo telefone de quem
//    fala. Medido em 07/09: das 9 RPCs candidatas, 8 recebiam `p_unidade_id`
//    como argumento — expor assim faria o modelo escolher de qual unidade quer
//    os dados. `p_unidade` (texto) existe so para a DIRETORIA pedir uma
//    unidade especifica; para os demais ele so serve para tomar "nao".
//
// ⚠️ DESCRICAO COM CASO, nao especificacao. Data, pessoa, a frase dela, o numero
//    do erro e o nome da irmã. E de onde vem a fluidez, segundo o agente da
//    Maria — e o que ele diz que conserta quando ela erra nao e o prompt, e a
//    descricao da ferramenta que ela deveria ter escolhido.
//
// ⚠️ Duas travas, e a de fora nao substitui a de dentro: esta lista ESCONDE, o
//    GRANT dos papeis (`sol_operacional`/`_tatico`/`_estrategico`) RECUSA.
// ⚠️ ESM: o arquivo e .mjs, entao `require` nao existe — a 1a versao usou
//    require e morreu no arranque com ReferenceError.
import fs from 'node:fs';

// ⚠️ Os nomes reais no ambiente da Sol, conferidos no host: `gateway.systemd.env`
//    traz SUPABASE_URL/SUPABASE_SERVICE_KEY e `/opt/LA-Organizer/.env` traz
//    LA_REPORT_SUPABASE_URL/LA_REPORT_SERVICE_ROLE_KEY. A 1a versao chutou os
//    nomes da Mila (SUPABASE_LAREPORT_*) e todas as portas voltaram 401.
const ENVS = ['/home/sol/.openclaw/gateway.systemd.env',
              '/opt/LA-Organizer/.env'];
for (const f of ENVS) {
  let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
  for (const l of t.split('\n')) {
    const s = l.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    const k = s.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const URL = (process.env.LA_REPORT_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.LA_REPORT_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
         || process.env.SUPABASE_SERVICE_ROLE_KEY;
// ⚠️ O env e FALLBACK DE ENSAIO, nao a fonte. Em producao o telefone vem no
//    argumento `p_solicitante_telefone` (veja o cabecalho do patch de 07/09):
//    o processo MCP recebe env estatico e e UM so para todas as conversas, entao
//    fixar o numero aqui faria toda conversa se passar pela mesma pessoa.
const TEL_ENSAIO = process.env.SOL_SOLICITANTE_TELEFONE || '';

async function rpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) return { ok: false, motivo: `rpc_${r.status}`, detalhe: (await r.text()).slice(0, 200) };
  return r.json();
}

// ── as 12 portas ────────────────────────────────────────────────────────────
// ⚠️ `Q` (quem) entra em TODA porta; `U` (unidade) so onde faz sentido.
const Q = { p_solicitante_telefone: { type: 'string', description: 'Quem está perguntando. 🔴 Se a mensagem trouxer `[cracha: SOL1....]`, cole o CRACHÁ INTEIRO aqui — ele é assinado e é a prova de quem falou. Só se não houver crachá, use o número de `[telefone_remetente: ...]`, só os dígitos. Não é opcional e não é para inventar: decide qual unidade você enxerga, e toda chamada fica registrada. Sem saber quem falou, pergunte em vez de chutar.' } };
const U = { ...Q, p_unidade: { type: 'string', description: 'Só a diretoria escolhe unidade. Para os demais, deixe vazio — eu já sei qual é a sua.' } };

const PORTAS = [
  { name: 'caixa_do_dia', fn: 'sol_porta_caixa_do_dia_v1',
    description: 'O caixa de HOJE da unidade: aberto ou fechado, quanto entrou, quanto saiu, por forma de pagamento. Use quando perguntarem "como tá o caixa?", "já fechou?", "quanto entrou hoje?". 🔴 É a FONTE do caixa — nunca monte esse número somando comprovantes do grupo por conta própria: comprovante repetido e estorno não aparecem na soma e o total sai maior que o real. Para o que ainda não foi lançado, é o grupo que manda, não eu.',
    schema: { ...U, p_data: { type: 'string', description: 'YYYY-MM-DD. Vazio = hoje.' } } },

  { name: 'inadimplencia', fn: 'sol_porta_inadimplencia_v1',
    description: 'Quem está devendo na unidade, com quanto e há quantos dias. Use para "quem tá inadimplente?", "quanto temos a receber atrasado?", "o Fulano pagou?". ⚠️ O espelho de faturas cobre a competência atual e a anterior, então aluno com dívida mais velha aparece com valor MENOR que o real — diga "pelo menos X", nunca "exatamente X". Para a lista de quem tem aula e nenhuma fatura emitida, a irmã é `alunos_sem_fatura`; são coisas diferentes e confundi-las já gerou cobrança indevida.',
    schema: { ...U } },

  { name: 'faturas_do_mes', fn: 'sol_porta_faturas_do_mes_v1',
    description: 'As faturas da competência: emitidas, pagas, em aberto, vencidas. Use para "quanto foi faturado esse mês?", "quantas faturas em aberto?". Aceita status para filtrar. ⚠️ Fatura sem `emusys_matricula_id` NÃO é erro: são ingressos de evento, passaporte, locação e rateio — a API manda `matricula_id: 0` de propósito. Em ago/2026 eram 58 de 1.093 (5,3%). Não conte isso como "fatura órfã".',
    schema: { ...U, p_ano: { type: 'integer' }, p_mes: { type: 'integer' },
              p_status: { type: 'string', description: 'aberta | paga | vencida. Vazio = todas.' } } },

  { name: 'numeros_da_unidade', fn: 'sol_porta_numeros_da_unidade_v1',
    description: 'O placar da unidade no mês: alunos ativos, matrículas, evasões, ticket médio. 🔴 É da GERÊNCIA para cima — se quem perguntar for do atendimento, eu recuso e ofereço o dia a dia. Isso é de propósito: número de unidade na mão de quem é medido por ele muda a conversa de orientação para cobrança. ⚠️ Trancado NÃO é ativo, e quem faz só banda ou só coral também não.',
    schema: { ...U, p_ano: { type: 'integer' }, p_mes: { type: 'integer' } } },

  { name: 'situacao_dos_alunos', fn: 'sol_porta_situacao_alunos_v1',
    description: 'Retrato dos alunos da unidade: cadastro completo, anamnese, presença, inadimplência, aviso prévio, comunidade no WhatsApp. Use para "como estão os alunos?", "quantos sem anamnese?", "quem está sem vir?". ⚠️ Quando a captura da comunidade não está fresca, o campo vem `sem_captura` — que significa NÃO SEI, nunca "não está no grupo". Dizer que o aluno não está na comunidade quando não sabemos é o tipo de erro que a família contesta na hora.',
    schema: { ...U, p_referencia: { type: 'string', description: 'YYYY-MM-DD. Vazio = hoje.' } } },

  { name: 'presenca_pendente', fn: 'sol_porta_presenca_pendente_v1',
    description: 'Chamadas não fechadas: aluno que ficou sem presença E sem falta. Use para "quem não lançou chamada?", "faltou marcar alguém?". ⚠️ Olha ONTEM por padrão, não hoje — a chamada de hoje ainda está acontecendo e cobrar aula que nem terminou é ruído. ⚠️ Isto NÃO é frequência do aluno: é chamada aberta. Falta lançada só pelo Emusys mantém o aluno na lista, porque `presente` é a única coisa que aceitamos daquela fonte.',
    schema: { ...U, p_data: { type: 'string', description: 'YYYY-MM-DD. Vazio = ontem.' } } },

  { name: 'pendencias_de_cadastro', fn: 'sol_porta_pendencias_cadastro_v1',
    description: 'Os buracos que a pessoa resolve FALANDO com você: lead sem canal de origem, sem curso de interesse, experimental sem desfecho, matrícula sem anamnese. Use quando perguntarem "tenho pendência?" e ofereça preencher na hora, citando um nome. 🔴 Cite UM exemplo e o total — nunca a lista inteira: lista é o que a pessoa pula. A anamnese é a que trava a estrela HUNTER 360.',
    schema: { ...Q, p_amostra: { type: 'integer', description: '1 a 8 nomes de exemplo. Padrão 3.' } } },

  { name: 'aviso_previo', fn: 'sol_porta_aviso_previo_v1',
    description: 'Quem entrou em aviso prévio nos últimos 90 dias, com motivo e data prevista de saída. Use para "quem avisou que sai?", "temos aviso prévio esse mês?". 🔴 A conversa aqui é de REVERSÃO, não de cobrança: entender o motivo real e oferecer alternativa concreta — horário, professor, projeto, condição. ⚠️ Aviso prévio é mês vigente MAIS o seguinte (dois meses), e quem está em aviso ainda NÃO conta como evasão.',
    schema: { ...U } },

  { name: 'renovacoes', fn: 'sol_porta_renovacoes_v1',
    description: 'Os contratos que terminam nesta competência e quais já renovaram. Use para "quem falta renovar?", "como tá a renovação do mês?". ⚠️ Banda e coral ficam de fora: não contam em retenção. ⚠️ O recesso escolar DESLOCA a competência de propósito — quem renovou em julho pode contar em agosto, porque o que manda é o mês da primeira aula do novo ciclo. Isso é esperado, não erro; já gerou pergunta de "sumiu renovação" que não tinha sumido.',
    schema: { ...U } },

  { name: 'contratos_vencendo', fn: 'sol_porta_contratos_vencendo_v1',
    description: 'Contratos com a última aula chegando, na janela de dias que você pedir. Use para "quem tá vencendo?", "quantos contratos acabam esse mês?". ⚠️ A coluna de faturas vencidas é PISO, não valor exato — o espelho só cobre as competências sincronizadas, então mostro "≥N". ⚠️ Aulas restantes diverge da tela do Emusys em 1 a 4 aulas (a regra da tela não é exposta pela API); a última aula, essa, bate 100%.',
    schema: { ...U, p_dias: { type: 'integer', description: '1 a 90. Padrão 30.' } } },

  { name: 'alunos_sem_fatura', fn: 'sol_porta_alunos_sem_fatura_v1',
    description: 'Aluno que TEM aula na competência e não teve mensalidade emitida — o dinheiro que está escapando. Use para "tem aluno sem cobrança?", "quem tá tendo aula de graça?". Vem ordenado pelo vencimento mais antigo, que é a pergunta real: há quanto tempo esse contrato está sem cobrança (pedido do Arthur em 27/08). ⚠️ Bolsista integral fica FORA por definição (valor 0 e zero parcelas) — eram 28 de 96 em ago/2026. A irmã para quem tem fatura e não pagou é `inadimplencia`.',
    schema: { ...U, p_competencia: { type: 'string', description: 'YYYY-MM-01. Vazio = mês atual.' } } },

  { name: 'pauta_do_dia', fn: 'sol_porta_pauta_do_dia_v1',
    description: 'A LISTA DE QUEM PRECISA DE ATENÇÃO hoje — não é a grade de aulas (essa é `agenda_do_dia`). Quem merece um telefonema hoje na unidade: quem sumiu das aulas, quem avisou que sai e ainda dá para reverter, quem renova com sinal aceso, família com mais de um em risco. Use para "tenho alguém para olhar?", "quem está em risco?", "o que eu faço primeiro?", "tem alguém para eu ligar?", "como está a retenção?". 🔴 Entregue a mensagem pronta que ela devolve, agrupada por assunto — não reescreva nem reordene: a ordem é por urgência real (dias até vencer, não data de detecção). ⚠️ Mostra só o que AINDA VALE: o sinal só entra se o detector o reemitiu na última rodada. Sem isso, 31% dos alunos da lista de "frequência despencando" eram gente que já tinha voltado e vinha a TODAS as aulas — foi por ruído assim que a equipe parou de ler a lista antes. ⚠️ A mesma pessoa com dois cursos é UMA linha (Pérola Madeira tem Canto e Violão e avisou uma vez só). ⚠️ Semáforo de professor NÃO vem aqui: aquilo se resolve falando com o professor, é da coordenação.',
    schema: { ...U, p_limite: { type: 'integer', description: '1 a 20 itens. Padrão 8 — o resto fica na fila e vem depois.' } } },

  { name: 'registrar_desfecho', fn: 'sol_porta_registrar_desfecho_v1',
    description: 'Fecha um item da pauta quando a pessoa conta o que aconteceu: "já liguei pra Catarina, ela vai ficar", "falei e vai sair mesmo", "esse aí não era nada". 🔴 É a ÚNICA porta que ESCREVE — todas as outras só leem. Quatro desfechos e só eles: `reteve` (falei e a família fica) · `saiu` (falei e vai sair mesmo) · `falso_positivo` (não era nada, já estava resolvido) · `nao_aplicavel` (não é da minha alçada). 🔴 Use `falso_positivo` sem constrangimento quando for o caso: é ele que mede quais regras merecem continuar, e esconder erro nosso é pior que admiti-lo. ⚠️ Só fecha item da unidade de quem falou, e só o que ainda está aberto. ⚠️ Dois alunos de mesmo primeiro nome fazem a porta RECUSAR e pedir o nome completo — ela nunca escolhe no chute (em 29/08 o casamento frouxo de nome pôs a responsável da Laura no card da Soraia).',
    schema: { ...Q,
      p_aluno: { type: 'string', description: 'Nome do aluno como a pessoa falou. Não invente sobrenome.' },
      p_desfecho: { type: 'string', description: 'reteve | saiu | falso_positivo | nao_aplicavel' },
      p_nota: { type: 'string', description: 'O que a pessoa contou, nas palavras dela. Opcional, mas é o que vale para aprender.' } } },

  { name: 'agenda_do_dia', fn: 'sol_porta_agenda_do_dia_v1',
    description: 'A GRADE DE AULAS do dia: horários, professores, salas, alunos, canceladas e experimentais. ⚠️ Isto é o calendário, NÃO a lista de quem precisa de atenção — se a pergunta for "tenho alguém para olhar/ligar hoje?", a irmã é `pauta_do_dia`. Use para "o que tem hoje?", "que horas o Fulano dá aula?", "a sala 3 está livre?". ⚠️ `professor_presenca` vem "ausente" por DEFAULT do Emusys em 100% das aulas futuras — só fale de presença de professor depois que a aula terminou, senão você acusa falta de metade do corpo docente todo dia.',
    schema: { ...U, p_data: { type: 'string', description: 'YYYY-MM-DD. Vazio = hoje.' } } },
];

// ── protocolo MCP ───────────────────────────────────────────────────────────
const j = (o) => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });

async function despachar(name, args) {
  const p = PORTAS.find((x) => x.name === name);
  if (!p) return j({ ok: false, motivo: 'porta_desconhecida', porta: name });
  // 🔴 CRACHA NAO PODE SER LIMPO. O strip de nao-digitos estava certo quando o
  //    valor era so telefone; com cracha ele destroi a assinatura — medido:
  //    "SOL1.5521970183684.d2f0f55a..." virou "155219701836842055105...", que
  //    nao resolve ninguem. Foi a propria auditoria (`telefone_alegado`) que
  //    mostrou, porque ela grava o que FOI MANDADO, nao o que eu quis mandar.
  const _bruto = String((args && args.p_solicitante_telefone) || TEL_ENSAIO || "").trim();
  const tel = /^SOL1./.test(_bruto)
    ? _bruto.replace(/[^A-Za-z0-9.]/g, "")   // cracha: so tira lixo de colagem
    : _bruto.replace(/\D/g, "");    // telefone: digitos
  if (!tel) return j({ ok: false, motivo: 'sem_solicitante',
    recado: 'Não sei quem está perguntando. Passe o `[cracha: ...]` da mensagem, ou o número de `[telefone_remetente: ...]` — sem isso eu não sei qual unidade mostrar.' });
  const limpos = { p_solicitante_telefone: tel };
  for (const [k, v] of Object.entries(args || {})) {
    if (v !== null && v !== undefined && v !== '') limpos[k] = v;
  }
  return j(await rpc(p.fn, limpos));
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!linha) continue;
    let req; try { req = JSON.parse(linha); } catch { continue; }
    const responder = (result) => process.stdout.write(
      JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
    if (req.method === 'initialize') {
      responder({ protocolVersion: '2024-11-05', capabilities: { tools: {} },
                  serverInfo: { name: 'sol-portas', version: '1.0.0' } });
    } else if (req.method === 'tools/list') {
      responder({ tools: PORTAS.map((p) => ({
        name: p.name, description: p.description,
        inputSchema: { type: 'object', properties: p.schema || {} } })) });
    } else if (req.method === 'tools/call') {
      responder(await despachar(req.params?.name, req.params?.arguments));
    } else if (req.method === 'ping') {
      responder({});
    }
  }
});
