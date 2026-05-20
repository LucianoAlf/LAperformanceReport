// Edge Function: sync-professores-emusys v1
// Sincroniza a tabela professores ↔ Emusys semanalmente.
//
// Para cada unidade (token diferente):
//   1. GET https://api.emusys.com.br/v1/professores
//   2. Para cada professor retornado pela API:
//      a. Já existe vínculo em professores_unidades com (emusys_id, unidade_id)? → nada a fazer
//      b. Existe professor com mesmo nome normalizado vinculado à unidade? → grava emusys_id (auto-cura)
//      c. Existe professor com mesmo nome em OUTRA unidade (sem vínculo nesta)? → cria o vínculo aqui também
//      d. Nenhum dos acima → cria professor novo + vínculo + log
//   3. Professores que estavam vinculados à unidade e NÃO apareceram na lista do Emusys → log 'sumiu_da_lista' (não desativa)
//
// Cron: semanal, Domingo 04:00 BRT (07:00 UTC)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tokens do Emusys por unidade (mesmo padrão da emusys-api.md)
const UNIDADES: Array<{ id: string; codigo: string; nome: string; token: string }> = [
  { id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', codigo: 'CG',    nome: 'Campo Grande', token: 'nEAlBC5gjtqojA7qberYVOttD1lXdx' },
  { id: '368d47f5-2d88-4475-bc14-ba084a9a348e', codigo: 'BARRA', nome: 'Barra',        token: '4reVMLdiBmdNTOBQKa4m7WGYQaRDKI' },
  { id: '95553e96-971b-4590-a6eb-0201d013c14d', codigo: 'REC',   nome: 'Recreio',      token: 'rUI85cQTePX1ecpLwWLbAWY9UM9yiF' },
];

const EMUSYS_BASE = 'https://api.emusys.com.br/v1';

function normalizar(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

interface EmusysProfessor { id: number; nome: string; }

async function fetchProfessoresEmusys(token: string): Promise<EmusysProfessor[]> {
  const res = await fetch(`${EMUSYS_BASE}/professores`, {
    method: 'GET',
    headers: { 'token': token, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Emusys retornou ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data?.professores) ? data.professores : [];
}

async function logEvento(supabase: any, evento: string, dados: {
  unidadeId: string;
  professorId?: number | null;
  emusysId?: number | null;
  nomeEmusys?: string | null;
  detalhes?: Record<string, unknown>;
}) {
  await supabase.from('professores_sync_log').insert({
    evento,
    unidade_id: dados.unidadeId,
    professor_id: dados.professorId ?? null,
    emusys_id: dados.emusysId ?? null,
    nome_emusys: dados.nomeEmusys ?? null,
    detalhes: dados.detalhes || null,
  });
}

interface SyncStats {
  unidade: string;
  total_emusys: number;
  ja_vinculados: number;
  vinculados_emusys_id_por_nome: number;
  vinculou_unidade_existente: number;
  criados_novos: number;
  sumiram_da_lista: number;
  erros: number;
}

async function syncUnidade(
  supabase: any,
  unidade: typeof UNIDADES[number],
): Promise<SyncStats> {
  const stats: SyncStats = {
    unidade: unidade.codigo,
    total_emusys: 0,
    ja_vinculados: 0,
    vinculados_emusys_id_por_nome: 0,
    vinculou_unidade_existente: 0,
    criados_novos: 0,
    sumiram_da_lista: 0,
    erros: 0,
  };

  // 1. Buscar lista do Emusys
  let listaEmusys: EmusysProfessor[];
  try {
    listaEmusys = await fetchProfessoresEmusys(unidade.token);
  } catch (err) {
    await logEvento(supabase, 'erro', {
      unidadeId: unidade.id,
      detalhes: { erro: err instanceof Error ? err.message : String(err), step: 'fetch_emusys' },
    });
    stats.erros++;
    return stats;
  }
  stats.total_emusys = listaEmusys.length;

  // 2. Buscar TUDO da nossa base de uma vez (evita N+1)
  const { data: vinculosUnidade } = await supabase
    .from('professores_unidades')
    .select('professor_id, emusys_id, professores(nome)')
    .eq('unidade_id', unidade.id);

  const { data: todosProfessores } = await supabase
    .from('professores')
    .select('id, nome');

  // Maps de lookup
  const emusysIdsVinculadosAqui = new Set<number>(
    (vinculosUnidade || []).map((v: any) => v.emusys_id).filter(Boolean)
  );
  const profsVinculadosAquiPorNome = new Map<string, number>();
  (vinculosUnidade || []).forEach((v: any) => {
    const nomeNorm = normalizar(v.professores?.nome);
    if (nomeNorm) profsVinculadosAquiPorNome.set(nomeNorm, v.professor_id);
  });
  const todosProfsPorNome = new Map<string, number>();
  (todosProfessores || []).forEach((p: any) => {
    const nomeNorm = normalizar(p.nome);
    if (nomeNorm && !todosProfsPorNome.has(nomeNorm)) todosProfsPorNome.set(nomeNorm, p.id);
  });

  // 3. Para cada professor do Emusys, decidir o caminho
  for (const ep of listaEmusys) {
    const nomeNorm = normalizar(ep.nome);
    if (!nomeNorm) continue;

    try {
      // Caso A: já está vinculado com este emusys_id → nada a fazer
      if (emusysIdsVinculadosAqui.has(ep.id)) {
        stats.ja_vinculados++;
        continue;
      }

      // Caso B: já está vinculado à unidade por nome (sem emusys_id ou com emusys_id diferente)
      // → atualiza/grava emusys_id (auto-cura)
      const profIdPorNomeAqui = profsVinculadosAquiPorNome.get(nomeNorm);
      if (profIdPorNomeAqui) {
        await supabase
          .from('professores_unidades')
          .update({ emusys_id: ep.id })
          .eq('professor_id', profIdPorNomeAqui)
          .eq('unidade_id', unidade.id);
        await logEvento(supabase, 'vinculou_emusys_id_por_nome', {
          unidadeId: unidade.id,
          professorId: profIdPorNomeAqui,
          emusysId: ep.id,
          nomeEmusys: ep.nome,
        });
        emusysIdsVinculadosAqui.add(ep.id);
        stats.vinculados_emusys_id_por_nome++;
        continue;
      }

      // Caso C: existe professor com este nome em OUTRA unidade → cria vínculo aqui também
      const profIdGlobal = todosProfsPorNome.get(nomeNorm);
      if (profIdGlobal) {
        await supabase
          .from('professores_unidades')
          .insert({ professor_id: profIdGlobal, unidade_id: unidade.id, emusys_id: ep.id });
        await logEvento(supabase, 'vinculou_unidade_existente', {
          unidadeId: unidade.id,
          professorId: profIdGlobal,
          emusysId: ep.id,
          nomeEmusys: ep.nome,
        });
        emusysIdsVinculadosAqui.add(ep.id);
        profsVinculadosAquiPorNome.set(nomeNorm, profIdGlobal);
        stats.vinculou_unidade_existente++;
        continue;
      }

      // Caso D: professor totalmente novo → cria em professores + vínculo
      const { data: novoProf, error: insertErr } = await supabase
        .from('professores')
        .insert({ nome: ep.nome, ativo: true })
        .select('id')
        .single();
      if (insertErr || !novoProf?.id) {
        await logEvento(supabase, 'erro', {
          unidadeId: unidade.id,
          emusysId: ep.id,
          nomeEmusys: ep.nome,
          detalhes: { erro: insertErr?.message || 'insert sem id', step: 'insert_professor' },
        });
        stats.erros++;
        continue;
      }
      await supabase
        .from('professores_unidades')
        .insert({ professor_id: novoProf.id, unidade_id: unidade.id, emusys_id: ep.id });
      await logEvento(supabase, 'criado_novo', {
        unidadeId: unidade.id,
        professorId: novoProf.id,
        emusysId: ep.id,
        nomeEmusys: ep.nome,
      });
      todosProfsPorNome.set(nomeNorm, novoProf.id);
      profsVinculadosAquiPorNome.set(nomeNorm, novoProf.id);
      emusysIdsVinculadosAqui.add(ep.id);
      stats.criados_novos++;
    } catch (err) {
      await logEvento(supabase, 'erro', {
        unidadeId: unidade.id,
        emusysId: ep.id,
        nomeEmusys: ep.nome,
        detalhes: { erro: err instanceof Error ? err.message : String(err), step: 'processar_professor' },
      });
      stats.erros++;
    }
  }

  // 4. Detectar quem sumiu da lista (estava com emusys_id, não veio na resposta)
  const idsEmusysHoje = new Set(listaEmusys.map((ep) => ep.id));
  for (const v of (vinculosUnidade || []) as Array<{ professor_id: number; emusys_id: number | null; professores: { nome: string } | null }>) {
    if (v.emusys_id && !idsEmusysHoje.has(v.emusys_id)) {
      await logEvento(supabase, 'sumiu_da_lista', {
        unidadeId: unidade.id,
        professorId: v.professor_id,
        emusysId: v.emusys_id,
        nomeEmusys: v.professores?.nome || null,
      });
      stats.sumiram_da_lista++;
    }
  }

  return stats;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('[sync-professores-emusys v1] Iniciando sync das 3 unidades');

    const resultados: SyncStats[] = [];
    for (const unidade of UNIDADES) {
      const stats = await syncUnidade(supabase, unidade);
      resultados.push(stats);
      console.log(`[sync-professores-emusys v1] ${unidade.codigo}:`, JSON.stringify(stats));
    }

    return new Response(
      JSON.stringify({ success: true, resultados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[sync-professores-emusys v1] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
