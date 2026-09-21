import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

// Roda a funcao REAL com as dependencias REAIS: `chamadaUtils` (a regra de
// "esta fechada?") e `presencaCanonica` (o estado do professor). E o ponto do
// modulo — ele COMPOE essas regras em vez de reescreve-las —, entao testar com
// dublês provaria a composicao errada.
// ⚠️ `bundle` com alias porque o Node nao resolve o `@/` do projeto; a
// transpilacao simples do `esbuild.transform`, usada em testes de modulos sem
// import local, nao basta aqui.
const { montarFilaDaChamada } = await (async () => {
  const saida = path.join(mkdtempSync(path.join(tmpdir(), 'fila-')), 'chamadaFila.mjs');
  await esbuild.build({
    entryPoints: ['src/lib/chamadaFila.ts'],
    outfile: saida,
    bundle: true,
    format: 'esm',
    platform: 'node',
    alias: { '@': path.resolve('src') },
    // Sem `external`: o bundle sai numa pasta temporaria, fora do projeto, e de
    // la o Node nao acharia `date-fns` no node_modules daqui.
    logLevel: 'silent',
  });
  return import(pathToFileURL(saida).href);
})();

const AGORA = new Date('2026-09-21T16:30:00-03:00');
const DIA = '2026-09-21';

/** Aluno sem destino: status cru do Emusys, sem resposta humana. */
const semDestino = (id) => ({
  aluno_id: id,
  nome: `Aluno ${id}`,
  status_presenca: 'ausente',
  respondido_por: null,
  emusys_presenca_bruta: null,
  aula_emusys_id: 900 + id,
  risco_pct: null,
  risco_calculado_em: null,
});

const presente = (id) => ({ ...semDestino(id), status_presenca: 'presente', respondido_por: 'agenda_secretaria' });

const aula = (extra) => ({
  chave: extra.chave ?? `${extra.hora_inicio}-${extra.professor_id ?? 0}`,
  hora_inicio: '14:00',
  hora_fim: '14:50',
  duracao_minutos: 50,
  cancelada: false,
  reagendada: false,
  categoria: 'normal',
  curso_nome: 'Violão',
  professor_id: 1,
  professor_nome: 'Letícia',
  sala_nome: 'Sala 2',
  turma_nome: null,
  unidade_nome: null,
  aula_ids: [1],
  alunos: [semDestino(1)],
  experimental_leads: [],
  ...extra,
});

const envelope = (extra = {}) => ({
  dados_status: 'atualizados',
  sincronizado_em: '2026-09-21T19:00:00Z',
  regra_versao: 'presenca-v2',
  pendencias: [],
  conflitos: [],
  revisoes_estruturais: [],
  ocorrencias: [],
  professores_ocorrencias: [],
  ...extra,
});

test('a fila traz o que espera há mais tempo primeiro', () => {
  // É uma fila de TRABALHO, não uma leitura do dia: o topo é o mais atrasado.
  const fila = montarFilaDaChamada(
    [
      aula({ hora_inicio: '15:00', hora_fim: '15:50', chave: 'b' }),
      aula({ hora_inicio: '14:00', hora_fim: '14:50', chave: 'a' }),
    ],
    DIA,
    AGORA,
    envelope(),
  );
  assert.deepEqual(fila.aulas.map((p) => p.aula.chave), ['a', 'b']);
});

test('aula que ainda não terminou não entra — nem quando está sem aluno', () => {
  // 🔴 A primeira versão deste teste usava uma aula futura COM aluno, e por
  // isso passava mesmo com a guarda removida: `chamadaCompleta` já resolvia o
  // caso. Quem exercita a guarda de verdade é a aula futura SEM aluno
  // vinculado — ali `chamadaCompleta` devolve `false` (não há o que conferir)
  // e, sem a guarda, um horário vago do fim da tarde entraria na fila de manhã.
  const comAluno = montarFilaDaChamada(
    [aula({ hora_inicio: '18:00', hora_fim: '18:50', chave: 'futura' })],
    DIA,
    AGORA,
    envelope(),
  );
  assert.equal(comAluno.aulas.length, 0);

  const vaga = montarFilaDaChamada(
    [aula({ hora_inicio: '18:00', hora_fim: '18:50', chave: 'vaga', alunos: [] })],
    DIA,
    AGORA,
    envelope(),
  );
  assert.equal(vaga.aulas.length, 0, 'horário vago do futuro não é chamada pendente');

  // E a MESMA aula vaga, já terminada, entra: o horário foi reservado, ninguém
  // vinculou aluno, e é justamente o caso que alguém precisa olhar.
  const vagaPassada = montarFilaDaChamada(
    [aula({ hora_inicio: '09:00', hora_fim: '09:50', chave: 'vaga-ontem', alunos: [] })],
    DIA,
    AGORA,
    envelope(),
  );
  assert.equal(vagaPassada.aulas.length, 1);
});

