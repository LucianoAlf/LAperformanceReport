// Aluno TRANCADO elegivel ao recital — LAPE-39, pedido da Fernanda (09/10/2026).
//
// "No recital nao aparecem os alunos trancados para escolher." Nao apareciam por desenho:
// a view de elegiveis nascia restrita a matricula ativa e a RPC que grava a apresentacao
// exigia matricula ativa DAQUELE curso.
//
// 🔴 O que este teste protege sao DUAS decisoes, nao o filtro em si:
//
//   1. TRANCADO ENTRA MARCADO. Trancar nao e sair — o recital e convite, nao KPI —, mas a
//      coordenacao precisa saber que a matricula esta pausada antes de convidar, cobrar
//      ingresso e avisar o professor. Esconder era o defeito; mostrar sem marca seria pior.
//
//   2. "ESTA PESSOA ESTA TRANCADA?" TEM UMA RESPOSTA SO, e e a do banco. O front NAO pode
//      derivar isso da lista de cursos: seria a segunda regua para a mesma pergunta — a
//      familia de defeito que produziu as duplicatas de renovacao e as quatro
//      implementacoes de "esta anamnese e deste aluno?".
//
// MEDIDO em producao em 09/10/2026: 20 matriculas trancadas = 19 pessoas (Barra 2, CG 10,
// Recreio 7); lista 994 -> 1013; 0 pessoa desaparece; 0 divergencia nas colunas antigas e
// no conjunto (curso, professor) de cursos. Com matricula ativa E trancada do mesmo curso
// (ensaiado com rollback, caso que nao existe hoje): a view devolve UM curso, nao trancado,
// e a RPC grava a matricula ATIVA — a agregacao antiga devolveria duas linhas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION = 'supabase/migrations/20261009160248_evento_aluno_trancado_elegivel.sql';
const sql = readFileSync(MIGRATION, 'utf8');
const selo = readFileSync('src/components/App/Eventos/SeloTrancado.tsx', 'utf8');
const alunosTab = readFileSync('src/components/App/Eventos/AlunosTab.tsx', 'utf8');
const seletor = readFileSync('src/components/App/Eventos/SeletorApresentacao.tsx', 'utf8');
const modal = readFileSync('src/components/App/Eventos/ModalAlunoOutraUnidade.tsx', 'utf8');
const hook = readFileSync('src/hooks/useEventos.ts', 'utf8');

/**
 * Codigo sem a prosa que o descreve.
 *
 * ⚠️ Existe porque a 1a versao deste teste reprovou o codigo CERTO tres vezes: o cabecalho
 * da migration explica o defeito CITANDO o padrao antigo, e o assert negativo o encontrava
 * ali. Teste de forma le o codigo, nunca o comentario.
 */
