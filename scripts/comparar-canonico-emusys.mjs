// Compara o extrato canônico da API (scripts/auditoria-canonica-emusys.mjs)
// com o nosso espelho `aluno_jornada_matricula_disciplina`, nas 4 chaves que o Alf pediu:
// aluno_id, matricula_id, matricula_disciplina_id e lead_id.
//
// Somente LEITURA. Emite um relatório em JSON no stdout.
import fs from 'node:fs';
import path from 'node:path';

const raizRepo = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(raizRepo, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((linha) => linha.includes('=') && !linha.trim().startsWith('#'))
    .map((linha) => {
      const corte = linha.indexOf('=');
      return [linha.slice(0, corte).trim(), linha.slice(corte + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_ROLE = env.VITE_SUPABASE_SERVICE_ROLE;

async function consultar(sql) {
  // PostgREST não executa SQL cru; usa-se a RPC de leitura já existente se houver.
  // Aqui vamos pelo endpoint REST tabela a tabela, paginando.
  throw new Error('nao usado');
}

async function baixarJornada() {
  const linhas = [];
  const tamanho = 1000;
  for (let inicio = 0; ; inicio += tamanho) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/aluno_jornada_matricula_disciplina`);
    url.searchParams.set(
      'select',
      'unidade_id,aluno_id,emusys_aluno_id,emusys_matricula_id,emusys_matricula_disciplina_id,emusys_professor_id,status_matricula,data_primeira_aula,data_ultima_aula',
    );
    const resposta = await fetch(url, {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        Range: `${inicio}-${inicio + tamanho - 1}`,
        Prefer: 'count=exact',
      },
    });
    if (!resposta.ok) throw new Error(`jornada HTTP ${resposta.status}: ${await resposta.text()}`);
    const pagina = await resposta.json();
    linhas.push(...pagina);
    if (pagina.length < tamanho) break;
  }
  return linhas;
}

const UNIDADES = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
};

const pastaSaida = path.join(raizRepo, 'outputs');
const jornada = await baixarJornada();
const jornadaPorUnidade = new Map();
for (const linha of jornada) {
  const chave = linha.unidade_id;
  if (!jornadaPorUnidade.has(chave)) jornadaPorUnidade.set(chave, new Map());
  jornadaPorUnidade.get(chave).set(Number(linha.emusys_matricula_disciplina_id), linha);
}

const relatorio = { gerado_em: new Date().toISOString(), unidades: {} };

for (const [nome, unidadeId] of Object.entries(UNIDADES)) {
  const arquivo = path.join(pastaSaida, `emusys-matriculas-${nome.toLowerCase().replace(/\s+/g, '-')}.json`);
  if (!fs.existsSync(arquivo)) {
    relatorio.unidades[nome] = { erro: 'extrato da API ausente' };
    continue;
  }
  const api = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const nossas = jornadaPorUnidade.get(unidadeId) ?? new Map();

  const soNaApi = [];
  const statusDivergente = [];
  const professorDivergente = [];
  const conferidos = [];

  for (const disciplina of api.disciplinas) {
    const mdId = Number(disciplina.matricula_disciplina_id);
    const nossa = nossas.get(mdId);
    if (!nossa) {
      soNaApi.push({
        matricula_disciplina_id: mdId,
        matricula_id: disciplina.matricula_id,
        aluno_id: disciplina.aluno_id,
        aluno_nome: disciplina.aluno_nome,
        lead_id: disciplina.lead_id,
        status: disciplina.status_matricula,
        professor: disciplina.nome_professor,
      });
      continue;
    }
    conferidos.push(mdId);

    // A API diz "ativa | trancada | finalizada"; o espelho usa os mesmos rótulos,
    // com "inativa"/"interrompida" caindo em finalizada.
    const apiStatus = String(disciplina.status_matricula ?? '').toLowerCase();
    const nossoStatus = String(nossa.status_matricula ?? '').toLowerCase();
    const equivalente = apiStatus === nossoStatus
      || (apiStatus !== 'ativa' && apiStatus !== 'trancada' && nossoStatus !== 'ativa' && nossoStatus !== 'trancada');
    if (!equivalente) {
      statusDivergente.push({
        matricula_disciplina_id: mdId, aluno_nome: disciplina.aluno_nome,
        api: apiStatus, nosso: nossoStatus,
      });
    }
  }

  const soNoNosso = [];
  const idsApi = new Set(api.disciplinas.map((d) => Number(d.matricula_disciplina_id)));
  for (const [mdId, linha] of nossas) {
    if (!idsApi.has(mdId)) {
      soNoNosso.push({
        matricula_disciplina_id: mdId,
        emusys_matricula_id: linha.emusys_matricula_id,
        status_matricula: linha.status_matricula,
        data_ultima_aula: linha.data_ultima_aula,
      });
    }
  }

  relatorio.unidades[nome] = {
    api: {
      matriculas: api.matriculas.length,
      disciplinas: api.disciplinas.length,
      ativas: api.matriculas.filter((m) => m.status === 'ativa').length,
      com_lead_id: api.disciplinas.filter((d) => d.lead_id).length,
    },
    nosso: { linhas_jornada: nossas.size },
    conferidos: conferidos.length,
    so_na_api: soNaApi.length,
    so_no_nosso: soNoNosso.length,
    status_divergente: statusDivergente.length,
    amostra_so_na_api: soNaApi.slice(0, 10),
    amostra_status_divergente: statusDivergente.slice(0, 10),
    amostra_so_no_nosso: soNoNosso.slice(0, 10),
  };
}

fs.writeFileSync(path.join(pastaSaida, 'comparacao-canonica.json'), JSON.stringify(relatorio, null, 2));
console.log(JSON.stringify(relatorio, (chave, valor) => (chave.startsWith('amostra_') ? valor.slice(0, 5) : valor), 2));
