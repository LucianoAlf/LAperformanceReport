import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dailyReportFiles = [
  'src/components/App/Administrativo/ModalRelatorio.tsx',
  'supabase/functions/relatorio-admin-whatsapp/index.ts',
];

for (const filePath of dailyReportFiles) {
  const source = readFileSync(filePath, 'utf8');

  assert(
    !source.includes("Tipo: ${e.tipo_evasao || 'N/A'}"),
    `${filePath} must not print raw tipo_evasao as N/A in daily evasions`,
  );

  assert(
    source.includes('const parcela = valorPerdidoMovimentacao(e);'),
    `${filePath} must derive daily evasion parcel from canonical movement value`,
  );

  assert(
    source.includes('Tipo: ${labelTipoEvasao(tipo)}'),
    `${filePath} must print a human label for inferred daily evasion type`,
  );

  assert(
    source.includes('Parcela: ${formatarParcelaEvasaoDiaria(parcela)}'),
    `${filePath} must include parcel value in daily evasion lines`,
  );
}

console.log('relatorio admin diario evasoes: OK');
