import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ESTILOS_ACAO_OBSERVADOR,
  ESTILOS_ACAO_OPERACAO,
  ehAcaoDeSombra,
  estiloDaAcao,
  filtrarRegistrosLog,
  formatarDetalhesLog,
  registroSemProfessor,
  rotuloDoEvento,
} from '../src/lib/automacaoLog.ts';
import { abaFoiPortada } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = le('../src/mobile/telas/alunos/AutomacaoMobile.tsx');
const desktop = le('../src/components/App/Alunos/Automacao/TabAutomacao.tsx');

const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---------------------------------------------------------------- valor ----

test('cada ação conhecida tem o seu rótulo', () => {
  assert.equal(estiloDaAcao('inserido').label, 'Novo Aluno');
  assert.equal(estiloDaAcao('status_ativo').label, 'Renovado');
  assert.equal(estiloDaAcao('status_evadido').label, 'Evadido');
  assert.equal(estiloDaAcao('processado').label, 'Processado (Emusys)');
});

test('🔴 ação de SOMBRA não pode parecer alteração real de aluno', () => {
  // Elas ficam fora do mapa de operação (que também gera os cartões de
  // contagem). Sem entrada própria, caíam no padrão e saíam como
  // "Atualizado" — parecendo escrita que nunca houve.
  for (const acao of ['processado_sombra', 'webhook_observado_direto']) {
    assert.equal(ehAcaoDeSombra(acao), true);
    assert.match(estiloDaAcao(acao).label, /sombra/i, `${acao} não se anuncia como sombra`);
    assert.ok(!(acao in ESTILOS_ACAO_OPERACAO), `${acao} entrou no mapa de operação`);
    assert.ok(acao in ESTILOS_ACAO_OBSERVADOR);
  }
  // `processado` é operação de verdade, apesar de vir do observador.
  assert.equal(ehAcaoDeSombra('processado'), false);
});

test('ação desconhecida cai no padrão, como na tela do computador', () => {
  assert.equal(estiloDaAcao('coisa_que_nao_existe').label, 'Atualizado');
});

test('evento sem rótulo conhecido volta cru', () => {
  // Inventar nome para evento novo esconderia justamente o que ninguém
  // mapeou ainda.
  assert.equal(rotuloDoEvento('matricula_nova'), 'Matrícula Nova');
  assert.equal(rotuloDoEvento('evento_novo_do_emusys'), 'evento_novo_do_emusys');
});

test('🔴 sync_presenca tem forma própria de detalhe', () => {
  // Nele o curso sozinho não diz de que aula se trata: a data e o professor
  // são o que identificam.
  assert.equal(
    formatarDetalhesLog({ evento: 'sync_presenca', detalhes: { data: '12/09', curso: 'Violão', professor: 'Gabriel' } }),
    '12/09 · Violão · Prof. Gabriel',
  );
  // Nos demais, a data não entra e o dia/horário só aparecem juntos.
  assert.equal(
    formatarDetalhesLog({ evento: 'matricula_nova', detalhes: { curso: 'Piano', dia: 'Terça', horario: '14:00' } }),
    'Piano · Terça 14:00',
  );
  assert.equal(
    formatarDetalhesLog({ evento: 'matricula_nova', detalhes: { curso: 'Piano', dia: 'Terça' } }),
    'Piano',
    'dia sem horário não deveria aparecer sozinho',
  );
  assert.equal(formatarDetalhesLog({ evento: 'matricula_nova', detalhes: null }), '');
});

test('o alerta de professor faltando é um fato do registro', () => {
  assert.equal(registroSemProfessor({ detalhes: { sem_professor: true } }), true);
  assert.equal(registroSemProfessor({ detalhes: { sem_professor: false } }), false);
  assert.equal(registroSemProfessor({ detalhes: null }), false);
});

