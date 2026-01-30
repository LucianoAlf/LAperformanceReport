import { useState, useEffect } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { Button } from '../../../ui/button';
import { DatePicker } from '../../../ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';
import { 
  useProjetoTipos, 
  useProjetoTipoFases,
  useCreateProjeto,
  useUnidades,
  useUsuarios,
  useProfessores
} from '../../../../hooks/useProjetos';
import type { ProjetoTipo, ProjetoPrioridade } from '../../../../types/projetos';
import { format, parse } from 'date-fns';

interface ModalNovoProjetoProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const prioridades: { value: ProjetoPrioridade; label: string }[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const avatarColors = [
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-pink-500',
  'from-cyan-500 to-blue-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
];

export function ModalNovoProjeto({ isOpen, onClose, onSuccess }: ModalNovoProjetoProps) {
  // Hooks de dados
  const { data: tipos, loading: loadingTipos } = useProjetoTipos();
  const { data: unidades, loading: loadingUnidades } = useUnidades();
  const { data: usuarios, loading: loadingUsuarios } = useUsuarios();
  const { data: professores, loading: loadingProfessores } = useProfessores();
  const { createProjeto, loading: criando } = useCreateProjeto();

  // Estado do formulário
  const [tipoSelecionado, setTipoSelecionado] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string | null>(null);
  const [prioridade, setPrioridade] = useState<ProjetoPrioridade>('normal');
  const [orcamento, setOrcamento] = useState('');
  const [equipeSelecionada, setEquipeSelecionada] = useState<{ tipo: string; id: number }[]>([]);

  // Buscar fases do tipo selecionado para preview
  const { data: fasesTemplate } = useProjetoTipoFases(tipoSelecionado);

  // Reset form quando fechar
  useEffect(() => {
    if (!isOpen) {
      setTipoSelecionado(null);
      setNome('');
      setDescricao('');
      setDataInicio('');
      setDataFim('');
      setUnidadeSelecionada(null);
      setPrioridade('normal');
      setOrcamento('');
      setEquipeSelecionada([]);
    }
  }, [isOpen]);

  // Calcular data fim sugerida baseada nas fases
  useEffect(() => {
    if (dataInicio && fasesTemplate && fasesTemplate.length > 0) {
      const totalDias = fasesTemplate.reduce((acc, fase) => acc + (fase.duracao_sugerida_dias || 7), 0);
      const dataInicioObj = new Date(dataInicio);
      dataInicioObj.setDate(dataInicioObj.getDate() + totalDias);
      setDataFim(dataInicioObj.toISOString().split('T')[0]);
    }
  }, [dataInicio, fasesTemplate]);

  const toggleEquipe = (tipo: string, id: number) => {
    const existe = equipeSelecionada.some(m => m.tipo === tipo && m.id === id);
    if (existe) {
      setEquipeSelecionada(equipeSelecionada.filter(m => !(m.tipo === tipo && m.id === id)));
    } else {
      setEquipeSelecionada([...equipeSelecionada, { tipo, id }]);
    }
  };

  const isEquipeSelecionado = (tipo: string, id: number) => {
    return equipeSelecionada.some(m => m.tipo === tipo && m.id === id);
  };

  const handleSubmit = async () => {
    if (!tipoSelecionado || !nome || !dataInicio || !dataFim) {
      return;
    }

    try {
      await createProjeto({
        tipo_id: tipoSelecionado,
        nome,
        descricao: descricao || undefined,
        data_inicio: dataInicio,
        data_fim: dataFim,
        unidade_id: unidadeSelecionada,
        prioridade,
        orcamento: orcamento ? parseFloat(orcamento) : undefined,
        equipe: equipeSelecionada.length > 0 ? equipeSelecionada : undefined,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao criar projeto:', error);
    }
  };

  const isFormValid = tipoSelecionado && nome && dataInicio && dataFim;

  if (!isOpen) return null;

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
            📁 Novo Projeto
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
          {/* Tipo de Projeto */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Tipo de Projeto *
            </label>
            {loadingTipos ? (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Carregando tipos...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tipos.map((tipo) => (
                  <button
                    key={tipo.id}
                    onClick={() => setTipoSelecionado(tipo.id)}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
                      ${tipoSelecionado === tipo.id
                        ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50'
                        : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                      }
                    `}
                  >
                    <span>{tipo.icone}</span>
                    <span>{tipo.nome}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview das Fases */}
          {tipoSelecionado && fasesTemplate && fasesTemplate.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2">
                📋 Fases que serão criadas automaticamente:
              </h4>
              <div className="flex flex-wrap gap-2">
                {fasesTemplate.map((fase, index) => (
                  <span
                    key={fase.id}
                    className="px-3 py-1 bg-slate-700/50 text-slate-300 text-xs rounded-full"
                  >
                    {index + 1}. {fase.nome} ({fase.duracao_sugerida_dias || 7} dias)
                  </span>
                ))}
              </div>
            </div>
          )}

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

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Data de Início *
              </label>
              <DatePicker
                date={dataInicio ? parse(dataInicio, 'yyyy-MM-dd', new Date()) : undefined}
                onDateChange={(date) => setDataInicio(date ? format(date, 'yyyy-MM-dd') : '')}
                placeholder="Selecione a data"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Data de Término *
              </label>
              <DatePicker
                date={dataFim ? parse(dataFim, 'yyyy-MM-dd', new Date()) : undefined}
                onDateChange={(date) => setDataFim(date ? format(date, 'yyyy-MM-dd') : '')}
                placeholder="Selecione a data"
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

          {/* Equipe */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Equipe
            </label>
            <div className="space-y-3">
              {/* Usuários */}
              {!loadingUsuarios && usuarios.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500 mb-2 block">Usuários</span>
                  <div className="flex flex-wrap gap-2">
                    {usuarios.map((usuario, index) => (
                      <button
                        key={`usuario-${usuario.id}`}
                        onClick={() => toggleEquipe('usuario', usuario.id)}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                          ${isEquipeSelecionado('usuario', usuario.id)
                            ? 'bg-violet-500/30 border border-violet-500/50'
                            : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
                          }
                        `}
                      >
                        <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${avatarColors[index % avatarColors.length]} flex items-center justify-center text-white text-xs font-bold`}>
                          {usuario.nome.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-slate-300">{usuario.nome}</span>
                        {isEquipeSelecionado('usuario', usuario.id) && (
                          <Check className="w-4 h-4 text-violet-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Professores */}
              {!loadingProfessores && professores.length > 0 && (
                <div>
                  <span className="text-xs text-slate-500 mb-2 block">Professores</span>
                  <div className="flex flex-wrap gap-2">
                    {professores.slice(0, 10).map((professor, index) => (
                      <button
                        key={`professor-${professor.id}`}
                        onClick={() => toggleEquipe('professor', professor.id)}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                          ${isEquipeSelecionado('professor', professor.id)
                            ? 'bg-cyan-500/30 border border-cyan-500/50'
                            : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
                          }
                        `}
                      >
                        <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${avatarColors[(index + 2) % avatarColors.length]} flex items-center justify-center text-white text-xs font-bold`}>
                          {professor.nome.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-slate-300">{professor.nome}</span>
                        {isEquipeSelecionado('professor', professor.id) && (
                          <Check className="w-4 h-4 text-cyan-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
              <Select value={prioridade} onValueChange={(value) => setPrioridade(value as ProjetoPrioridade)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione a prioridade" />
                </SelectTrigger>
                <SelectContent>
                  {prioridades.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-900/50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={criando}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || criando}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            {criando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Criar Projeto
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ModalNovoProjeto;
