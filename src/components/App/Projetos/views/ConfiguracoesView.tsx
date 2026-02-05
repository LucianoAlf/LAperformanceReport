import React, { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  ListChecks, 
  Bell, 
  Users, 
  Bot, 
  MessageSquare,
  Pencil,
  Trash2,
  GripVertical,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  Play,
  Clock,
  AlertTriangle,
  Calendar,
  FileText,
  Plus,
  X
} from 'lucide-react';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../../ui/alert-dialog';
import { toast } from 'sonner';
import { 
  useNotificacaoConfig, 
  NOTIFICACAO_TIPO_LABELS, 
  NOTIFICACAO_TIPO_DESCRICOES,
  type NotificacaoConfig 
} from '../../../../hooks/useNotificacoes';
import { 
  getWhatsAppConnectionStatus, 
  sendTestMessage, 
  formatPhoneNumber,
  type WhatsAppConnectionStatus 
} from '../../../../services/whatsapp';
import { supabase } from '../../../../lib/supabase';

type SettingsSection = 'tipos' | 'fases' | 'notificacoes' | 'equipe' | 'fabio' | 'whatsapp';

const settingsNav = [
  { id: 'tipos' as const, label: 'Tipos de Projeto', icon: FolderKanban },
  { id: 'fases' as const, label: 'Templates de Fases', icon: ListChecks },
  { id: 'notificacoes' as const, label: 'Notificações', icon: Bell },
  { id: 'equipe' as const, label: 'Equipe e Permissões', icon: Users },
  { id: 'fabio' as const, label: 'Fábio IA', icon: Bot },
  { id: 'whatsapp' as const, label: 'WhatsApp', icon: MessageSquare },
];

// Interface para Fase Template
interface FaseTemplate {
  id: number;
  tipo_id: number;
  nome: string;
  ordem: number;
  duracao_sugerida_dias: number | null;
  descricao: string | null;
  created_at: string;
  total_tarefas?: number;
}

// Interface para Tipo de Projeto
interface ProjetoTipo {
  id: number;
  nome: string;
  icone: string;
  cor: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  total_projetos?: number;
}

// Cores disponíveis para tipos de projeto
const CORES_DISPONIVEIS = [
  { value: '#8b5cf6', label: 'Violeta', bg: 'bg-violet-500' },
  { value: '#06b6d4', label: 'Ciano', bg: 'bg-cyan-500' },
  { value: '#ec4899', label: 'Rosa', bg: 'bg-pink-500' },
  { value: '#10b981', label: 'Verde', bg: 'bg-emerald-500' },
  { value: '#f59e0b', label: 'Âmbar', bg: 'bg-amber-500' },
  { value: '#3b82f6', label: 'Azul', bg: 'bg-blue-500' },
  { value: '#ef4444', label: 'Vermelho', bg: 'bg-red-500' },
  { value: '#a855f7', label: 'Roxo', bg: 'bg-purple-500' },
];

// Ícones disponíveis para tipos de projeto
const ICONES_DISPONIVEIS = ['🎉', '🎵', '🎸', '📚', '📱', '🎬', '🎤', '🎹', '🎺', '🎻', '🥁', '🎧', '📝', '📊', '🎨', '🎭', '🎪', '🏆', '⭐', '🌟'];

export function ConfiguracoesView() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('tipos');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6 min-h-[calc(100vh-320px)]">
      {/* Sidebar */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 h-fit lg:sticky lg:top-4">
        <nav className="space-y-1">
          {settingsNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left
                  ${isActive 
                    ? 'bg-violet-500/20 text-violet-400' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Conteúdo */}
      <div className="space-y-6">
        {/* Tipos de Projeto */}
        {activeSection === 'tipos' && <TiposProjetoSection />}

        {/* Templates de Fases */}
        {activeSection === 'fases' && <TemplatesFasesSection />}

        {/* Notificações */}
        {activeSection === 'notificacoes' && (
          <NotificacoesSection />
        )}

        {/* Equipe e Permissões */}
        {activeSection === 'equipe' && (
          <EquipeSection />
        )}

        {/* Fábio IA */}
        {activeSection === 'fabio' && (
          <FabioIASection />
        )}

        {/* WhatsApp */}
        {activeSection === 'whatsapp' && (
          <WhatsAppSection />
        )}
      </div>
    </div>
  );
}