function semComentarios(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** O mesmo para SQL: a migration da casa comenta mais do que executa. */
function sqlSemComentarios(fonte) {
  return fonte
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

const sqlCodigo = sqlSemComentarios(sql);

test('as duas views do modulo olham o mesmo universo: ativo OU trancado', () => {
  const ocorrencias = sqlCodigo.match(/status in \('ativo', 'trancado'\)/g) ?? [];
  // elegiveis + familia. O filtro da RPC e aplicado por patch guardado, nao escrito aqui.
  assert.equal(ocorrencias.length, 2, 'esperava o filtro nas duas views');
  assert.ok(
    !/where a\.status = 'ativo'/.test(sqlCodigo),
    'nenhuma das views pode continuar restrita a ativo',
  );
});

test('o filtro "Familia" acompanha, senao o irmao trancado nunca casa com o irmao ativo', () => {
  assert.ok(sqlCodigo.includes('create or replace view public.vw_evento_familia_v1'));
});

test('cursos agrega por (pessoa, curso) antes do jsonb, sem distinct no objeto', () => {
  // Com `trancado` dentro do objeto, o distinct devolveria o MESMO curso duas vezes para
  // quem tem uma matricula ativa e outra trancada dele: a tela repetiria o curso e a
  // alocacao por curso_id passaria a responder por um dos dois.
  assert.ok(/^curso as \(/m.test(sqlCodigo), 'esperava o CTE de grao (pessoa, curso)');
  assert.ok(
    !/jsonb_agg\(distinct/.test(sqlCodigo),
    'o distinct no objeto e o defeito que o CTE evita',
  );
  assert.ok(
    sqlCodigo.includes('not bool_or(m.matricula_ativa)'),
    'trancado = NENHUMA matricula ativa, nos dois graos',
  );
});

test('a ativa manda sobre a trancada ao eleger matricula e referencia', () => {
  assert.ok(
    sqlCodigo.includes("order by (a.status <> ''ativo''), a.id desc"),
    'a RPC tem de preferir a ativa; ordenar so por id pegaria a trancada mais nova',
  );
  assert.ok(
    sqlCodigo.includes('order by m.curso_e_banda, m.matricula_ativa desc, m.aluno_id desc'),
    'a referencia da pessoa: banda por ultimo, ativa antes de trancada',
  );
});

test('a RPC e corrigida por patch guardado sobre a definicao VIVA, com contagem de ancora', () => {
  // A funcao viva ganhou, depois da migration que a criou, a guarda de escopo e a trava do
  // aluno de outra unidade. Transcreve-la do repo apagaria as duas em silencio — e a prova
  // de que nao apagou tem de rodar DENTRO da migration.
  assert.ok(sqlCodigo.includes('pg_get_functiondef'), 'o patch parte do corpo vivo');
  assert.ok(
    !/create or replace function public\.evento_apresentacao_adicionar_v1/.test(sqlCodigo),
    'reescrever a funcao inteira a partir do repo e o que esta proibido aqui',
  );
  const guardas = sqlCodigo.match(/esperava 1 ocorrencia, achou/g) ?? [];
  assert.equal(guardas.length, 4, 'cada ancora declara quantas vezes espera casar');
  for (const trava of ['fn_evento_pode_ver', 'ainda não foi adicionado a este evento']) {
    assert.ok(sqlCodigo.includes(trava), `a prova pos-patch tem de conferir: ${trava}`);
  }
});

test('a recusa da RPC deixou de dizer "matricula ativa", que virou falso', () => {
  assert.ok(sqlCodigo.includes("'% não tem matrícula de %.'"));
  assert.ok(sqlCodigo.includes('ativa ou trancada'), 'o hint diz o universo real');
});

test('EXECUTE da funcao recriada e reemitido sem anon', () => {
  // Recriar funcao e o caminho classico de reabrir EXECUTE para anon neste projeto.
  assert.ok(
    /revoke execute on function public\.evento_apresentacao_adicionar_v1[\s\S]{0,140}from public, anon/
      .test(sqlCodigo),
  );
  assert.ok(
    /grant execute on function public\.evento_apresentacao_adicionar_v1[\s\S]{0,140}to authenticated, service_role/
      .test(sqlCodigo),
  );
});

test('trancado entra como ULTIMA coluna da view', () => {
  // Trocar a view no lugar nao permite inserir coluna no meio nem renomear: a ordem antiga
  // (… faz_banda, motivo_sem_curso) e contrato de quem ja le a view.
  const projecao = sqlCodigo.slice(sqlCodigo.indexOf('select\n  p.unidade_id'));
  const posMotivo = projecao.indexOf('as motivo_sem_curso');
  const posTrancado = projecao.indexOf('p.trancado\nfrom pessoa p');
  assert.ok(posMotivo > 0 && posTrancado > posMotivo, 'trancado vem depois de motivo_sem_curso');
});

test('o rotulo trancado tem fonte unica: nenhum consumidor escreve o texto por conta', () => {
  assert.ok(selo.includes('export function SeloTrancado'));
  const consumidores = [
    ['AlunosTab', alunosTab],
    ['SeletorApresentacao', seletor],
    ['ModalAlunoOutraUnidade', modal],
  ];
  for (const [nome, fonte] of consumidores) {
    const limpo = semComentarios(fonte);
    assert.ok(limpo.includes('<SeloTrancado'), `${nome} tem de usar o selo compartilhado`);
    assert.ok(
      !/[>'"`]\s*trancad/i.test(limpo),
      `${nome} nao pode escrever rotulo nem tooltip proprio de trancado`,
    );
  }
});

test('o front NAO deriva "pessoa trancada" — le a flag do banco', () => {
  const limpo = [alunosTab, seletor, modal, hook].map(semComentarios).join('\n');
  // ⚠️ Ancorado em FORMA, nao em vocabulario: `cursos.some(...)` e legitimo e e o que os
  // filtros de professor e de curso da aba usam. O que nao pode e a varredura CONCLUIR
  // sobre `trancado`.
  assert.ok(
    !/cursos\s*\.\s*(every|some|filter)\s*\([^)]{0,80}trancado/.test(limpo),
    'varrer os cursos para concluir se a PESSOA esta trancada cria a segunda regua',
  );
  assert.ok(semComentarios(alunosTab).includes('aluno.trancado'), 'a pessoa sai da flag do banco');
  assert.ok(semComentarios(seletor).includes('p.aluno.trancado'));
});

test('o selo por curso nao repete o da pessoa na mesma linha', () => {
  // Pessoa toda trancada: o selo de cima ja disse. O selo do curso existe para o caso
  // MISTO — trancou Violao e segue ativa em Canto —, em que a pessoa nao e "trancada".
  assert.ok(semComentarios(alunosTab).includes('c.trancado && !aluno.trancado'));
});

test('os tipos do hook carregam as duas flags, com o grao declarado', () => {
  assert.ok(/CursoDoAluno \{[\s\S]*?trancado: boolean;/.test(hook), 'por curso');
  assert.ok(/AlunoElegivel \{[\s\S]*?\n  trancado: boolean;/.test(hook), 'por pessoa');
});
