import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const UNIDADE_RECREIO = '95553e96-971b-4590-a6eb-0201d013c14d';

export const CONTRATOS_ASSINADOS_CANARIO = Object.freeze([
  { emusys_matricula_id: '32', contrato_assinado: true },
  { emusys_matricula_id: '78', contrato_assinado: true },
  { emusys_matricula_id: '169', contrato_assinado: true },
  { emusys_matricula_id: '328', contrato_assinado: true },
  { emusys_matricula_id: '394', contrato_assinado: true },
  { emusys_matricula_id: '409', contrato_assinado: true },
  { emusys_matricula_id: '167', contrato_assinado: true },
  { emusys_matricula_id: '416', contrato_assinado: true },
]);

export function avaliarCanarioContratos(rows) {
  const observados = new Map(
    rows.map((row) => [String(row.emusys_matricula_id), row.contrato_assinado]),
  );
  const divergencias = CONTRATOS_ASSINADOS_CANARIO.flatMap(({ emusys_matricula_id }) => {
    const observado = observados.has(emusys_matricula_id)
      ? observados.get(emusys_matricula_id)
      : 'ausente';
    return observado === true ? [] : [{ emusys_matricula_id, observado }];
  });
  return { ok: divergencias.length === 0, divergencias };
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ids = CONTRATOS_ASSINADOS_CANARIO.map((item) => item.emusys_matricula_id);
  const { data, error } = await supabase
    .from('aluno_contratos_emusys')
    .select('emusys_matricula_id,contrato_assinado')
    .eq('unidade_id', UNIDADE_RECREIO)
    .in('emusys_matricula_id', ids);

  if (error) throw error;
  const resultado = avaliarCanarioContratos(data ?? []);
  if (!resultado.ok) {
    console.error(JSON.stringify({ status: 'regressao', divergencias: resultado.divergencias }));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ status: 'ok', matriculas_verificadas: ids.length }));
}

const executadoDiretamente = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executadoDiretamente) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