// ============================================
// Seção de Templates de Fases (CRUD completo com drag-and-drop)
// ============================================
function TemplatesFasesSection() {
  const [tipos, setTipos] = useState<ProjetoTipo[]>([]);
  const [fases, setFases] = useState<FaseTemplate[]>([]);
  const [selectedTipoId, setSelectedTipoId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal de criar/editar fase
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFase, setEditingFase] = useState<FaseTemplate | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    duracao_sugerida_dias: 7,
    descricao: '',
  });
  
  // Modal de confirmação de exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [faseToDelete, setFaseToDelete] = useState<FaseTemplate | null>(null);
  
  // Estado para drag-and-drop
  const [draggedFase, setDraggedFase] = useState<FaseTemplate | null>(null);

  // Carregar tipos de projeto
  const loadTipos = async () => {
    try {
      const { data, error } = await supabase
        .from('projeto_tipos')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setTipos(data || []);
      
      // Selecionar o primeiro tipo por padrão
      if (data && data.length > 0 && !selectedTipoId) {
        setSelectedTipoId(data[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar tipos:', error);
      toast.error('Erro ao carregar tipos de projeto');
    }
  };

  // Carregar fases do tipo selecionado
  const loadFases = async () => {
    if (!selectedTipoId) {
      setFases([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projeto_tipo_fases_template')
        .select('*')
        .eq('tipo_id', selectedTipoId)
        .order('ordem');

      if (error) throw error;

      // Buscar contagem de tarefas para cada fase
      const fasesComContagem = await Promise.all(
        (data || []).map(async (fase) => {
          const { count } = await supabase
            .from('projeto_tipo_tarefas_template')
            .select('*', { count: 'exact', head: true })
            .eq('fase_template_id', fase.id);
          return { ...fase, total_tarefas: count || 0 };
        })
      );

      setFases(fasesComContagem);
    } catch (error) {
      console.error('Erro ao carregar fases:', error);
      toast.error('Erro ao carregar fases do template');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTipos();
  }, []);

  useEffect(() => {
    if (selectedTipoId) {
      loadFases();
    }
  }, [selectedTipoId]);

  // Obter tipo selecionado
  const selectedTipo = tipos.find(t => t.id === selectedTipoId);

  // Formatar duração em texto legível
  const formatDuracao = (dias: number | null) => {
    if (!dias) return 'Não definida';
    if (dias === 1) return '1 dia';
    if (dias < 7) return `${dias} dias`;
    if (dias === 7) return '1 semana';
    if (dias < 14) return `${dias} dias`;
    if (dias === 14) return '2 semanas';
    if (dias < 30) return `${Math.floor(dias / 7)} semanas`;
    if (dias === 30) return '1 mês';
    return `${dias} dias`;
  };

  // Abrir modal para criar nova fase
  const handleNovaFase = () => {
    setEditingFase(null);
    setFormData({
      nome: '',
      duracao_sugerida_dias: 7,
      descricao: '',
    });
    setModalOpen(true);
  };

  // Abrir modal para editar fase existente
  const handleEditarFase = (fase: FaseTemplate) => {
    setEditingFase(fase);
    setFormData({
      nome: fase.nome,
      duracao_sugerida_dias: fase.duracao_sugerida_dias || 7,
      descricao: fase.descricao || '',
    });
    setModalOpen(true);
  };

  // Salvar fase (criar ou atualizar)
  const handleSalvar = async () => {
    if (!formData.nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (!selectedTipoId) {
      toast.error('Selecione um tipo de projeto');
      return;
    }

    setSaving(true);
    try {
      if (editingFase) {
        // Atualizar fase existente
        const { error } = await supabase
          .from('projeto_tipo_fases_template')
          .update({
            nome: formData.nome.trim(),
            duracao_sugerida_dias: formData.duracao_sugerida_dias,
            descricao: formData.descricao.trim() || null,
          })
          .eq('id', editingFase.id);

        if (error) throw error;
        toast.success('Fase atualizada com sucesso!');
      } else {
        // Criar nova fase (com ordem = última + 1)
        const novaOrdem = fases.length > 0 ? Math.max(...fases.map(f => f.ordem)) + 1 : 1;
        
        const { error } = await supabase
          .from('projeto_tipo_fases_template')
          .insert({
            tipo_id: selectedTipoId,
            nome: formData.nome.trim(),
            ordem: novaOrdem,
            duracao_sugerida_dias: formData.duracao_sugerida_dias,
            descricao: formData.descricao.trim() || null,
          });

        if (error) throw error;
        toast.success('Fase criada com sucesso!');
      }

      setModalOpen(false);
      loadFases();
    } catch (error) {
      console.error('Erro ao salvar fase:', error);
      toast.error('Erro ao salvar fase');
    } finally {
      setSaving(false);
    }
  };

  // Confirmar exclusão
  const handleConfirmarExclusao = (fase: FaseTemplate) => {
    setFaseToDelete(fase);
    setDeleteDialogOpen(true);
  };

  // Excluir fase
  const handleExcluir = async () => {
    if (!faseToDelete) return;

    setSaving(true);
    try {
      // Primeiro excluir tarefas vinculadas
      await supabase
        .from('projeto_tipo_tarefas_template')
        .delete()
        .eq('fase_template_id', faseToDelete.id);

      // Depois excluir a fase
      const { error } = await supabase
        .from('projeto_tipo_fases_template')
        .delete()
        .eq('id', faseToDelete.id);

      if (error) throw error;

      // Reordenar fases restantes
      const fasesRestantes = fases.filter(f => f.id !== faseToDelete.id);
      for (let i = 0; i < fasesRestantes.length; i++) {
        await supabase
          .from('projeto_tipo_fases_template')
          .update({ ordem: i + 1 })
          .eq('id', fasesRestantes[i].id);
      }

      toast.success('Fase excluída com sucesso!');
      setDeleteDialogOpen(false);
      setFaseToDelete(null);
      loadFases();
    } catch (error) {
      console.error('Erro ao excluir fase:', error);
      toast.error('Erro ao excluir fase');
    } finally {
      setSaving(false);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, fase: FaseTemplate) => {
    setDraggedFase(fase);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetFase: FaseTemplate) => {
    e.preventDefault();
    if (!draggedFase || draggedFase.id === targetFase.id) {
      setDraggedFase(null);
      return;
    }

    // Reordenar localmente
    const newFases = [...fases];
    const draggedIndex = newFases.findIndex(f => f.id === draggedFase.id);
    const targetIndex = newFases.findIndex(f => f.id === targetFase.id);

    newFases.splice(draggedIndex, 1);
    newFases.splice(targetIndex, 0, draggedFase);

    // Atualizar ordens
    const fasesReordenadas = newFases.map((f, index) => ({ ...f, ordem: index + 1 }));
    setFases(fasesReordenadas);
    setDraggedFase(null);

    // Salvar no banco
    try {
      for (const fase of fasesReordenadas) {
        await supabase
          .from('projeto_tipo_fases_template')
          .update({ ordem: fase.ordem })
          .eq('id', fase.id);
      }
      toast.success('Ordem atualizada!');
    } catch (error) {
      console.error('Erro ao reordenar:', error);
      toast.error('Erro ao salvar nova ordem');
      loadFases(); // Recarregar em caso de erro
    }
  };

  const handleDragEnd = () => {
    setDraggedFase(null);
  };

  if (loading && tipos.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        <span className="ml-3 text-slate-400">Carregando templates...</span>
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-violet-400" />
          Templates de Fases
        </h2>
        <p className="text-slate-400 text-sm mt-1">Configure as fases padrão para cada tipo de projeto</p>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm text-slate-400">Selecione o tipo de projeto:</label>
        <Select 
          value={selectedTipoId?.toString() || ''} 
          onValueChange={(value) => setSelectedTipoId(Number(value))}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Selecione o tipo" />
          </SelectTrigger>
          <SelectContent>
            {tipos.map((tipo) => (
              <SelectItem key={tipo.id} value={tipo.id.toString()}>
                {tipo.icone} {tipo.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTipo && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-white">
              {selectedTipo.icone} {selectedTipo.nome} - Fases do Template
            </h3>
            <Button onClick={handleNovaFase} variant="outline" size="sm" className="border-slate-700">
              <Plus className="w-4 h-4 mr-1" />
              Adicionar Fase
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            </div>
          ) : fases.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma fase cadastrada para este tipo</p>
              <Button onClick={handleNovaFase} variant="link" className="mt-2 text-violet-400">
                Criar primeira fase
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {fases.map((fase) => (
                <div 
                  key={fase.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, fase)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, fase)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-4 bg-slate-800/30 border border-slate-700 rounded-lg hover:border-slate-600 transition-all ${
                    draggedFase?.id === fase.id ? 'opacity-50 border-violet-500' : ''
                  }`}
                >
                  <div className="text-slate-500 cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="w-7 h-7 rounded-md bg-violet-500/20 text-violet-400 flex items-center justify-center text-xs font-bold">
                    {fase.ordem}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-medium text-sm">{fase.nome}</div>
                    <span className="text-xs text-slate-500">Duração sugerida: {formatDuracao(fase.duracao_sugerida_dias)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{fase.total_tarefas} tarefa{fase.total_tarefas !== 1 ? 's' : ''} padrão</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-white"
                      onClick={() => handleEditarFase(fase)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-rose-400"
                      onClick={() => handleConfirmarExclusao(fase)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {fases.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <GripVertical className="w-3 h-3" />
                Arraste as fases para reordenar
              </p>
            </div>
          )}
        </div>
      )}

      {!selectedTipo && tipos.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
          <ListChecks className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400">Selecione um tipo de projeto para ver as fases</p>
        </div>
      )}

      {/* Modal de Criar/Editar Fase */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingFase ? 'Editar Fase' : 'Nova Fase'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Nome da Fase *</label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Planejamento"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Duração Sugerida */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Duração Sugerida (dias)</label>
              <Select 
                value={formData.duracao_sugerida_dias.toString()} 
                onValueChange={(value) => setFormData({ ...formData, duracao_sugerida_dias: Number(value) })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 dia</SelectItem>
                  <SelectItem value="2">2 dias</SelectItem>
                  <SelectItem value="3">3 dias</SelectItem>
                  <SelectItem value="5">5 dias</SelectItem>
                  <SelectItem value="7">1 semana</SelectItem>
                  <SelectItem value="14">2 semanas</SelectItem>
                  <SelectItem value="21">3 semanas</SelectItem>
                  <SelectItem value="30">1 mês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Descrição</label>
              <Input
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Breve descrição das atividades desta fase"
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-slate-700">
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={saving} className="bg-violet-600 hover:bg-violet-500">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                editingFase ? 'Salvar Alterações' : 'Criar Fase'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir Fase</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir a fase <strong className="text-white">{faseToDelete?.nome}</strong>?
              {(faseToDelete?.total_tarefas || 0) > 0 && (
                <span className="block mt-2 text-amber-400">
                  ⚠️ Esta fase possui {faseToDelete?.total_tarefas} tarefa(s) que também serão excluídas.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleExcluir} 
              className="bg-rose-600 hover:bg-rose-500"
              disabled={saving}
            >
              {saving ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================
// Seção de Tipos de Projeto (CRUD completo)
// ============================================
function TiposProjetoSection() {
  const [tipos, setTipos] = useState<ProjetoTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal de criar/editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTipo, setEditingTipo] = useState<ProjetoTipo | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    icone: '📁',
    cor: '#8b5cf6',
    descricao: '',
  });
  
  // Modal de confirmação de exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tipoToDelete, setTipoToDelete] = useState<ProjetoTipo | null>(null);

  // Carregar tipos do banco
  const loadTipos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projeto_tipos')
        .select('*')
        .order('id');

      if (error) throw error;

      // Buscar contagem de projetos para cada tipo
      const tiposComContagem = await Promise.all(
        (data || []).map(async (tipo) => {
          const { count } = await supabase
            .from('projetos')
            .select('*', { count: 'exact', head: true })
            .eq('tipo_id', tipo.id);
          return { ...tipo, total_projetos: count || 0 };
        })
      );

      setTipos(tiposComContagem);
    } catch (error) {
      console.error('Erro ao carregar tipos:', error);
      toast.error('Erro ao carregar tipos de projeto');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTipos();
  }, []);

  // Abrir modal para criar novo tipo
  const handleNovoTipo = () => {
    setEditingTipo(null);
    setFormData({
      nome: '',
      icone: '📁',
      cor: '#8b5cf6',
      descricao: '',
    });
    setModalOpen(true);
  };

  // Abrir modal para editar tipo existente
  const handleEditarTipo = (tipo: ProjetoTipo) => {
    setEditingTipo(tipo);
    setFormData({
      nome: tipo.nome,
      icone: tipo.icone,
      cor: tipo.cor,
      descricao: tipo.descricao || '',
    });
    setModalOpen(true);
  };

  // Salvar tipo (criar ou atualizar)
  const handleSalvar = async () => {
    if (!formData.nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (editingTipo) {
        // Atualizar tipo existente
        const { error } = await supabase
          .from('projeto_tipos')
          .update({
            nome: formData.nome.trim(),
            icone: formData.icone,
            cor: formData.cor,
            descricao: formData.descricao.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTipo.id);

        if (error) throw error;
        toast.success('Tipo atualizado com sucesso!');
      } else {
        // Criar novo tipo
        const { error } = await supabase
          .from('projeto_tipos')
          .insert({
            nome: formData.nome.trim(),
            icone: formData.icone,
            cor: formData.cor,
            descricao: formData.descricao.trim() || null,
          });

        if (error) throw error;
        toast.success('Tipo criado com sucesso!');
      }

      setModalOpen(false);
      loadTipos();
    } catch (error) {
      console.error('Erro ao salvar tipo:', error);
      toast.error('Erro ao salvar tipo de projeto');
    } finally {
      setSaving(false);
    }
  };

  // Confirmar exclusão
  const handleConfirmarExclusao = (tipo: ProjetoTipo) => {
    setTipoToDelete(tipo);
    setDeleteDialogOpen(true);
  };

  // Excluir tipo
  const handleExcluir = async () => {
    if (!tipoToDelete) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('projeto_tipos')
        .delete()
        .eq('id', tipoToDelete.id);

      if (error) throw error;
      toast.success('Tipo excluído com sucesso!');
      setDeleteDialogOpen(false);
      setTipoToDelete(null);
      loadTipos();
    } catch (error) {
      console.error('Erro ao excluir tipo:', error);
      toast.error('Erro ao excluir tipo. Verifique se não há projetos vinculados.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle ativo/inativo
  const handleToggleAtivo = async (tipo: ProjetoTipo) => {
    try {
      const { error } = await supabase
        .from('projeto_tipos')
        .update({ ativo: !tipo.ativo, updated_at: new Date().toISOString() })
        .eq('id', tipo.id);

      if (error) throw error;
      toast.success(tipo.ativo ? 'Tipo desativado' : 'Tipo ativado');
      loadTipos();
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error('Erro ao alterar status do tipo');
    }
  };

  // Encontrar label da cor
  const getCorLabel = (corHex: string) => {
    const cor = CORES_DISPONIVEIS.find(c => c.value === corHex);
    return cor?.label || 'Personalizada';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        <span className="ml-3 text-slate-400">Carregando tipos de projeto...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-violet-400" />
            Tipos de Projeto
          </h2>
          <p className="text-slate-400 text-sm mt-1">Gerencie os tipos de projeto disponíveis no sistema</p>
        </div>
        <Button onClick={handleNovoTipo} className="bg-violet-600 hover:bg-violet-500">
          <Plus className="w-4 h-4 mr-2" />
          Novo Tipo
        </Button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Ícone</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Nome</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Cor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Projetos</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tipos.map((tipo) => (
              <tr key={tipo.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                    style={{ backgroundColor: `${tipo.cor}20` }}
                  >
                    {tipo.icone}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="font-semibold text-white">{tipo.nome}</span>
                  {tipo.descricao && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{tipo.descricao}</p>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded" 
                      style={{ backgroundColor: tipo.cor }}
                    />
                    <span className="text-slate-400 text-sm">{getCorLabel(tipo.cor)}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-400">{tipo.total_projetos} projeto{tipo.total_projetos !== 1 ? 's' : ''}</td>
                <td className="px-4 py-4">
                  <button
                    onClick={() => handleToggleAtivo(tipo)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                      tipo.ativo 
                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {tipo.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-white"
                      onClick={() => handleEditarTipo(tipo)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-rose-400"
                      onClick={() => handleConfirmarExclusao(tipo)}
                      disabled={(tipo.total_projetos || 0) > 0}
                      title={(tipo.total_projetos || 0) > 0 ? 'Não é possível excluir tipos com projetos vinculados' : 'Excluir tipo'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tipos.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum tipo de projeto cadastrado</p>
            <Button onClick={handleNovoTipo} variant="link" className="mt-2 text-violet-400">
              Criar primeiro tipo
            </Button>
          </div>
        )}
      </div>

      {/* Modal de Criar/Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingTipo ? 'Editar Tipo de Projeto' : 'Novo Tipo de Projeto'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Nome *</label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Recital de Final de Ano"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Descrição</label>
              <Input
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Breve descrição do tipo de projeto"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Ícone */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Ícone</label>
              <div className="flex flex-wrap gap-2">
                {ICONES_DISPONIVEIS.map((icone) => (
                  <button
                    key={icone}
                    type="button"
                    onClick={() => setFormData({ ...formData, icone })}
                    className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                      formData.icone === icone
                        ? 'bg-violet-500/30 ring-2 ring-violet-500'
                        : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    {icone}
                  </button>
                ))}
              </div>
            </div>

            {/* Cor */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Cor</label>
              <div className="flex flex-wrap gap-2">
                {CORES_DISPONIVEIS.map((cor) => (
                  <button
                    key={cor.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, cor: cor.value })}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                      formData.cor === cor.value
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: cor.value }}
                    title={cor.label}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="pt-4 border-t border-slate-800">
              <label className="text-sm font-medium text-slate-300 mb-2 block">Preview</label>
              <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                  style={{ backgroundColor: `${formData.cor}20` }}
                >
                  {formData.icone}
                </div>
                <div>
                  <div className="font-semibold text-white">{formData.nome || 'Nome do Tipo'}</div>
                  <div className="text-xs text-slate-400">{formData.descricao || 'Descrição do tipo'}</div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-slate-700">
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={saving} className="bg-violet-600 hover:bg-violet-500">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                editingTipo ? 'Salvar Alterações' : 'Criar Tipo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir Tipo de Projeto</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir o tipo <strong className="text-white">{tipoToDelete?.nome}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleExcluir} 
              className="bg-rose-600 hover:bg-rose-500"
              disabled={saving}
            >
              {saving ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================
// Seção de Notificações (com dados reais do Supabase)
// ============================================
function NotificacoesSection() {
  const { data: configs, loading, toggleAtivo, updateConfig } = useNotificacaoConfig();
  const [saving, setSaving] = useState<number | null>(null);

  const TIPO_ICONS: Record<string, { icon: string; bgColor: string }> = {
    tarefa_atrasada: { icon: '⚠️', bgColor: 'bg-rose-500/20' },
    tarefa_vencendo: { icon: '⏰', bgColor: 'bg-amber-500/20' },
    projeto_parado: { icon: '🚫', bgColor: 'bg-slate-500/20' },
    resumo_semanal: { icon: '📊', bgColor: 'bg-cyan-500/20' },
  };

  const antecedenciaOptions = [
    { value: 1, label: '1 dia' },
    { value: 3, label: '3 dias' },
    { value: 7, label: '7 dias' },
    { value: 15, label: '15 dias' },
    { value: 30, label: '30 dias' },
  ];

  const diasSemanaOptions = [
    { value: 0, label: 'Domingo' },
    { value: 1, label: 'Segunda-feira' },
    { value: 2, label: 'Terça-feira' },
    { value: 3, label: 'Quarta-feira' },
    { value: 4, label: 'Quinta-feira' },
    { value: 5, label: 'Sexta-feira' },
    { value: 6, label: 'Sábado' },
  ];

  const handleToggle = async (config: NotificacaoConfig) => {
    setSaving(config.id);
    await toggleAtivo(config.id);
    setSaving(null);
  };

  const handleUpdateConfig = async (id: number, field: string, value: number | string) => {
    setSaving(id);
    await updateConfig(id, { [field]: value });
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        <span className="ml-3 text-slate-400">Carregando configurações...</span>
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-violet-400" />
          Central de Notificações
        </h2>
        <p className="text-slate-400 text-sm mt-1">Configure alertas automáticos para a equipe</p>
      </div>

      <div className="space-y-4">
        {configs.map((config) => {
          const tipoInfo = TIPO_ICONS[config.tipo] || { icon: '🔔', bgColor: 'bg-slate-500/20' };
          const label = NOTIFICACAO_TIPO_LABELS[config.tipo] || config.tipo;
          const descricao = NOTIFICACAO_TIPO_DESCRICOES[config.tipo] || '';

          return (
            <div key={config.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${tipoInfo.bgColor} flex items-center justify-center`}>
                    <span className="text-lg">{tipoInfo.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{label}</h3>
                    <p className="text-sm text-slate-400">{descricao}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(config)}
                  disabled={saving === config.id}
                  className={`w-12 h-6 rounded-full transition-colors relative ${config.ativo ? 'bg-violet-500' : 'bg-slate-700'}`}
                >
                  {saving === config.id ? (
                    <Loader2 className="w-4 h-4 animate-spin absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
                  ) : (
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.ativo ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  )}
                </button>
              </div>

              {config.ativo && (
                <div className="space-y-3 border-t border-slate-800 pt-4">
                  {/* Antecedência para tarefa_vencendo */}
                  {config.tipo === 'tarefa_vencendo' && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-400 w-32">Antecedência:</span>
                      <Select 
                        value={config.antecedencia_dias?.toString() || '3'}
                        onValueChange={(value) => handleUpdateConfig(config.id, 'antecedencia_dias', parseInt(value))}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {antecedenciaOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value.toString()}>{opt.label} antes</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Dias de inatividade para projeto_parado */}
                  {config.tipo === 'projeto_parado' && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-400 w-32">Após:</span>
                      <Select 
                        value={config.dias_inatividade?.toString() || '7'}
                        onValueChange={(value) => handleUpdateConfig(config.id, 'dias_inatividade', parseInt(value))}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {antecedenciaOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value.toString()}>{opt.label} sem atividade</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Dia da semana para resumo_semanal */}
                  {config.tipo === 'resumo_semanal' && (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-400 w-32">Dia de envio:</span>
                      <Select 
                        value={config.dia_semana?.toString() || '1'}
                        onValueChange={(value) => handleUpdateConfig(config.id, 'dia_semana', parseInt(value))}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {diasSemanaOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value.toString()}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Horário de envio */}
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-400 w-32">Horário:</span>
                    <Select 
                      value={config.hora_envio?.slice(0, 5) || '09:00'}
                      onValueChange={(value) => handleUpdateConfig(config.id, 'hora_envio', value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map(hora => (
                          <SelectItem key={hora} value={hora}>{hora}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Info sobre destinatários */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                    <span>💡 Configure os destinatários na seção WhatsApp</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
        <p className="text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Configurações salvas automaticamente
        </p>
      </div>
    </>
  );
}

// ============================================
// Interface para Membro da Equipe
// ============================================
interface MembroEquipe {
  id: number;
  usuario_id: number | null;
  nome: string;
  cargo: string | null;
  tipo: string;
  avatar_cor: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// Interface para Permissão
interface PermissaoConfig {
  id: number;
  chave: string;
  valor: boolean;
  descricao: string | null;
}

// Cores disponíveis para avatar
const CORES_AVATAR = [
  { value: 'violet', label: 'Violeta', bg: 'bg-violet-500/20', text: 'text-violet-400' },
  { value: 'emerald', label: 'Verde', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { value: 'cyan', label: 'Ciano', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  { value: 'rose', label: 'Rosa', bg: 'bg-rose-500/20', text: 'text-rose-400' },
  { value: 'amber', label: 'Âmbar', bg: 'bg-amber-500/20', text: 'text-amber-400' },
  { value: 'blue', label: 'Azul', bg: 'bg-blue-500/20', text: 'text-blue-400' },
];

// Labels para permissões
const PERMISSAO_LABELS: Record<string, { label: string; desc: string }> = {
  ver_projetos: { label: 'Ver projetos da escola', desc: 'Visualizar lista de projetos' },
  ver_tarefas: { label: 'Ver suas tarefas', desc: 'Visualizar tarefas atribuídas' },
  concluir_tarefas: { label: 'Concluir tarefas', desc: 'Marcar tarefas como concluídas' },
  comentar_tarefas: { label: 'Comentar em tarefas', desc: 'Adicionar comentários' },
  editar_tarefas: { label: 'Editar tarefas', desc: 'Modificar detalhes das tarefas' },
  criar_tarefas: { label: 'Criar tarefas', desc: 'Criar novas tarefas em projetos' },
};

// ============================================
// Seção de Equipe e Permissões (CRUD completo)
// ============================================
function EquipeSection() {
  const [membros, setMembros] = useState<MembroEquipe[]>([]);
  const [permissoes, setPermissoes] = useState<PermissaoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPermissoes, setSavingPermissoes] = useState(false);
  
  // Modal de criar/editar membro
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMembro, setEditingMembro] = useState<MembroEquipe | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    cargo: '',
    tipo: 'assistente',
    avatar_cor: 'violet',
  });
  
  // Modal de confirmação de exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [membroToDelete, setMembroToDelete] = useState<MembroEquipe | null>(null);

  // Carregar membros da equipe
  const loadMembros = async () => {
    try {
      const { data, error } = await supabase
        .from('projeto_equipe_membros')
        .select('*')
        .eq('ativo', true)
        .order('tipo', { ascending: false })
        .order('nome');

      if (error) throw error;
      setMembros(data || []);
    } catch (error) {
      console.error('Erro ao carregar membros:', error);
      toast.error('Erro ao carregar membros da equipe');
    }
  };

  // Carregar permissões
  const loadPermissoes = async () => {
    try {
      const { data, error } = await supabase
        .from('projeto_config_permissoes')
        .select('*')
        .order('id');

      if (error) throw error;
      setPermissoes(data || []);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
      toast.error('Erro ao carregar permissões');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembros();
    loadPermissoes();
  }, []);

  // Obter cor do avatar
  const getAvatarStyle = (cor: string) => {
    const corConfig = CORES_AVATAR.find(c => c.value === cor);
    return corConfig || CORES_AVATAR[0];
  };

  // Abrir modal para criar novo membro
  const handleNovoMembro = () => {
    setEditingMembro(null);
    setFormData({
      nome: '',
      cargo: '',
      tipo: 'assistente',
      avatar_cor: 'violet',
    });
    setModalOpen(true);
  };

  // Abrir modal para editar membro existente
  const handleEditarMembro = (membro: MembroEquipe) => {
    setEditingMembro(membro);
    setFormData({
      nome: membro.nome,
      cargo: membro.cargo || '',
      tipo: membro.tipo,
      avatar_cor: membro.avatar_cor,
    });
    setModalOpen(true);
  };

  // Salvar membro (criar ou atualizar)
  const handleSalvar = async () => {
    if (!formData.nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (editingMembro) {
        // Atualizar membro existente
        const { error } = await supabase
          .from('projeto_equipe_membros')
          .update({
            nome: formData.nome.trim(),
            cargo: formData.cargo.trim() || null,
            tipo: formData.tipo,
            avatar_cor: formData.avatar_cor,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingMembro.id);

        if (error) throw error;
        toast.success('Membro atualizado com sucesso!');
      } else {
        // Criar novo membro
        const { error } = await supabase
          .from('projeto_equipe_membros')
          .insert({
            nome: formData.nome.trim(),
            cargo: formData.cargo.trim() || null,
            tipo: formData.tipo,
            avatar_cor: formData.avatar_cor,
          });

        if (error) throw error;
        toast.success('Membro adicionado com sucesso!');
      }

      setModalOpen(false);
      loadMembros();
    } catch (error) {
      console.error('Erro ao salvar membro:', error);
      toast.error('Erro ao salvar membro');
    } finally {
      setSaving(false);
    }
  };

  // Confirmar exclusão
  const handleConfirmarExclusao = (membro: MembroEquipe) => {
    setMembroToDelete(membro);
    setDeleteDialogOpen(true);
  };

  // Excluir membro (soft delete)
  const handleExcluir = async () => {
    if (!membroToDelete) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('projeto_equipe_membros')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('id', membroToDelete.id);

      if (error) throw error;
      toast.success('Membro removido com sucesso!');
      setDeleteDialogOpen(false);
      setMembroToDelete(null);
      loadMembros();
    } catch (error) {
      console.error('Erro ao excluir membro:', error);
      toast.error('Erro ao remover membro');
    } finally {
      setSaving(false);
    }
  };

  // Toggle permissão
  const handleTogglePermissao = async (permissao: PermissaoConfig) => {
    try {
      const { error } = await supabase
        .from('projeto_config_permissoes')
        .update({ 
          valor: !permissao.valor, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', permissao.id);

      if (error) throw error;
      
      // Atualizar estado local
      setPermissoes(prev => prev.map(p => 
        p.id === permissao.id ? { ...p, valor: !p.valor } : p
      ));
    } catch (error) {
      console.error('Erro ao alterar permissão:', error);
      toast.error('Erro ao alterar permissão');
    }
  };

  // Salvar todas as permissões
  const handleSalvarPermissoes = async () => {
    setSavingPermissoes(true);
    try {
      for (const perm of permissoes) {
        await supabase
          .from('projeto_config_permissoes')
          .update({ valor: perm.valor, updated_at: new Date().toISOString() })
          .eq('id', perm.id);
      }
      toast.success('Permissões salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar permissões:', error);
      toast.error('Erro ao salvar permissões');
    } finally {
      setSavingPermissoes(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        <span className="ml-3 text-slate-400">Carregando equipe...</span>
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-violet-400" />
          Equipe e Permissões
        </h2>
        <p className="text-slate-400 text-sm mt-1">Gerencie a equipe pedagógica e suas permissões</p>
      </div>

      {/* Membros da Equipe */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/30">
          <h3 className="font-semibold text-white">Membros da Equipe</h3>
          <Button onClick={handleNovoMembro} variant="outline" size="sm" className="border-slate-700">
            <Plus className="w-4 h-4 mr-1" />
            Adicionar Membro
          </Button>
        </div>
        
        {membros.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum membro cadastrado</p>
            <Button onClick={handleNovoMembro} variant="link" className="mt-2 text-violet-400">
              Adicionar primeiro membro
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {membros.map((membro) => {
              const avatarStyle = getAvatarStyle(membro.avatar_cor);
              return (
                <div key={membro.id} className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${avatarStyle.bg} flex items-center justify-center ${avatarStyle.text} font-bold`}>
                      {membro.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-white">{membro.nome}</div>
                      <div className="text-sm text-slate-400">{membro.cargo || 'Sem cargo definido'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      membro.tipo === 'coordenador' 
                        ? 'bg-violet-500/20 text-violet-400' 
                        : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {membro.tipo === 'coordenador' ? 'Coordenador' : 'Assistente'}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-white"
                      onClick={() => handleEditarMembro(membro)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-slate-400 hover:text-rose-400"
                      onClick={() => handleConfirmarExclusao(membro)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Permissões de Professores */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            🎵 Permissões de Professores
          </h3>
          <p className="text-sm text-slate-400 mt-1">O que os professores podem fazer no sistema de projetos</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {permissoes.map((perm) => {
            const labels = PERMISSAO_LABELS[perm.chave] || { label: perm.chave, desc: perm.descricao || '' };
            return (
              <div 
                key={perm.id}
                className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
              >
                <div>
                  <div className="text-sm font-medium text-white">{labels.label}</div>
                  <div className="text-xs text-slate-500">{labels.desc}</div>
                </div>
                <button
                  onClick={() => handleTogglePermissao(perm)}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    perm.valor ? 'bg-violet-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    perm.valor ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={handleSalvarPermissoes} 
          disabled={savingPermissoes}
          className="bg-violet-600 hover:bg-violet-500"
        >
          {savingPermissoes ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            '💾 Salvar Permissões'
          )}
        </Button>
      </div>

      {/* Modal de Criar/Editar Membro */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingMembro ? 'Editar Membro' : 'Novo Membro'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Nome *</label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Nome do membro"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Cargo */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Cargo</label>
              <Input
                value={formData.cargo}
                onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                placeholder="Ex: Coordenador Pedagógico"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Tipo</label>
              <Select 
                value={formData.tipo} 
                onValueChange={(value) => setFormData({ ...formData, tipo: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coordenador">Coordenador</SelectItem>
                  <SelectItem value="assistente">Assistente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cor do Avatar */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Cor do Avatar</label>
              <div className="flex flex-wrap gap-2">
                {CORES_AVATAR.map((cor) => (
                  <button
                    key={cor.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, avatar_cor: cor.value })}
                    className={`w-10 h-10 rounded-full ${cor.bg} flex items-center justify-center transition-all ${
                      formData.avatar_cor === cor.value
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                        : 'hover:scale-110'
                    }`}
                    title={cor.label}
                  >
                    <span className={`font-bold ${cor.text}`}>
                      {formData.nome ? formData.nome.charAt(0).toUpperCase() : 'A'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-slate-700">
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={saving} className="bg-violet-600 hover:bg-violet-500">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                editingMembro ? 'Salvar Alterações' : 'Adicionar Membro'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remover Membro</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja remover <strong className="text-white">{membroToDelete?.nome}</strong> da equipe?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleExcluir} 
              className="bg-rose-600 hover:bg-rose-500"
              disabled={saving}
            >
              {saving ? 'Removendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================
// Seção Fábio IA
// ============================================
function FabioIASection() {
  const [config, setConfig] = useState({
    status: 'online',
    funcionalidades: {
      sugestoesTarefas: true,
      analiseRiscos: true,
      resumosProjetos: true,
      respostasChat: true,
      alertasInteligentes: false,
    },
    canais: {
      chatInterno: true,
      whatsapp: false,
      email: false,
    }
  });

  const toggleFuncionalidade = (key: keyof typeof config.funcionalidades) => {
    setConfig(prev => ({
      ...prev,
      funcionalidades: { ...prev.funcionalidades, [key]: !prev.funcionalidades[key] }
    }));
  };

  const toggleCanal = (key: keyof typeof config.canais) => {
    setConfig(prev => ({
      ...prev,
      canais: { ...prev.canais, [key]: !prev.canais[key] }
    }));
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-400" />
          Fábio - Assistente IA
        </h2>
        <p className="text-slate-400 text-sm mt-1">Configure o assistente inteligente de projetos</p>
      </div>

      {/* Status */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/Fábio.svg" 
              alt="Fábio" 
              className="w-16 h-16 rounded-2xl"
            />
            <div>
              <h3 className="font-semibold text-white text-lg">Fábio</h3>
              <p className="text-sm text-slate-400">Assistente de Projetos Pedagógicos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              config.status === 'online' 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-slate-700 text-slate-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${config.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {config.status === 'online' ? 'Online' : 'Offline'}
            </span>
            <button
              onClick={() => setConfig(prev => ({ ...prev, status: prev.status === 'online' ? 'offline' : 'online' }))}
              className={`w-12 h-6 rounded-full transition-colors ${config.status === 'online' ? 'bg-violet-500' : 'bg-slate-700'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.status === 'online' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Funcionalidades */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">Funcionalidades Ativas</h3>
        <div className="space-y-3">
          {[
            { key: 'sugestoesTarefas', icon: '💡', label: 'Sugestões de Tarefas', desc: 'Sugere próximas tarefas baseado no contexto' },
            { key: 'analiseRiscos', icon: '⚠️', label: 'Análise de Riscos', desc: 'Identifica projetos com risco de atraso' },
            { key: 'resumosProjetos', icon: '📊', label: 'Resumos de Projetos', desc: 'Gera resumos automáticos do progresso' },
            { key: 'respostasChat', icon: '💬', label: 'Respostas no Chat', desc: 'Responde perguntas sobre projetos' },
            { key: 'alertasInteligentes', icon: '🔔', label: 'Alertas Inteligentes', desc: 'Envia alertas proativos (experimental)' },
          ].map((func) => (
            <div 
              key={func.key}
              className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{func.icon}</span>
                <div>
                  <div className="text-sm font-medium text-white">{func.label}</div>
                  <div className="text-xs text-slate-500">{func.desc}</div>
                </div>
              </div>
              <button
                onClick={() => toggleFuncionalidade(func.key as keyof typeof config.funcionalidades)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  config.funcionalidades[func.key as keyof typeof config.funcionalidades] 
                    ? 'bg-violet-500' 
                    : 'bg-slate-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  config.funcionalidades[func.key as keyof typeof config.funcionalidades] 
                    ? 'translate-x-5' 
                    : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Canais de Comunicação */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">Canais de Comunicação</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { key: 'chatInterno', icon: '💬', label: 'Chat Interno', desc: 'Widget no sistema' },
            { key: 'whatsapp', icon: '📱', label: 'WhatsApp', desc: 'Mensagens via WhatsApp' },
            { key: 'email', icon: '📧', label: 'E-mail', desc: 'Notificações por e-mail' },
          ].map((canal) => (
            <div 
              key={canal.key}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                config.canais[canal.key as keyof typeof config.canais]
                  ? 'bg-violet-500/10 border-violet-500/50'
                  : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
              }`}
              onClick={() => toggleCanal(canal.key as keyof typeof config.canais)}
            >
              <div className="text-2xl mb-2">{canal.icon}</div>
              <div className="font-medium text-white text-sm">{canal.label}</div>
              <div className="text-xs text-slate-500">{canal.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="bg-violet-600 hover:bg-violet-500">
          💾 Salvar Configurações
        </Button>
      </div>
    </>
  );
}

// ============================================
// Seção WhatsApp (com integração UAZAPI real)
// ============================================
function WhatsAppSection() {
  const [connectionStatus, setConnectionStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [horarios, setHorarios] = useState({
    inicio: '08:00',
    fim: '18:00',
    diasSemana: ['seg', 'ter', 'qua', 'qui', 'sex'],
  });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Carregar configurações do banco
  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .limit(1)
        .single();

      if (!error && data) {
        setHorarios({
          inicio: data.hora_inicio || '08:00',
          fim: data.hora_fim || '18:00',
          diasSemana: data.dias_semana || ['seg', 'ter', 'qua', 'qui', 'sex'],
        });
      }
    } catch (error) {
      console.error('Erro ao carregar config WhatsApp:', error);
    } finally {
      setLoadingConfig(false);
    }
  };

  // Salvar configurações no banco
  const saveConfig = async (newHorarios: typeof horarios) => {
    setSavingConfig(true);
    try {
      const { error } = await supabase
        .from('whatsapp_config')
        .update({
          hora_inicio: newHorarios.inicio,
          hora_fim: newHorarios.fim,
          dias_semana: newHorarios.diasSemana,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      if (error) throw error;
      toast.success('Configurações salvas!');
    } catch (error) {
      console.error('Erro ao salvar config WhatsApp:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSavingConfig(false);
    }
  };

  // Atualizar horários e salvar
  const updateHorarios = (updates: Partial<typeof horarios>) => {
    const newHorarios = { ...horarios, ...updates };
    setHorarios(newHorarios);
    saveConfig(newHorarios);
  };

  // Verificar status da conexão ao montar
  useEffect(() => {
    checkConnectionStatus();
    loadConfig();
  }, []);

  const checkConnectionStatus = async () => {
    setCheckingStatus(true);
    try {
      // Verificar status baseado no histórico de notificações recentes
      const { data: logs, error } = await supabase
        .from('notificacao_log')
        .select('*')
        .eq('canal', 'whatsapp')
        .eq('status', 'enviado')
        .order('enviado_at', { ascending: false })
        .limit(1);

      if (!error && logs && logs.length > 0) {
        // Se há envios bem-sucedidos recentes, considera conectado
        const lastLog = logs[0];
        const lastSent = new Date(lastLog.enviado_at);
        const now = new Date();
        const hoursSinceLastSend = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceLastSend < 168) { // Menos de 7 dias
          setConnectionStatus({ connected: true, phone: 'Verificado via histórico' });
        } else {
          setConnectionStatus({ connected: false, error: 'Nenhum envio recente' });
        }
      } else {
        setConnectionStatus({ connected: false, error: 'Sem histórico de envios' });
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      setConnectionStatus({ connected: false, error: 'Erro ao verificar status' });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSendTest = async () => {
    if (!testNumber.trim()) {
      setTestResult({ success: false, message: 'Informe um número de telefone' });
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      // Enviar mensagem de teste usando a mesma lógica dos alertas
      const { data, error } = await supabase.functions.invoke('projeto-alertas-whatsapp', {
        body: { action: 'resumo_semanal' }, // Usa resumo semanal como teste
      });

      console.log('[WhatsApp Test] Resposta:', data, error);
      
      if (error) {
        setTestResult({ success: false, message: error.message || 'Erro ao enviar mensagem' });
        toast.error(error.message || 'Erro ao enviar mensagem');
      } else if (data?.success) {
        setTestResult({ success: true, message: `✅ Mensagem enviada com sucesso!` });
        setTestNumber('');
        toast.success('Mensagem de teste enviada!');
        // Recarregar status
        checkConnectionStatus();
      } else {
        setTestResult({ success: false, message: data?.error || 'Erro ao enviar mensagem' });
        toast.error(data?.error || 'Erro ao enviar mensagem');
      }
    } catch (error) {
      console.error('Erro ao enviar teste:', error);
      setTestResult({ success: false, message: 'Erro de conexão' });
      toast.error('Erro de conexão');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-violet-400" />
          Integração WhatsApp
        </h2>
        <p className="text-slate-400 text-sm mt-1">Configure notificações via WhatsApp (UAZAPI)</p>
      </div>

      {/* Status da Conexão */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              connectionStatus?.connected ? 'bg-emerald-500/20' : 'bg-slate-700'
            }`}>
              <span className="text-2xl">📱</span>
            </div>
            <div>
              <h3 className="font-semibold text-white">Status da Conexão UAZAPI</h3>
              {checkingStatus ? (
                <p className="text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </p>
              ) : connectionStatus?.connected ? (
                <p className="text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Conectado {connectionStatus.phone && `(${connectionStatus.phone})`}
                </p>
              ) : (
                <p className="text-sm text-rose-400 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  {connectionStatus?.error || 'Não conectado'}
                </p>
              )}
            </div>
          </div>
          <Button 
            variant="outline"
            className="border-slate-700"
            onClick={checkConnectionStatus}
            disabled={checkingStatus}
          >
            {checkingStatus ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Verificar Status
          </Button>
        </div>

        {connectionStatus?.connected && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p className="text-sm text-emerald-400">
              ✅ WhatsApp conectado e pronto para enviar notificações automáticas.
            </p>
          </div>
        )}

        {!connectionStatus?.connected && !checkingStatus && (
          <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-400">
              ⚠️ Verifique se a instância UAZAPI está ativa e conectada.
            </p>
          </div>
        )}
      </div>

      {/* Teste de Envio */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">📤 Enviar Mensagem de Teste</h3>
        <p className="text-sm text-slate-400 mb-4">Teste a integração enviando uma mensagem para um número</p>
        
        <div className="flex gap-3">
          <input 
            type="text"
            placeholder="(21) 99999-9999"
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
          />
          <Button 
            onClick={handleSendTest}
            disabled={sendingTest || !testNumber.trim()}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            {sendingTest ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Enviar Teste
          </Button>
        </div>

        {testResult && (
          <div className={`mt-3 p-3 rounded-lg ${
            testResult.success 
              ? 'bg-emerald-500/10 border border-emerald-500/30' 
              : 'bg-rose-500/10 border border-rose-500/30'
          }`}>
            <p className={`text-sm flex items-center gap-2 ${
              testResult.success ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.message}
            </p>
          </div>
        )}
      </div>

      {/* Horários de Envio */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">⏰ Horários de Envio</h3>
        <p className="text-sm text-slate-400 mb-4">Notificações automáticas serão enviadas apenas nestes horários</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-slate-400 block mb-2">Início</label>
            <Select 
              value={horarios.inicio}
              onValueChange={(value) => updateHorarios({ inicio: value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00'].map(hora => (
                  <SelectItem key={hora} value={hora}>{hora}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Fim</label>
            <Select 
              value={horarios.fim}
              onValueChange={(value) => updateHorarios({ fim: value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map(hora => (
                  <SelectItem key={hora} value={hora}>{hora}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 block mb-2">Dias da Semana</label>
          <div className="flex gap-2">
            {[
              { key: 'seg', label: 'Seg' },
              { key: 'ter', label: 'Ter' },
              { key: 'qua', label: 'Qua' },
              { key: 'qui', label: 'Qui' },
              { key: 'sex', label: 'Sex' },
              { key: 'sab', label: 'Sáb' },
              { key: 'dom', label: 'Dom' },
            ].map((dia) => (
              <button
                key={dia.key}
                onClick={() => {
                  const newDiasSemana = horarios.diasSemana.includes(dia.key)
                    ? horarios.diasSemana.filter(d => d !== dia.key)
                    : [...horarios.diasSemana, dia.key];
                  updateHorarios({ diasSemana: newDiasSemana });
                }}
                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                  horarios.diasSemana.includes(dia.key)
                    ? 'bg-violet-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {dia.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
        <p className="text-sm text-slate-400">
          💡 <strong>Dica:</strong> As notificações são enviadas automaticamente quando há tarefas atrasadas, 
          tarefas vencendo ou projetos parados. Configure os alertas na seção "Notificações".
        </p>
      </div>

      {/* Testar Alertas Manualmente */}
      <TestarAlertasSection />

      {/* Histórico de Notificações */}
      <HistoricoNotificacoesSection />
    </>
  );
}

// ============================================
// Seção de Teste de Alertas
// ============================================
function TestarAlertasSection() {
  const [testingAlert, setTestingAlert] = useState<string | null>(null);
  const [alertResult, setAlertResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  const testarAlerta = async (tipo: string) => {
    setTestingAlert(tipo);
    setAlertResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/projeto-alertas-whatsapp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: tipo }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setAlertResult({ 
          success: true, 
          message: `Alerta executado com sucesso!`,
          data: data.result
        });
      } else {
        setAlertResult({ 
          success: false, 
          message: data.error || 'Erro ao executar alerta' 
        });
      }
    } catch (error) {
      setAlertResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro de conexão' 
      });
    } finally {
      setTestingAlert(null);
    }
  };

  const alertTypes = [
    { key: 'tarefa_atrasada', label: 'Tarefas Atrasadas', icon: AlertTriangle, color: 'rose' },
    { key: 'tarefa_vencendo', label: 'Tarefas Vencendo', icon: Clock, color: 'amber' },
    { key: 'projeto_parado', label: 'Projetos Parados', icon: Calendar, color: 'blue' },
    { key: 'resumo_semanal', label: 'Resumo Semanal', icon: FileText, color: 'violet' },
  ];

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
        <Play className="w-4 h-4 text-emerald-400" />
        Testar Alertas Manualmente
      </h3>
      <p className="text-sm text-slate-400 mb-4">
        Dispare alertas manualmente para testar a integração. Os alertas serão enviados para os destinatários configurados.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {alertTypes.map((alert) => {
          const Icon = alert.icon;
          const isLoading = testingAlert === alert.key;
          const colorClasses = {
            rose: 'hover:bg-rose-500/20 hover:border-rose-500/50',
            amber: 'hover:bg-amber-500/20 hover:border-amber-500/50',
            blue: 'hover:bg-blue-500/20 hover:border-blue-500/50',
            violet: 'hover:bg-violet-500/20 hover:border-violet-500/50',
          };

          return (
            <button
              key={alert.key}
              onClick={() => testarAlerta(alert.key)}
              disabled={testingAlert !== null}
              className={`
                p-4 rounded-lg border border-slate-700 bg-slate-800/50 
                transition-all text-left
                ${colorClasses[alert.color as keyof typeof colorClasses]}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <div className="flex items-center gap-2 mb-2">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                ) : (
                  <Icon className={`w-5 h-5 text-${alert.color}-400`} />
                )}
              </div>
              <div className="text-sm font-medium text-white">{alert.label}</div>
            </button>
          );
        })}
      </div>

      {alertResult && (
        <div className={`mt-4 p-4 rounded-lg ${
          alertResult.success 
            ? 'bg-emerald-500/10 border border-emerald-500/30' 
            : 'bg-rose-500/10 border border-rose-500/30'
        }`}>
          <p className={`text-sm flex items-center gap-2 ${
            alertResult.success ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {alertResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {alertResult.message}
          </p>
          {alertResult.data && (
            <pre className="mt-2 text-xs text-slate-400 bg-slate-900/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(alertResult.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Seção de Histórico de Notificações
// ============================================
interface NotificacaoLog {
  id: number;
  tipo: string;
  destinatario_tipo: string;
  destinatario_id: number;
  canal: string;
  status: string;
  enviado_at: string;
  erro_mensagem?: string;
}

function HistoricoNotificacoesSection() {
  const [logs, setLogs] = useState<NotificacaoLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notificacao_log')
        .select('*')
        .order('enviado_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setLogs(data);
      }
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const tipoLabels: Record<string, { label: string; icon: string }> = {
    tarefa_atrasada: { label: 'Tarefa Atrasada', icon: '🚨' },
    tarefa_vencendo: { label: 'Tarefa Vencendo', icon: '📅' },
    projeto_parado: { label: 'Projeto Parado', icon: '⏸️' },
    resumo_semanal: { label: 'Resumo Semanal', icon: '📊' },
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-400" />
          Histórico de Notificações
        </h3>
        <Button 
          variant="outline" 
          size="sm"
          className="border-slate-700"
          onClick={fetchLogs}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Nenhuma notificação enviada ainda</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {logs.map((log) => {
            const tipoInfo = tipoLabels[log.tipo] || { label: log.tipo, icon: '📌' };
            
            return (
              <div 
                key={log.id}
                className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg"
              >
                <span className="text-lg">{tipoInfo.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {tipoInfo.label}
                  </div>
                  <div className="text-xs text-slate-500">
                    {log.destinatario_tipo} #{log.destinatario_id} • {log.canal}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xs px-2 py-1 rounded-full ${
                    log.status === 'enviado' 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {log.status === 'enviado' ? '✓ Enviado' : '✗ Erro'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatDate(log.enviado_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ConfiguracoesView;
