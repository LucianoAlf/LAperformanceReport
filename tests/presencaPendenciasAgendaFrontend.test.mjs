import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const hook = readFileSync(join(ROOT,'src/hooks/useAgendaDia.ts'),'utf8');
const page = readFileSync(join(ROOT,'src/components/App/Agenda/AgendaPage.tsx'),'utf8');
const alerta = readFileSync(join(ROOT,'src/components/App/Agenda/Chamada/AlertaPendencias.tsx'),'utf8');
const view = readFileSync(join(ROOT,'src/components/App/Agenda/Chamada/ChamadaView.tsx'),'utf8');

test('Agenda renderiza exatamente o envelope v2 usado pela Sol', () => {
  assert.match(hook, /rpc\(['"]get_agenda_dia_v2['"]/u);
  assert.doesNotMatch(hook, /\.from\(['"]aulas_emusys['"]\)[\s\S]{0,240}created_at/u);
  assert.match(alerta, /presenca\.pendencias/u);
  assert.match(alerta, /presenca\.dados_status/u);
  assert.doesNotMatch(alerta, /alunoSemDestino|leadExperimentalSemDestino/u);
  assert.doesNotMatch(page, /alunoSemDestino|leadExperimentalSemDestino/u);
  assert.match(page, /presenca\.dados_status\s*===\s*['"]atualizados['"]/u);
  assert.match(page, /presenca\.pendencias\.length/u);
  assert.match(hook, /if \(doCache\)/u);
  assert.match(hook, /else\s*\{[\s\S]{0,360}setAulas\(\[\]\)[\s\S]{0,120}setPresenca\(presencaInicial\)/u);
  assert.match(view, /presenca=\{presenca\}/u);
});
