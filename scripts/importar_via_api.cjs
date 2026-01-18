const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus';

const UNIDADE_MAP = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e',
};

async function importData() {
  // Ler CSV
  const csvPath = path.join(__dirname, '..', 'docs', 'LA_MUSIC_HISTORICO_LTV.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  const dataLines = lines.slice(1);

  console.log('Total de registros no CSV:', dataLines.length);

  // Parsear registros
  const records = dataLines.map(line => {
    const cols = line.split(',');
    return {
      nome: (cols[0] || '').trim(),
      tempo_permanencia_meses: parseInt(cols[1]) || 0,
      categoria_saida: (cols[2] || '').trim() || null,
      mes_saida: (cols[3] || '').trim() || null,
      unidade_id: UNIDADE_MAP[(cols[4] || '').trim()] || null,
    };
  }).filter(r => r.unidade_id && r.nome);

  console.log('Registros validos:', records.length);

  // Inserir em batches de 100
  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/alunos_historico`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      });

      if (response.ok) {
        inserted += batch.length;
        console.log(`Batch ${batchNum}: ${batch.length} registros inseridos (total: ${inserted})`);
      } else {
        const errorText = await response.text();
        console.error(`Erro no batch ${batchNum}:`, response.status, errorText);
        errors++;
      }
    } catch (err) {
      console.error(`Erro no batch ${batchNum}:`, err.message);
      errors++;
    }
  }

  console.log('\n=== RESULTADO ===');
  console.log('Total inseridos:', inserted);
  console.log('Batches com erro:', errors);
}

importData().catch(console.error);
