import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizarTelefone } from '@/lib/normalizarTelefone';

export interface AlunoDuplicado {
  id: number;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  responsavel_telefone: string | null;
  data_nascimento: string | null;
  status: string;
  curso_id: number | null;
  professor_atual_id: number | null;
  is_segundo_curso: boolean | null;
  data_matricula: string | null;
  tipo_match?: 'forte_telefone' | 'forte_nome_nasc' | 'fraca';
}

interface ParametrosBusca {
  nome: string;
  telefoneAluno?: string | null;
  telefoneResponsavel?: string | null;
  dataNascimento?: string | null; // ISO YYYY-MM-DD
  unidadeId: string;
  excluirAlunoId?: number;
}

/**
 * Hook para verificar alunos duplicados antes da criacao.
 *
 * Cascata de match (espelha edge function processar-matricula-emusys):
 * - FORTE_TELEFONE: telefone normalizado bate com aluno.telefone, aluno.whatsapp
 *   ou aluno.responsavel_telefone (cobre caso pai matriculando filho)
 * - FORTE_NOME_NASC: mesmo nome (nome_normalizado) + mesma data_nascimento
 *   na mesma unidade — duplicata real
 * - FRACA: mesmo nome na mesma unidade, datas diferentes ou sem data
 *   (possivel homonimo legitimo)
 *
 * Filtros base: status IN ('ativo','trancado'), exclui aluno_id passado
 */
export function useCheckAlunoDuplicado() {
  const [verificando, setVerificando] = useState(false);
  const [duplicatasFortes, setDuplicatasFortes] = useState<AlunoDuplicado[]>([]);
  const [duplicatasFracas, setDuplicatasFracas] = useState<AlunoDuplicado[]>([]);

  const verificar = useCallback(async (params: ParametrosBusca): Promise<AlunoDuplicado[]> => {
    const { nome, telefoneAluno, telefoneResponsavel, dataNascimento, unidadeId, excluirAlunoId } = params;
    if (!unidadeId) return [];
    const nomeLimpo = nome?.trim() || '';
    const temTelefone = !!(telefoneAluno?.trim() || telefoneResponsavel?.trim());
    if (!nomeLimpo && !temTelefone) return [];

    setVerificando(true);
    try {
      const SELECT_FIELDS = 'id, nome, telefone, whatsapp, responsavel_telefone, data_nascimento, status, curso_id, professor_atual_id, is_segundo_curso, data_matricula';

      const baseQuery = () => {
        let q = supabase
          .from('alunos')
          .select(SELECT_FIELDS)
          .eq('unidade_id', unidadeId)
          .in('status', ['ativo', 'trancado']);
        if (excluirAlunoId) q = q.neq('id', excluirAlunoId);
        return q;
      };

      // FORTE TELEFONE: match em telefone, whatsapp ou responsavel_telefone
      const fortesTel: AlunoDuplicado[] = [];
      const telefonesParaTestar = [
        normalizarTelefone(telefoneAluno),
        normalizarTelefone(telefoneResponsavel),
      ].filter((t): t is string => !!t);

      for (const tel of telefonesParaTestar) {
        const semDDI = tel.startsWith('55') ? tel.slice(2) : tel;
        const orParts = [
          `telefone.eq.${tel}`,
          `whatsapp.eq.${tel}`,
          `responsavel_telefone.eq.${tel}`,
        ];
        if (semDDI !== tel) {
          orParts.push(`telefone.eq.${semDDI}`);
          orParts.push(`whatsapp.eq.${semDDI}`);
          orParts.push(`responsavel_telefone.eq.${semDDI}`);
        }
        const { data, error } = await baseQuery().or(orParts.join(',')).limit(5);
        if (error) {
          console.error('Erro ao verificar duplicata forte (telefone):', error);
          continue;
        }
        for (const a of data || []) {
          if (!fortesTel.find(f => f.id === a.id)) {
            fortesTel.push({ ...a, tipo_match: 'forte_telefone' });
          }
        }
      }

      const idsJaAchados = new Set(fortesTel.map(f => f.id));

      // Match por nome (NOME_NASC ou FRACA dependendo da data_nascimento)
      let porNome: AlunoDuplicado[] = [];
      if (nomeLimpo.length >= 3) {
        const { data, error } = await baseQuery()
          .ilike('nome', nomeLimpo)
          .order('data_matricula', { ascending: false })
          .limit(10);
        if (error) {
          console.error('Erro ao verificar duplicata por nome:', error);
        } else {
          porNome = (data || []).filter(a => !idsJaAchados.has(a.id));
        }
      }

      // Classificar entre forte_nome_nasc (data bate) ou fraca (data nao bate)
      const fortesNomeNasc: AlunoDuplicado[] = [];
      const fracas: AlunoDuplicado[] = [];
      for (const a of porNome) {
        const mesmaData = !!dataNascimento && !!a.data_nascimento && a.data_nascimento === dataNascimento;
        if (mesmaData) {
          fortesNomeNasc.push({ ...a, tipo_match: 'forte_nome_nasc' });
        } else {
          fracas.push({ ...a, tipo_match: 'fraca' });
        }
      }

      const fortes = [...fortesTel, ...fortesNomeNasc];
      setDuplicatasFortes(fortes);
      setDuplicatasFracas(fracas.slice(0, 5));
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
