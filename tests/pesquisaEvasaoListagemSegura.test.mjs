import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql',
);
const tabPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx',
);
const typesPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/pesquisaEvasao.types.ts',
);

const sql = readFileSync(migrationPath, 'utf8');
const tab = readFileSync(tabPath, 'utf8');
const types = readFileSync(typesPath, 'utf8');

function extrairFuncao(nome) {
  const inicio = sql.search(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nome}\\s*\\(`, 'i'),
  );
  if (inicio < 0) return '';

  const proxima = sql.slice(inicio + 1).search(
    /\ncreate\s+or\s+replace\s+function\s+public\./i,
  );
  return proxima < 0
    ? sql.slice(inicio)
    : sql.slice(inicio, inicio + 1 + proxima);
}

function semComentarios(source) {
  return source
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

test('RPC v2 possui assinatura versionada e retorno paginado completo', () => {
  const v2 = extrairFuncao('listar_evadidos_para_pesquisa_v2');

  assert.match(
    v2,
    /listar_evadidos_para_pesquisa_v2\s*\(\s*p_unidade_id\s+uuid\s*,\s*p_limite\s+integer\s*,\s*p_offset\s+integer\s*,\s*p_status\s+varchar\s*,\s*p_ano\s+integer\s*,\s*p_mes\s+integer\s*,\s*p_busca\s+text\s*\)/i,
  );

  for (const campo of [
    'total_count bigint',
    'evasao_id integer',
    'aluno_id integer',
    'nome text',
    'telefone text',
    'curso text',
    'professor text',
    'tempo_meses integer',
    'data_evasao date',
    'motivo_catalogado text',
    'motivo_legado text',
    'pesquisa_producao_status text',
    'pesquisa_producao_id uuid',
    'resposta_producao_texto text',
    'resposta_producao_audio_url text',
    'resposta_producao_tipo text',
    'respondido_producao_em timestamptz',
    'is_menor boolean',
    'responsavel_nome text',
    'publico_tipo text',
    'bloqueio_codigo text',
    'elegivel_envio boolean',
    'elegibilidade_regra text',
    'possui_historico_teste boolean',
    'quantidade_testes bigint',
    'ultimo_teste_em timestamptz',
  ]) {
    assert.match(
      v2,
      new RegExp(campo.replace(/\s+/g, '\\s+'), 'i'),
      `campo ausente no retorno v2: ${campo}`,
    );
  }
});

test('v2 valida usuario interno e filtra antes de contar e paginar', () => {
  const v2 = extrairFuncao('listar_evadidos_para_pesquisa_v2');
  const baseInicio = v2.search(/base_autorizada\s+as\s*\(/i);
  const identidadeInterna = v2.search(
    /fn_pesquisa_evasao_usuario_interno_ativo\s*\(\s*\)/i,
  );
  const contagem = v2.search(/count\s*\(\s*\*\s*\)\s+over\s*\(\s*\)/i);
  const limite = v2.search(/\blimit\s+least\s*\(/i);

  assert.ok(baseInicio >= 0, 'falta CTE de linhas autorizadas');
  assert.ok(identidadeInterna > baseInicio, 'usuario interno deve ser validado dentro da base');
  assert.ok(contagem > identidadeInterna, 'count deve refletir os mesmos filtros internos');
  assert.ok(limite > contagem, 'paginacao deve ocorrer depois da contagem');
  assert.match(v2, /p_unidade_id\s+is\s+null\s+or\s+m\.unidade_id\s*=\s*p_unidade_id/i);
  assert.match(v2, /p_ano\s+is\s+null[\s\S]*extract\s*\(\s*year\s+from\s+m\.data/i);
  assert.match(v2, /p_mes\s+is\s+null[\s\S]*extract\s*\(\s*month\s+from\s+m\.data/i);
});

test('busca ocorre no servidor antes do count e da paginacao', () => {
  const v2 = extrairFuncao('listar_evadidos_para_pesquisa_v2');
  const busca = v2.search(/nullif\s*\(\s*btrim\s*\(\s*p_busca\s*\)\s*,\s*''\s*\)\s+is\s+null/i);
  const contagem = v2.search(/count\s*\(\s*\*\s*\)\s+over\s*\(\s*\)/i);
  const limite = v2.search(/\blimit\s+least\s*\(/i);

  assert.ok(busca >= 0, 'p_busca precisa filtrar dentro da RPC');
  assert.ok(contagem > busca, 'total_count precisa refletir p_busca');
  assert.ok(limite > contagem, 'busca e contagem devem preceder a paginacao');
  assert.match(v2, /\bilike\s*\(\s*['"]%['"]\s*\|\|\s*btrim\s*\(\s*p_busca\s*\)\s*\|\|\s*['"]%['"]\s*\)/i);
  assert.match(
    tab,
    /p_busca:\s*(?:filtroBusca\.trim\(\)|consulta\.filtroBusca)\s*\|\|\s*null/,
  );
  assert.match(tab, /filtroServidorChave[\s\S]*filtroBusca\.trim\(\)/);
  assert.doesNotMatch(
    tab,
    /evadidos\.filter\s*\(/,
    'busca client-side quebra total e range da paginacao',
  );
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.listar_evadidos_para_pesquisa_v2\s*\(\s*uuid\s*,\s*integer\s*,\s*integer\s*,\s*varchar\s*,\s*integer\s*,\s*integer\s*,\s*text\s*\)/i,
  );
});

test('producao e testes sao separados sem multiplicar a movimentacao', () => {
  const v2 = semComentarios(extrairFuncao('listar_evadidos_para_pesquisa_v2'));

  assert.match(
    v2,
    /where\s+pe0\.evasao_id\s*=\s*m\.id[\s\S]*pe0\.modo_teste\s*=\s*false[\s\S]*limit\s+1/i,
  );
  assert.match(
    v2,
    /count\s*\(\s*\*\s*\)\s+filter\s*\(\s*where\s+pe_t\.modo_teste\s*=\s*true\s*\)/i,
  );
  assert.match(v2, /producao\.status[\s\S]*as\s+pesquisa_producao_status/i);
  assert.match(v2, /producao\.resposta_texto[\s\S]*as\s+resposta_producao_texto/i);
  assert.doesNotMatch(
    v2,
    /join\s+public\.pesquisa_evasao\s+pe\s+on\s+pe\.evasao_id\s*=\s*m\.id/i,
    'join direto em todos os testes duplicaria a linha principal',
  );
});

test('bloqueios preservam sem telefone, motivo legado e flag interna explicita', () => {
  const v2 = semComentarios(extrairFuncao('listar_evadidos_para_pesquisa_v2'));

  for (const codigo of [
    'sem_aluno',
    'sem_telefone',
    'telefone_invalido',
    'motivo_nao_catalogado',
    'publico_interno',
    'pesquisa_aberta_no_mesmo_numero',
  ]) {
    assert.match(v2, new RegExp(`['"]${codigo}['"]`, 'i'));
  }

  assert.match(v2, /ms\.nome[\s\S]*as\s+motivo_catalogado/i);
  assert.match(v2, /m\.motivo[\s\S]*as\s+motivo_legado/i);
  assert.doesNotMatch(
    v2,
    /(?:where|and)\s+coalesce\s*\(\s*m\.telefone_snapshot\s*,\s*a\.whatsapp\s*,\s*a\.telefone\s*\)\s+is\s+not\s+null/i,
    'linhas sem telefone nao podem sumir da listagem v2',
  );
  assert.match(v2, /public\.pesquisa_evasao_publicos_internos/i);
  assert.match(v2, /publico_interno\.ativo\s*=\s*true/i);
  assert.match(v2, /publico_interno\.tipo/i);
  assert.doesNotMatch(v2, /a\.tipo_aluno/i);
  assert.doesNotMatch(
    v2,
    /(?:a|m)\.(?:nome|aluno_nome)\s+(?:ilike|similar\s+to|~)/i,
    'publico interno nao pode ser inferido por nome',
  );
});

