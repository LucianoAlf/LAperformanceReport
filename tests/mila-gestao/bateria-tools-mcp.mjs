#!/usr/bin/env node
// BATERIA DETERMINÍSTICA DAS 34 TOOLS DA MILA (08/09/2026).
//
// 🔴 POR QUE PELO MCP E NÃO POR SQL. Chamar a RPC direto provaria o banco e não
//    o que a Mila usa. O que quebra na prática é a costura: mapeamento de
//    argumento, o gate de tráfego, o carimbo, o DRY. Esta bateria sobe o MCP
//    server de verdade (stdio, um processo por pessoa) e chama `tools/call`
//    exatamente como o Hermes chama.
//
// ⚠️ Cada pessoa é um PROCESSO próprio, porque o carimbo é fixado por instância
//    (`MILA_SOLICITANTE_TELEFONE`). É assim em produção e é assim aqui.
//
// ⚠️ `MILA_GESTAO_DRY_RUN=1` em todas: nenhuma escrita chega ao banco e nenhum
//    WhatsApp sai. A prova de que a trava vale está no próprio resultado — as
//    tools de escrita têm de devolver `dry_run: true`.
//
// ⚠️ Esta camada NÃO julga texto de agente. Ela responde três perguntas:
//    (1) a tool aparece para quem deve? (2) ela responde sem erro?
//    (3) o conteúdo tem a forma que a descrição promete?
//    O que a Mila FALA é a camada 2 (bateria-conversas.py).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const WRAPPER = '/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.sh';

// ── quem fala ──────────────────────────────────────────────────────────────
const PESSOAS = {
  kailane:  { tel: '5521984690143', nome: 'Kailane',      papel: 'consultora Barra' },
  daiana:   { tel: '5521968060404', nome: 'Daiana (Dai)', papel: 'consultora Recreio' },
  vitoria:  { tel: '553171422022',  nome: 'Vitória',      papel: 'consultora CG' },
  krissya:  { tel: '5521966875271', nome: 'Anne Krissya', papel: 'líder comercial (rede)' },
  luciano:  { tel: '5521981278047', nome: 'Luciano Alf',  papel: 'diretoria' },
  arthur:   { tel: '5521970183684', nome: 'Arthur',       papel: 'administrativo Barra' },
  ninguem:  { tel: '5521000000000', nome: '(fora da governança)', papel: 'desconhecido' },
};

// ── cliente MCP mínimo sobre stdio ─────────────────────────────────────────
class Mcp {
  constructor(tel) {
    this.p = spawn('bash', [WRAPPER], {
      env: { ...process.env, HOME: '/home/mila',
             MILA_SOLICITANTE_TELEFONE: tel,
             MILA_GESTAO_DRY_RUN: '1' },   // ⚠️ nada escreve, nada envia
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.buf = '';
    this.pend = new Map();
    this.id = 0;
    this.erro = '';
    this.p.stdout.on('data', (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const linha = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!linha) continue;
        try {
          const m = JSON.parse(linha);
          if (m.id != null && this.pend.has(m.id)) { this.pend.get(m.id)(m); this.pend.delete(m.id); }
        } catch { /* linha de log do servidor */ }
      }
    });
    this.p.stderr.on('data', (d) => { this.erro += d.toString(); });
  }

