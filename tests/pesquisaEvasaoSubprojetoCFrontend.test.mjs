import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  types: resolve(root, 'src/components/App/SucessoCliente/pesquisaEvasao.types.ts'),
  hook: resolve(root, 'src/components/App/SucessoCliente/hooks/useClassificacaoEvasao.ts'),
  classificacao: resolve(root, 'src/components/App/SucessoCliente/ClassificacaoPesquisaEvasao.tsx'),
  acoes: resolve(root, 'src/components/App/SucessoCliente/AcoesPesquisaEvasao.tsx'),
};
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('tipos fecham taxonomia, relacao, acoes e desfechos', () => {
  const types = read(paths.types);
  assert.match(types, /PESQUISA_EVASAO_CATEGORIAS/);
  for (const value of [
    'financeiro', 'tempo_horario', 'saude', 'desanimo',
    'pedagogico_professor', 'atendimento_experiencia', 'mudanca_endereco',
    'familia_estudos_trabalho', 'outro', 'inconclusivo', 'resposta_invalida',
    'confirmou_parcialmente', 'sem_motivo_anterior',
    'tentativa_retencao', 'solucao_oferecida',
    'recuperou', 'prometeu_voltar', 'confirmou_saida',
  ]) assert.match(types, new RegExp(`['"]${value}['"]`));
});

test('frontend de C usa somente RPCs governadas', () => {
  const source = `${read(paths.hook)}\n${read(paths.classificacao)}\n${read(paths.acoes)}`;
  for (const rpc of [
    'obter_dados_classificacao_pesquisa_evasao_v1',
    'registrar_classificacao_pesquisa_evasao_v1',
    'registrar_acao_pesquisa_evasao_v1',
    'concluir_acao_pesquisa_evasao_v1',
    'registrar_desfecho_pesquisa_evasao_v1',
  ]) assert.match(source, new RegExp(rpc));
  assert.doesNotMatch(
    source,
    /\.from\(['"](?:pesquisa_evasao_classificacoes|pesquisa_evasao_desfechos|aluno_acoes)['"]\)/,
  );
});

test('hook recarrega apos sucesso e nao faz atualizacao otimista', () => {
  const hook = read(paths.hook);
  assert.match(hook, /await carregar\(\)/);
  assert.match(hook, /if \(error\) return \{ ok: false as const, erro: error \}/);
  assert.doesNotMatch(hook, /setDados\([^)]*entrada/);
});
