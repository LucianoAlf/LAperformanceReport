// Componente: Lista de Cenários Salvos

import { FolderOpen, Trash2, CheckCircle, Clock } from 'lucide-react';
import { Cenario } from '@/lib/simulador/tipos';
import { formatarMoeda } from '@/lib/simulador/calculos';

interface CenariosListaProps {
  cenarios: Cenario[];
  cenarioAtivo: string | null;
  onCarregar: (id: string) => void;
  onDeletar: (id: string) => Promise<void>;
}

export function CenariosLista({ cenarios, cenarioAtivo, onCarregar, onDeletar }: CenariosListaProps) {
  if (cenarios.length === 0) return null;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
          <FolderOpen className="w-4 h-4 text-slate-400" />
        </div>
        <h2 className="font-semibold text-white">CENÁRIOS SALVOS</h2>
        <span className="text-xs text-slate-500">({cenarios.length})</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cenarios.map((cenario) => {
          const isAtivo = cenario.id === cenarioAtivo;
          const foiAplicado = !!cenario.aplicadoEm;
          
          return (
            <div
              key={cenario.id}
              className={`
                relative bg-slate-700/30 border rounded-xl p-4 cursor-pointer
                transition-all hover:bg-slate-700/50
                ${isAtivo ? 'border-cyan-500/50 ring-1 ring-cyan-500/30' : 'border-slate-600'}
              `}
              onClick={() => onCarregar(cenario.id)}
            >
              {/* Badge de status */}
              {foiAplicado && (
                <div className="absolute top-2 right-2">
                  <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                    <CheckCircle className="w-3 h-3" />
                    Aplicado
                  </span>
                </div>
              )}
              
              {/* Nome e descrição */}
              <div className="mb-3">
                <h3 className={`font-medium ${isAtivo ? 'text-cyan-400' : 'text-white'}`}>
                  {cenario.nome}
                </h3>
                {cenario.descricao && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{cenario.descricao}</p>
                )}
              </div>
              
              {/* Resumo */}
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div>
                  <span className="text-slate-500">Alunos:</span>
                  <span className="text-white ml-1">{cenario.inputs.alunosObjetivo}</span>
                </div>
                <div>
                  <span className="text-slate-500">MRR:</span>
                  <span className="text-white ml-1">{formatarMoeda(cenario.resultado.mrrProjetado)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Matrículas:</span>
                  <span className="text-white ml-1">{cenario.resultado.matriculasMensais}/mês</span>
                </div>
                <div>
                  <span className="text-slate-500">Score:</span>
                  <span className={`ml-1 ${
                    cenario.resultado.scoreViabilidade >= 70 ? 'text-emerald-400' :
                    cenario.resultado.scoreViabilidade >= 50 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {cenario.resultado.scoreViabilidade}%
                  </span>
                </div>
              </div>
              
              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-600/50">
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Clock className="w-3 h-3" />
                  {new Date(cenario.criadoEm).toLocaleDateString('pt-BR')}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletar(cenario.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Excluir cenário"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CenariosLista;
