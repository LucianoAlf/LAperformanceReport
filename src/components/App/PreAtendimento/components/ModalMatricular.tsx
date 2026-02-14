import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { ModalNovoAluno } from '../../Alunos/ModalNovoAluno';
import type { DadosIniciaisMatricula } from '../../Alunos/ModalNovoAluno';
import type { LeadCRM } from '../types';

interface ModalMatricularProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: () => void;
  lead: LeadCRM | null;
}

/**
 * Wrapper que busca os dados necessários (professores, cursos, salas, etc.)
 * e renderiza o ModalNovoAluno com dados do lead pré-preenchidos.
 */
export function ModalMatricular({ aberto, onClose, onSalvo, lead }: ModalMatricularProps) {
  const [loading, setLoading] = useState(true);
  const [professores, setProfessores] = useState<{id: number, nome: string}[]>([]);
  const [cursos, setCursos] = useState<{id: number, nome: string}[]>([]);
  const [tiposMatricula, setTiposMatricula] = useState<{id: number, nome: string}[]>([]);
  const [salas, setSalas] = useState<{id: number, nome: string, capacidade_maxima: number}[]>([]);

  // Buscar dados necessários quando o modal abre
  useEffect(() => {
    if (!aberto) return;
    setLoading(true);

    const unidadeFilter = lead?.unidade_id || '';

    Promise.all([
      supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('cursos').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('tipos_matricula').select('id, nome').order('nome'),
      supabase.from('salas').select('id, nome, capacidade_maxima')
        .eq('ativo', true)
        .eq('unidade_id', unidadeFilter)
        .order('nome'),
    ]).then(([profRes, cursosRes, tiposRes, salasRes]) => {
      setProfessores((profRes.data || []) as {id: number, nome: string}[]);
      setCursos((cursosRes.data || []) as {id: number, nome: string}[]);
      setTiposMatricula((tiposRes.data || []) as {id: number, nome: string}[]);
      setSalas((salasRes.data || []) as {id: number, nome: string, capacidade_maxima: number}[]);
      setLoading(false);
    });
  }, [aberto, lead?.unidade_id]);

  if (!aberto || !lead) return null;

  // Montar dados iniciais a partir do lead
  const dadosIniciais: DadosIniciaisMatricula = {
    aluno_nome: lead.nome || '',
    unidade_id: lead.unidade_id,
    curso_id: lead.curso_interesse_id,
    canal_origem_id: lead.canal_origem_id,
    professor_experimental_id: lead.professor_experimental_id,
    telefone: lead.telefone || '',
    email: lead.email || '',
    lead_id: lead.id,
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-slate-900 rounded-2xl p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          <p className="text-sm text-slate-300">Carregando formulário de matrícula...</p>
        </div>
      </div>
    );
  }

  const handleSalvar = async () => {
    // Marcar lead como convertido
    if (lead.id) {
      await supabase.from('leads').update({
        converteu: true,
        data_conversao: new Date().toISOString().split('T')[0],
        etapa_pipeline_id: 8, // Matriculado
      }).eq('id', lead.id);

      // Registrar no histórico
      await supabase.from('crm_lead_historico').insert({
        lead_id: lead.id,
        tipo: 'matricula',
        descricao: `Lead matriculado como aluno`,
      });
    }

    onSalvo?.();
    onClose();
  };

  return (
    <ModalNovoAluno
      onClose={onClose}
      onSalvar={handleSalvar}
      professores={professores}
      cursos={cursos}
      tiposMatricula={tiposMatricula}
      salas={salas}
      horarios={[]}
      unidadeAtual={lead.unidade_id}
      dadosIniciais={dadosIniciais}
    />
  );
}

export default ModalMatricular;
