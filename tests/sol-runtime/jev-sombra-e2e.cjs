// Jev em sombra (08/10/2026): só registra; desligado = nada; mídia não vai; telefone
// mascarado; falha/timeout vira linha de erro sem lançar exceção.
const fs = require('fs'); const os = require('os'); const path = require('path');
const { criarJevSombra, _estado } = require('../../vps/la-hq/sol/runtime/jev-sombra.cjs');
const falhas = []; const checar = (c, m) => { if (!c) falhas.push(m); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-'));
fs.writeFileSync(path.join(dir, '.jev.env'), 'SOL_JEV_OPENROUTER_KEY=chave-teste\n');
const corpos = [];
const fetchOk = async (_u, o) => { corpos.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ answers: { intencao: { choice: 'aprovar', confidence: 0.97 } }, usage: { cost: 0.00001 } }) }; };
(async () => {
  const j = criarJevSombra({ dir, fetchImpl: fetchOk });
  const ev = { messageId: 'M1', body: 'Pode, liga pra 21 99999-8888', quotedMessageId: 'Q1', quotedPreview: 'Comprovante recebido — R$ 377,00' };
  checar(await j.observar({ event: ev, unidade: 'Campo Grande', legado: { acao: 'lancado' } }) === null, 'desligado deveria não fazer nada');
  checar(corpos.length === 0, 'desligado chamou o Jev');
  fs.writeFileSync(path.join(dir, 'jev.json'), '{"sombra": true}');
  const l = await j.observar({ event: ev, unidade: 'Campo Grande', legado: { acao: 'lancado' }, citaCardDaSol: true });
  checar(l && l.escolha === 'aprovar' && l.confianca === 0.97 && l.legado === 'lancado' && l.cita_card_sol === true, 'linha errada: ' + JSON.stringify(l));
  checar(!/99999/.test(corpos[0].state) && /\[tel\]/.test(corpos[0].state), 'telefone vazou no state');
  checar(corpos[0].model === 'typesafe/jev-1.13', 'modelo errado');
  checar(await j.observar({ event: { ...ev, hasMedia: true } }) === null, 'mídia não deveria ir ao Jev');
  const reg = fs.readFileSync(path.join(dir, 'jev-sombra.jsonl'), 'utf8').trim().split('\n');
  checar(reg.length === 1 && !/99999/.test(reg[0]) && /Pode, liga pra \[tel\]/.test(reg[0]), 'registro deveria ter 1 linha, com o texto mascarado');
  const lc = await j.observar({ event: { messageId: 'M2', body: 'Lança manualmente, Mayra' }, unidade: 'CG', legado: null });
  checar(lc && lc.via === 'filtro' && lc.final === 'conversa' && corpos.length === 1, 'colega por nome deveria ser filtrado sem chamar o Jev');
  const fetchDeixa = async () => ({ ok: true, json: async () => ({ answers: { intencao: { choice: 'aprovar', confidence: 0.95 } } }) });
  const jd = criarJevSombra({ dir, fetchImpl: fetchDeixa });
  const ld = await jd.observar({ event: { messageId: 'M3', body: 'Pode deixar' } });
  checar(ld && ld.escolha === 'aprovar' && ld.final === 'conversa' && ld.trava === true, 'trava de fala curta deveria barrar "Pode deixar"');
  const lp = await jd.observar({ event: { messageId: 'M4', body: 'Pode' } });
  checar(lp && lp.final === 'aprovar', '"Pode" curto segue aprovar');
  const jErro = criarJevSombra({ dir, fetchImpl: async () => { throw new Error('rede'); } });
  const le = await jErro.observar({ event: ev, unidade: 'CG', legado: null });
  checar(le && le.erro === 'falha', 'falha de rede deveria virar linha de erro');
  const j429 = criarJevSombra({ dir, fetchImpl: async () => ({ ok: false, status: 429 }) });
  checar((await j429.observar({ event: ev })).erro === 'http_429', '429 deveria virar linha de erro');
  fs.unlinkSync(path.join(dir, '.jev.env'));
  checar((await j.observar({ event: ev })).erro === 'sem_chave', 'sem chave deveria registrar sem_chave');
  if (falhas.length) { console.error('FALHAS:\n- ' + falhas.join('\n- ')); process.exit(1); }
  console.log('OK jev-sombra');
})().catch((e) => { console.error(e); process.exit(1); });
