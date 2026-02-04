/**
 * Script de Importação de Alunos - LA Music
 * Data: 09/01/2026
 * Descrição: Importa 911 alunos do CSV para a tabela alunos no Supabase
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) {
  console.error('❌ ERRO: SUPABASE_URL não definida!');
  console.log('Execute: $env:SUPABASE_URL="sua_url_aqui"');
  process.exit(1);
}

if (!SUPABASE_KEY) {
  console.error('❌ ERRO: SUPABASE_SERVICE_KEY não definida!');
  console.log('Execute: $env:SUPABASE_SERVICE_KEY="sua_service_key_aqui"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Mapeamento de Unidades (nome -> UUID)
const UNIDADES_MAP = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e'
};

// Cache para lookups
let professoresCache = {};
let cursosCache = {};
let tiposMatriculaCache = {};

/**
 * Carrega dados de referência do banco
 */
async function carregarDadosReferencia() {
  console.log('📚 Carregando dados de referência...');

  // Professores
  const { data: professores, error: errProf } = await supabase
    .from('professores')
    .select('id, nome_normalizado');
  
  if (errProf) throw new Error(`Erro ao carregar professores: ${errProf.message}`);
  professores.forEach(p => {
    professoresCache[p.nome_normalizado] = p.id;
  });
  console.log(`  ✅ ${professores.length} professores carregados`);

  // Cursos
  const { data: cursos, error: errCurso } = await supabase
    .from('cursos')
    .select('id, nome_normalizado');
  
  if (errCurso) throw new Error(`Erro ao carregar cursos: ${errCurso.message}`);
  cursos.forEach(c => {
    cursosCache[c.nome_normalizado] = c.id;
  });
  console.log(`  ✅ ${cursos.length} cursos carregados`);

  // Tipos de Matrícula
  const { data: tipos, error: errTipo } = await supabase
    .from('tipos_matricula')
    .select('id, nome_normalizado');
  
  if (errTipo) throw new Error(`Erro ao carregar tipos de matrícula: ${errTipo.message}`);
  tipos.forEach(t => {
    tiposMatriculaCache[t.nome_normalizado] = t.id;
  });
  console.log(`  ✅ ${tipos.length} tipos de matrícula carregados`);
}

/**
 * Converte data DD/MM/YYYY para YYYY-MM-DD
 */
function converterData(dataStr) {
  if (!dataStr || dataStr.trim() === '') return null;
  const partes = dataStr.split('/');
  if (partes.length !== 3) return null;
  return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
}

/**
 * Converte horário HH:MM para formato TIME
 */
function converterHorario(horarioStr) {
  if (!horarioStr || horarioStr.trim() === '') return null;
  // Já está no formato HH:MM, adicionar segundos
  return `${horarioStr}:00`;
}

/**
 * Processa uma linha do CSV e retorna objeto para inserção
 */
function processarLinha(linha, numeroLinha) {
  const campos = linha.split(',');
  
  if (campos.length < 12) {
    console.warn(`⚠️ Linha ${numeroLinha}: número insuficiente de campos (${campos.length})`);
    return null;
  }

  const [
    nome,
    data_nascimento,
    data_matricula,
    curso,
    professor,
    valor_parcela,
    tipo_matricula,
    status,
    unidade,
    dia_semana,
    horario,
    percentual_presenca
  ] = campos.map(c => c.trim());

  // Validações
  if (!nome) {
    console.warn(`⚠️ Linha ${numeroLinha}: nome vazio`);
    return null;
  }

  // Lookup de IDs
  const professorNorm = professor.toUpperCase().trim();
  const professorId = professoresCache[professorNorm];
  if (!professorId) {
    console.warn(`⚠️ Linha ${numeroLinha}: professor não encontrado: "${professor}"`);
    return null;
  }

  const cursoNorm = curso.toUpperCase().trim();
  const cursoId = cursosCache[cursoNorm];
  if (!cursoId) {
    console.warn(`⚠️ Linha ${numeroLinha}: curso não encontrado: "${curso}"`);
    return null;
  }

  const tipoMatriculaNorm = tipo_matricula.toUpperCase().trim();
  const tipoMatriculaId = tiposMatriculaCache[tipoMatriculaNorm];
  if (!tipoMatriculaId) {
    console.warn(`⚠️ Linha ${numeroLinha}: tipo matrícula não encontrado: "${tipo_matricula}"`);
    return null;
  }

  const unidadeId = UNIDADES_MAP[unidade];
  if (!unidadeId) {
    console.warn(`⚠️ Linha ${numeroLinha}: unidade não encontrada: "${unidade}"`);
    return null;
  }

  // Montar objeto
  return {
    nome: nome,
    data_nascimento: converterData(data_nascimento),
    data_matricula: converterData(data_matricula),
    curso_id: cursoId,
    professor_atual_id: professorId,
    valor_parcela: parseFloat(valor_parcela) || 0,
    tipo_matricula_id: tipoMatriculaId,
    status: status.toLowerCase(),
    unidade_id: unidadeId,
    dia_aula: dia_semana || null,
    horario_aula: converterHorario(horario),
    percentual_presenca: percentual_presenca ? parseInt(percentual_presenca) : null
  };
}