test('publico interno ativo tem precedencia sobre bloqueios cadastrais depois de sem aluno', () => {
  const v2 = semComentarios(extrairFuncao('listar_evadidos_para_pesquisa_v2'));
  const bloqueios = v2.match(
    /case\s+when\s+aluno_id\s+is\s+null[\s\S]*?end::text\s+as\s+bloqueio_codigo/i,
  )?.[0] ?? '';

  const semAluno = bloqueios.indexOf("'sem_aluno'");
  const publicoInterno = bloqueios.indexOf("'publico_interno'");
  const semTelefone = bloqueios.indexOf("'sem_telefone'");
  const telefoneInvalido = bloqueios.indexOf("'telefone_invalido'");
  const motivoNaoCatalogado = bloqueios.indexOf("'motivo_nao_catalogado'");

  assert.ok(semAluno >= 0, 'falta hard block sem_aluno');
  assert.ok(
    semAluno < publicoInterno
      && publicoInterno < semTelefone
      && semTelefone < telefoneInvalido
      && telefoneInvalido < motivoNaoCatalogado,
    'pessoa interna identificada nao deve receber orientacao de correcao cadastral',
  );
});

test('telefone produtivo usa somente o snapshot imutavel da movimentacao', () => {
  const v2 = semComentarios(extrairFuncao('listar_evadidos_para_pesquisa_v2'));
  const criar = semComentarios(extrairFuncao('criar_pesquisa_evasao'));

  for (const source of [v2, criar]) {
    assert.match(source, /m\.telefone_snapshot/i);
    assert.doesNotMatch(
      source,
      /\ba\.(?:whatsapp|telefone)\b/i,
      'cadastro atual nao pode autorizar nem fornecer destino produtivo',
    );
  }
  assert.doesNotMatch(
    sql,
    /coalesce\s*\(\s*m\.telefone_snapshot\s*,\s*a\.whatsapp\s*,\s*a\.telefone\s*\)/i,
    'nenhuma RPC desta migration pode reintroduzir o fallback divergente da Edge',
  );
});

