import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Building2, X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Sala } from './SalasPage';

// Interface para Unidade
interface Unidade {
  id: string;
  nome: string;
  codigo: string;
}

// Tipos de sala disponíveis
const TIPOS_SALA = [
  'Piano/Teclado',
  'Bateria/Percussão',
  'Cordas',
  'Sopro',
  'Canto/Vocal',
  'Teoria Musical',
  'Multiuso/Coringa',
  'Violino',
];

interface ModalEditarSalaProps {
  sala: Sala | null;
  unidades: Unidade[];
  onClose: () => void;
  onSalvar: () => void;
}

export function ModalEditarSala({ sala, unidades, onClose, onSalvar }: ModalEditarSalaProps) {
  const { isAdmin, usuario } = useAuth();
  const isEdicao = !!sala;
  
  // Estados do formulário
  const [nome, setNome] = useState(sala?.nome || '');
  const [unidadeId, setUnidadeId] = useState(sala?.unidade_id || usuario?.unidade_id || '');
  const [tipoSala, setTipoSala] = useState(sala?.tipo_sala || '');
  const [capacidadeMaxima, setCapacidadeMaxima] = useState(sala?.capacidade_maxima || 4);
  const [bufferOperacional, setBufferOperacional] = useState(sala?.buffer_operacional || 10);
  const [salaCoringa, setSalaCoringa] = useState(sala?.sala_coringa || false);
  const [salvando, setSalvando] = useState(false);

  // Preencher dados quando editar
  useEffect(() => {
    if (sala) {
      setNome(sala.nome);
      setUnidadeId(sala.unidade_id);
      setTipoSala(sala.tipo_sala || '');
      setCapacidadeMaxima(sala.capacidade_maxima);
      setBufferOperacional(sala.buffer_operacional);
      setSalaCoringa(sala.sala_coringa);
    }
  }, [sala]);

  // Salvar sala
  async function handleSalvar() {
    // Validações
    if (!nome.trim()) {
      alert('Informe o nome da sala.');
      return;
    }
    if (!unidadeId) {
      alert('Selecione a unidade.');
      return;
    }
    if (!tipoSala) {
      alert('Selecione o tipo de sala.');
      return;
    }
    if (capacidadeMaxima < 1) {
      alert('A capacidade mínima é 1 aluno.');
      return;
    }

    setSalvando(true);

    try {
      const dadosSala = {
        nome: nome.trim(),
        unidade_id: unidadeId,
        tipo_sala: tipoSala,
        capacidade_maxima: capacidadeMaxima,
        buffer_operacional: bufferOperacional,
        sala_coringa: salaCoringa,
        ativo: true,
        updated_at: new Date().toISOString(),
      };

      if (isEdicao && sala) {
        // Atualizar sala existente
        const { error } = await supabase
          .from('salas')
          .update(dadosSala)
          .eq('id', sala.id);

        if (error) {
          console.error('Erro ao atualizar sala:', error);
          alert('Erro ao atualizar sala: ' + error.message);
          return;
        }
      } else {
        // Criar nova sala
        const { error } = await supabase
          .from('salas')
          .insert({
            ...dadosSala,
            created_at: new Date().toISOString(),
          });

        if (error) {
          console.error('Erro ao criar sala:', error);
          alert('Erro ao criar sala: ' + error.message);
          return;
        }
      }

      onSalvar();
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao salvar sala. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  // Fechar com Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Building2 className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              {isEdicao ? 'Editar Sala' : 'Nova Sala'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
          <div className="space-y-6">
          
          {/* Seção: Informações Gerais */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Informações Gerais
            </h4>

            {/* Nome da Sala */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Nome Identificador da Sala *
              </label>
              <input 
                type="text" 
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Sala 1 - Piano"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
              />
            </div>

            {/* Unidade e Tipo */}
            <div className={`grid ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Unidade *
                  </label>
                  <Select value={unidadeId} onValueChange={setUnidadeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidades.map((unidade) => (
                        <SelectItem key={unidade.id} value={unidade.id}>
                          {unidade.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Tipo de Sala *
                </label>
                <Select value={tipoSala} onValueChange={setTipoSala}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_SALA.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Seção: Capacidade e Operacional */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Capacidade e Operacional
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Capacidade Máxima (Alunos) *
                </label>
                <input 
                  type="number" 
                  value={capacidadeMaxima}
                  onChange={(e) => setCapacidadeMaxima(parseInt(e.target.value) || 1)}
                  min={1}
                  max={20}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Buffer Operacional (Minutos) *
                </label>
                <input 
                  type="number" 
                  value={bufferOperacional}
                  onChange={(e) => setBufferOperacional(parseInt(e.target.value) || 0)}
                  min={0}
                  max={60}
                  step={5}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Tempo mínimo de intervalo entre aulas
                </p>
              </div>
            </div>
          </div>

          {/* Seção: Configurações Especiais */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wide">
              Configurações Especiais
            </h4>

            {/* Checkbox Sala Coringa */}
            <label className="flex items-start gap-3 p-3 bg-slate-900/50 border border-slate-700 rounded-xl cursor-pointer hover:border-emerald-500/50 transition group">
              <div className="relative mt-0.5">
                <input 
                  type="checkbox" 
                  checked={salaCoringa}
                  onChange={(e) => setSalaCoringa(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="w-5 h-5 rounded border-2 border-slate-600 bg-slate-800 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all group-hover:border-slate-500 peer-checked:group-hover:bg-emerald-400 flex items-center justify-center">
                  <svg className={`w-3 h-3 text-white transition-opacity ${salaCoringa ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div>
                <div className="font-medium text-white text-sm mb-1">✨ Sala Coringa</div>
                <p className="text-xs text-slate-400">
                  Esta sala pode ser usada para múltiplos tipos de aula
                </p>
              </div>
            </label>
          </div>

          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 p-6 flex items-center justify-end gap-3 flex-shrink-0">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 border border-slate-700 transition"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-purple-600 hover:bg-purple-500 px-6 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Salvando...
              </>
            ) : (
              <>
                {isEdicao ? 'Salvar Alterações' : 'Criar Sala'}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
