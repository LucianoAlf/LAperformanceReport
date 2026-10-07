/**
 * Pré-Atendimento: mover um lead para a etapa "Visita Agendada" tem de REGISTRAR a
 * visita (29/09/2026).
 *
 * O Kanban (arrasto) e o "Mover etapa" da ficha gravavam só `leads.etapa_pipeline_id`.
 * A contagem de visitas lê a tabela `visitas` (+ canal Visita/Placa), então o card ia
 * para a coluna e a visita não existia em lugar nenhum — Barra e Recreio, que não têm a
 * Mila agendando, perdiam toda visita movida à mão (caso real: Edna #1596, Recreio,
 * 23/09). A tela Comercial já abria o `ModalAgendar`; o Pré-Atendimento não.
 *
 * A regra de decisão roda compilada do .ts real (esbuild), não de uma cópia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'visita-mover-etapa-'));
const saida = join(dir, 'visitasComercial.mjs');
execFileSync('npx', ['esbuild', 'src/lib/visitasComercial.ts', '--format=esm', `--outfile=${saida}`], {
  stdio: 'pipe', shell: process.platform === 'win32',
});
const lib = await import(pathToFileURL(saida).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const ler = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('etapa de visita do pipeline e a 6 (mesma do ModalAgendar e do funil do Comercial)', () => {
  assert.equal(lib.ETAPA_PIPELINE_VISITA, 6);
});

test('visita agendada que ainda nao passou impede agendar outra (a da Mila, por exemplo)', () => {
  const v = lib.visitaAgendadaVigente(
    [
      { id: 'a', data: '2026-09-20', horario: '10:00:00', status: 'agendada' },
      { id: 'b', data: '2026-10-03', horario: '11:00:00', status: 'agendada' },
      { id: 'c', data: '2026-09-30', horario: '14:00:00', status: 'agendada' },
    ],
    '2026-09-29',
  );
  assert.equal(v?.id, 'c', 'devolve a proxima, nao a primeira da lista');
});

test('visita de hoje ainda vale; ja passada, cancelada ou com presenca marcada nao', () => {
  assert.equal(
    lib.visitaAgendadaVigente([{ id: 'h', data: '2026-09-29', horario: '19:00:00', status: 'agendada' }], '2026-09-29')?.id,
    'h',
  );
  assert.equal(
    lib.visitaAgendadaVigente(
      [
        { id: 'p', data: '2026-09-28', horario: '13:00:00', status: 'agendada' },
        { id: 'x', data: '2026-10-01', horario: '10:00:00', status: 'cancelada' },
        { id: 'r', data: '2026-10-01', horario: '10:00:00', status: 'realizada' },
        { id: 'n', data: '2026-10-01', horario: '10:00:00', status: 'nao_compareceu' },
      ],
      '2026-09-29',
    ),
    null,
  );
  assert.equal(lib.visitaAgendadaVigente([], '2026-09-29'), null);
});

test('arrasto do Kanban para a etapa de visita passa pelo ModalAgendar travado em visita', () => {
  const fonte = semComentarios(ler('src/components/App/PreAtendimento/tabs/PipelineTab.tsx'));
  assert.match(fonte, /ETAPA_PIPELINE_VISITA/);
  assert.match(fonte, /<ModalAgendar[\s\S]*?tipoInicial="visita"[\s\S]*?tipoTravado/);
  assert.match(fonte, /consultarVisitaVigenteDoLead/);
  const desvio = fonte.indexOf('ETAPA_PIPELINE_VISITA', fonte.indexOf('handleDropOnEtapa'));
  const update = fonte.indexOf(".from('leads')", fonte.indexOf('handleDropOnEtapa'));
  assert.ok(desvio > 0 && desvio < update, 'o desvio para a visita vem antes do UPDATE direto');
});

test('"Mover etapa" da ficha tambem nao grava a etapa de visita sem agendar', () => {
  const fonte = semComentarios(ler('src/components/App/PreAtendimento/components/ModalMoverEtapa.tsx'));
  assert.match(fonte, /ETAPA_PIPELINE_VISITA/);
  assert.match(fonte, /onAgendarVisita/);
  assert.match(fonte, /consultarVisitaVigenteDoLead/);
  assert.doesNotMatch(fonte, /catch \(err\) \{\s*console\.error\('Erro ao mover etapa:', err\);\s*\}/,
    'falha ao mover nao pode ficar muda');
  const pagina = semComentarios(ler('src/components/App/PreAtendimento/PreAtendimentoPage.tsx'));
  assert.match(pagina, /onAgendarVisita=/);
  assert.match(pagina, /<ModalAgendar[\s\S]*?tipoInicial="visita"[\s\S]*?tipoTravado/);
});
