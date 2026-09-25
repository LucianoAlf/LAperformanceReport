/**
 * Revisao do recital — LAPE-39, fase 5.
 *
 * A pergunta que esta aba responde e "posso imprimir?". Estes testes travam DUAS coisas que
 * um olho humano nao confere sozinho: a ordem de gravidade (o que impede vem antes do que
 * so incomoda) e o fato de a lista nao mentir quando esta vazia.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/eventos.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-rev-')), 'eventos.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { levantarPendencias, resumirEvento } = lib;

const EVENTO = {
  horario_inicio: '09:00',
  duracao_padrao_segundos: 300,
  intervalo_entre_blocos_segundos: 2700,
};

let seq = 0;
const ap = (extra = {}) => ({
  id: ++seq,
  ordem: seq,
  duracao_segundos: 300,
  pessoa_chave: `p${seq}`,
  aluno_nome: `Aluno ${seq}`,
  curso_nome: 'Violão',
  musica: 'Asa Branca',
  ...extra,
});

const bloco = (nome, apresentacoes, extra = {}) => ({
  id: Number(nome.replace(/\D/g, '')) || 1,
  nome,
  ordem: Number(nome.replace(/\D/g, '')) || 1,
  horario_inicial: null,
  inicio_manual: false,
  apresentacoes,
  ...extra,
});

const aluno = (extra = {}) => ({
  pessoa_chave: 'x',
  nome: 'Fulano',
  status: 'participa',
  cursos_no_recital: 1,
  cursos: [{ curso_id: 1, curso_nome: 'Violão' }],
  alocacoes: [{ curso_id: 1 }],
  ...extra,
});

const entrada = (blocos = [], alunos = []) => ({ evento: EVENTO, blocos, alunos });
const tipos = (ps) => ps.map((p) => p.tipo);

/* ───────────────────────── nada a apontar ───────────────────────── */

test('grade completa nao gera pendencia nenhuma', () => {
  const a = ap({ pessoa_chave: 'x' });
  const r = levantarPendencias(entrada([bloco('Bloco 1', [a])], [aluno()]));
  assert.deepEqual(r, []);
});

test('evento vazio nao gera pendencia — nao ha o que revisar ainda', () => {
  // Um evento recem-criado nao pode abrir a revisao acusando seis problemas: a pessoa
  // ainda nao comecou. Lista vazia aqui e o estado correto.
  assert.deepEqual(levantarPendencias(entrada()), []);
});

/* ───────────────────────── impedimentos ───────────────────────── */

test('quem marcou "nao participa" e esta na grade IMPEDE', () => {
  const a = ap({ pessoa_chave: 'x', aluno_nome: 'Desistente' });
  const r = levantarPendencias(
    entrada([bloco('Bloco 1', [a])], [aluno({ status: 'nao', alocacoes: [{ curso_id: 1 }] })]),
  );
  const p = r.find((x) => x.tipo === 'na_grade_mas_nao_participa');
  assert.ok(p, 'tem de acusar');
  assert.equal(p.gravidade, 'impede');
  assert.match(p.itens[0], /Desistente/u);
  assert.equal(p.onde, 'grade');
});

test('conflito de horario IMPEDE, e so aparece com inicio manual', () => {
  const b1 = bloco('Bloco 1', [ap()]);
  // Bloco 2 mandado para 09:01, antes de o primeiro terminar (09:05).
  const b2 = bloco('Bloco 2', [ap()], { horario_inicial: '09:01', inicio_manual: true });
  const r = levantarPendencias(entrada([b1, b2], []));
  const p = r.find((x) => x.tipo === 'conflito_de_horario');
  assert.ok(p);
  assert.equal(p.gravidade, 'impede');

  // Sem inicio manual, o encadeamento automatico nunca produz sobreposicao.
  const semManual = levantarPendencias(entrada([bloco('Bloco 1', [ap()]), bloco('Bloco 2', [ap()])], []));
  assert.equal(semManual.find((x) => x.tipo === 'conflito_de_horario'), undefined);
});