test('aula cancelada não entra — ela não tem chamada a fechar', () => {
  const fila = montarFilaDaChamada([aula({ cancelada: true })], DIA, AGORA, envelope());
  assert.equal(fila.aulas.length, 0);
});

test('aula com todos os alunos resolvidos sai da fila', () => {
  const fila = montarFilaDaChamada([aula({ alunos: [presente(1), presente(2)] })], DIA, AGORA, envelope());
  assert.equal(fila.aulas.length, 0);
  // E uma com um aluno pendente entre dois resolvidos continua.
  const parcial = montarFilaDaChamada(
    [aula({ alunos: [presente(1), semDestino(2), presente(3)] })],
    DIA,
    AGORA,
    envelope(),
  );
  assert.equal(parcial.aulas.length, 1);
});

test('professor sem marcação entra; marcado sai', () => {
  const semMarcar = montarFilaDaChamada([aula({})], DIA, AGORA, envelope());
  assert.deepEqual(semMarcar.professores.map((p) => p.nome), ['Letícia']);

  const marcado = montarFilaDaChamada(
    [aula({})],
    DIA,
    AGORA,
    envelope({
      professores_ocorrencias: [
        { aula_emusys_id: 1, professor_id: 1, estado: 'presente', decidido_em: '2026-09-21T18:00:00Z', fonte: 'agenda_secretaria' },
      ],
    }),
  );
  assert.equal(marcado.professores.length, 0);
});

test('🔴 dado desatualizado NÃO vira "ninguém marcou"', () => {
  // "Não sei" e "está devendo" são coisas diferentes. Cobrar a equipe por um
  // sincronismo atrasado é a mesma inversão que a régua de `sem_captura` já
  // proíbe do outro lado do sistema.
  for (const status of ['dados_desatualizados', 'roster_em_revisao']) {
    const fila = montarFilaDaChamada([aula({})], DIA, AGORA, envelope({ dados_status: status }));
    assert.equal(fila.professores.length, 0, `${status} não pode acusar o professor`);
  }
});

test('o professor aparece UMA vez, com o intervalo do dia inteiro', () => {
  // A marcação do professor é do DIA, não da aula: listá-lo uma vez por aula
  // faria a equipe marcar sete vezes a mesma pessoa.
  const fila = montarFilaDaChamada(
    [
      aula({ hora_inicio: '14:00', hora_fim: '14:50', aula_ids: [1], chave: 'a' }),
      aula({ hora_inicio: '09:00', hora_fim: '09:50', aula_ids: [2], chave: 'b' }),
      aula({ hora_inicio: '16:00', hora_fim: '16:50', aula_ids: [3], chave: 'c' }),
    ],
    DIA,
    AGORA,
    envelope(),
  );
  assert.equal(fila.professores.length, 1);
  const [p] = fila.professores;
  assert.equal(p.qtdAulas, 3);
  assert.equal(p.primeiraHora, '09:00');
  assert.equal(p.ultimaHora, '16:50');
  // Os ids de todas as aulas do dia, porque é o que a marcação do dia cobre.
  assert.deepEqual([...p.aulaIds].sort(), [1, 2, 3]);
});

test('o total soma os dois lados', () => {
  const fila = montarFilaDaChamada(
    [aula({ chave: 'a' }), aula({ chave: 'b', professor_id: 2, professor_nome: 'Bia', aula_ids: [2] })],
    DIA,
    AGORA,
    envelope(),
  );
  assert.equal(fila.total, fila.professores.length + fila.aulas.length);
  assert.equal(fila.total, 4);
});
