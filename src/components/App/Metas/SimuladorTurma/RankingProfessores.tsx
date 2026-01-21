// Componente: Ranking de Professores por Média (V1 - Modelo Preferido)
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Users, ChevronDown, ChevronUp, AlertTriangle, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfessorTurma } from '@/lib/simulador-turma/tipos';
import { formatarMoeda, formatarPercentual } from '@/lib/simulador-turma/calculos';
import { supabase } from '@/lib/supabase';

interface RankingProfessoresProps {
  professores: ProfessorTurma[];
  mediaMeta: number;
  unidadeId?: string;
}

interface OutletContextType {
  competencia: { ano: number; mes: number };
}

type OrdenacaoTipo = 'media_asc' | 'media_desc' | 'carteira' | 'nome';

const statusConfig = {
  critico: { cor: 'rose', label: 'Crítico (<1.3)' },
  atencao: { cor: 'amber', label: 'Atenção (1.3-1.7)' },
  bom: { cor: 'cyan', label: 'Bom (1.7-2.0)' },
  excelente: { cor: 'emerald', label: 'Excelente (>2.0)' },
};

export function RankingProfessores({ professores, mediaMeta, unidadeId }: RankingProfessoresProps) {
  const { competencia } = useOutletContext<OutletContextType>();
  const [ordenacao, setOrdenacao] = useState<OrdenacaoTipo>('media_asc');
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set([professores[0]?.id]));
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [metasIndividuais, setMetasIndividuais] = useState<Record<number, number>>({});
  const [salvandoMeta, setSalvandoMeta] = useState<number | null>(null);
  const [metaSalva, setMetaSalva] = useState<number | null>(null);

  // Função para salvar meta individual do professor
  const handleSalvarMetaIndividual = async (professor: ProfessorTurma) => {
    if (!unidadeId) return;
    
    const metaValor = metasIndividuais[professor.id] ?? Math.min(mediaMeta, professor.mediaAlunosTurma + 0.5);
    
    setSalvandoMeta(professor.id);
    
    try {
      const { error } = await supabase
        .from('metas_professor_turma')
        .upsert({
          professor_id: professor.id,
          unidade_id: unidadeId,
          ano: competencia.ano,
          mes: competencia.mes,
          media_meta: metaValor,
          media_atual: professor.mediaAlunosTurma,
          total_alunos: professor.totalAlunos,
          total_turmas: professor.totalTurmas,
        }, {
          onConflict: 'professor_id,ano,mes'
        });

      if (error) throw error;

      setMetaSalva(professor.id);
      setTimeout(() => setMetaSalva(null), 2000);
    } catch (err) {
      console.error('Erro ao salvar meta:', err);
    } finally {
      setSalvandoMeta(null);
    }
  };

  // Ordenar professores
  const professoresOrdenados = [...professores].sort((a, b) => {
    switch (ordenacao) {
      case 'media_asc':
        return a.mediaAlunosTurma - b.mediaAlunosTurma;
      case 'media_desc':
        return b.mediaAlunosTurma - a.mediaAlunosTurma;
      case 'carteira':
        return b.totalAlunos - a.totalAlunos;
      case 'nome':
        return a.nome.localeCompare(b.nome);
      default:
        return 0;
    }
  });

  // Limitar exibição
  const professoresExibidos = mostrarTodos 
    ? professoresOrdenados 
    : professoresOrdenados.slice(0, 5);

  const toggleExpandido = (id: number) => {
    setExpandidos(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) {
        novo.delete(id);
      } else {
        novo.add(id);
      }
      return novo;
    });
  };

  const getCorStatus = (status: ProfessorTurma['status']) => {
    const cores = {
      critico: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30' },
      atencao: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
      bom: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
      excelente: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    };
    return cores[status];
  };

  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
          <Users className="w-5 h-5 text-cyan-400" />
          Ranking de Professores por Média
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Ordenar por:</span>
          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as OrdenacaoTipo)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="media_asc">Média (menor → maior)</option>
            <option value="media_desc">Média (maior → menor)</option>
            <option value="carteira">Carteira de Alunos</option>
            <option value="nome">Nome A-Z</option>
          </select>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-6 mb-4 text-xs">
        {Object.entries(statusConfig).map(([key, config]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', `bg-${config.cor}-500`)} />
            {config.label}
          </span>
        ))}
      </div>

      {/* Lista de Professores */}
      <div className="space-y-2">
        {professoresExibidos.map((prof, index) => {
          const isExpandido = expandidos.has(prof.id);
          const cores = getCorStatus(prof.status);

          return (
            <div key={prof.id} className={cn('border rounded-xl overflow-hidden', cores.border)}>
              <button
                onClick={() => toggleExpandido(prof.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                    cores.bg, cores.text
                  )}>
                    {index + 1}
                  </span>
                  <div className="text-left">
                    <p className="font-semibold text-white">{prof.nome}</p>
                    <p className="text-xs text-slate-500">
                      {prof.totalAlunos} alunos • MRR {formatarMoeda(prof.mrrCarteira)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className={cn('text-2xl font-bold', cores.text)}>
                      {prof.mediaAlunosTurma.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">alunos/turma</p>
                  </div>
                  {isExpandido ? (
                    <ChevronUp className="w-5 h-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500" />
                  )}
                </div>
              </button>

              {/* Conteúdo Expandido */}
              {isExpandido && (
                <div className={cn('border-t p-4 bg-slate-900/30', cores.border.replace('border-', 'border-t-'))}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Situação Atual</p>
                      <p className="text-sm text-white">
                        % Folha: <span className={cn('font-semibold', cores.text)}>
                          {formatarPercentual(prof.percentualFolhaAtual)}
                        </span>
                      </p>
                      <p className="text-sm text-white">
                        Margem: <span className="font-semibold">{formatarPercentual(prof.margemAtual)}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Se atingir meta {mediaMeta.toFixed(1)}</p>
                      <p className="text-sm text-white">
                        % Folha: <span className="font-semibold text-emerald-400">
                          {formatarPercentual(prof.percentualFolhaMeta)}
                        </span>
                      </p>
                      <p className="text-sm text-white">
                        Economia: <span className="font-semibold text-emerald-400">
                          {formatarMoeda(prof.economiaMensal)}/mês
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Definir Meta Individual</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={metasIndividuais[prof.id] ?? prof.metaIndividual ?? Math.min(mediaMeta, prof.mediaAlunosTurma + 0.5)}
                          onChange={(e) => setMetasIndividuais(prev => ({
                            ...prev,
                            [prof.id]: Number(e.target.value)
                          }))}
                          step="0.1"
                          min="1.0"
                          max="3.0"
                          className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-center focus:border-cyan-500 focus:outline-none"
                        />
                        <button 
                          onClick={() => handleSalvarMetaIndividual(prof)}
                          disabled={salvandoMeta === prof.id}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-1",
                            metaSalva === prof.id 
                              ? "bg-emerald-500" 
                              : "bg-cyan-500 hover:bg-cyan-600"
                          )}
                        >
                          {salvandoMeta === prof.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : metaSalva === prof.id ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            "Salvar"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {prof.status === 'critico' && (
                    <div className="flex items-center gap-2 text-xs text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      Atenção: Este professor tem quase todas as aulas individuais. Priorize ações de junção de turmas.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Botão Ver Mais */}
      {professores.length > 5 && (
        <button
          onClick={() => setMostrarTodos(!mostrarTodos)}
          className="w-full mt-4 py-3 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:border-cyan-500 transition-colors flex items-center justify-center gap-2"
        >
          <span>
            {mostrarTodos 
              ? 'Mostrar menos' 
              : `Ver todos os ${professores.length} professores`
            }
          </span>
          {mostrarTodos ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      )}
    </section>
  );
}
