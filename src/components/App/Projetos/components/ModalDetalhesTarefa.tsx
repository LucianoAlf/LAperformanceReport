import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Calendar, 
  Check,
  Trash2,
  Edit,
  Clock,
  Loader2,
  Plus,
  Link2,
  ChevronDown,
  ChevronRight,
  Upload,
  Download,
  Send,
  FileText,
  Image,
  File,
  History,
  MessageSquare,
  Paperclip,
  ListTree,
  AlertTriangle,
  User
} from 'lucide-react';
import { Button } from '../../../ui/button';
import { Textarea } from '../../../ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../ui/select';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/AuthContext';
import type { 
  ProjetoTarefa, 
  ProjetoAnexo, 
  ProjetoComentario, 
  ProjetoLogAlteracao,
  TarefaStatus
} from '../../../../types/projetos';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface ModalDetalhesTarefaProps {
  isOpen: boolean;
  tarefa: ProjetoTarefa | null;
  todasTarefas: ProjetoTarefa[]; // Para selecionar dependências
  onClose: () => void;
  onUpdate: () => void;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: 'text-slate-400', bg: 'bg-slate-500/20' },
  em_andamento: { label: 'Em Andamento', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  concluida: { label: 'Concluída', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  cancelada: { label: 'Cancelada', color: 'text-rose-400', bg: 'bg-rose-500/20' },
};

const prioridadeConfig: Record<string, { label: string; color: string; icon: string }> = {
  baixa: { label: 'Baixa', color: 'text-slate-400', icon: '↓' },
  normal: { label: 'Normal', color: 'text-blue-400', icon: '→' },
  alta: { label: 'Alta', color: 'text-amber-400', icon: '↑' },
  urgente: { label: 'Urgente', color: 'text-rose-400', icon: '🔥' },
};

type TabType = 'subtarefas' | 'anexos' | 'comentarios' | 'historico';

export function ModalDetalhesTarefa({ 
  isOpen, 
  tarefa, 
  todasTarefas,
  onClose, 
  onUpdate 
}: ModalDetalhesTarefaProps) {
  const { usuario } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('subtarefas');
  const [loading, setLoading] = useState(false);
  
  // Estados para subtarefas
  const [subtarefas, setSubtarefas] = useState<ProjetoTarefa[]>([]);
  const [novaSubtarefa, setNovaSubtarefa] = useState('');
  const [criandoSubtarefa, setCriandoSubtarefa] = useState(false);
  
  // Estados para dependência
  const [dependenciaId, setDependenciaId] = useState<string>('');
  const [tarefaDependencia, setTarefaDependencia] = useState<ProjetoTarefa | null>(null);
  
  // Estados para anexos
  const [anexos, setAnexos] = useState<ProjetoAnexo[]>([]);
  const [uploading, setUploading] = useState(false);
  
  // Estados para comentários
  const [comentarios, setComentarios] = useState<ProjetoComentario[]>([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  
  // Estados para histórico
  const [logs, setLogs] = useState<ProjetoLogAlteracao[]>([]);

  // Carregar dados quando abrir
  useEffect(() => {
    if (isOpen && tarefa) {
      fetchSubtarefas();
      fetchAnexos();
      fetchComentarios();
      fetchLogs();
      setDependenciaId(tarefa.dependencia_id?.toString() || '');
      
      // Buscar tarefa de dependência
      if (tarefa.dependencia_id) {
        const dep = todasTarefas.find(t => t.id === tarefa.dependencia_id);
        setTarefaDependencia(dep || null);
      } else {
        setTarefaDependencia(null);
      }
    }
  }, [isOpen, tarefa]);

  // Buscar subtarefas
  const fetchSubtarefas = useCallback(async () => {
    if (!tarefa) return;
    const { data } = await supabase
      .from('projeto_tarefas')
      .select('*')
      .eq('tarefa_pai_id', tarefa.id)
      .order('created_at', { ascending: true });
    setSubtarefas(data || []);
  }, [tarefa]);

  // Buscar anexos
  const fetchAnexos = useCallback(async () => {
    if (!tarefa) return;
    const { data } = await supabase
      .from('projeto_anexos')
      .select('*')
      .eq('tarefa_id', tarefa.id)
      .order('created_at', { ascending: false });
    setAnexos(data || []);
  }, [tarefa]);

  // Buscar comentários
  const fetchComentarios = useCallback(async () => {
    if (!tarefa) return;
    const { data } = await supabase
      .from('projeto_comentarios')
      .select('*')
      .eq('tarefa_id', tarefa.id)
      .order('created_at', { ascending: true });
    
    // Buscar nomes dos autores
    if (data && data.length > 0) {
      const comentariosComAutor = await Promise.all(
        data.map(async (c) => {
          if (c.autor_tipo === 'usuario') {
            const { data: usuario } = await supabase
              .from('usuarios')
              .select('nome')
              .eq('id', c.autor_id)
              .single();
            return { ...c, autor: usuario };
          } else {
            const { data: professor } = await supabase
              .from('professores')
              .select('nome')
              .eq('id', c.autor_id)
              .single();
            return { ...c, autor: professor };
          }
        })
      );
      setComentarios(comentariosComAutor);
    } else {
      setComentarios([]);
    }
  }, [tarefa]);

  // Buscar logs
  const fetchLogs = useCallback(async () => {
    if (!tarefa) return;
    const { data } = await supabase
      .from('projeto_log_alteracoes')
      .select('*')
      .eq('tarefa_id', tarefa.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(data || []);
  }, [tarefa]);

  // Criar subtarefa
  const handleCriarSubtarefa = async () => {
    if (!tarefa || !novaSubtarefa.trim()) return;
    
    setCriandoSubtarefa(true);
    try {
      const { error } = await supabase
        .from('projeto_tarefas')
        .insert({
          titulo: novaSubtarefa.trim(),
          projeto_id: tarefa.projeto_id,
          fase_id: tarefa.fase_id,
          tarefa_pai_id: tarefa.id,
          status: 'pendente',
          prioridade: 'normal',
          ordem: subtarefas.length + 1,
        });
      
      if (error) throw error;
      
      setNovaSubtarefa('');
      fetchSubtarefas();
      onUpdate();
      toast.success('Subtarefa criada!');
    } catch (error) {
      toast.error('Erro ao criar subtarefa');
    } finally {
      setCriandoSubtarefa(false);
    }
  };

  // Toggle subtarefa concluída
  const handleToggleSubtarefa = async (subtarefa: ProjetoTarefa) => {
    const novoStatus: TarefaStatus = subtarefa.status === 'concluida' ? 'pendente' : 'concluida';
    
    try {
      const { error } = await supabase
        .from('projeto_tarefas')
        .update({ 
          status: novoStatus,
          completed_at: novoStatus === 'concluida' ? new Date().toISOString() : null
        })
        .eq('id', subtarefa.id);
      
      if (error) throw error;
      
      fetchSubtarefas();
      onUpdate();
    } catch (error) {
      toast.error('Erro ao atualizar subtarefa');
    }
  };

  // Deletar subtarefa
  const handleDeleteSubtarefa = async (subtarefaId: number) => {
    try {
      const { error } = await supabase
        .from('projeto_tarefas')
        .delete()
        .eq('id', subtarefaId);
      
      if (error) throw error;
      
      fetchSubtarefas();
      onUpdate();
      toast.success('Subtarefa removida');
    } catch (error) {
      toast.error('Erro ao remover subtarefa');
    }
  };

  // Atualizar dependência
  const handleUpdateDependencia = async (value: string) => {
    if (!tarefa) return;
    
    setDependenciaId(value);
    const newDependenciaId = value ? parseInt(value) : null;
    
    try {
      const { error } = await supabase
        .from('projeto_tarefas')
        .update({ dependencia_id: newDependenciaId })
        .eq('id', tarefa.id);
      
      if (error) throw error;
      
      const dep = todasTarefas.find(t => t.id === newDependenciaId);
      setTarefaDependencia(dep || null);
      onUpdate();
      toast.success('Dependência atualizada');
    } catch (error) {
      toast.error('Erro ao atualizar dependência');
    }
  };

  // Upload de anexo
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tarefa || !usuario) return;

    setUploading(true);
    try {
      // 1. Upload para Storage
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const path = `tarefas/${tarefa.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('projeto-anexos')
        .upload(path, file);

      if (uploadError) throw uploadError;

      // 2. Obter URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('projeto-anexos')
        .getPublicUrl(path);

      // 3. Salvar no banco
      const { error: dbError } = await supabase.from('projeto_anexos').insert({
        tarefa_id: tarefa.id,
        projeto_id: tarefa.projeto_id,
        nome: fileName,
        nome_original: file.name,
        tipo_mime: file.type,
        tamanho_bytes: file.size,
        storage_path: path,
        url_publica: publicUrl,
        uploaded_by_tipo: 'usuario',
        uploaded_by_id: parseInt(usuario.id),
      });

      if (dbError) throw dbError;

      fetchAnexos();
      toast.success('Arquivo enviado!');
    } catch (error) {
      console.error('Erro upload:', error);
      toast.error('Erro ao enviar arquivo');
    } finally {
      setUploading(false);
      // Limpar input
      e.target.value = '';
    }
  };

  // Deletar anexo
  const handleDeleteAnexo = async (anexo: ProjetoAnexo) => {
    try {
      // 1. Deletar do Storage
      await supabase.storage
        .from('projeto-anexos')
        .remove([anexo.storage_path]);

      // 2. Deletar do banco
      const { error } = await supabase
        .from('projeto_anexos')
        .delete()
        .eq('id', anexo.id);

      if (error) throw error;

      fetchAnexos();
      toast.success('Anexo removido');
    } catch (error) {
      toast.error('Erro ao remover anexo');
    }
  };

  // Enviar comentário
  const handleEnviarComentario = async () => {
    if (!tarefa || !novoComentario.trim() || !usuario) return;

    setEnviandoComentario(true);
    try {
      const { error } = await supabase.from('projeto_comentarios').insert({
        tarefa_id: tarefa.id,
        projeto_id: tarefa.projeto_id,
        autor_tipo: 'usuario',
        autor_id: parseInt(usuario.id),
        conteudo: novoComentario.trim(),
      });

      if (error) throw error;

      setNovoComentario('');
      fetchComentarios();
      toast.success('Comentário enviado!');
    } catch (error) {
      toast.error('Erro ao enviar comentário');
    } finally {
      setEnviandoComentario(false);
    }
  };

  // Deletar comentário
  const handleDeleteComentario = async (comentarioId: number) => {
    try {
      const { error } = await supabase
        .from('projeto_comentarios')
        .delete()
        .eq('id', comentarioId);

      if (error) throw error;

      fetchComentarios();
      toast.success('Comentário removido');
    } catch (error) {
      toast.error('Erro ao remover comentário');
    }
  };

  // Helpers
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="w-5 h-5 text-blue-400" />;
    if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-red-400" />;
    return <File className="w-5 h-5 text-slate-400" />;
  };

  const getLogIcon = (acao: string) => {
    switch (acao) {
      case 'tarefa_criada':
      case 'criado':
        return <Plus className="w-4 h-4 text-green-500" />;
      case 'tarefa_concluida':
        return <Check className="w-4 h-4 text-emerald-500" />;
      case 'tarefa_status':
      case 'status_alterado':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'tarefa_excluida':
      case 'excluido':
        return <Trash2 className="w-4 h-4 text-red-500" />;
      default:
        return <History className="w-4 h-4 text-slate-500" />;
    }
  };

  // Verificar se pode concluir (dependência)
  const podeConcluir = !tarefa?.dependencia_id || 
    todasTarefas.find(t => t.id === tarefa.dependencia_id)?.status === 'concluida';

  // Tarefas disponíveis para dependência (excluir a própria e suas subtarefas)
  const tarefasDisponiveis = todasTarefas.filter(t => 
    t.id !== tarefa?.id && 
    t.tarefa_pai_id !== tarefa?.id &&
    t.projeto_id === tarefa?.projeto_id
  );

  if (!isOpen || !tarefa) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-slate-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-3 h-3 rounded-full ${
                tarefa.status === 'concluida' ? 'bg-emerald-500' :
                tarefa.status === 'em_andamento' ? 'bg-cyan-500' :
                tarefa.status === 'cancelada' ? 'bg-rose-500' : 'bg-slate-500'
              }`} />
              <h2 className={`text-xl font-bold ${
                tarefa.status === 'concluida' ? 'text-slate-400 line-through' : 'text-white'
              }`}>
                {tarefa.titulo}
              </h2>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig[tarefa.status]?.bg} ${statusConfig[tarefa.status]?.color}`}>
                {statusConfig[tarefa.status]?.label}
              </span>
              <span className={prioridadeConfig[tarefa.prioridade]?.color}>
                {prioridadeConfig[tarefa.prioridade]?.icon} {prioridadeConfig[tarefa.prioridade]?.label}
              </span>
              {tarefa.prazo && (
                <span className={`flex items-center gap-1 ${
                  new Date(tarefa.prazo) < new Date() && tarefa.status !== 'concluida'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}>
                  <Calendar className="w-4 h-4" />
                  {format(new Date(tarefa.prazo), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              )}
            </div>

            {/* Alerta de dependência */}
            {tarefaDependencia && tarefaDependencia.status !== 'concluida' && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
                <span>Depende de: <strong>{tarefaDependencia.titulo}</strong> (pendente)</span>
              </div>
            )}
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          {[
            { id: 'subtarefas' as TabType, label: 'Subtarefas', icon: ListTree, count: subtarefas.length },
            { id: 'anexos' as TabType, label: 'Anexos', icon: Paperclip, count: anexos.length },
            { id: 'comentarios' as TabType, label: 'Comentários', icon: MessageSquare, count: comentarios.length },
            { id: 'historico' as TabType, label: 'Histórico', icon: History, count: logs.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-violet-400 border-violet-500 bg-violet-500/5'
                  : 'text-slate-400 border-transparent hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === tab.id ? 'bg-violet-500/20' : 'bg-slate-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conteúdo das Tabs */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Tab: Subtarefas */}
          {activeTab === 'subtarefas' && (
            <div className="space-y-4">
              {/* Dependência */}
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-300">Dependência</span>
                </div>
                <Select value={dependenciaId || "none"} onValueChange={(v) => handleUpdateDependencia(v === "none" ? "" : v)}>
                  <SelectTrigger className="bg-slate-900 border-slate-700">
                    <SelectValue placeholder="Nenhuma dependência" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {tarefasDisponiveis.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.status === 'concluida' ? '✅ ' : '⏳ '}{t.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tarefaDependencia && (
                  <p className="mt-2 text-xs text-slate-500">
                    Status: {statusConfig[tarefaDependencia.status]?.label}
                  </p>
                )}
              </div>

              {/* Lista de Subtarefas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-300">
                    Subtarefas ({subtarefas.length})
                  </h4>
                </div>

                <div className="space-y-2">
                  {subtarefas.map((sub) => (
                    <div 
                      key={sub.id} 
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        sub.status === 'concluida'
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-slate-800/50 border-slate-700'
                      }`}
                    >
                      <button
                        onClick={() => handleToggleSubtarefa(sub)}
                        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          sub.status === 'concluida'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-slate-500 hover:border-violet-500'
                        }`}
                      >
                        {sub.status === 'concluida' && <Check className="w-3 h-3" />}
                      </button>
                      <span className={`flex-1 ${sub.status === 'concluida' ? 'line-through text-slate-500' : 'text-white'}`}>
                        {sub.titulo}
                      </span>
                      <button
                        onClick={() => handleDeleteSubtarefa(sub.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {subtarefas.length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">
                      Nenhuma subtarefa
                    </p>
                  )}
                </div>

                {/* Adicionar subtarefa */}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="text"
                    value={novaSubtarefa}
                    onChange={(e) => setNovaSubtarefa(e.target.value)}
                    placeholder="Nova subtarefa..."
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCriarSubtarefa();
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleCriarSubtarefa}
                    disabled={criandoSubtarefa || !novaSubtarefa.trim()}
                    className="bg-violet-600 hover:bg-violet-500"
                  >
                    {criandoSubtarefa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Anexos */}
          {activeTab === 'anexos' && (
            <div className="space-y-4">
              {/* Upload */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-300">
                  Arquivos ({anexos.length})
                </h4>
                <label className="cursor-pointer">
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={handleUpload} 
                    disabled={uploading} 
                  />
                  <Button size="sm" variant="outline" disabled={uploading} asChild>
                    <span>
                      {uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Upload
                    </span>
                  </Button>
                </label>
              </div>

              {/* Lista de anexos */}
              <div className="space-y-2">
                {anexos.map((anexo) => (
                  <div 
                    key={anexo.id} 
                    className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    {getFileIcon(anexo.tipo_mime)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{anexo.nome_original}</p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(anexo.tamanho_bytes)} • {format(new Date(anexo.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <a 
                      href={anexo.url_publica || '#'} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-2 text-slate-400 hover:text-white transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDeleteAnexo(anexo)}
                      className="p-2 text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {anexos.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <Paperclip className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhum anexo</p>
                    <p className="text-xs mt-1">Arraste arquivos ou clique em Upload</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Comentários */}
          {activeTab === 'comentarios' && (
            <div className="space-y-4">
              {/* Lista de comentários */}
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {comentarios.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {c.autor?.nome || 'Usuário'}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        {c.editado && <span className="text-xs text-slate-500">(editado)</span>}
                      </div>
                      <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{c.conteudo}</p>
                    </div>
                    {usuario && c.autor_id === parseInt(usuario.id) && (
                      <button
                        onClick={() => handleDeleteComentario(c.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                {comentarios.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhum comentário ainda</p>
                  </div>
                )}
              </div>

              {/* Novo comentário */}
              <div className="flex gap-2 pt-4 border-t border-slate-800">
                <Textarea
                  value={novoComentario}
                  onChange={(e) => setNovoComentario(e.target.value)}
                  placeholder="Escreva um comentário..."
                  className="flex-1 min-h-[80px] bg-slate-800 border-slate-700 resize-none"
                />
                <Button 
                  onClick={handleEnviarComentario}
                  disabled={!novoComentario.trim() || enviandoComentario}
                  className="bg-violet-600 hover:bg-violet-500 self-end"
                >
                  {enviandoComentario ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Tab: Histórico */}
          {activeTab === 'historico' && (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  {getLogIcon(log.acao)}
                  <div className="flex-1">
                    <p className="text-slate-300">{log.descricao || log.acao}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}

              {logs.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma alteração registrada</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-800">
          <Button variant="outline" onClick={onClose} className="border-slate-700">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
