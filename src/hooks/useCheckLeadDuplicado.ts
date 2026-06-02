import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizarTelefone } from '@/lib/normalizarTelefone';

export interface LeadDuplicado {
  id: number;
  nome: string;
  telefone: string | null;
  whatsapp?: string | null;
  status: string;
  etapa_pipeline_id: number | null;
  created_at: string;
  tipo_match?: 'forte' | 'fraca';
}

/**
 * Hook para verificar leads duplicados antes da criacao.
 *
 * Cascata de match (espelha edge function processar-matricula-emusys):
 * - FORTE: telefone normalizado bate com lead.telefone OU lead.whatsapp
 * - FRACA: mesmo nome (case-insensitive, trim) na mesma unidade, telefones diferentes
 *
 * Retorna duplicatasFortes e duplicatasFracas separadas, e tambem `duplicados`
 * (lista combinada) para compatibilidade com chamadores antigos.
 */
export function useCheckLeadDuplicado() {
  const [verificando, setVerificando] = useState(false);
  const [duplicatasFortes, setDuplicatasFortes] = useState<LeadDuplicado[]>([]);
  const [duplicatasFracas, setDuplicatasFracas] = useState<LeadDuplicado[]>([]);

  const verificar = useCallback(async (
    nome: string,
    telefone: string | null | undefined,
    unidadeId: string
  ): Promise<LeadDuplicado[]> => {
    if (!unidadeId) return [];
    if (!nome.trim() && !telefone?.trim()) return [];

    setVerificando(true);
    try {
      const nomeLimpo = nome.trim();
      const telNormalizado = normalizarTelefone(telefone);
      const telSemDDI = telNormalizado?.startsWith('55') ? telNormalizado.slice(2) : telNormalizado;

      const baseQuery = () => supabase
        .from('leads')
        .select('id, nome, telefone, whatsapp, status, etapa_pipeline_id, created_at')
        .eq('unidade_id', unidadeId)
        .eq('arquivado', false);

      // FORTE: match por telefone (telefone OU whatsapp, com OU sem DDI)
      let fortes: LeadDuplicado[] = [];
      if (telNormalizado) {
        const orParts = [
          `telefone.eq.${telNormalizado}`,
          `whatsapp.eq.${telNormalizado}`,
        ];
        if (telSemDDI && telSemDDI !== telNormalizado) {
          orParts.push(`telefone.eq.${telSemDDI}`);
          orParts.push(`whatsapp.eq.${telSemDDI}`);
        }
        const { data, error } = await baseQuery()
          .or(orParts.join(','))
          .limit(5);
        if (error) {
          console.error('Erro ao verificar duplicata forte:', error);
        } else {
          fortes = (data || []).map(d => ({ ...d, tipo_match: 'forte' as const }));
        }
      }

      // FRACA: match por nome (case-insensitive), excluindo os ja achados como forte
      let fracas: LeadDuplicado[] = [];
      if (nomeLimpo.length >= 3) {
        const idsFortes = new Set(fortes.map(f => f.id));
        const { data, error } = await baseQuery()
          .ilike('nome', nomeLimpo)
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) {
          console.error('Erro ao verificar duplicata fraca:', error);
        } else {
          fracas = (data || [])
            .filter(d => !idsFortes.has(d.id))
            .slice(0, 5)
            .map(d => ({ ...d, tipo_match: 'fraca' as const }));
        }
      }

      setDuplicatasFortes(fortes);
      setDuplicatasFracas(fracas);
      return [...fortes, ...fracas];
    } finally {
      setVerificando(false);
    }
  }, []);

  const limparDuplicados = useCallback(() => {
    setDuplicatasFortes([]);
    setDuplicatasFracas([]);
  }, []);

  return {
    duplicados: [...duplicatasFortes, ...duplicatasFracas],
    duplicatasFortes,
    duplicatasFracas,
    verificando,
    verificar,
    limparDuplicados,
  };
}

/**
 * Verificacao em lote para batch inserts.
 * Recebe lista de telefones e retorna quais ja existem na unidade —
 * tanto em `leads` quanto em `alunos` (matriculas). Detectar telefone que ja
 * pertence a um aluno evita criar lead manual duplicado de quem ja e matricula
 * (ex.: cadastro vindo da automacao Emusys). Alunos sao marcados com status 'aluno'.
 */
export async function verificarDuplicadosEmLote(
  telefones: string[],
  unidadeId: string
): Promise<Map<string, LeadDuplicado>> {
  const telefonesValidos = telefones.filter(t => t.trim());
  if (telefonesValidos.length === 0 || !unidadeId) return new Map();

  const mapa = new Map<string, LeadDuplicado>();

  // 1. Leads existentes na unidade
  const { data: leadsData, error: leadsErr } = await supabase
    .from('leads')
    .select('id, nome, telefone, whatsapp, status, etapa_pipeline_id, created_at')
    .eq('unidade_id', unidadeId)
    .eq('arquivado', false)
    .in('telefone', telefonesValidos)
    .limit(100);

  if (leadsErr) {
    console.error('Erro ao verificar duplicatas (leads) em lote:', leadsErr);
  } else {
    for (const lead of leadsData || []) {
      if (lead.telefone && !mapa.has(lead.telefone)) mapa.set(lead.telefone, lead);
    }
  }

  // 2. Alunos/matriculas existentes na unidade (telefone ja pertence a uma pessoa matriculada)
  const { data: alunosData, error: alunosErr } = await supabase
    .from('alunos')
    .select('id, nome, telefone, status, created_at')
    .eq('unidade_id', unidadeId)
    .in('telefone', telefonesValidos)
    .limit(100);

  if (alunosErr) {
    console.error('Erro ao verificar duplicatas (alunos) em lote:', alunosErr);
  } else {
    for (const aluno of alunosData || []) {
      if (aluno.telefone && !mapa.has(aluno.telefone)) {
        mapa.set(aluno.telefone, {
          id: aluno.id,
          nome: aluno.nome,
          telefone: aluno.telefone,
          whatsapp: null,
          status: aluno.status || 'aluno',
          etapa_pipeline_id: null,
          created_at: aluno.created_at,
        });
      }
    }
  }

  return mapa;
}
