import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const conciliacao = read('src/components/App/Alunos/ConciliacaoPresencas.tsx');
const sucesso = read('src/components/App/SucessoCliente/PresencaTab.tsx');
const faltas = read('src/components/App/SucessoCliente/hooks/useFaltasPeriodo.ts');
const professor = read('src/components/App/Professores/ModalDetalhesPresenca.tsx');

function exigeMetadadosVisiveis(source, consumidor) {
  for (const campo of ['Denominador', 'Fonte', 'Período', 'regra_versao', 'estado_publicacao']) {
    assert.match(source, new RegExp(campo, 'iu'), `${consumidor}: ${campo} precisa estar visível`);
  }
}

test('Conciliação Presenças expõe o contrato de publicação do recorte', () => {
  exigeMetadadosVisiveis(conciliacao, 'Conciliação Presenças');
  assert.match(conciliacao, /presenca-semantica-v1\.2/u);
  assert.match(conciliacao, /total_alunos_pendentes[\s\S]*total_revisados/u);
});

test('Sucesso do Aluno Presença não publica percentual do legado sem denominador publicável', () => {
  exigeMetadadosVisiveis(sucesso, 'Sucesso do Aluno/Presença');
  assert.match(sucesso, /formatarPercentualPublicavel/u);
  assert.match(sucesso, /Em auditoria/u);
  assert.doesNotMatch(sucesso, /const pct = total > 0 \? Math\.round\(\(presentes \/ total\) \* 100\) : 0/u);
  assert.doesNotMatch(sucesso, /\{resumoSemana\.pct\}%/u);
});

test('hook de faltas transporta denominador e metadados sem fabricar percentual publicável', () => {
  for (const campo of ['denominador', 'fonte', 'periodo_inicio', 'periodo_fim', 'regra_versao', 'estado_publicacao']) {
    assert.match(faltas, new RegExp(campo, 'u'), `useFaltasPeriodo: campo ${campo} ausente`);
  }
  assert.match(faltas, /pct_presenca_publicavel:\s*number\s*\|\s*null/u);
  assert.match(faltas, /\(universoPublicavel\s*\?\s*linhas\s*:\s*\[\]\)\.map/u);
  assert.match(faltas, /denominador:\s*number\s*\|\s*null/u);
  assert.match(faltas, /denominador:\s*universoPublicavel[\s\S]*?\?[^:]+:\s*null/u);
});

test('Professores Detalhes preserva null e explica cobertura insuficiente sem denominador publicável', () => {
  exigeMetadadosVisiveis(professor, 'Professores/Detalhes');
  assert.match(professor, /percentual:\s*number\s*\|\s*null/u);
  assert.match(professor, /formatarPercentualPublicavel/u);
  assert.match(professor, /Cobertura insuficiente/u);
  assert.doesNotMatch(professor, /percentual:\s*v\.total > 0[\s\S]*:\s*0/u);
  assert.doesNotMatch(professor, /\{d\.percentual\.toFixed\(1\)\}%/u);
});