test('impedimento vem SEMPRE antes do que so pede atencao', () => {
  // Monta uma grade com os dois tipos ao mesmo tempo: quem le a lista de cima para baixo
  // tem de encontrar primeiro o que impede a impressao.
  const r = levantarPendencias(
    entrada(
      [bloco('Bloco 1', [ap({ pessoa_chave: 'x', musica: null })])],
      [aluno({ status: 'nao' })],
    ),
  );
  assert.ok(r.length >= 2);
  assert.equal(r[0].gravidade, 'impede');
  assert.ok(r.some((p) => p.gravidade === 'atencao'));
});

/* ───────────────────────── atencao ───────────────────────── */

test('confirmado fora da grade conta POR CURSO, nao por pessoa', () => {
  // Quem faz dois cursos se apresenta duas vezes: alocada em um, continua devendo o outro.
  const r = levantarPendencias(
    entrada(
      [],
      [
        aluno({
          nome: 'Maria Fernanda',
          cursos_no_recital: 2,
          cursos: [
            { curso_id: 1, curso_nome: 'Violão' },
            { curso_id: 2, curso_nome: 'Canto' },
          ],
          alocacoes: [{ curso_id: 1 }],
        }),
      ],
    ),
  );
  const p = r.find((x) => x.tipo === 'confirmado_fora_da_grade');
  assert.ok(p);
  assert.equal(p.itens.length, 1, 'so o curso que falta');
  assert.match(p.itens[0], /Canto/u);
  assert.doesNotMatch(p.itens[0], /Violão/u);
});

test('indefinido sem curso no recital nao entra na lista', () => {
  // Quem so faz banda ou esta com cadastro incompleto nao gera apresentacao — cobrar uma
  // resposta sobre participar dela seria pedir decisao que nao muda nada na grade.
  const r = levantarPendencias(
    entrada([], [aluno({ status: 'indefinido', cursos_no_recital: 0, cursos: [], alocacoes: [] })]),
  );
  assert.equal(r.find((x) => x.tipo === 'participacao_indefinida'), undefined);
});

test('indefinido com curso entra, e resolve-se na aba Alunos', () => {
  const r = levantarPendencias(entrada([], [aluno({ status: 'indefinido', alocacoes: [] })]));
  const p = r.find((x) => x.tipo === 'participacao_indefinida');
  assert.ok(p);
  assert.equal(p.onde, 'alunos');
});

test('musica vazia ou so espaco conta como sem musica', () => {
  const r = levantarPendencias(
    entrada([bloco('Bloco 1', [ap({ musica: null }), ap({ musica: '   ' }), ap()])], []),
  );
  const p = r.find((x) => x.tipo === 'apresentacao_sem_musica');
  assert.ok(p);
  assert.equal(p.itens.length, 2);
});

test('bloco vazio e apontado', () => {
  const r = levantarPendencias(entrada([bloco('Bloco 1', [])], []));
  assert.ok(r.find((x) => x.tipo === 'bloco_vazio'));
});

test('toda pendencia diz ONDE se resolve', () => {
  const r = levantarPendencias(
    entrada(
      [bloco('Bloco 1', [ap({ pessoa_chave: 'x', musica: null })]), bloco('Bloco 2', [])],
      [aluno({ status: 'indefinido', alocacoes: [] })],
    ),
  );
  assert.ok(r.length > 0);
  for (const p of r) {
    assert.ok(['alunos', 'grade'].includes(p.onde), `${p.tipo} sem destino`);
    assert.ok(p.itens.length > 0, `${p.tipo} sem nenhum caso listado`);
    assert.ok(p.detalhe.length > 0, `${p.tipo} sem explicacao do porque importa`);
  }
});

/* ───────────────── limite de 22:00 (regra do prototipo) ───────────────── */

