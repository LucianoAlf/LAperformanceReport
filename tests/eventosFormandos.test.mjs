/**
 * M12 — formandos do recital (pedido do coordenador Marcos, aprovado pelo Alf 30/09).
 *
 * A regra de QUEM passa de ciclo mora no LA Teacher (fn_passagem_de_ciclo +
 * vw_recital_passagem_de_ciclo_v1): 12 anos no ano → Kids→School; 2 anos no ano em
 * Bebês → Preparatória. Do nosso lado o contrato é:
 *  - evento_participacao.formatura/_tipo/_origem marcado SOZINHO pela rotina,
 *    andando junto com evento_recital_sincronizar_v1;
 *  - formatura_origem='manual' é autoridade: a rotina nunca sobrescreve decisão
 *    da coordenação (marcação, desmarcação ou tipo);
 *  - formatura é da PESSOA: aluno com 2 cursos conta uma vez;
 *  - o selo aparece na lista de alunos e na grade, e cada bloco conta quantos
 *    formandos tem (ritual da beca);
 *  - o tipo 'la' (conclusão de curso) está aposentado — não entra em marcação nova.
 *
 * O caminho ponta a ponta (view → rotina → participação → override → escopo) está
 * em tests/sql/eventos_m12_formandos.sql, rodado contra o banco com ROLLBACK.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('supabase/migrations/20260930210000_eventos_m12_formandos.sql', 'utf8');
const hook = readFileSync('src/hooks/useEventos.ts', 'utf8');
const alunos = readFileSync('src/components/App/Eventos/AlunosTab.tsx', 'utf8');
const grade = readFileSync('src/components/App/Eventos/GradeTab.tsx', 'utf8');

/* ─────────── migration: regra e autoridade ─────────── */

test('M12: a fonte da marca é a view canônica do LA Teacher, por pessoa', () => {
  assert.match(sql, /vw_recital_passagem_de_ciclo_v1/, 'a rotina não lê a view do Teacher');
  // distinct por pessoa_chave — aluno com 2 cursos é um formando só.
  assert.match(sql, /group by v\.pessoa_chave, v\.aluno_id/, 'agrupamento por pessoa ausente');
  assert.match(sql, /'kids_para_school' then 'kids'/, 'tipo kids não mapeado');
  assert.match(sql, /'bebes_para_preparatoria' then 'bebes'/, 'tipo bebes não mapeado');
});

test('M12: origem manual nunca é sobrescrita pela rotina automática', () => {
  // upd e del carregam o guarda de 'manual' — sem ele a rotina pisaria na decisão
  // da coordenação a cada rodada (o defeito que a coluna formatura_origem evita).
  assert.match(sql, /formatura_origem is distinct from 'manual'/, 'upd sem guarda de manual');
  assert.match(sql, /coalesce\(p\.formatura_origem, 'auto'\) = 'auto'/, 'del sem guarda de manual');
  assert.match(sql, /'manual'/, 'origem manual não existe na migration');
});

test('M12: o tipo aposentado la sai e o check aceita os dois tipos novos', () => {
  assert.match(sql, /check \(formatura_tipo in \('kids', 'la', 'bebes'\)\)/,
    'check de tipo não abriu espaço para bebes');
  assert.match(sql, /where formatura_tipo = 'la'/, 'a limpeza do legado la sumiu');
  // A RPC manual recusa 'la' — formatura por conclusão não se usa.
  const definir = sql.slice(sql.indexOf('evento_formando_definir_v1'));
  assert.match(definir, /p_tipo not in \('kids', 'bebes'\)/, 'RPC manual aceita tipo inválido');
});

test('M12: a rotina anda junto com o sync e não pode derrubá-lo', () => {
  const chama = sql.indexOf('evento_formandos_sincronizar_v1(p_evento_id)');
  assert.ok(chama > sql.indexOf('evento_recital_sincronizar_v1(p_evento_id bigint)'),
    'a rotina de formandos não foi engatada no sync do recital');
  // exception when others — selo de beca quebrado não pode travar o rider inteiro.
  assert.match(sql, /v_formandos := public\.evento_formandos_sincronizar_v1[\s\S]*?exception when others/,
    'a chamada dos formandos não está protegida');
});

test('M12: as duas RPCs são escopadas e fechadas para anon', () => {
  assert.match(sql, /revoke all on function public\.evento_formandos_sincronizar_v1.*anon/s);
  assert.match(sql, /revoke all on function public\.evento_formando_definir_v1.*anon/s);
  const definir = sql.slice(sql.indexOf('evento_formando_definir_v1'));
  assert.match(definir, /fn_evento_pode_ver\(p_evento_id\)/, 'decisão manual sem escopo');
});

/* ─────────── frontend: selo na lista e na grade, contagem por bloco ─────────── */

test('hook: a participação carrega tipo e origem; a grade recebe o selo por pessoa', () => {
  assert.match(hook, /formatura_tipo, formatura_origem/, 'select da participação sem formatura');
  assert.match(hook, /formatura_tipo: formaturaPorChave\.get\(linha\.pessoa_chave\)/,
    'a grade não amarra o selo pela pessoa_chave');
  assert.match(hook, /evento_formando_definir_v1/, 'wrapper da decisão manual ausente');
});

test('lista de alunos: selo de formando com o tipo e o toggle manual', () => {
  assert.match(alunos, /GraduationCap/, 'ícone de formando ausente');
  assert.match(alunos, /Kids → School/, 'tipo kids sem rótulo');
  assert.match(alunos, /Bebês → Preparatória/, 'tipo bebes sem rótulo');
  // O toggle é o override da coordenação — clicável, e fantasma até o hover para
  // não virar controle morto em 270 linhas.
  assert.match(alunos, /onFormando/, 'a linha não recebe o toggle de formando');
});

test('grade: selo no integrante e contagem de formandos por bloco (por pessoa)', () => {
  assert.match(grade, /formatura_tipo/, 'selo não ligado na linha do integrante');
  // Set<pessoa_chave> — quem toca 2 cursos no mesmo bloco conta uma vez.
  assert.match(grade, /pessoas\.add\(a\.pessoa_chave\)/,
    'a contagem do bloco não deduplica por pessoa');
  assert.match(grade, /formando/, 'rótulo de formandos ausente no cabeçalho do bloco');
});
