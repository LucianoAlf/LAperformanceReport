import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const faltasHook = read('../src/components/App/SucessoCliente/hooks/useFaltasPeriodo.ts');
const presencaTab = read('../src/components/App/SucessoCliente/PresencaTab.tsx');
const modalProfessor = read('../src/components/App/Professores/ModalDetalhesPresenca.tsx');
const tabProfessores = read('../src/components/GestaoMensal/TabProfessoresNew.tsx');
const agregador = read('../src/lib/professoresKpisCanonicos.ts');
const interfacesSql = read('../supabase/migrations/20260827031400_presenca_interfaces_consulta_v2.sql');
const modalSucesso = read('../src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx');
const farmer = read('../src/components/App/Administrativo/PainelFarmer/hooks/useSucessoAlunoAlertas.ts');

test('RPC regular usa ocorrência v2 e experimental permanece isolada', () => {
  assert.match(interfacesSql, /get_presenca_ocorrencias_periodo_v2[\s\S]*vw_presenca_ocorrencia_canonica_v2/iu);
  const regular = interfacesSql.split(/create or replace function public\.get_presenca_experimental_aluno_periodo_v1/iu)[0];
  assert.doesNotMatch(regular, /\bfrom\s+public\.aluno_presenca\b/iu);
  assert.match(interfacesSql, /get_presenca_experimental_aluno_periodo_v1[\s\S]*categoria[^\n]*experimental/iu);
  assert.match(interfacesSql, /get_user_unidade_ids\(\)/u);
  assert.match(interfacesSql, /revoke all[\s\S]*from public, anon, authenticated, service_role/iu);
  assert.doesNotMatch(interfacesSql, /grant execute[\s\S]*\bto\s+anon\b/iu);
});

test('rankings e detalhes usam somente RPCs v2 publicaveis', () => {
  assert.match(faltasHook, /rpc\(['"]get_faltas_periodo_v2['"]/u);
  assert.doesNotMatch(faltasHook, /rpc\(['"]get_faltas_periodo['"]/u);

  assert.match(presencaTab, /rpc\(['"]get_presenca_ocorrencias_periodo_v2['"]/u);
  assert.match(presencaTab, /rpc\(['"]get_presenca_experimental_aluno_periodo_v1['"]/u);
  assert.doesNotMatch(presencaTab, /\.from\(['"]aluno_presenca['"]\)/u);

  assert.match(modalProfessor, /rpc\(['"]get_presenca_ocorrencias_periodo_v2['"]/u);
  assert.doesNotMatch(modalProfessor, /get_presenca_por_aluno_professor/u);

  assert.match(modalSucesso, /get_presenca_ocorrencias_periodo_v2/u);
  assert.doesNotMatch(modalSucesso, /\.from\(['"]aluno_presenca['"]\)/u);
  assert.doesNotMatch(modalSucesso, /percentual_presenca\s*\|\|\s*0/iu);
  assert.match(farmer, /\.from\(['"]vw_aluno_sucesso_lista['"]\)/u);
  assert.doesNotMatch(farmer, /percentual_presenca:\s*[^\n]+\|\|\s*0/iu);
});

test('interfaces publicam periodo, universo, regra e equacao sem transformar nulo em zero', () => {
  for (const source of [faltasHook, presencaTab, modalProfessor, tabProfessores]) {
    assert.match(source, /estado_publicacao/iu);
    assert.match(source, /regra_versao/iu);
  }

  assert.match(tabProfessores, /presenca_eventos_confirmados/u);
  assert.match(tabProfessores, /presenca_eventos_incertos/u);
  assert.match(tabProfessores, /presentes\s*\/\s*eventos confirmados/iu);
  assert.match(tabProfessores, /Sem base/iu);
  assert.match(presencaTab, /presentes\s*\/\s*eventos confirmados/iu);
  assert.doesNotMatch(faltasHook, /pct_presenca_publicavel:\s*Number\([^)]*\)\s*\|\|\s*0/iu);
});

test('consolidado de professores fecha se qualquer parcela do universo estiver em auditoria', () => {
  assert.match(
    agregador,
    /presencaPublicavel\s*=\s*grupo\.length\s*>\s*0\s*&&\s*grupo\.every\(\(linha\)\s*=>\s*linha\.presenca_publicavel\)/u,
  );
  assert.match(
    agregador,
    /presencaPublicavelGlobal\s*=\s*linhas\.length\s*>\s*0\s*&&\s*linhas\.every\(\(linha\)\s*=>\s*linha\.presenca_publicavel\)/u,
  );
});

test('erro de RPC apaga publicacao anterior e ocorrencia incerta bloqueia o universo completo', () => {
  assert.match(faltasHook, /setFaltas\(\[\]\);\s*setPublicacao\(criarPublicacaoFaltasEmAuditoria\(dataInicio, dataFim\)\)/u);
  assert.doesNotMatch(faltasHook, /setPublicacao\(atual\s*=>/u);

  assert.doesNotMatch(presencaTab, /\.filter\(ocorrenciaTerminal\)/u);
  assert.match(presencaTab, /const linhas = filtroData \? presencasDoDia : presencas;/u);
  assert.match(presencaTab, /avaliarPublicacaoOcorrencias\(\s*linhas,/u);
  assert.match(presencaTab, /denominador === null \? 'Em auditoria'/u);
});