test('telefones local e E164 usam a mesma chave canonica nos dois lados', () => {
  const v2 = semComentarios(extrairFuncao('listar_evadidos_para_pesquisa_v2'));

  assert.match(
    v2,
    /when\s+telefone_digitos\s*~\s*['"]\^\[0-9\]\{10,11\}\$['"]\s+then\s+['"]55['"]\s*\|\|\s*telefone_digitos/i,
    'telefone da linha precisa ganhar 55 quando vier local',
  );
  assert.match(
    v2,
    /regexp_replace\s*\(\s*pe_aberta\.telefone_destino_snapshot[\s\S]*as\s+telefone_aberta_digitos/i,
    'telefone da pesquisa aberta precisa ser normalizado separadamente',
  );
  assert.match(
    v2,
    /when\s+telefone_aberta_digitos\s*~\s*['"]\^\[0-9\]\{10,11\}\$['"]\s+then\s+['"]55['"]\s*\|\|\s*telefone_aberta_digitos/i,
    'telefone aberto local precisa ganhar 55',
  );
  assert.match(
    v2,
    /telefone_aberta_normalizado\s*=\s*classificada\.telefone_normalizado/i,
    'comparacao precisa usar as duas chaves canonicas',
  );
});

test('Subprojeto A nao decide timing D mais 3', () => {
  const v2 = semComentarios(extrairFuncao('listar_evadidos_para_pesquisa_v2'));
  const podeEnviar = semComentarios(extrairFuncao('pode_enviar_pesquisa_evasao'));

  for (const source of [v2, podeEnviar, tab]) {
    assert.doesNotMatch(source, /aguardar_prazo_minimo/i);
    assert.doesNotMatch(source, /v_dias_desde_evasao/i);
  }
  assert.doesNotMatch(v2, /current_date\s*-\s*data_evasao\s*(?:>=|<)\s*3/i);
  assert.doesNotMatch(
    podeEnviar,
    /current_date\s*-\s*v_data_evasao|v_dias_desde_evasao\s*>=\s*3/i,
  );
  assert.match(
    v2,
    /bloqueio_codigo\s+is\s+null[\s\S]*pesquisa_producao_status\s+in\s*\(/i,
    'producao continua exigindo ausencia de hard block e status enviavel',
  );
});

test('historico retorna somente testes para usuario interno ativo', () => {
  const historico = extrairFuncao('listar_pesquisas_evasao_teste_v1');

  assert.match(
    historico,
    /listar_pesquisas_evasao_teste_v1\s*\(\s*p_evasao_id\s+integer\s*\)/i,
  );
  for (const campo of [
    'pesquisa_id uuid',
    'modo_teste boolean',
    'envio_status text',
    'resposta_status text',
    'enviado_em timestamptz',
    'respondido_em timestamptz',
  ]) {
    assert.match(historico, new RegExp(campo.replace(/\s+/g, '\\s+'), 'i'));
  }
  assert.match(historico, /pe\.modo_teste\s*=\s*true/i);
  assert.match(historico, /m\.id\s*=\s*p_evasao_id/i);
  assert.match(
    historico,
    /fn_pesquisa_evasao_usuario_interno_ativo\s*\(\s*\)/i,
  );
  assert.doesNotMatch(historico, /sucesso_aluno\.evasao|usuario_perfis/i);
  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.listar_pesquisas_evasao_teste_v1\s*\(\s*integer\s*\)[\s\S]*from\s+public\s*,\s*anon/i,
  );
});

test('frontend usa pagina de 50, total, range e reset de filtros', () => {
  assert.match(tab, /const\s+TAMANHO_PAGINA\s*=\s*50/);
  assert.match(tab, /listar_evadidos_para_pesquisa_v2/);
  assert.match(tab, /p_limite:\s*TAMANHO_PAGINA/);
  assert.match(
    tab,
    /p_offset:\s*\((?:pagina|consulta\.pagina)\s*-\s*1\)\s*\*\s*TAMANHO_PAGINA/,
  );
  assert.doesNotMatch(tab, /p_limite:\s*100/);
  assert.match(tab, /total_count/);
  assert.match(tab, /Mostrando\s*\{/);
  assert.match(tab, /P[aá]gina anterior/i);
  assert.match(tab, /Pr[oó]xima p[aá]gina/i);
  assert.match(
    tab,
    /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{\s*setPagina\s*\(\s*1\s*\)/,
    'troca de filtro deve voltar para a primeira pagina',
  );
});

test('pagina vazia recua sem publicar total zero e refaz pela sequencia atual', () => {
  const carregar = tab.match(
    /const\s+carregarDados\s*=\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?(?=\n\s*const\s+previsualizarPesquisa\s*=)/,
  )?.[0] ?? '';
  const guardaPagina = carregar.search(
    /if\s*\(\s*linhas\.length\s*===\s*0\s*&&\s*consulta\.pagina\s*>\s*1\s*\)/,
  );
  const invalidaSequencia = carregar.indexOf(
    'carregamentoDadosSequenciaRef.current',
    guardaPagina,
  );
  const recuaPagina = carregar.indexOf('setPagina', guardaPagina);
  const retorna = carregar.indexOf('return;', guardaPagina);
  const publicaTotal = carregar.indexOf('setTotalRegistros');

  assert.ok(guardaPagina >= 0, 'pagina vazia acima da primeira precisa recuar');
  assert.ok(invalidaSequencia > guardaPagina && invalidaSequencia < retorna);
  assert.ok(recuaPagina > guardaPagina && recuaPagina < retorna);
  assert.ok(
    publicaTotal > retorna,
    'total da pagina anterior deve sobreviver ate a consulta de recuo terminar',
  );
  assert.match(
    carregar,
    /setPagina\s*\(\s*consulta\.pagina\s*-\s*1\s*\)/,
    'mudanca de pagina deve acionar novamente o efeito de consulta',
  );
});

test('Realtime acompanha a chave completa da consulta atual', () => {
  const efeitoRealtime = tab.match(
    /\/\/ Realtime:[\s\S]*?(?=\n\s*const\s+carregarDados\s*=)/,
  )?.[0] ?? '';

  assert.match(efeitoRealtime, /if\s*\(\s*!confirmandoRef\.current\s*\)\s*carregarDados\s*\(\s*\)/);
  assert.match(
    efeitoRealtime,
    /\}\s*,\s*\[\s*filtroServidorChave\s*,\s*pagina\s*\]\s*\)/,
    'a busca tambem precisa renovar o closure usado pelo callback Realtime',
  );
});

test('somente a consulta mais recente pode atualizar dados e loading', () => {
  const carregar = tab.match(
    /const\s+carregarDados\s*=\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?(?=\n\s*const\s+previsualizarPesquisa\s*=)/,
  )?.[0] ?? '';

  assert.match(tab, /const\s+carregamentoDadosSequenciaRef\s*=\s*useRef\s*\(\s*0\s*\)/);
  assert.match(tab, /const\s+consultaDadosAtualRef\s*=\s*useRef\s*\(/);
  assert.match(tab, /consultaDadosAtualRef\.current\s*=\s*\{[\s\S]*filtroBusca:\s*filtroBusca\.trim\(\)/);
  assert.match(
    carregar,
    /const\s+sequencia\s*=\s*\+\+carregamentoDadosSequenciaRef\.current/,
  );
  assert.match(carregar, /const\s+consulta\s*=\s*consultaDadosAtualRef\.current/);
  assert.match(
    carregar,
    /const\s+requisicaoAindaAtual\s*=\s*\(\s*\)\s*=>[\s\S]*sequencia\s*===\s*carregamentoDadosSequenciaRef\.current[\s\S]*consulta\.chave\s*===\s*consultaDadosAtualRef\.current\.chave/,
    'alem da sequencia, uma mudanca de filtro ainda sem nova request deve invalidar a antiga',
  );
  const guardas = [
    ...carregar.matchAll(/if\s*\(\s*!requisicaoAindaAtual\s*\(\s*\)\s*\)\s*return\s*;/g),
  ].map((resultado) => resultado.index);
  const rpcListagem = carregar.indexOf("'listar_evadidos_para_pesquisa_v2'");
  const setTotal = carregar.indexOf('setTotalRegistros');
  const setLista = carregar.indexOf('setEvadidos');
  const rpcStats = carregar.indexOf("'stats_pesquisa_evasao'");
  const setStats = carregar.indexOf('setStats');

  assert.ok(guardas[0] > rpcListagem, 'falta guarda depois do await da listagem');
  assert.ok(setTotal > guardas[0] && setTotal < rpcStats);
  assert.ok(setLista > guardas[0] && setLista < rpcStats);
  assert.ok(guardas[1] > rpcStats, 'falta guarda depois do await de stats');
  assert.ok(setStats > guardas[1], 'stats antigas nao podem atualizar a tela');
  assert.match(
    carregar,
    /finally\s*\{\s*if\s*\(\s*requisicaoAindaAtual\s*\(\s*\)\s*\)\s*setLoading\s*\(\s*false\s*\)/,
    'uma resposta antiga nao pode desligar o loading da consulta atual',
  );
  assert.match(carregar, /p_busca:\s*consulta\.filtroBusca\s*\|\|\s*null/);
  assert.match(
    carregar,
    /['"]stats_pesquisa_evasao['"][\s\S]*?p_ano:\s*consulta\.filtroAno[\s\S]*?p_mes:\s*consulta\.filtroMes/,
    'os cards devem usar o mesmo ano e mes selecionados na listagem',
  );
  assert.doesNotMatch(
    carregar,
    /['"]stats_pesquisa_evasao['"][\s\S]{0,300}?new Date\s*\(/,
    'stats nao podem ignorar os filtros visiveis e voltar ao mes atual',
  );
});

test('frontend exibe bloqueios, fallback de motivo e correcao governada', () => {
  assert.match(types, /bloqueio_codigo\s*:/);
  assert.match(types, /motivo_catalogado\s*:/);
  assert.match(types, /motivo_legado\s*:/);
  assert.match(types, /publico_tipo\s*:/);
  assert.match(tab, /motivo_catalogado\s*\|\|\s*evadido\.motivo_legado/);
  assert.match(tab, /bloqueio_codigo/);
  assert.match(tab, /Corrigir no cadastro do aluno/);
  assert.match(
    tab,
    /Corrigir no cadastro do aluno[\s\S]{0,300}disabled|disabled[\s\S]{0,300}Corrigir no cadastro do aluno/,
    'sem deep-link canonico a acao precisa permanecer bloqueada',
  );
});

test('tipo de publico do frontend permanece em paridade com o valor outro da RPC', () => {
  const publicoTipo = types.match(/publico_tipo\s*:[^;]+;/)?.[0] ?? '';

  for (const tipo of ['aluno', 'responsavel', 'colaborador', 'professor', 'outro']) {
    assert.match(publicoTipo, new RegExp(`['"]${tipo}['"]`));
  }
});

test('modo teste ignora bloqueios produtivos e conserva os hard blocks de pessoa', () => {
  const ramoTeste = tab.match(
    /const\s+podeGerarPreview\s*=\s*modoTeste[\s\S]*?(?=;\s*\n)/,
  )?.[0] ?? '';

  assert.match(ramoTeste, /!\s*registroTeste/);
  assert.match(ramoTeste, /['"]sem_aluno['"]/);
  assert.match(ramoTeste, /['"]publico_interno['"]/);
  assert.match(ramoTeste, /['"]responsavel_sem_nome['"]/);
  assert.match(
    ramoTeste,
    /\[\s*['"]colaborador['"]\s*,\s*['"]professor['"]\s*,\s*['"]outro['"]\s*\]\.includes\s*\(\s*evadido\.publico_tipo\s*\)/,
    'publico interno precisa continuar bloqueado mesmo se outro codigo tiver precedencia',
  );
  for (const bloqueioProdutivo of [
    'sem_telefone',
    'telefone_invalido',
    'motivo_nao_catalogado',
    'pesquisa_aberta_no_mesmo_numero',
  ]) {
    assert.doesNotMatch(
      ramoTeste,
      new RegExp(`['"]${bloqueioProdutivo}['"]`),
      `${bloqueioProdutivo} nao pode impedir preview de teste`,
    );
  }
  assert.match(
    ramoTeste,
    /evadido\.elegivel_envio\s*&&\s*statusProducaoPermiteEnvio/,
    'producao continua governada pela elegibilidade da RPC',
  );
  assert.doesNotMatch(
    ramoTeste,
    /statusBase\s*===\s*['"](?:enviado|respondido)['"]/,
    'status produtivo enviado/respondido nao limita o slot de teste',
  );
});

test('historico de testes fica separado e identificado na UI', () => {
  assert.match(tab, /listar_pesquisas_evasao_teste_v1/);
  assert.match(tab, /Hist[oó]rico de testes/i);
  assert.match(tab, /modo_teste/);
  assert.match(tab, />\s*TESTE\s*</);
  assert.match(types, /interface\s+PesquisaEvasaoTeste/);
  assert.match(types, /modo_teste\s*:\s*boolean/);
});

test('historico de teste e invalidado no Realtime e apos confirmar teste', () => {
  const efeitoRealtime = tab.match(
    /\/\/ Realtime:[\s\S]*?(?=\n\s*const\s+carregarDados\s*=)/,
  )?.[0] ?? '';
  const confirmar = tab.match(
    /const\s+confirmarEnvio\s*=\s*async\s*\(\s*mensagemFinal\s*:\s*string\s*\)\s*=>\s*\{[\s\S]*?(?=\n\s*const\s+alterarModalPreview\s*=)/,
  )?.[0] ?? '';
  const invalidar = tab.match(
    /const\s+invalidarHistoricoTeste\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?(?=\n\s*\};)/,
  )?.[0] ?? '';

  assert.match(invalidar, /setHistoricosTeste\s*\(\s*\{\s*\}\s*\)/);
  assert.match(invalidar, /setHistoricoTesteExpandido\s*\(\s*null\s*\)/);
  assert.match(efeitoRealtime, /invalidarHistoricoTeste\s*\(\s*\)/);
  assert.match(
    confirmar,
    /resposta\.modo_teste\s*===\s*true[\s\S]{0,150}invalidarHistoricoTeste\s*\(\s*\)/,
    'Realtime e suprimido durante confirmacao; sucesso de teste deve limpar o cache',
  );
});

test('fechar historico em voo libera imediatamente o botao para reabrir', () => {
  const carregarHistorico = tab.match(
    /const\s+carregarHistoricoTeste\s*=\s*async[\s\S]*?(?=\n\s*const\s+getBloqueioLabel\s*=)/,
  )?.[0] ?? '';
  const fecharEmVoo = carregarHistorico.match(
    /if\s*\(\s*historicoTesteExpandido\s*===\s*evasaoId\s*\)\s*\{[\s\S]*?\}/,
  )?.[0] ?? '';

  assert.match(fecharEmVoo, /historicoTesteSequenciaRef\.current\s*\+=\s*1/);
  assert.match(fecharEmVoo, /setHistoricoTesteExpandido\s*\(\s*null\s*\)/);
  assert.match(fecharEmVoo, /setCarregandoHistorico\s*\(\s*null\s*\)/);
});

test('componente nao escreve diretamente em cadastro ou movimentacao', () => {
  assert.doesNotMatch(tab, /const\s+salvarTelefone\b/);
  assert.doesNotMatch(
    tab,
    /\.from\s*\(\s*['"](?:movimentacoes_admin|alunos)['"]\s*\)[\s\S]{0,500}?\.update\s*\(/,
  );
});
