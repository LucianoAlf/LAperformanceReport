import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edge = readFileSync(
  new URL(
    "../supabase/functions/relatorio-admin-whatsapp/index.ts",
    import.meta.url,
  ),
  "utf8",
);
const comercialPage = readFileSync(
  new URL(
    "../src/components/App/Comercial/ComercialPage.tsx",
    import.meta.url,
  ),
  "utf8",
);
const formatador = readFileSync(
  new URL(
    "../supabase/functions/_shared/relatorio-comercial.ts",
    import.meta.url,
  ),
  "utf8",
);

function bloco(inicio, fim) {
  const posInicio = edge.indexOf(inicio);
  assert.notEqual(posInicio, -1, `inicio ausente: ${inicio}`);
  const posFim = edge.indexOf(fim, posInicio + inicio.length);
  assert.notEqual(posFim, -1, `fim ausente depois de ${inicio}: ${fim}`);
  return edge.slice(posInicio, posFim);
}

function blocoFonte(fonte, inicio, fim) {
  const posInicio = fonte.indexOf(inicio);
  assert.notEqual(posInicio, -1, `inicio ausente: ${inicio}`);
  const posFim = fonte.indexOf(fim, posInicio + inicio.length);
  assert.notEqual(posFim, -1, `fim ausente depois de ${inicio}: ${fim}`);
  return fonte.slice(posInicio, posFim);
}