test('termino depois das 22:00 vira pendencia', () => {
  // Uma das cinco "REGRAS FUNDAMENTAIS" escritas no prototipo do Arthur:
  // `const MAX_FINISH_MINUTES = 22 * 60; // 22:00 = 1320 min`
  const tarde = { ...EVENTO, horario_inicio: '21:50' };
  const r = levantarPendencias({
    evento: tarde,
    blocos: [bloco('Bloco 1', [ap(), ap(), ap()])],
    alunos: [],
  });
  const p = r.find((x) => x.tipo === 'termino_apos_limite');
  assert.ok(p, 'tem de acusar termino apos as 22:00');
  // 21:50 + 3 x 5 min + 2 trocas de 5 min
  assert.match(p.titulo, /22:15/u);
});

test('o limite e RECOMENDADO — avisa, nao impede', () => {
  // O prototipo diz "horario limite recomendado". Quem decide esticar o recital e a
  // coordenacao, nao o sistema.
  const tarde = { ...EVENTO, horario_inicio: '21:50' };
  const r = levantarPendencias({ evento: tarde, blocos: [bloco('B', [ap(), ap(), ap()])], alunos: [] });
  assert.equal(r.find((x) => x.tipo === 'termino_apos_limite').gravidade, 'atencao');
});

test('terminar EXATAMENTE as 22:00 nao acusa', () => {
  // A regra e "ultrapassar", nao "atingir" — acusar no limite exato treinaria a equipe a
  // ignorar o aviso.
  const noLimite = { ...EVENTO, horario_inicio: '21:55' };
  const r = levantarPendencias({ evento: noLimite, blocos: [bloco('B', [ap()])], alunos: [] });
  assert.equal(r.find((x) => x.tipo === 'termino_apos_limite'), undefined);
});

test('recital em horario normal nao acusa nada sobre o limite', () => {
  const r = levantarPendencias(entrada([bloco('B', [ap()])], []));
  assert.equal(r.find((x) => x.tipo === 'termino_apos_limite'), undefined);
});

/* ───────────────────────── resumo ───────────────────────── */

test('resumo conta so quem CONFIRMOU como participante', () => {
  const r = resumirEvento(
    entrada([], [aluno({ status: 'participa' }), aluno({ status: 'indefinido' }), aluno({ status: 'nao' })]),
  );
  assert.equal(r.participantes, 1);
});

test('duracao total inclui o intervalo entre blocos', () => {
  // 2 blocos de 5 min com 45 min de intervalo: 09:00 -> 09:05, 09:50 -> 09:55.
  const r = resumirEvento(entrada([bloco('Bloco 1', [ap()]), bloco('Bloco 2', [ap()])], []));
  assert.equal(r.inicio, '09:00');
  assert.equal(r.terminoPrevisto, '09:55');
  assert.equal(r.duracaoTotalSegundos, 55 * 60);
});

test('semDuracaoPropria conta quem ainda usa o padrao', () => {
  // A hora de termino e estimativa enquanto isso for > 0 — por isso sai junto, sempre.
  const r = resumirEvento(
    entrada([bloco('Bloco 1', [ap({ duracao_segundos: null }), ap({ duracao_segundos: 420 })])], []),
  );
  assert.equal(r.semDuracaoPropria, 1);
  assert.equal(r.apresentacoes, 2);
});

test('evento sem bloco nao inventa horario', () => {
  const r = resumirEvento(entrada());
  assert.equal(r.inicio, null);
  assert.equal(r.terminoPrevisto, null);
  assert.equal(r.duracaoTotalSegundos, 0);
});

/* ───────────────────────── a aba existe ───────────────────────── */

test('a aba Revisao renderiza a tela, nao um placeholder', () => {
  const pagina = readFileSync('src/components/App/Eventos/EventoDetalhePage.tsx', 'utf8');
  assert.match(pagina, /tabAtiva === 'revisao' && <RevisaoTab/u);
  // Com as quatro abas prontas, o componente de placeholder nao pode sobreviver "por via
  // das duvidas": foi ele que anunciou a fase 4 como futura depois de ela estar no ar.
  assert.doesNotMatch(pagina, /function AbaFutura/u);
});
