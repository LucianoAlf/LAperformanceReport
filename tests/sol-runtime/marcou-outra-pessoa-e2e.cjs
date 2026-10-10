// 10/10/2026 (CG, Jhon): "@Luciano Alf ... como faço na Sol?" não é pra Sol.
// Mensagem que marca alguém e não marca a Sol nem cita card dela não aciona a
// guarda de pendência ("Não entendi essa 🤔"), mesmo com "Sol" no texto.
const fs = require('fs'); const path = require('path');
const ponte = fs.readFileSync(path.join(__dirname, '../../vps/la-hq/sol/runtime/bridge.js'), 'utf8');
const falhas = []; const checar = (c, m) => { if (!c) falhas.push(m); };
checar(/const _marcouOutro = Array\.isArray\(_menc\) && _menc\.length > 0/.test(ponte), 'falta detectar menção a outra pessoa');
checar(/_pareceProSol = _citouSol\s*\|\| \(!_marcouOutro && /.test(ponte), 'chamar a Sol pelo nome não pode valer quando marcou outra pessoa');
// Lógica isolada (mesma normalização da ponte).
const norm = (v) => String(v).replace(/:.*@/, '@').replace(/@.*/, '');
const ids = new Set(['5521900000000:5@s.whatsapp.net', '123456@lid'].map(norm));
const marcouOutro = (m) => m.length > 0 && !m.some(x => ids.has(norm(x)));
checar(marcouOutro(['5521981278047@s.whatsapp.net']) === true, 'marcar o Alf = outra pessoa');
checar(marcouOutro(['5521900000000@s.whatsapp.net']) === false, 'marcar a Sol não é outra pessoa');
checar(marcouOutro(['5521981278047@s.whatsapp.net', '123456@lid']) === false, 'marcar Sol + Alf ainda é com a Sol');
checar(marcouOutro([]) === false, 'sem menção segue a regra antiga');
if (falhas.length) { console.error('FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1); }
console.log('ok marcou-outra-pessoa-e2e');