/**
 * Importa alunos em lotes
 */
async function importarAlunos(alunos, tamanhoBatch = 50) {
  console.log(`\n📥 Importando ${alunos.length} alunos em lotes de ${tamanhoBatch}...`);
  
  let inseridos = 0;
  let erros = 0;

  for (let i = 0; i < alunos.length; i += tamanhoBatch) {
    const batch = alunos.slice(i, i + tamanhoBatch);
    const batchNum = Math.floor(i / tamanhoBatch) + 1;
    const totalBatches = Math.ceil(alunos.length / tamanhoBatch);

    const { data, error } = await supabase
      .from('alunos')
      .insert(batch)
      .select('id');

    if (error) {
      console.error(`❌ Erro no batch ${batchNum}/${totalBatches}: ${error.message}`);
      erros += batch.length;
    } else {
      inseridos += data.length;
      console.log(`  ✅ Batch ${batchNum}/${totalBatches}: ${data.length} alunos inseridos`);
    }
  }

  return { inseridos, erros };
}

/**
 * Função principal
 */
async function main() {
  console.log('🎵 LA MUSIC - Importação de Alunos');
  console.log('==================================\n');

  try {
    // Carregar dados de referência
    await carregarDadosReferencia();

    // Ler CSV
    const csvPath = path.join(__dirname, '..', 'docs', 'LA_MUSIC_ALUNOS_CONSOLIDADO.csv');
    console.log(`\n📄 Lendo arquivo: ${csvPath}`);
    
    const conteudo = fs.readFileSync(csvPath, 'utf-8');
    const linhas = conteudo.split('\n').filter(l => l.trim());
    
    console.log(`  📊 Total de linhas: ${linhas.length} (incluindo cabeçalho)`);

    // Processar linhas (pular cabeçalho)
    const alunos = [];
    const errosProcessamento = [];

    for (let i = 1; i < linhas.length; i++) {
      const aluno = processarLinha(linhas[i], i + 1);
      if (aluno) {
        alunos.push(aluno);
      } else {
        errosProcessamento.push(i + 1);
      }
    }

    console.log(`\n📋 Resumo do processamento:`);
    console.log(`  ✅ Alunos válidos: ${alunos.length}`);
    console.log(`  ⚠️ Linhas com erro: ${errosProcessamento.length}`);

    if (errosProcessamento.length > 0) {
      console.log(`  📍 Linhas problemáticas: ${errosProcessamento.slice(0, 10).join(', ')}${errosProcessamento.length > 10 ? '...' : ''}`);
    }

    // Importar
    const { inseridos, erros } = await importarAlunos(alunos);

    // Resultado final
    console.log('\n==================================');
    console.log('📊 RESULTADO FINAL:');
    console.log(`  ✅ Alunos inseridos: ${inseridos}`);
    console.log(`  ❌ Erros de inserção: ${erros}`);
    console.log('==================================\n');

  } catch (error) {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  }
}

// Executar
main();