test("tela diaria consome somente o texto canonico da edge para uma unidade especifica", () => {
  const diario = blocoFonte(
    comercialPage,
    "const gerarRelatorioDiario = async () => {",
    "const gerarRelatorioSemanal = async () => {",
  );

  assert.match(diario, /const\s*\{\s*dataFim\s*\}\s*=\s*calcularRangeDatas\(\)/);
  assert.match(
    diario,
    /const unidadeRelatorioId\s*=\s*isAdmin\s*\?\s*context\?\.unidadeSelecionada\s*:\s*usuario\?\.unidade_id/,
  );
  assert.match(diario, /!unidadeRelatorioId\s*\|\|\s*unidadeRelatorioId\s*===\s*['"]todos['"]/);
  assert.match(diario, /Selecione uma unidade/i);
  assert.match(
    diario,
    /supabase\.functions\.invoke\(['"]relatorio-admin-whatsapp['"],\s*\{\s*body:\s*\{\s*modo:\s*['"]dry_run_comercial['"],\s*unidade:\s*unidadeRelatorioId,\s*data_referencia:\s*dataFim,?\s*\},?\s*\}\)/s,
  );
  assert.match(diario, /if\s*\(error\)\s*throw\s+error/);
  assert.match(diario, /data\?\.success\s*!==\s*true/);
  assert.match(diario, /typeof\s+data\?\.texto\s*!==\s*['"]string['"]/);
  assert.match(diario, /return\s+data\.texto/);
  assert.doesNotMatch(diario, /\.rpc\s*\(/);
  assert.doesNotMatch(diario, /sync-presenca-emusys/);
  assert.doesNotMatch(diario, /get_kpis_comercial_canonicos_v2|get_conciliacao_experimentais_v2|get_experimentais_emusys_operacional_v1/);
});

test("texto canonico inclui os dois tickets e e a unica fonte para exibir copiar e enfileirar", () => {
  assert.match(formatador, /Ticket médio das parcelas/);
  assert.match(formatador, /Ticket médio dos passaportes/);

  const execucao = blocoFonte(
    comercialPage,
    "const executarGeracaoRelatorio = async (",
    "// Gerar relatório automaticamente",
  );
  assert.match(execucao, /const texto\s*=\s*await gerarRelatorioSelecionado\(tipo\)/);
  assert.match(execucao, /setRelatorioTexto\(texto\)/);

  const copiar = blocoFonte(
    comercialPage,
    "const copiarRelatorio = async () => {",
    "// Enviar relatório via WhatsApp para o grupo",
  );
  assert.match(copiar, /copyTextToClipboard\(relatorioTexto\)/);
  assert.doesNotMatch(copiar, /gerarRelatorio(?:Diario|Semanal|Mensal|Matriculas|Comparativo)/);

  const envio = blocoFonte(
    comercialPage,
    "const enviarWhatsAppGrupo = async () => {",
    "// Obter contagem do dia para cada tipo",
  );
  assert.match(envio, /podeUsarRelatorio\([\s\S]*relatorioTexto[\s\S]*relatorioOrigemAtualRef\.current/);
  assert.match(envio, /const textoEnvio\s*=\s*relatorioTexto/);
  assert.match(envio, /p_texto:\s*textoEnvio/);
});

test("copia e envio exigem origem atual e envio usa unidade capturada com o texto", () => {
  assert.match(comercialPage, /relatorioOrigem/);
  assert.match(comercialPage, /relatorioOrigemAtualRef/);
  assert.match(comercialPage, /relatorioEnvioIdRef/);
  assert.match(comercialPage, /podeUsarRelatorio\(/);

  const envio = blocoFonte(
    comercialPage,
    "const enviarWhatsAppGrupo = async () => {",
    "// Obter contagem do dia para cada tipo",
  );
  assert.match(envio, /const origemEnvio\s*=\s*relatorioOrigem/);
  assert.match(envio, /const textoEnvio\s*=\s*relatorioTexto/);
  assert.match(envio, /const unidadeEnvio\s*=\s*origemEnvio\.unidade/);
  assert.match(envio, /p_texto:\s*textoEnvio/);
  assert.match(envio, /p_unidade:\s*unidadeEnvio/);
  assert.match(envio, /p_competencia:\s*origemEnvio\.competencia/);
  assert.match(envio, /respostaEnvioAindaValida\(/);
  assert.doesNotMatch(envio, /context\?\.unidadeSelecionada/);
  assert.doesNotMatch(envio, /unidadeId\s*\|\|\s*['"]todos['"]/);
});

test("editar o texto invalida envio pendente e limpa sucesso ou erro anterior", () => {
  assert.match(comercialPage, /const editarTextoRelatorio\s*=\s*\(novoTexto:\s*string\)\s*=>\s*\{/);

  const edicao = blocoFonte(
    comercialPage,
    "const editarTextoRelatorio = (novoTexto: string) => {",
    "const executarGeracaoRelatorio = async (",
  );
  assert.match(edicao, /invalidarEstadoEnvioRelatorio\(\)/);
  assert.match(edicao, /setRelatorioTexto\(novoTexto\)/);

  assert.match(
    comercialPage,
    /<textarea[\s\S]*?onChange=\{\(e\)\s*=>\s*editarTextoRelatorio\(e\.target\.value\)\}/,
  );
});

test("geradores semanal mensal e comparativos permanecem delegados como antes", () => {
  const seletor = blocoFonte(
    comercialPage,
    "const gerarRelatorioSelecionado = async (",
    "const executarGeracaoRelatorio = async (",
  );
  for (const [tipo, gerador] of [
    ["semanal", "gerarRelatorioSemanal"],
    ["mensal", "gerarRelatorioMensal"],
    ["matriculas", "gerarRelatorioMatriculas"],
    ["comparativo_mensal", "gerarRelatorioComparativoMensal"],
    ["comparativo_anual", "gerarRelatorioComparativoAnual"],
  ]) {
    assert.match(
      seletor,
      new RegExp(`case ['"]${tipo}['"]:[\\s\\S]*return ${gerador}\\(\\)`),
    );
  }
});

test("gerador atualiza o snapshot de mes ate D+7 antes de qualquer leitura canonica", () => {
  const gerador = bloco(
    "async function gerarRelatorioComercialDiario(",
    "async function processarCron(",
  );

  assert.match(gerador, /dataReferencia\??\s*:/);
  assert.match(gerador, /America\/Sao_Paulo/);
  assert.match(gerador, /dataInicioSnapshot/);
  assert.match(gerador, /dataFimSnapshot/);
  assert.match(gerador, /adicionarDiasIso\([^,]+,\s*7\)/);

  const preflight = gerador.indexOf("await atualizarSnapshotExperimentais(");
  const primeiraLeitura = Math.min(
    ...[".rpc(", ".from('"].map((marcador) => {
      const indice = gerador.indexOf(marcador);
      return indice === -1 ? Number.POSITIVE_INFINITY : indice;
    }),
  );
  assert.ok(preflight >= 0, "preflight de snapshot ausente");
  assert.ok(
    preflight < primeiraLeitura,
    "snapshot precisa terminar antes da primeira leitura",
  );
  assert.match(gerador, /snapshot\.snapshot\.status\s*!==\s*['"]completo['"]/);
});

test("refresh servidor-servidor falha fechado em HTTP, payload, unidade, intervalo e execucao", () => {
  const refresh = bloco(
    "async function atualizarSnapshotExperimentais(",
    "async function gerarRelatorioComercialDiario(",
  );

  assert.match(refresh, /modo:\s*['"]experimentais['"]/);
  assert.match(refresh, /unidade_id:\s*unidadeId/);
  assert.match(refresh, /data_inicio:\s*dataInicio/);
  assert.match(refresh, /data_fim:\s*dataFim/);
  assert.match(refresh, /if\s*\(\s*!response\.ok\s*\)/);
  assert.match(refresh, /payload\.success\s*!==\s*true/);
  assert.match(refresh, /payload\.unidade\?\.id\s*!==\s*unidadeId/);
  assert.match(refresh, /payload\.intervalo\?\.data_inicio\s*!==\s*dataInicio/);
  assert.match(refresh, /payload\.intervalo\?\.data_fim\s*!==\s*dataFim/);
  assert.match(refresh, /payload\.snapshot\?\.status\s*!==\s*['"]completo['"]/);
  assert.match(refresh, /payload\.snapshot\?\.execucao_id/);
});

test("fontes canonicas sao carregadas em paralelo somente depois do refresh", () => {
  const gerador = bloco(
    "async function gerarRelatorioComercialDiario(",
    "async function processarCron(",
  );
  const depoisRefresh = gerador.slice(
    gerador.indexOf("await atualizarSnapshotExperimentais("),
  );

  assert.match(depoisRefresh, /Promise\.all\s*\(/);
  for (
    const fonte of [
      "get_kpis_comercial_canonicos_v2",
      "get_conciliacao_experimentais_v2",
      "get_experimentais_emusys_operacional_v1",
      "metas_kpi",
      "emusys_experimentais_raw",
      "leads",
      "lead_experimentais",
      "alunos",
    ]
  ) {
    assert.match(depoisRefresh, new RegExp(fonte));
  }
  assert.doesNotMatch(edge, /get_dados_comercial_ia/);
  assert.match(depoisRefresh, /\.gte\(['"]created_at['"],\s*inicioDiaBRT\)/);
  assert.match(
    depoisRefresh,
    /\.lt\(['"]created_at['"],\s*fimDiaBRTExclusivo\)/,
  );
  assert.match(
    depoisRefresh,
    /resumoEmusysDia\.snapshot_status\s*!==\s*['"]completo['"]/,
  );
});

test("coorte detalhada falha fechado se consultas de enriquecimento falharem", () => {
  const busca = bloco(
    "async function buscarMatriculasComerciaisAlunos(",
    "async function buscarVinculosCursoProximas(",
  );
  assert.match(
    busca,
    /leadResults[\s\S]*?resultado\.error[\s\S]*?throw\s+resultado\.error/,
  );
  assert.match(busca, /experimentaisPorAlunoResponse/);
  assert.match(busca, /experimentaisPorEmusysResponse/);
  assert.match(busca, /experimentaisPorLeadResponse/);
  assert.match(busca, /professoresError[\s\S]*?throw\s+professoresError/);
});

test("enriquecimentos de lead ficam escopados pela unidade antes dos filtros por ID", () => {
  const busca = bloco(
    "async function buscarMatriculasComerciaisAlunos(",
    "async function buscarVinculosCursoProximas(",
  );
  assert.match(
    busca,
    /\.from\(['"]leads['"]\)[\s\S]*?\.eq\(['"]unidade_id['"],\s*unidadeId\)[\s\S]*?\.in\(['"]aluno_id['"],\s*alunoIds\)/,
  );

  const consultasExperimentais = [
    ...busca.matchAll(
      /\.from\(['"]lead_experimentais['"]\)([\s\S]*?)\.in\(['"](?:aluno_id|emusys_lead_id|lead_id)['"],[^)]+\)/g,
    ),
  ];
  assert.equal(consultasExperimentais.length, 3);
  for (const consulta of consultasExperimentais) {
    assert.match(
      consulta[1],
      /\.eq\(['"]unidade_id['"],\s*unidadeId\)/,
      "cada busca por IDs deve aplicar unidade antes do .in",
    );
  }
});

test("proximas experimentais usam apenas snapshot ativo e identidades estaveis", () => {
  const gerador = bloco(
    "async function gerarRelatorioComercialDiario(",
    "async function processarCron(",
  );
  assert.match(gerador, /snapshot_ativo/);
  assert.match(gerador, /emusys_aula_id/);
  assert.match(gerador, /participante_chave/);
  assert.match(gerador, /lead_experimental_id/);
  assert.match(gerador, /emusys_lead_id/);
  assert.match(gerador, /emusys_aluno_id/);
  assert.doesNotMatch(
    gerador,
    /aluno_nome_normalizado|aluno_telefone|responsavel_telefone|payload\b/,
  );

  const enriquecimento = bloco(
    "function enriquecerProximasExperimentais(",
    "async function atualizarSnapshotExperimentais(",
  );
  assert.match(enriquecimento, /leadExperimentalId/);
  assert.match(enriquecimento, /leadId/);
  assert.match(enriquecimento, /emusysLeadId/);
  assert.doesNotMatch(
    enriquecimento,
    /normalizarTexto|alunoNome.*(?:===|==)|nome.*(?:===|==).*aluno/i,
  );
});

test("agenda raw fica presa a execucao confirmada e falha fechado em concorrencia", () => {
  const gerador = bloco(
    "async function gerarRelatorioComercialDiario(",
    "async function processarCron(",
  );
  assert.match(
    gerador,
    /\.select\(['"][^'"]*snapshot_execucao_id[^'"]*['"]\)/,
  );
  assert.match(
    gerador,
    /\.eq\(['"]snapshot_execucao_id['"],\s*snapshot\.snapshot\.execucao_id\)/,
  );
  assert.match(
    gerador,
    /validarExecucaoSnapshotProximas\(\s*linhasFuturas,\s*snapshot\.snapshot\.execucao_id,?\s*\)/,
  );
  assert.match(gerador, /confirmacaoSnapshotResponse/);
  assert.match(
    gerador,
    /resumoConfirmacaoSnapshot\.snapshot_execucao_id[\s\S]*?snapshot\.snapshot\.execucao_id/,
  );
  assert.match(
    gerador,
    /SNAPSHOT_EXPERIMENTAIS_CONCORRENTE/,
  );
});

test("uma unica coorte alimenta total, tickets e lista detalhada sem nova filtragem", () => {
  const gerador = bloco(
    "async function gerarRelatorioComercialDiario(",
    "async function processarCron(",
  );
  assert.match(
    gerador,
    /const matriculasNovas\s*=\s*agruparMatriculasComerciais\([\s\S]*?\.filter\(ehMatriculaComercialCanonicaEdge\)/,
  );
  assert.match(
    gerador,
    /calcularTicketsMatriculas\(\s*matriculasNovas\.map\(\(mat\)\s*=>\s*\(\{[\s\S]*?parcelasDoGrupo\(mat\)[\s\S]*?passaporteDoGrupo\(mat\)/,
  );
  assert.match(
    gerador,
    /mes:\s*\{[\s\S]*?matriculas:\s*matriculasNovas\.length/,
  );
  assert.match(gerador, /matriculasDetalhadas:\s*matriculasNovas\.map\(/);
  assert.doesNotMatch(
    gerador,
    /matriculasDetalhadas:\s*matriculasNovas\.(?:filter|slice)\(/,
  );
  assert.equal(
    [...gerador.matchAll(/formatarRelatorioComercialDiario\s*\(/g)].length,
    1,
    "o gerador deve delegar ao formatador puro exatamente uma vez",
  );
});

test("dry-run exige JWT e RPC de escopo; cron exige service_role", () => {
  const handler = bloco(
    "serve(async (req) => {",
    "// === MODO MANUAL (existente) ===",
  );
  assert.match(handler, /payload\.modo\s*===\s*['"]dry_run_comercial['"]/);
  assert.match(handler, /Authorization/);
  assert.match(handler, /auth\.getUser\s*\(/);
  assert.match(handler, /pode_gerar_relatorio_comercial_v1/);
  assert.match(handler, /status:\s*401/);
  assert.match(handler, /status:\s*403/);
  assert.match(handler, /payload\.unidade\s*===\s*['"]todos['"]/);
  assert.match(handler, /status:\s*400/);
  assert.match(handler, /payload\.modo\s*===\s*['"]cron['"]/);
  assert.match(handler, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("dry-run e cron usam o gerador unico e cron grava somente na fila canonica", () => {
  const cron = bloco("async function processarCron(", "serve(async (req) => {");
  const handler = bloco(
    "serve(async (req) => {",
    "// === MODO MANUAL (existente) ===",
  );

  assert.match(cron, /gerarRelatorioComercialDiario\s*\(/);
  assert.match(handler, /gerarRelatorioComercialDiario\s*\(/);
  assert.match(cron, /\.from\(['"]fila_relatorios_whatsapp['"]\)/);
  assert.doesNotMatch(cron, /fila_relatorios_sol_hermes/);
});

test("texto antigo bloqueado nao permanece no produtor canonico", () => {
  assert.doesNotMatch(edge, /BLOQUEADA/);
  assert.match(edge, /formatarRelatorioComercialDiario/);
});
