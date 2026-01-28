import { useState, useEffect } from 'react';
import { X, Loader2, Check, Trash2 } from 'lucide-react';
import { Button } from '../../../ui/button';
import { 
  useUpdateProjeto,
  useUnidades,
} from '../../../../hooks/useProjetos';
import type { Projeto, ProjetoPrioridade, ProjetoStatus } from '../../../../types/projetos';

interface ModalEditarProjetoProps {
  isOpen: boolean;
  projeto: Projeto | null;
  onClose: () => void;
  onSuccess: () => void;
  onDelete: (projeto: Projeto) => void;
}

const prioridades: { value: ProjetoPrioridade; label: string }[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const statusOptions: { value: ProjetoStatus; label: string }[] = [
  { value: 'planejamento', label: 'Planejamento' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'em_revisao', label: 'Em Revisão' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'cancelado', label: 'Cancelado' },
];

export function ModalEditarProjeto({ isOpen, projeto, onClose, onSuccess, onDelete }: ModalEditarProjetoProps) {
  const { data: unidades, loading: loadingUnidades } = useUnidades();
  const { updateProjeto, loading: atualizando } = useUpdateProjeto();

  // Estado do formulário
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string | null>(null);
  const [prioridade, setPrioridade] = useState<ProjetoPrioridade>('normal');
  const [status, setStatus] = useState<ProjetoStatus>('planejamento');
  const [orcamento, setOrcamento] = useState('');

  // Preencher formulário quando projeto mudar
  useEffect(() => {
    if (projeto) {
      setNome(projeto.nome || '');
      setDescricao(projeto.descricao || '');
      setDataInicio(projeto.data_inicio || '');
      setDataFim(projeto.data_fim || '');
      setUnidadeSelecionada(projeto.unidade_id || null);
      setPrioridade(projeto.prioridade || 'normal');
      setStatus(projeto.status || 'planejamento');
      setOrcamento(projeto.orcamento?.toString() || '');
    }
  }, [projeto]);

  const handleSubmit = async () => {
    if (!projeto || !nome || !dataInicio || !dataFim) {
      return;
    }

    try {
      await updateProjeto(projeto.id, {
        nome,
        descricao: descricao || undefined,
        data_inicio: dataInicio,
        data_fim: dataFim,
        unidade_id: unidadeSelecionada,
        prioridade,
        status,
        orcamento: orcamento ? parseFloat(orcamento) : undefined,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao atualizar projeto:', error);
    }
  };

  const isFormValid = nome && dataInicio && dataFim;

  if (!isOpen || !projeto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            ✏️ Editar Projeto
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-5">
          {/* Info do Tipo */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-center gap-3">
            <span className="text-2xl">{projeto.tipo?.icone || '📁'}</span>
            <div>
              <div className="text-white font-medium">{projeto.tipo?.nome || 'Projeto'}</div>
              <div className="text-sm text-slate-400">Tipo de projeto não pode ser alterado</div>
            </div>
          </div>

          {/* Nome do Projeto */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Nome do Projeto *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Semana do Violonista 2026"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Descrição
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o projeto..."
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjetoStatus)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
            >
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Data de Início *
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Data de Término *
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          </div>

          {/* Unidade */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Unidade
            </label>
            {loadingUnidades ? (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Carregando unidades...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setUnidadeSelecionada(null)}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${unidadeSelecionada === null
                      ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50'
                      : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                    }
                  `}
                >
                  Todas
                </button>
                {unidades.map((unidade) => (
                  <button
                    key={unidade.id}
                    onClick={() => setUnidadeSelecionada(unidade.id)}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-all
                      ${unidadeSelecionada === unidade.id
                        ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50'
                        : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                      }
                    `}
                  >
                    {unidade.nome}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Orçamento e Prioridade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Orçamento (R$)
              </label>
              <input
                type="number"
                value={orcamento}
                onChange={(e) => setOrcamento(e.target.value)}
                placeholder="0,00"
                step="0.01"
                min="0"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Prioridade
              </label>
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as ProjetoPrioridade)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
              >
                {prioridades.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-900/50">
          <Button
            variant="outline"
            onClick={() => onDelete(projeto)}
            disabled={atualizando}
            className="border-rose-600/50 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Excluir
          </Button>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={atualizando}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || atualizando}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {atualizando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Salvar Alterações
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModalEditarProjeto;
