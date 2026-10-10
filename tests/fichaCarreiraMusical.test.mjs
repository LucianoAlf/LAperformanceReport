import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = path.join(root, 'supabase', 'functions', 'ficha-tecnica', 'index.ts');
const htmlPath = path.join(root, 'public', 'ficha-tecnica', 'index.html');
const migrationTabelaPath = path.join(root, 'supabase', 'migrations', '20261009210000_ficha_carreira_musical.sql');
const migrationMikePath = path.join(root, 'supabase', 'migrations', '20261009210100_mike_professores_carreira_v1.sql');
const rollbackTabelaPath = path.join(root, 'supabase', 'rollbacks', '20261009210000_ficha_carreira_musical_ROLLBACK.sql');
const rollbackMikePath = path.join(root, 'supabase', 'rollbacks', '20261009210100_mike_professores_carreira_v1_ROLLBACK.sql');
const hookPath = path.join(root, 'src', 'hooks', 'useFichaColaborador.ts');
const fichaPath = path.join(root, 'src', 'components', 'App', 'Time', 'FichaColaborador.tsx');
const fichaLinkPath = path.join(root, 'src', 'lib', 'fichaLink.ts');
const typesBancoPath = path.join(root, 'src', 'types', 'database.types.ts');

const edgeSource = fs.readFileSync(edgePath, 'utf8');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');
const migrationTabela = fs.readFileSync(migrationTabelaPath, 'utf8');
const migrationMike = fs.readFileSync(migrationMikePath, 'utf8');

// Ids canônicos do bloco — contrato entre edge, formulário, app e RPC do Mike.
const IDS_CARREIRA = [
  'bio_curta',
  'instrumentos_nivel',
  'estilos',
  'referencias',
  'trajetoria',
  'formacao',
  'gosta_ensinar',
  'dica_mestre_1',
  'dica_mestre_2',
  'dica_mestre_3',
  'instagram',
  'youtube',
  'outra_rede',
  'topa_video_audio',
];
const OPCOES_TOPA = ['sim_video_audio', 'so_video', 'so_audio', 'nao_topa'];

