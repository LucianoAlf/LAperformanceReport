import React, { useState, useEffect, useCallback } from 'react';
import { 
  Music, ChevronUp, ChevronDown, Save, Loader2, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';

// Valores permitidos para o fator de demanda
const FATORES_PERMITIDOS = [1.0, 1.5, 2.0, 2.5, 3.0];

// Faixas de referência
const FAIXAS_REFERENCIA = [
  { fator: 1.0, label: 'Curso Grande', percentual: '≥ 15%' },
  { fator: 1.5, label: 'Médio-Grande', percentual: '10-14.99%' },
  { fator: 2.0, label: 'Curso Médio', percentual: '5-9.99%' },
  { fator: 2.5, label: 'Curso Pequeno', percentual: '2-4.99%' },
  { fator: 3.0, label: 'Muito Pequeno', percentual: '< 2%' },
];

interface Curso {
  id: number;
  nome: string;
  fator_demanda: number;
  total_alunos: number;
  percentual: number;
}

interface FatorDemandaCursosProps {
  unidadeId?: string;
  readOnly?: boolean;
}

export const FatorDemandaCursos: React.FC<FatorDemandaCursosProps> = ({
  unidadeId,
  readOnly = false
}) => {
  const toast = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [cursosAlterados, setCursosAlterados] = useState<Record<number, number>>({});

  // Carregar cursos com contagem de alunos
  const carregarCursos = useCallback(async () => {
    setLoading(true);
    try {
      // Query para buscar cursos com contagem de alunos
      let query = supabase
        .from('cursos')
        .select('id, nome, fator_demanda')
        .eq('ativo', true)
        .order('nome');

      const { data: cursosData, error: cursosError } = await query;
      if (cursosError) throw cursosError;

      // Buscar contagem de alunos por curso
      let alunosQuery = supabase
        .from('alunos')
        .select('curso_id')
        .eq('status', 'ativo');

      if (unidadeId) {
        alunosQuery = alunosQuery.eq('unidade_id', unidadeId);
      }

      const { data: alunosData, error: alunosError } = await alunosQuery;
      if (alunosError) throw alunosError;

      // Contar alunos por curso
      const contagemPorCurso: Record<number, number> = {};
      let totalAlunos = 0;
      alunosData?.forEach(aluno => {
        if (aluno.curso_id) {
          contagemPorCurso[aluno.curso_id] = (contagemPorCurso[aluno.curso_id] || 0) + 1;
          totalAlunos++;
        }
      });

      // Montar lista de cursos com dados
      const cursosComDados: Curso[] = (cursosData || []).map(curso => ({
        id: curso.id,
        nome: curso.nome,
        fator_demanda: curso.fator_demanda || 1.0,
        total_alunos: contagemPorCurso[curso.id] || 0,
        percentual: totalAlunos > 0 
          ? Math.round((contagemPorCurso[curso.id] || 0) / totalAlunos * 1000) / 10 
          : 0
      }));

      // Ordenar por quantidade de alunos (decrescente)
      cursosComDados.sort((a, b) => b.total_alunos - a.total_alunos);

      setCursos(cursosComDados);
    } catch (error) {
      console.error('Erro ao carregar cursos:', error);
      toast.error('Erro ao carregar cursos');
    } finally {
      setLoading(false);
    }
  }, [unidadeId, toast]);

  useEffect(() => {
    if (isExpanded && cursos.length === 0) {
      carregarCursos();
    }
  }, [isExpanded, cursos.length, carregarCursos]);

  // Alterar fator de um curso
  const handleFatorChange = (cursoId: number, novoFator: number) => {
    setCursosAlterados(prev => ({
      ...prev,
      [cursoId]: novoFator
    }));
    setHasChanges(true);
  };

  // Salvar alterações
  const handleSave = async () => {
    if (Object.keys(cursosAlterados).length === 0) return;

    setSaving(true);
    try {
      // Atualizar cada curso alterado
      for (const [cursoId, fator] of Object.entries(cursosAlterados)) {
        const { error } = await supabase
          .from('cursos')
          .update({ fator_demanda: fator })
          .eq('id', parseInt(cursoId));

        if (error) throw error;
      }

      toast.success('Fatores de demanda atualizados!');
      setCursosAlterados({});
      setHasChanges(false);
      carregarCursos(); // Recarregar dados
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  // Obter fator atual (alterado ou original)
  const getFatorAtual = (curso: Curso): number => {
    return cursosAlterados[curso.id] ?? curso.fator_demanda;
  };

  // Cor do badge baseada no fator
  const getFatorColor = (fator: number): string => {
    if (fator <= 1.0) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (fator <= 1.5) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    if (fator <= 2.0) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (fator <= 2.5) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  };

  return (
    <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 overflow-hidden">
      {/* Header do Accordion */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Music className="w-5 h-5 text-amber-400" />
          <h3 className="font-semibold text-white text-sm">
            Fator de Demanda por Curso
          </h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {/* Conteúdo Expandido */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Legenda */}
          <div className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-slate-400">
              <p className="mb-2">O Fator de Demanda equilibra cursos de diferentes tamanhos no cálculo do Health Score.</p>
              <div className="flex flex-wrap gap-2">
                {FAIXAS_REFERENCIA.map(faixa => (
                  <span key={faixa.fator} className={`px-2 py-0.5 rounded border ${getFatorColor(faixa.fator)}`}>
                    {faixa.fator}x = {faixa.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tabela de Cursos */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Curso</th>
                    <th className="text-center py-2 px-3 text-slate-400 font-medium">Alunos</th>
                    <th className="text-center py-2 px-3 text-slate-400 font-medium">%</th>
                    <th className="text-center py-2 px-3 text-slate-400 font-medium">Fator</th>
                  </tr>
                </thead>
                <tbody>
                  {cursos.map(curso => {
                    const fatorAtual = getFatorAtual(curso);
                    const foiAlterado = cursosAlterados[curso.id] !== undefined;
                    
                    return (
                      <tr 
                        key={curso.id} 
                        className={`border-b border-slate-800 hover:bg-slate-800/30 ${foiAlterado ? 'bg-amber-500/5' : ''}`}
                      >
                        <td className="py-2 px-3">
                          <span className="text-white font-medium">{curso.nome}</span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-slate-300">{curso.total_alunos}</span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-slate-400">{curso.percentual}%</span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {readOnly ? (
                            <span className={`px-2 py-1 rounded border ${getFatorColor(fatorAtual)}`}>
                              {fatorAtual}x
                            </span>
                          ) : (
                            <Select
                              value={fatorAtual.toString()}
                              onValueChange={(value) => handleFatorChange(curso.id, parseFloat(value))}
                            >
                              <SelectTrigger className={`w-20 h-8 ${getFatorColor(fatorAtual)} border`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FATORES_PERMITIDOS.map(fator => (
                                  <SelectItem key={fator} value={fator.toString()}>
                                    {fator}x
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Botão Salvar */}
          {!readOnly && hasChanges && (
            <div className="flex justify-end pt-4 border-t border-slate-700/50">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar Fatores
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FatorDemandaCursos;