  chamar(method, params) {
    const id = ++this.id;
    return new Promise((ok, falha) => {
      const t = setTimeout(() => falha(new Error('timeout_mcp')), 60000);
      this.pend.set(id, (m) => { clearTimeout(t); ok(m); });
      this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async abrir() {
    await this.chamar('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'bateria', version: '1' },
    });
    this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  }

  async tools() {
    const r = await this.chamar('tools/list', {});
    return (r.result?.tools || []).map((t) => t.name);
  }

  async call(nome, args) {
    const r = await this.chamar('tools/call', { name: nome, arguments: args || {} });
    const txt = r.result?.content?.[0]?.text ?? '';
    let dado = null;
    try { dado = JSON.parse(txt); } catch { dado = null; }
    return { erro: !!r.result?.isError, texto: txt, dado };
  }

  fechar() { try { this.p.kill(); } catch { /* já morreu */ } }
}

// ── dados reais para os argumentos (nada inventado) ────────────────────────
const D = JSON.parse(readFileSync(process.argv[2] || '/tmp/dados-bateria.json', 'utf8'));

// Cada caso: [tool, args, verificação]. A verificação recebe o JSON devolvido e
// devolve string vazia (ok) ou o motivo da falha. Ancorar em FORMA e em FATO —
// nunca em palavra do agente, que aqui nem existe.
// Quem enxerga a rede (unidade_id nulo na governanca).
const DE_REDE = ['krissya', 'luciano'];

// 🔴 Verifica o ESCOPO, não só o `ok`. Pessoa de rede tem de receber
//    `por_unidade`; pessoa de unidade NUNCA pode receber.
function escopoOk(d, p) {
  if (!d?.ok) return `ok:false (${d?.motivo})`;
  const temRede = d.por_unidade != null;
  if (DE_REDE.includes(p) && !temRede) return 'pessoa de rede nao recebeu por_unidade';
  if (!DE_REDE.includes(p) && temRede) return 'FURO DE ESCOPO: pessoa de unidade recebeu a rede';
  return '';
}

const casos = (p) => [
  // ── LEITURA ─────────────────────────────────────────────────────────────
  ['minha_pauta', {}, (d) => d?.ok === false ? `ok:false (${d.motivo})` : ''],
  ['minha_pauta', { limite: 3 }, (d) => d?.ok === false ? `ok:false (${d.motivo})` : ''],
  ['estrelas_matriculador', {}, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['estrelas_matriculador', { ano: 2026, mes: 8 }, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['ficha_lead', { lead_id: D.lead_da_unidade[p] }, (d) => d?.ok || d?.motivo ? '' : 'sem ok nem motivo'],
  ['ficha_lead', { telefone: D.telefone_lead[p] }, (d) => d?.ok || d?.motivo ? '' : 'sem ok nem motivo'],
  ['ficha_lead', { nome: 'Maria' }, (d) => d ? '' : 'resposta vazia'],
  ['ficha_lead', { lead_id: D.lead_de_outra_unidade[p] }, (d) =>
    d?.ok === false || d?.fora_do_escopo ? '' : (p === 'kailane' || p === 'daiana' || p === 'vitoria'
      ? 'consultora enxergou lead de outra unidade' : '')],
  // 🔴 Estas tres recusavam quem lidera a REDE com `sem_unidade` (achado da 1a
  //    bateria). Agora o predicado exige, alem do ok, o ESCOPO certo para cada
  //    tipo de pessoa — senao o conserto poderia ter dado rede a consultora.
  ['agenda_do_dia', {}, (d) => escopoOk(d, p)],
  ['agenda_do_dia', { data: D.dia_util }, (d) => escopoOk(d, p)],
  ['fechamento_do_dia', {}, (d) => escopoOk(d, p)],
  ['fechamento_do_dia', { data: D.dia_util }, (d) => escopoOk(d, p)],
  ['numeros_do_mes', {}, (d) => escopoOk(d, p)],
  ['numeros_do_mes', { ano: 2026, mes: 8 }, (d) => escopoOk(d, p)],
  // rede pedindo UMA unidade
  ['numeros_do_mes', { ano: 2026, mes: 8, unidade: D.unidade_barra }, (d) =>
    !d?.ok ? `ok:false (${d?.motivo})`
    : DE_REDE.includes(p) ? (d.unidade === 'Barra' ? '' : `rede pediu Barra e veio ${d.unidade}`)
    : (d.por_unidade ? 'FURO: consultora recebeu a rede' : ''),
  ],
  ['pendencias_comerciais', {}, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['pendencias_comerciais', { amostra: 3 }, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['o_que_aprendemos', {}, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['o_que_aprendemos', { codigo: 'P1' }, (d) => d?.ok || d?.motivo ? '' : 'sem ok nem motivo'],
  ['onde_focar', {}, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['desempenho_atendimento', {}, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['desempenho_atendimento', { dias: 3 }, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['retomadas_do_dia', {}, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  // ⚠️ devolve ARRAY de dias (nao objeto com `ok`). O 1o predicado exigia `ok` e
  //    reprovava resposta CERTA — 3 das 3 falhas da 1a rodada eram minhas.
  ['agenda_da_escola', {}, (d) => Array.isArray(d) && d.length && 'tem_expediente' in d[0]
    ? '' : 'nao veio array de dias'],
  ['agenda_da_escola', { de: '2026-09-01', ate: '2026-09-30' }, (d) => Array.isArray(d) && d.length === 30
    ? '' : `esperava 30 dias, veio ${Array.isArray(d) ? d.length : typeof d}`],

  // ⚠️ nome inexistente tem de RECUSAR: null silencioso devolveria a REDE
  //    inteira para quem pediu UMA unidade — o oposto do pedido.
  ['numeros_do_mes', { ano: 2026, mes: 8, unidade: 'Niteroi' }, (d, r) =>
    r.erro && /unidade_desconhecida/.test(r.texto) ? '' : 'aceitou unidade inexistente'],

  // ── BASE COMERCIAL ──────────────────────────────────────────────────────
  ['consultar_base_comercial', { situacao: 'lead achou caro' }, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['consultar_base_comercial', { situacao: 'como conduzir a experimental', limite: 2 }, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['consultar_base_comercial', { situacao: 'trancamento de matricula' }, (d) => d?.ok ? '' : `ok:false (${d?.motivo})`],
  ['registrar_eficacia', { codigo: 'E1', resultado: 'funcionou', rotulo: 'ensaio' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['registrar_lacuna_base', { situacao: 'ensaio', o_que_faltou: 'ensaio da bateria' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],

  // ── TRAFEGO (gate) ──────────────────────────────────────────────────────
  ['trafego_por_canal', { de: '2026-08-01', ate: '2026-08-31' }, (d, r) => {
    if (r.erro) return `errou: ${r.texto.slice(0, 70)}`;
    if (!Array.isArray(d) || !d.length) return 'nao veio array de canais';
    const meta = d.find((x) => x.canal === 'Instagram/Facebook');
    if (!meta) return 'sem a linha Instagram/Facebook (agrupamento por verba)';
    if (meta.periodo_de !== '2026-08-01' || meta.periodo_ate !== '2026-08-31')
      return `periodo devolvido ${meta.periodo_de}..${meta.periodo_ate}`;
    // 🔴 a regra que nasceu do bug de hoje: UM canal por plataforma
    const gastos = d.filter((x) => x.gasto != null).map((x) => x.gasto);
    if (new Set(gastos).size !== gastos.length) return 'duas linhas com o mesmo gasto (duplicou de novo)';
    return '';
  }],
  ['trafego_por_canal', { dias: 30 }, (d, r) => r.erro ? `errou: ${r.texto.slice(0, 70)}`
    : (Array.isArray(d) && d.length ? '' : 'nao veio array')],
  // ⚠️ periodo pela metade DEVE ser recusado — o erro aqui e o acerto
  ['trafego_por_canal', { de: '2026-08-01' }, (d, r) =>
    r.erro && /periodo_incompleto/.test(r.texto) ? '' : 'aceitou periodo pela metade (deveria recusar)'],
  ['trafego_por_criativo', { de: '2026-08-01', ate: '2026-08-31' }, (d, r) =>
    r.erro ? `errou: ${r.texto.slice(0, 70)}` : (Array.isArray(d) ? '' : 'nao veio array')],
  ['publicos_reativacao', {}, (d, r) =>
    r.erro ? `errou: ${r.texto.slice(0, 70)}` : (Array.isArray(d) && d.length ? '' : 'nao veio array de publicos')],

  // ── ESCRITA (tudo em DRY) ───────────────────────────────────────────────
  ['registrar_curso_interesse', { lead_id: D.lead_da_unidade[p], curso: 'Bateria' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['registrar_motivo_perda', { lead_id: D.lead_da_unidade[p], motivo: 'preco', nota: 'ensaio' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['registrar_canal_origem', { lead_id: D.lead_da_unidade[p], canal: 'Indicação' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['registrar_consultor', { lead_id: D.lead_da_unidade[p], consultor: 'Jhonatan' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['anotar_lead', { lead_id: D.lead_da_unidade[p], texto: 'ensaio da bateria' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['registrar_retomada', { lead_id: D.lead_da_unidade[p], frase: 'me chama em janeiro', prazo_texto: 'janeiro' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['fechar_sinal', { sinal_id: D.sinal_id, desfecho: 'sem_acao', nota: 'ensaio' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['desfecho_retomada', { retomada_id: D.retomada_id_falso, desfecho: 'sem_acao' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['propor_recado', { destino_tipo: 'colaborador', destino: 'Krissya', texto: 'ensaio da bateria — descartar', assunto: 'ensaio' },
    (d) => d?.ok || d?.motivo ? '' : 'sem ok nem motivo'],
  ['recado_pendente', {}, (d) => d?.ok || d?.motivo ? '' : 'sem ok nem motivo'],
  ['recado_para_mim', {}, (d) => d?.ok || d?.motivo ? '' : 'sem ok nem motivo'],
  ['enviar_recado', { recado_id: D.recado_id_falso }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN (ia mandar WhatsApp!)'],
  ['enviar_retorno_recado', { recado_id: D.recado_id_falso, texto: 'ensaio' }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN'],
  ['responder_recado', { recado_id: D.recado_id_falso, resposta: 'ensaio' }, (d) => d?.ok || d?.motivo ? '' : 'sem ok nem motivo'],
  ['revisar_recado', { recado_id: D.recado_id_falso, novo_texto: 'ensaio', motivo: 'ensaio' }, (d) => d?.ok || d?.motivo ? '' : 'sem ok nem motivo'],
  ['resolver_conversa', { lead_id: D.lead_da_unidade[p] }, (d) => d?.dry_run ? '' : 'NAO respeitou o DRY_RUN (ia fechar conversa!)'],
];

// quem deve ver o quê (espelha veBaseComercial / veTudo do MCP)
// ⚠️ `veBaseComercial()` = departamento comercial OU nivel diretoria.
//    `veTudo()` (trafego) = departamento em (diretoria,marketing,comercial)
//    **E** nivel em (lider,diretoria). Consultora e `colaborador`, entao NAO ve
//    trafego — e isso e a regra, nao defeito: custo de midia nao e assunto dela.
//    (A 1a versao desta tabela dizia que sim e reprovou o comportamento certo.)
const ESPERADO_VISIBILIDADE = {
  kailane: { base: true,  trafego: false },  // comercial, colaborador
  daiana:  { base: true,  trafego: false },
  vitoria: { base: true,  trafego: false },
  krissya: { base: true,  trafego: true  },  // comercial, LIDER de rede
  luciano: { base: true,  trafego: true  },  // diretoria
  arthur:  { base: false, trafego: false },  // administrativo
  ninguem: { base: false, trafego: false },  // nem existe na governanca
};

async function rodar(chave) {
  const p = PESSOAS[chave];
  const mcp = new Mcp(p.tel);
  const linhas = [];
  let falhas = 0;
  try {
    await mcp.abrir();
    const visiveis = await mcp.tools();
    const esp = ESPERADO_VISIBILIDADE[chave];

    // 1) VISIBILIDADE — a tool aparece para quem deve?
    const temBase = visiveis.includes('consultar_base_comercial');
    const temTraf = visiveis.includes('trafego_por_canal');
    if (temBase !== esp.base) { falhas++; linhas.push(`  ❌ visibilidade base_comercial: esperava ${esp.base}, veio ${temBase}`); }
    if (temTraf !== esp.trafego) { falhas++; linhas.push(`  ❌ visibilidade trafego: esperava ${esp.trafego}, veio ${temTraf}`); }
    if (chave === 'ninguem' && visiveis.length !== 0) { falhas++; linhas.push(`  ❌ desconhecido viu ${visiveis.length} tools (deveria ver 0)`); }
    linhas.push(`  tools visíveis: ${visiveis.length}  (base=${temBase} trafego=${temTraf})`);

    // 2) CHAMADA — cada tool responde?
    for (const [tool, args, checa] of casos(chave)) {
      if (!visiveis.includes(tool)) {
        // não ver a tool é o esperado para quem não tem acesso; só reporta
        linhas.push(`  ·  ${tool.padEnd(26)} ${JSON.stringify(args).slice(0, 46).padEnd(48)} (não visível)`);
        continue;
      }
      const r = await mcp.call(tool, args);
      let veredito = '';
      // ⚠️ O predicado recebe a RESPOSTA INTEIRA (`r`), não só o JSON: há caso em
      //    que o erro É o comportamento certo (período pela metade tem de ser
      //    recusado). Curto-circuitar no erro antes do predicado reprovava
      //    acerto — foi o que aconteceu na 2ª rodada.
      try { veredito = checa(r.dado, r) || ''; } catch (e) { veredito = 'predicado explodiu: ' + e.message; }
      if (!veredito && !r.erro && r.dado === null) veredito = `resposta nao-JSON: ${r.texto.slice(0, 60)}`;
      if (veredito) falhas++;
      const resumo = r.dado
        ? (r.dado.ok === false ? `ok:false ${r.dado.motivo || ''}` :
           r.dado.dry_run ? 'dry_run' :
           Array.isArray(r.dado) ? `${r.dado.length} linha(s)` : 'ok')
        : r.texto.slice(0, 40);
      linhas.push(`  ${veredito ? '❌' : '✅'} ${tool.padEnd(26)} ${JSON.stringify(args).slice(0, 46).padEnd(48)} ${resumo}${veredito ? '  <-- ' + veredito : ''}`);
    }
  } catch (e) {
    falhas++;
    linhas.push(`  ❌ falhou de vez: ${e.message}  stderr=${mcp.erro.slice(0, 200)}`);
  } finally { mcp.fechar(); }
  return { linhas, falhas };
}

const alvo = process.argv[3];
const chaves = alvo ? [alvo] : Object.keys(PESSOAS);
let total = 0;
for (const k of chaves) {
  const p = PESSOAS[k];
  console.log(`\n${'='.repeat(78)}\n### ${p.nome} — ${p.papel}  (${p.tel})\n${'='.repeat(78)}`);
  const { linhas, falhas } = await rodar(k);
  linhas.forEach((l) => console.log(l));
  total += falhas;
  console.log(`  → ${falhas ? falhas + ' problema(s)' : 'sem problema'}`);
}
console.log(`\n${'='.repeat(78)}\nTOTAL: ${total ? total + ' PROBLEMA(S)' : 'TUDO PASSOU'}`);
process.exit(total ? 1 : 0);