function extrairCamposDaEdge() {
  const bloco = edgeSource.slice(
    edgeSource.indexOf('const CARREIRA_CAMPOS'),
    edgeSource.indexOf('// ----------', edgeSource.indexOf('const CARREIRA_CAMPOS')),
  );
  const campos = [];
  const regex = /\{\s*id:\s*'([^']+)',\s*grupo:\s*'([^']+)',\s*tipo:\s*'([^']+)',\s*label:\s*'([^']+)'/g;
  let m;
  while ((m = regex.exec(bloco)) !== null) {
    campos.push({ id: m[1], grupo: m[2], tipo: m[3], label: m[4] });
  }
  return campos;
}

async function importarPerfilTextos() {
  const source = fs.readFileSync(path.join(root, 'src', 'data', 'perfilTextos.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: 'perfilTextos.ts',
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('edge: bloco Minha carreira na música existe com todos os campos do pedido', () => {
  const campos = extrairCamposDaEdge();
  assert.deepEqual(campos.map((c) => c.id), IDS_CARREIRA);
  assert.equal(campos.filter((c) => c.grupo === 'Dica do Mestre').length, 3);
  assert.equal(campos.filter((c) => c.grupo === 'Você como músico(a)').length, 7);
  assert.equal(campos.filter((c) => c.grupo === 'Redes sociais e mídias').length, 4);
  assert.equal(campos.filter((c) => c.tipo === 'escolha').length, 1);
});

test('edge: consentimento de vídeo/áudio só aceita os 4 ids canônicos', () => {
  for (const opcao of OPCOES_TOPA) {
    assert.match(edgeSource, new RegExp(`id:\\s*'${opcao}'`));
  }
  assert.match(edgeSource, /campo\.tipo === 'escolha'[\s\S]*?some\(\(o\) => o\.id === valor\)/);
  // campos de texto continuam limitados a 2000 caracteres, igual ao Rider
  assert.match(edgeSource, /valor\.slice\(0, 2000\)/);
});

test('edge: resolver expõe o bloco só para PROFESSOR e a action carreira grava com histórico', () => {
  assert.match(edgeSource, /const mostraCarreira = cargo === 'PROFESSOR';/);
  assert.match(edgeSource, /mostra_carreira: mostraCarreira/);
  assert.match(edgeSource, /carreira_campos: mostraCarreira \? CARREIRA_CAMPOS : \[\]/);
  assert.match(edgeSource, /from\('colaborador_carreira'\)/);
  assert.match(edgeSource, /action === 'carreira' && req\.method === 'POST'/);
  assert.match(edgeSource, /cargo !== 'PROFESSOR'[\s\S]*?carreira disponível apenas para professores/);
  assert.match(edgeSource, /from\('colaborador_carreira_versoes'\)\.insert/);
  // upsert idempotente pela mesma chave do Rider
  assert.match(edgeSource, /onConflict: 'colaborador_id'/);
});

test('migration da tabela: mesmo desenho do Rider — RLS, leitura dono/admin/unidade, grant Sol', () => {
  assert.match(migrationTabela, /create table if not exists public\.colaborador_carreira \(/);
  assert.match(migrationTabela, /create table if not exists public\.colaborador_carreira_versoes/);
  assert.match(migrationTabela, /references public\.colaboradores\(id\) on delete cascade/);
  assert.match(migrationTabela, /colaborador_id integer not null unique/);
  assert.match(migrationTabela, /enable row level security/);
  assert.match(migrationTabela, /create policy carreira_leitura/);
  assert.match(migrationTabela, /u\.perfil = 'unidade'[\s\S]*?u\.unidade_id = c\.unidade_id/);
  assert.match(migrationTabela, /create policy carreira_escrita_dono/);
  assert.match(migrationTabela, /grant select on public\.colaborador_carreira to sol_acesso_restrito/);
  assert.ok(fs.existsSync(rollbackTabelaPath));
  const rollback = fs.readFileSync(rollbackTabelaPath, 'utf8');
  assert.match(rollback, /drop table if exists public\.colaborador_carreira/);
  assert.match(rollback, /drop table if exists public\.colaborador_carreira_versoes/);
  assert.match(rollback, /revoke select on public\.colaborador_carreira from sol_acesso_restrito/);
});

test('migration mike: gate do crachá, sem PII e sem perfil comportamental', () => {
  assert.match(migrationMike, /create or replace function public\.mike_professores_carreira_v1\(\)/);
  assert.match(migrationMike, /session_user::text not in \('mike_mcp','postgres','supabase_admin'\)/);
  assert.match(migrationMike, /stable security definer/);
  // nenhum dado de contato nem do perfil comportamental pode vazar na fachada —
  // a checagem roda no CORPO SQL (linhas de comentário citam os termos de propósito)
  const corpo = migrationMike.replace(/^--.*$/gm, '');
  assert.doesNotMatch(corpo, /c\.whatsapp/i);
  assert.doesNotMatch(corpo, /c\.email/i);
  assert.doesNotMatch(corpo, /temperamento/i);
  assert.doesNotMatch(corpo, /valorizacao/i);
  assert.doesNotMatch(corpo, /valores_codinome|valores_primario|valores_contagem/i);
  // escopo: só professores ativos do departamento Professores
  assert.match(migrationMike, /lower\(btrim\(coalesce\(c\.departamento, ''\)\)\) = 'professores'/);
  assert.match(migrationMike, /lower\(btrim\(coalesce\(c\.situacao, 'ativo'\)\)\) = 'ativo'/);
  // ACL travada: nem anon, nem authenticated — só mike_mcp e service_role
  assert.match(migrationMike, /revoke all on function public\.mike_professores_carreira_v1\(\) from public, anon, authenticated/);
  assert.match(migrationMike, /grant execute on function public\.mike_professores_carreira_v1\(\) to mike_mcp, service_role/);
  // quem ainda não preencheu aparece como carreira_preenchida=false (sem 2ª consulta)
  assert.match(migrationMike, /'carreira_preenchida', preenchida/);
  assert.match(migrationMike, /'dica_mestre_temas', jsonb_strip_nulls/);
  assert.match(migrationMike, /'ressalvas', jsonb_build_array/);
  const rollback = fs.readFileSync(rollbackMikePath, 'utf8');
  assert.match(rollback, /drop function if exists public\.mike_professores_carreira_v1\(\)/);
});

test('formulário: quem já respondeu cai direto no bloco novo pelo mesmo link', () => {
  assert.match(htmlSource, /id="screen-carreira"/);
  assert.match(htmlSource, /<h1>Minha carreira na música<\/h1>/);
  assert.match(htmlSource, /if\(dados\.diagnostico_feito\)\{\s*if\(dados\.mostra_carreira\) irParaCarreira\(\);\s*else showFim\(\);\s*return;\s*\}/);
  // fluxo novo: rider salva e encaminha pra carreira quando professor
  assert.match(htmlSource, /if\(dados\.mostra_carreira\) irParaCarreira\(\);\s*else showFim\(\);/);
  // salvar chama a action da edge com o token
  assert.match(htmlSource, /action=carreira&token=\$\{encodeURIComponent\(TOKEN\)\}/);
  // consentimento em radio com id canônico
  assert.match(htmlSource, /input\.name = campo\.id;/);
  assert.match(htmlSource, /respostas\[input\.name\] = input\.value;/);
  // tela de conclusão mantém os dois blocos sempre editáveis
  assert.match(htmlSource, /id="btnEditarCarreira"[\s\S]*?Editar minha carreira na música/);
  assert.match(htmlSource, /btnEditarCarreira"\)\.style\.display = dados\?\.mostra_carreira \? "" : "none";/);
  // transparência: o texto avisa que o conteúdo pode virar público
  assert.match(htmlSource, /Só escreva o que você toparia ver publicado/);
});

test('app: card na ficha, hook lê a tabela nova e tipos registram a tabela', () => {
  const hook = fs.readFileSync(hookPath, 'utf8');
  assert.match(hook, /from\('colaborador_carreira'\)/);
  assert.match(hook, /carreira_respostas: carreira\?\.respostas \?\? null/);

  const ficha = fs.readFileSync(fichaPath, 'utf8');
  assert.match(ficha, /function CarreiraCard\(/);
  assert.match(ficha, /Minha carreira na música · escrito por \{nome\}/);
  // bloco exclusivo do departamento Professores (mesma régua da edge)
  assert.match(ficha, /\(ficha\.departamento \?\? ''\)\.trim\(\)\.toLowerCase\(\) === 'professores'/);
  // escolha canônica vira rótulo legível na ficha
  assert.match(ficha, /rotuloTopaVideoAudio/);

  const tipos = fs.readFileSync(typesBancoPath, 'utf8');
  assert.match(tipos, /colaborador_carreira: \{/);
  assert.match(tipos, /colaborador_carreira_versoes: \{/);
});

test('app: link reenviável para quem já respondeu, com mensagem do bloco novo', async () => {
  const ficha = fs.readFileSync(fichaPath, 'utf8');
  assert.match(ficha, /Reenviar no WhatsApp/);
  assert.match(ficha, /montarLinkWhatsAppFichaCarreira/);

  const source = fs.readFileSync(fichaLinkPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: 'fichaLink.ts',
  }).outputText;
  const module = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  const link = 'https://la-performance-report.vercel.app/ficha-tecnica/?t=fabio-abc123';
  const mensagem = module.montarMensagemFichaCarreira('Fábio', link);
  assert.ok(mensagem.includes('Minha carreira na música'));
  assert.ok(mensagem.endsWith(link));
  const url = module.montarLinkWhatsAppFichaCarreira('Fábio', '5521962768647', link);
  assert.equal(url, `https://wa.me/5521962768647?text=${encodeURIComponent(mensagem)}`);
  assert.equal(module.montarLinkWhatsAppFichaCarreira('Fábio', null, link), null);
  // mensagem original da 1ª ficha permanece intacta
  const primeira = module.montarMensagemFicha('Ana', link);
  assert.ok(primeira.startsWith('Oi, Ana! Tudo bem? Queria te pedir pra preencher a Ficha Técnica da LA.'));
});

test('paridade: CARREIRA_CAMPOS do app é cópia fiel da edge (ids, grupos, tipos, labels)', async () => {
  const module = await importarPerfilTextos();
  const doApp = module.CARREIRA_CAMPOS;
  const daEdge = extrairCamposDaEdge();

  assert.deepEqual(doApp.map((c) => c.id), daEdge.map((c) => c.id));
  for (const campoApp of doApp) {
    const campoEdge = daEdge.find((c) => c.id === campoApp.id);
    assert.ok(campoEdge, `campo ${campoApp.id} existe na edge`);
    assert.equal(campoApp.grupo, campoEdge.grupo, `grupo divergente em ${campoApp.id}`);
    assert.equal(campoApp.tipo, campoEdge.tipo, `tipo divergente em ${campoApp.id}`);
    assert.equal(campoApp.label, campoEdge.label, `label divergente em ${campoApp.id}`);
  }
  // rótulo legível do consentimento cobre os 4 ids canônicos
  for (const opcao of OPCOES_TOPA) {
    assert.ok(module.rotuloTopaVideoAudio(opcao), `sem rótulo para ${opcao}`);
  }
  assert.equal(module.rotuloTopaVideoAudio(null), null);
  assert.equal(module.rotuloTopaVideoAudio('id_inventado'), null);
});