test('o recorte local: busca por aluno e o pseudo-evento sem_professor', () => {
  const base = [
    { id: 1, aluno_nome: 'Maria Eduarda', detalhes: { sem_professor: true } },
    { id: 2, aluno_nome: 'João Pedro', detalhes: {} },
    { id: 3, aluno_nome: 'Mariana', detalhes: null },
  ];
  assert.deepEqual(filtrarRegistrosLog(base).map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(filtrarRegistrosLog(base, { busca: 'mari' }).map((r) => r.id), [1, 3]);
  assert.deepEqual(filtrarRegistrosLog(base, { evento: 'sem_professor' }).map((r) => r.id), [1]);
  // `sem_professor` não é evento do banco: ele recorta aqui, depois da consulta.
  assert.deepEqual(
    filtrarRegistrosLog(base, { evento: 'sem_professor', busca: 'joão' }).map((r) => r.id),
    [],
  );
});

test('evento REAL não é filtrado de novo no cliente', () => {
  // Período, evento e ação viajam para o banco. Refiltrar aqui esvaziaria a
  // lista, porque a consulta já devolveu só o que casa.
  const base = [{ id: 1, aluno_nome: 'Ana', detalhes: {} }];
  assert.equal(filtrarRegistrosLog(base, { evento: 'matricula_nova' }).length, 1);
});

// ------------------------------------------------------- contrato do código ----

test('🔴 o computador e o celular leem os MESMOS rótulos', () => {
  assert.match(desktop, /from '@\/lib\/automacaoLog'/);
  assert.match(desktop, /estiloDaAcao\(registro\.acao\)/);
  assert.match(desktop, /filtrarRegistrosLog\(registros/);
  // Os mapas não podem voltar a nascer dentro do componente.
  const limpo = semComentarios(desktop);
  assert.doesNotMatch(limpo, /label: 'Novo Aluno'/, 'o mapa de ações voltou para o desktop');
  assert.doesNotMatch(limpo, /'Matrícula Nova'/, 'o mapa de eventos voltou para o desktop');
  assert.doesNotMatch(limpo, /evento === 'sync_presenca'/, 'o resumo de detalhes voltou para o desktop');
});

test('a tela do celular não consulta o banco', () => {
  const limpo = semComentarios(tela);
  assert.doesNotMatch(limpo, /from '@\/lib\/supabase'/);
  assert.doesNotMatch(limpo, /automacao_log/);
  assert.match(tela, /from '@\/lib\/automacaoLog'/);
});

test('o alvo de toque tem 44px', () => {
  const alturas = [...tela.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(alturas.length >= 1);
  assert.ok(alturas.every((px) => px >= 44), 'alvo abaixo de 44px');
});

test('🔴 linha sem payload não finge que expande', () => {
  // Um botão que abre nada promete e não cumpre — e o leitor de tela o
  // anuncia como expansível.
  assert.match(tela, /disabled=\{!temPayload\}/);
  assert.match(tela, /aria-expanded=\{temPayload \? aberta : undefined\}/);
});

test('🔴 o payload não é truncado', () => {
  // Ali o valor É o conteúdo: um id cortado pela metade não serve para
  // procurar nada.
  const bloco = tela.slice(tela.indexOf('function Payload'));
  assert.match(bloco, /break-all/);
  assert.doesNotMatch(bloco, /<dd[^>]*truncate/);
});

test('a aba entrou nas portadas', () => {
  assert.equal(abaFoiPortada('/app/alunos', 'automacao'), true);
  for (const pendente of ['grade', 'distribuicao', 'conciliacao', 'importar']) {
    assert.equal(abaFoiPortada('/app/alunos', pendente), false, `${pendente} entrou sem ter sido portada`);
  }
});

test('⚠️ a bifurcação fica depois dos hooks e o JSX do desktop segue lá', () => {
  const iHook = Math.max(desktop.lastIndexOf('useState('), desktop.lastIndexOf('useEffect('));
  const iBif = desktop.indexOf('if (ehCelular) {');
  assert.ok(iBif > -1, 'a bifurcação sumiu');
  assert.ok(iHook < iBif, 'há hook depois da bifurcação');
  const bloco = desktop.slice(iBif);
  assert.match(bloco, /<table className="w-full">/, 'a tabela do desktop sumiu');
  assert.match(bloco, /Execucao/, 'a coluna de execução do desktop sumiu');
});
