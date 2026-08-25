import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const modal = read('src/components/App/Bandas/ModalEventoBanda.tsx');

test('modal aceita data inicial apenas na criação e edição prevalece', () => {
  assert.match(modal, /dataInicial\?: Date \| null/);
  assert.match(
    modal,
    /evento\s*\? new Date\(evento\.data_inicio\)\s*:\s*dataInicial\s*\? new Date\(dataInicial\)\s*:\s*undefined/,
  );
  assert.match(modal, /\[aberto, evento, unidadeAtual, dataInicial\]/);
});

const calendarioPath = 'src/components/App/Bandas/CalendarioEventosBandas.tsx';
const calendario = existsSync(path.join(root, calendarioPath)) ? read(calendarioPath) : '';

test('arquivos do calendário têm nomes distintos em filesystem case-insensitive', () => {
  const arquivos = readdirSync(path.join(root, 'src/components/App/Bandas'))
    .filter((arquivo) => arquivo.toLowerCase().startsWith('calendarioeventosbandas.'));
  const bases = arquivos.map((arquivo) => path.parse(arquivo).name.toLowerCase());
  assert.equal(new Set(bases).size, bases.length, arquivos.join(', '));
});

test('calendário mensal oferece navegação, hoje, grade e painel do dia', () => {
  assert.match(calendario, /subMonths\(mesAtual, 1\)/);
  assert.match(calendario, /addMonths\(mesAtual, 1\)/);
  assert.match(calendario, /Hoje/);
  assert.match(calendario, /grid-cols-7/);
  assert.match(calendario, /Agenda do dia/);
});

test('interações de dia e evento permanecem separadas', () => {
  assert.match(calendario, /onCriarEvento\(dia\)/);
  assert.match(calendario, /event\.stopPropagation\(\)/);
  assert.match(calendario, /onAbrirEvento\(evento\)/);
  assert.match(calendario, /restantes > 0/);
  assert.match(calendario, /setDiaSelecionado\(dia\)/);
});

test('painel expõe as ações existentes para eventos agendados', () => {
  assert.match(calendario, /onCancelarEvento\(evento\)/);
  assert.match(calendario, /onRemoverEvento\(evento\)/);
  assert.match(calendario, /evento\.status === 'agendado'/);
});

test('calendário não introduz cores hexadecimais', () => {
  assert.ok(calendario, 'o componente de calendário precisa existir');
  assert.doesNotMatch(calendario, /#[\da-f]{3,8}/i);
});

const eventosTab = read('src/components/App/Bandas/EventosTab.tsx');

test('aba abre em calendário, persiste o toggle e busca toda a história uma vez', () => {
  assert.match(eventosTab, /bandas_eventos_visualizacao/);
  assert.match(eventosTab, /return saved === 'lista' \? 'lista' : 'calendario'/);
  assert.match(eventosTab, /useBandaEventos\(unidadeAtual, null\)/);
  assert.match(
    eventosTab,
    /filtrarEventosDaLista\(eventos, mostrarPassados, agoraReferencia\)/,
  );
});

test('switch de passados fica exclusivo da lista e calendário recebe os callbacks atuais', () => {
  assert.match(eventosTab, /visualizacao === 'lista'[\s\S]*?mostrar-passados/);
  assert.match(eventosTab, /<CalendarioEventosBandas/);
  assert.match(eventosTab, /onCancelarEvento=\{setEventoCancelando\}/);
  assert.match(eventosTab, /onRemoverEvento=\{setEventoRemovendo\}/);
});

test('criação por dia e Novo evento não compartilham data residual', () => {
  assert.match(eventosTab, /setDataInicial\(data \? new Date\(data\) : null\)/);
  assert.match(eventosTab, /dataInicial=\{dataInicial\}/);
  assert.match(eventosTab, /setDataInicial\(null\)/);
});
