'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Plus,
  Users,
  ClipboardList,
  MessageSquare,
  Phone,
  Mail,
  Instagram,
  UserCheck,
  AlertTriangle,
  Loader2,
  Trophy,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useColaboradorAtual, useChecklistDetail } from './hooks';
import type { FarmerChecklistItem, FarmerChecklistContato } from './types';

interface ChecklistDetailProps {
  checklistId: string;
  unidadeId: string;
  onVoltar: () => void;
}

type DetailSubTab = 'tarefas' | 'carteira' | 'sucesso';

const CANAL_ICONS: Record<string, React.ReactNode> = {
  WhatsApp: <MessageSquare className="w-3.5 h-3.5" />,
  Telefone: <Phone className="w-3.5 h-3.5" />,
  Email: <Mail className="w-3.5 h-3.5" />,
  Instagram: <Instagram className="w-3.5 h-3.5" />,
  Presencial: <UserCheck className="w-3.5 h-3.5" />,
};

const CANAL_COLORS: Record<string, string> = {
  WhatsApp: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Telefone: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Email: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Instagram: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  Presencial: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

export function ChecklistDetail({ checklistId, unidadeId, onVoltar }: ChecklistDetailProps) {
  const { colaborador } = useColaboradorAtual(unidadeId);
  const {
    detail,
    items,
    contatos,
    loading,
    totalItems,
    itemsConcluidos,
    percentualProgresso,
    totalContatos,
    contatosResponderam,
    taxaSucesso,
    toggleItem,
    adicionarItem,
    editarItem,
    removerItem,
    atualizarContato,
    atualizarResponsavel,
    colaboradoresUnidade,
    cursosUnidade,
    professoresUnidade,
    refetch,
  } = useChecklistDetail(checklistId, unidadeId);

  const [activeSubTab, setActiveSubTab] = useState<DetailSubTab>('tarefas');
  const [modalNovoItemAberto, setModalNovoItemAberto] = useState(false);
  const [novoItemDescricao, setNovoItemDescricao] = useState('');
  const [novoItemCanal, setNovoItemCanal] = useState<string>('');
  const [salvandoItem, setSalvandoItem] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<string | null>(null);

  // Modal de edição do checklist
  const [modalEditarAberto, setModalEditarAberto] = useState(false);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [editPeriodicidade, setEditPeriodicidade] = useState('pontual');
  const [editDepartamento, setEditDepartamento] = useState('administrativo');
  const [editPrioridade, setEditPrioridade] = useState('media');
  const [editDataInicio, setEditDataInicio] = useState<Date | undefined>();
  const [editDataPrazo, setEditDataPrazo] = useState<Date | undefined>();
  const [editResponsavelId, setEditResponsavelId] = useState<string>('sem');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [confirmarExclusaoChecklist, setConfirmarExclusaoChecklist] = useState(false);

  // Input inline para adicionar tarefa
  const [inlineNovoItem, setInlineNovoItem] = useState('');

  const abrirModalEditar = () => {
    if (!detail) return;
    setEditTitulo(detail.titulo);
    setEditDescricao(detail.descricao || '');
    setEditPeriodicidade(detail.periodicidade || 'pontual');
    setEditDepartamento(detail.departamento || 'administrativo');
    setEditPrioridade(detail.prioridade || 'media');
    setEditDataInicio(detail.data_inicio ? new Date(detail.data_inicio + 'T00:00:00') : undefined);
    setEditDataPrazo(detail.data_prazo ? new Date(detail.data_prazo + 'T00:00:00') : undefined);
    setEditResponsavelId(detail.responsavel_id?.toString() || 'sem');
    setModalEditarAberto(true);
  };

  const handleSalvarEdicao = async () => {
    if (!detail || !editTitulo.trim()) return;
    setSalvandoEdicao(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase
        .from('farmer_checklists')
        .update({
          titulo: editTitulo.trim(),
          descricao: editDescricao.trim() || null,
          periodicidade: editPeriodicidade,
          departamento: editDepartamento,
          prioridade: editPrioridade,
          data_inicio: editDataInicio?.toISOString().split('T')[0] || null,
          data_prazo: editDataPrazo?.toISOString().split('T')[0] || null,
          responsavel_id: editResponsavelId !== 'sem' ? parseInt(editResponsavelId) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', detail.checklist_id);
      if (error) throw error;
      setModalEditarAberto(false);
      await refetch();
    } catch (err) {
      console.error('Erro ao salvar edição:', err);
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const handleExcluirChecklist = async () => {
    if (!detail) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('farmer_checklist_items').delete().eq('checklist_id', detail.checklist_id);
      await supabase.from('farmer_checklist_contatos').delete().eq('checklist_id', detail.checklist_id);
      await supabase.from('farmer_checklists').delete().eq('id', detail.checklist_id);
      onVoltar();
    } catch (err) {
      console.error('Erro ao excluir checklist:', err);
    }
  };

  const handleInlineAddItem = async () => {
    if (!inlineNovoItem.trim()) return;
    try {
      await adicionarItem({
        descricao: inlineNovoItem.trim(),
        ordem: items.length,
      });
      setInlineNovoItem('');
    } catch (err) {
      console.error('Erro ao adicionar item inline:', err);
    }
  };

  const handleToggleItem = async (itemId: string, concluida: boolean) => {
    if (!colaborador?.id) return;
    await toggleItem(itemId, concluida, colaborador.id);
  };

  const handleAdicionarItem = async () => {
    if (!novoItemDescricao.trim()) return;
    setSalvandoItem(true);
    try {
      await adicionarItem({
        descricao: novoItemDescricao.trim(),
        canal: novoItemCanal || undefined,
        ordem: items.length,
      });
      setNovoItemDescricao('');
      setNovoItemCanal('');
      setModalNovoItemAberto(false);
    } catch (err) {
      console.error('Erro ao adicionar item:', err);
    } finally {
      setSalvandoItem(false);
    }
  };

  const confirmarExclusaoItem = async () => {
    if (!itemParaExcluir) return;
    try {
      await removerItem(itemParaExcluir);
      setItemParaExcluir(null);
    } catch (err) {
      console.error('Erro ao excluir item:', err);
    }
  };

  if (loading || !detail) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-slate-700 rounded animate-pulse" />
          <div className="h-6 bg-slate-700 rounded w-1/3 animate-pulse" />
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 animate-pulse">
          <div className="h-4 bg-slate-700 rounded w-2/3 mb-4" />
          <div className="h-2 bg-slate-700/50 rounded w-full mb-6" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-slate-700/50 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isConcluido = detail.status === 'concluido';

  // Calcular prazo
  const diasRestantes = detail.data_prazo
    ? Math.ceil((new Date(detail.data_prazo + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const prazoLabel = detail.data_prazo
    ? new Date(detail.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  const progressColor =
    percentualProgresso >= 100
      ? 'bg-emerald-500'
      : percentualProgresso >= 50
        ? 'bg-gradient-to-r from-violet-500 to-emerald-500'
        : 'bg-gradient-to-r from-violet-500 to-amber-500';

  const subTabs: { id: DetailSubTab; label: string; count?: number }[] = [
    { id: 'tarefas', label: 'Tarefas', count: totalItems },
    { id: 'carteira', label: 'Carteira de Alunos', count: totalContatos },
    { id: 'sucesso', label: 'Sucesso' },
  ];

  return (
    <div className="space-y-6">
      {/* Header com botão voltar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onVoltar}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={abrirModalEditar}
            className="text-slate-400 hover:text-white"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmarExclusaoChecklist(true)}
            className="text-slate-400 hover:text-rose-400"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Título + descrição + badges (wireframe L352-353: ícone colorido) */}
      <div className="flex items-start gap-4">
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
          isConcluido ? 'bg-emerald-500/20' :
          detail.prioridade === 'alta' ? 'bg-rose-500/20' :
          detail.prioridade === 'media' ? 'bg-amber-500/20' : 'bg-violet-500/20'
        )}>
          <span className="text-2xl">
            {isConcluido ? '✅' :
             detail.departamento === 'administrativo' ? '📋' :
             detail.departamento === 'comercial' ? '💼' :
             detail.departamento === 'pedagogico' ? '📚' : '📌'}
          </span>
        </div>
        <div>
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          {isConcluido && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {detail.titulo}
        </h3>
        {detail.descricao && (
          <p className="text-sm text-slate-400 mt-0.5">{detail.descricao}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Badge de prioridade */}
          <span className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
            detail.prioridade === 'alta'
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              : detail.prioridade === 'media'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
          )}>
            {detail.prioridade === 'alta' ? 'URGENTE' :
             detail.prioridade === 'media' ? 'Alta' : 'Normal'}
          </span>

          {/* Badge de periodicidade */}
          {detail.periodicidade && detail.periodicidade !== 'pontual' && (
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-violet-500/20 text-violet-400 border-violet-500/30">
              {detail.periodicidade === 'diario' ? 'Diário' :
               detail.periodicidade === 'semanal' ? 'Semanal' : 'Mensal'}
            </span>
          )}

          {/* Badge de departamento */}
          {detail.departamento && (
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-slate-500/20 text-slate-300 border-slate-500/30">
              {detail.departamento === 'administrativo' ? 'Administrativo' :
               detail.departamento === 'comercial' ? 'Comercial' :
               detail.departamento === 'pedagogico' ? 'Pedagógico' : 'Geral'}
            </span>
          )}

          {/* Prazo */}
          {prazoLabel && (
            <span className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
              diasRestantes !== null && diasRestantes <= 0
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                : diasRestantes !== null && diasRestantes <= 3
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
            )}>
              Prazo: {prazoLabel}
              {diasRestantes !== null && diasRestantes <= 0 && ' (Vencido!)'}
            </span>
          )}

          {/* Responsável */}
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-3 h-3 text-violet-400 shrink-0" />
            <Select
              value={detail.responsavel_id?.toString() || 'sem'}
              onValueChange={(v) => atualizarResponsavel(v === 'sem' ? null : Number(v))}
            >
              <SelectTrigger className="h-6 w-auto min-w-[120px] text-xs bg-transparent border-slate-600/50 rounded-full px-2.5 gap-1">
                <SelectValue placeholder="Responsável..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="sem" className="text-xs text-slate-400">Sem responsável</SelectItem>
                {colaboradoresUnidade.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()} className="text-xs">
                    {c.apelido || c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        </div>
      </div>

      {/* Barra de Progresso Principal */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">Progresso Geral</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-white">
              {itemsConcluidos}/{totalItems} tarefas
            </span>
            <span className={cn(
              'text-lg font-bold',
              percentualProgresso >= 100 ? 'text-emerald-400' :
              percentualProgresso >= 50 ? 'text-violet-400' : 'text-amber-400'
            )}>
              {percentualProgresso}%
            </span>
          </div>
        </div>
        <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', progressColor)}
            style={{ width: `${percentualProgresso}%` }}
          />
        </div>

        {/* Info do responsável */}
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span>👤 {detail.colaborador_apelido || detail.colaborador_nome}</span>
          {totalContatos > 0 && (
            <span>👥 {contatosResponderam}/{totalContatos} responderam ({taxaSucesso}%)</span>
          )}
        </div>
      </div>

      {/* Sub-tabs internas (mesmo padrão do PainelFarmer) */}
      <div className="flex gap-2">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              'px-4 py-2 rounded-t-xl rounded-b-none text-sm font-medium transition-all flex items-center gap-2 border border-b-0',
              activeSubTab === tab.id
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white border-violet-600'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 border-slate-700/50'
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full',
                activeSubTab === tab.id ? 'bg-white/20' : 'bg-slate-700'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo da sub-tab */}
      <div className="bg-slate-900/50 border border-slate-700/50 border-t-0 rounded-b-xl p-5">
        {activeSubTab === 'tarefas' && (
          <TarefasSubTab
            items={items}
            isConcluido={isConcluido}
            onToggle={handleToggleItem}
            onAddItem={() => setModalNovoItemAberto(true)}
            onEditItem={editarItem}
            onAddSubItem={async (parentId, descricao, canal) => {
              await adicionarItem({ descricao, canal: canal || undefined, parent_id: parentId });
            }}
            onDeleteItem={(id) => setItemParaExcluir(id)}
            inlineValue={inlineNovoItem}
            onInlineChange={setInlineNovoItem}
            onInlineSubmit={handleInlineAddItem}
            colaboradores={colaboradoresUnidade}
          />
        )}
        {activeSubTab === 'carteira' && (
          <CarteiraSubTab
            contatos={contatos}
            onAtualizarContato={atualizarContato}
            cursosUnidade={cursosUnidade}
            professoresUnidade={professoresUnidade}
          />
        )}
        {activeSubTab === 'sucesso' && (
          <SucessoSubTab
            items={items}
            contatos={contatos}
            totalItems={totalItems}
            itemsConcluidos={itemsConcluidos}
            percentualProgresso={percentualProgresso}
            totalContatos={totalContatos}
            contatosResponderam={contatosResponderam}
            taxaSucesso={taxaSucesso}
          />
        )}
      </div>

      {/* Modal: Novo Item */}
      <Dialog open={modalNovoItemAberto} onOpenChange={setModalNovoItemAberto}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Adicionar Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Descrição
              </label>
              <Input
                value={novoItemDescricao}
                onChange={e => setNovoItemDescricao(e.target.value)}
                placeholder="Ex: Enviar mensagem de boas-vindas"
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Canal (opcional)
              </label>
              <Select value={novoItemCanal} onValueChange={setNovoItemCanal}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Selecione o canal" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="WhatsApp">💬 WhatsApp</SelectItem>
                  <SelectItem value="Telefone">📞 Telefone</SelectItem>
                  <SelectItem value="Email">📧 Email</SelectItem>
                  <SelectItem value="Instagram">📸 Instagram</SelectItem>
                  <SelectItem value="Presencial">🤝 Presencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalNovoItemAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAdicionarItem}
              disabled={!novoItemDescricao.trim() || salvandoItem}
              className="bg-gradient-to-r from-violet-600 to-purple-600"
            >
              {salvandoItem ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar exclusão de item */}
      <AlertDialog open={!!itemParaExcluir} onOpenChange={(open) => { if (!open) setItemParaExcluir(null); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Excluir Tarefa
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir esta tarefa do checklist?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusaoItem}
              className="bg-rose-500 text-white hover:bg-rose-600"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Editar Checklist (wireframe Imagem 5) */}
      <Dialog open={modalEditarAberto} onOpenChange={setModalEditarAberto}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Pencil className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <DialogTitle className="text-white">Editar Checklist</DialogTitle>
                <DialogDescription className="text-slate-400 text-xs">
                  Altere título, prazo, prioridade e tarefas
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Título</label>
              <Input
                value={editTitulo}
                onChange={e => setEditTitulo(e.target.value)}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Descrição</label>
              <Textarea
                value={editDescricao}
                onChange={e => setEditDescricao(e.target.value)}
                className="bg-slate-800 border-slate-700 min-h-[60px] resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Periodicidade</label>
                <Select value={editPeriodicidade} onValueChange={setEditPeriodicidade}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="pontual">Pontual</SelectItem>
                    <SelectItem value="diario">Diário</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Departamento</label>
                <Select value={editDepartamento} onValueChange={setEditDepartamento}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="administrativo">Administrativo</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="pedagogico">Pedagógico</SelectItem>
                    <SelectItem value="geral">Geral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Prioridade</label>
                <Select value={editPrioridade} onValueChange={setEditPrioridade}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="baixa">Normal</SelectItem>
                    <SelectItem value="media">Alta</SelectItem>
                    <SelectItem value="alta">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Data Início</label>
                <DatePicker date={editDataInicio} onDateChange={setEditDataInicio} placeholder="Selecione..." />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Data Prazo</label>
                <DatePicker date={editDataPrazo} onDateChange={setEditDataPrazo} placeholder="Selecione..." />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Responsável</label>
              <Select value={editResponsavelId} onValueChange={setEditResponsavelId}>
                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="sem" className="text-xs text-slate-400">Sem responsável</SelectItem>
                  {colaboradoresUnidade.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()} className="text-xs">
                      {c.apelido || c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between border-t border-slate-700/50 pt-4">
            <button
              onClick={() => { setModalEditarAberto(false); setConfirmarExclusaoChecklist(true); }}
              className="text-sm text-rose-400 hover:text-rose-300 flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Checklist
            </button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setModalEditarAberto(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarEdicao}
                disabled={!editTitulo.trim() || salvandoEdicao}
                className="bg-gradient-to-r from-violet-600 to-purple-600"
              >
                {salvandoEdicao ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Alterações'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Confirmar exclusão do checklist inteiro */}
      <AlertDialog open={confirmarExclusaoChecklist} onOpenChange={setConfirmarExclusaoChecklist}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Excluir Checklist
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir este checklist? Todas as tarefas e contatos vinculados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluirChecklist}
              className="bg-rose-500 text-white hover:bg-rose-600"
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================
// Sub-tab: Tarefas (itens do checklist)
// ============================================

interface TarefasSubTabProps {
  items: FarmerChecklistItem[];
  isConcluido: boolean;
  onToggle: (itemId: string, concluida: boolean) => void;
  onAddItem: () => void;
  onEditItem: (itemId: string, dados: { descricao?: string; canal?: string | null; info?: string | null; responsavel_id?: number | null }) => Promise<void>;
  onAddSubItem: (parentId: string, descricao: string, canal?: string) => Promise<void>;
  onDeleteItem: (itemId: string) => void;
  inlineValue: string;
  onInlineChange: (v: string) => void;
  onInlineSubmit: () => void;
  colaboradores: { id: number; nome: string; apelido: string | null; perfil: string }[];
}

function TarefasSubTab({ items, isConcluido, onToggle, onAddItem, onEditItem, onAddSubItem, onDeleteItem, inlineValue, onInlineChange, onInlineSubmit, colaboradores }: TarefasSubTabProps) {
  const [filtro, setFiltro] = useState<'todos' | 'professor' | 'curso'>('todos');

  // Estado de edição inline de item
  const [editandoItemId, setEditandoItemId] = useState<string | null>(null);
  const [editDescricao, setEditDescricao] = useState('');
  const [editCanal, setEditCanal] = useState<string>('');
  const [editResponsavel, setEditResponsavel] = useState<string>('');

  // Estado de adicionar subtarefa
  const [addSubParentId, setAddSubParentId] = useState<string | null>(null);
  const [novaSubDescricao, setNovaSubDescricao] = useState('');
  const [novaSubCanal, setNovaSubCanal] = useState('');
  const [salvandoSub, setSalvandoSub] = useState(false);

  const iniciarEdicao = (item: { id: string; descricao: string; canal?: string | null; responsavel_id?: number | null }) => {
    setEditandoItemId(item.id);
    setEditDescricao(item.descricao);
    setEditCanal(item.canal || '');
    setEditResponsavel(item.responsavel_id?.toString() || '');
  };

  const salvarEdicao = async () => {
    if (!editandoItemId || !editDescricao.trim()) return;
    await onEditItem(editandoItemId, {
      descricao: editDescricao.trim(),
      canal: editCanal || null,
      responsavel_id: editResponsavel ? Number(editResponsavel) : null,
    });
    setEditandoItemId(null);
  };

  const cancelarEdicao = () => {
    setEditandoItemId(null);
  };

  const iniciarAddSub = (parentId: string) => {
    setAddSubParentId(parentId);
    setNovaSubDescricao('');
    setNovaSubCanal('');
  };

  const salvarSubtarefa = async () => {
    if (!addSubParentId || !novaSubDescricao.trim()) return;
    setSalvandoSub(true);
    try {
      await onAddSubItem(addSubParentId, novaSubDescricao.trim(), novaSubCanal || undefined);
      setAddSubParentId(null);
    } finally {
      setSalvandoSub(false);
    }
  };

  // Contagem total incluindo sub-itens
  const totalAll = items.reduce((acc, i) => acc + 1 + (i.sub_items?.length || 0), 0);
  const doneAll = items.reduce((acc, i) => acc + (i.concluida ? 1 : 0) + (i.sub_items?.filter(s => s.concluida).length || 0), 0);
  const allDone = totalAll > 0 && doneAll === totalAll;

  const handleSelectAll = (checked: boolean) => {
    items.forEach(item => {
      if (item.concluida !== checked) onToggle(item.id, checked);
      item.sub_items?.forEach(sub => {
        if (sub.concluida !== checked) onToggle(sub.id, checked);
      });
    });
  };

  return (
    <div className="space-y-3">
      {/* Header: Selecionar Todos + Filtros (wireframe L386-393) */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <Checkbox
            checked={allDone}
            onCheckedChange={(checked) => handleSelectAll(!!checked)}
            disabled={isConcluido}
          />
          <span className={cn('text-sm font-medium group-hover:text-white', allDone ? 'text-emerald-400' : 'text-slate-300')}>
            Selecionar Todos
          </span>
          <span className="text-xs text-slate-500">({doneAll}/{totalAll} concluídas)</span>
        </label>
        <div className="flex items-center gap-1.5">
          {(['todos', 'professor', 'curso'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium rounded-lg border',
                filtro === f
                  ? 'bg-violet-600/20 text-violet-400 border-violet-500/30'
                  : 'text-slate-500 hover:text-slate-300 border-transparent hover:border-slate-600/40'
              )}
            >
              {f === 'todos' ? 'Todos' : f === 'professor' ? 'Por Professor' : 'Por Curso'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de itens */}
      {items.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">Nenhuma tarefa ainda</p>
          <p className="text-sm">Adicione tarefas a este checklist</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map(item => {
            // Highlight: item pendente com info ou sub-itens pendentes
            const hasPendingContext = !item.concluida && (item.info || (item.sub_items && item.sub_items.length > 0));
            const isEditing = editandoItemId === item.id;
            return (
            <div key={item.id}>
              {/* Item principal */}
              <div className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-all group',
                isEditing
                  ? 'border-violet-500/30 bg-violet-500/5'
                  : item.concluida
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : hasPendingContext
                      ? 'border-amber-500/10 bg-amber-500/5'
                      : 'border-slate-700/30 bg-slate-800/30 hover:bg-slate-700/20'
              )}>
                <Checkbox
                  checked={item.concluida}
                  onCheckedChange={(checked) => onToggle(item.id, !!checked)}
                  disabled={isConcluido || isEditing}
                  className="mt-0.5"
                />

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    /* === MODO EDIÇÃO INLINE === */
                    <div className="space-y-2">
                      <input
                        autoFocus
                        value={editDescricao}
                        onChange={e => setEditDescricao(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(); if (e.key === 'Escape') cancelarEdicao(); }}
                        className="w-full bg-slate-800 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-500"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={editCanal || 'nenhum'} onValueChange={v => setEditCanal(v === 'nenhum' ? '' : v)}>
                          <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-600 w-36">
                            <SelectValue placeholder="Canal" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="nenhum">Sem canal</SelectItem>
                            <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                            <SelectItem value="Telefone">Telefone</SelectItem>
                            <SelectItem value="Email">Email</SelectItem>
                            <SelectItem value="Instagram">Instagram</SelectItem>
                            <SelectItem value="Presencial">Presencial</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={editResponsavel || 'nenhum'} onValueChange={v => setEditResponsavel(v === 'nenhum' ? '' : v)}>
                          <SelectTrigger className="h-7 text-xs bg-slate-800 border-slate-600 w-40">
                            <SelectValue placeholder="Responsável" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="nenhum">Sem responsável</SelectItem>
                            {colaboradores.map(c => (
                              <SelectItem key={c.id} value={c.id.toString()} className="text-xs">{c.apelido || c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700" onClick={salvarEdicao}>
                          Salvar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400" onClick={cancelarEdicao}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* === MODO VISUALIZAÇÃO === */
                    <>
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          'text-sm transition-all',
                          item.concluida ? 'text-slate-400 line-through' : 'text-white',
                          !item.concluida && hasPendingContext && 'font-medium'
                        )}>
                          {item.descricao}
                        </p>
                        {item.canal && (
                          <span className={cn(
                            'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0',
                            CANAL_COLORS[item.canal] || 'bg-slate-700/50 text-slate-400 border-slate-600/50'
                          )}>
                            {item.canal}
                          </span>
                        )}
                        {item.responsavel_nome && (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-500/15 text-violet-400 border border-violet-500/20">
                            <UserCheck className="w-2.5 h-2.5" />
                            {item.responsavel_apelido || item.responsavel_nome}
                          </span>
                        )}
                      </div>
                      {item.info && !item.concluida && (
                        <p className="text-xs text-slate-500 mt-1">{item.info}</p>
                      )}
                    </>
                  )}

                  {/* Sub-itens inline */}
                  {item.sub_items && item.sub_items.length > 0 && (
                    <div className="ml-5 mt-2 space-y-1.5">
                      {item.sub_items.map(sub => (
                        <div key={sub.id} className="flex items-center gap-2 p-2 rounded-md bg-slate-800/20 group/sub">
                          <Checkbox
                            checked={sub.concluida}
                            onCheckedChange={(checked) => onToggle(sub.id, !!checked)}
                            disabled={isConcluido}
                            className="h-3.5 w-3.5"
                          />
                          <p className={cn('text-xs flex-1', sub.concluida ? 'text-slate-500 line-through' : 'text-slate-300')}>
                            {sub.descricao}
                          </p>
                          {sub.canal && (
                            <span className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0', CANAL_COLORS[sub.canal] || 'bg-slate-700/50 text-slate-400 border-slate-600/50')}>
                              {sub.canal}
                            </span>
                          )}
                          {sub.info && (
                            <span className={cn('text-xs', sub.concluida ? 'text-emerald-400' : 'text-amber-400')}>
                              {sub.info}
                            </span>
                          )}
                          {/* Botões editar/excluir subtarefa */}
                          {!isConcluido && (
                            <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                              <button onClick={() => iniciarEdicao(sub)} className="text-slate-500 hover:text-violet-400 p-0.5">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={() => onDeleteItem(sub.id)} className="text-slate-500 hover:text-rose-400 p-0.5">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Input inline para nova subtarefa */}
                  {addSubParentId === item.id && (
                    <div className="ml-5 mt-2 flex items-center gap-2 p-2 rounded-md border border-dashed border-violet-500/30 bg-violet-500/5">
                      <Plus className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                      <input
                        autoFocus
                        value={novaSubDescricao}
                        onChange={e => setNovaSubDescricao(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') salvarSubtarefa(); if (e.key === 'Escape') setAddSubParentId(null); }}
                        placeholder="Descrição da subtarefa..."
                        className="flex-1 bg-transparent text-xs text-slate-300 placeholder:text-slate-600 outline-none"
                      />
                      <Select value={novaSubCanal || 'nenhum'} onValueChange={v => setNovaSubCanal(v === 'nenhum' ? '' : v)}>
                        <SelectTrigger className="h-6 text-[10px] bg-slate-800 border-slate-600 w-28">
                          <SelectValue placeholder="Canal" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="nenhum">Sem canal</SelectItem>
                          <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                          <SelectItem value="Telefone">Telefone</SelectItem>
                          <SelectItem value="Email">Email</SelectItem>
                          <SelectItem value="Presencial">Presencial</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-6 text-[10px] px-2 bg-violet-600" onClick={salvarSubtarefa} disabled={!novaSubDescricao.trim() || salvandoSub}>
                        {salvandoSub ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Adicionar'}
                      </Button>
                      <button onClick={() => setAddSubParentId(null)} className="text-slate-500 hover:text-white p-0.5">
                        <span className="text-xs">✕</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Botões de ação (editar, subtarefa, excluir) */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.info && item.concluida && (
                    <span className="text-xs text-emerald-400 mr-1">{item.info}</span>
                  )}

                  {!isConcluido && !isEditing && (
                    <>
                      {/* Botão editar */}
                      <button
                        onClick={() => iniciarEdicao(item)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-violet-400 p-1 transition-opacity"
                        title="Editar tarefa"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {/* Botão adicionar subtarefa */}
                      <button
                        onClick={() => iniciarAddSub(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-emerald-400 p-1 transition-opacity"
                        title="Adicionar subtarefa"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      {/* Botão excluir */}
                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 transition-opacity"
                        title="Excluir tarefa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })}

          {/* Input inline para adicionar tarefa (wireframe) */}
          {!isConcluido && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-slate-700/40 hover:border-violet-500/30 mt-2">
              <Plus className="w-4 h-4 text-slate-600 flex-shrink-0" />
              <input
                value={inlineValue}
                onChange={e => onInlineChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onInlineSubmit(); }}
                placeholder="Adicionar nova tarefa ao checklist..."
                className="flex-1 bg-transparent text-sm text-slate-300 placeholder:text-slate-600 outline-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-tab: Carteira (contatos/alunos)
// ============================================

interface CarteiraSubTabProps {
  contatos: FarmerChecklistContato[];
  onAtualizarContato: (id: string, status: string, canal?: string, obs?: string) => void;
  cursosUnidade: { id: number; nome: string }[];
  professoresUnidade: { id: number; nome: string }[];
}

function CarteiraSubTab({ contatos, onAtualizarContato, cursosUnidade, professoresUnidade }: CarteiraSubTabProps) {
  const [filtroCurso, setFiltroCurso] = useState('todos');
  const [filtroProf, setFiltroProf] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [pagina, setPagina] = useState(0);
  const [acoesAbertoId, setAcoesAbertoId] = useState<string | null>(null);
  const POR_PAGINA = 10;

  const statusColors: Record<string, string> = {
    pendente: 'text-slate-400',
    respondeu: 'text-emerald-400',
    visualizou: 'text-blue-400',
    sem_resposta: 'text-amber-400',
    nao_recebeu: 'text-rose-400',
  };
  const statusDotColors: Record<string, string> = {
    pendente: 'bg-slate-400',
    respondeu: 'bg-emerald-400',
    visualizou: 'bg-blue-400',
    sem_resposta: 'bg-amber-400',
    nao_recebeu: 'bg-rose-400',
  };
  const statusLabels: Record<string, string> = {
    pendente: 'Pendente',
    respondeu: 'Respondeu',
    visualizou: 'Visualizou',
    sem_resposta: 'Sem Resposta',
    nao_recebeu: 'Não Recebeu',
  };

  if (contatos.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="font-medium">Nenhum aluno vinculado</p>
        <p className="text-sm">Vincule alunos a este checklist para acompanhar contatos</p>
      </div>
    );
  }

  // Usar cursos e professores da unidade (todos os ativos, não apenas os do checklist)
  const cursos = cursosUnidade;
  const professores = professoresUnidade;

  // Filtrar contatos
  const filtrados = contatos.filter(c => {
    if (filtroCurso !== 'todos' && c.alunos?.cursos?.nome !== cursos.find(cu => cu.id.toString() === filtroCurso)?.nome) return false;
    if (filtroProf !== 'todos' && c.alunos?.professores?.nome !== professores.find(p => p.id.toString() === filtroProf)?.nome) return false;
    if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false;
    return true;
  });

  // Métricas
  const responderam = filtrados.filter(c => c.status === 'respondeu').length;
  const pendentes = filtrados.filter(c => c.status === 'pendente' || c.status === 'sem_resposta').length;
  const semResposta = filtrados.filter(c => c.status === 'nao_recebeu').length;
  const taxaSucesso = filtrados.length > 0 ? Math.round((responderam / filtrados.length) * 100) : 0;

  // Paginação
  const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  return (
    <div className="space-y-4">
      {/* Filtros (wireframe L429-433) */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filtroCurso} onValueChange={v => { setFiltroCurso(v); setPagina(0); }}>
          <SelectTrigger className="bg-slate-800 border-slate-700 h-8 text-xs w-48"><SelectValue placeholder="Todos os Cursos" /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="todos" className="text-xs">Todos os Cursos</SelectItem>
            {cursos.map(c => <SelectItem key={c.id} value={c.id.toString()} className="text-xs">{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroProf} onValueChange={v => { setFiltroProf(v); setPagina(0); }}>
          <SelectTrigger className="bg-slate-800 border-slate-700 h-8 text-xs w-48"><SelectValue placeholder="Todos os Professores" /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="todos" className="text-xs">Todos os Professores</SelectItem>
            {professores.map(p => <SelectItem key={p.id} value={p.id.toString()} className="text-xs">{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={v => { setFiltroStatus(v); setPagina(0); }}>
          <SelectTrigger className="bg-slate-800 border-slate-700 h-8 text-xs w-40"><SelectValue placeholder="Todos os Status" /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="todos" className="text-xs">Todos os Status</SelectItem>
            {Object.entries(statusLabels).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">Minha carteira: {filtrados.length} de {contatos.length}</span>
      </div>

      {/* Cards resumo (wireframe L435-436) */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-800/50 border border-slate-700/20 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-white">{filtrados.length}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Meus Alunos</p>
        </div>
        <div className="bg-slate-800/50 border border-emerald-500/20 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">{taxaSucesso}%</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Taxa de Sucesso</p>
        </div>
        <div className="bg-slate-800/50 border border-amber-500/20 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-amber-400">{pendentes}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Pendentes</p>
        </div>
        <div className="bg-slate-800/50 border border-rose-500/20 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-rose-400">{semResposta}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Sem Resposta</p>
        </div>
      </div>

      {/* Tabela (wireframe L438-449) */}
      <div className="overflow-hidden rounded-xl border border-slate-700/30">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800/70 text-slate-400">
              <th className="text-left px-3 py-2.5 font-medium">Aluno</th>
              <th className="text-left px-3 py-2.5 font-medium">Curso</th>
              <th className="text-left px-3 py-2.5 font-medium">Professor</th>
              <th className="text-left px-3 py-2.5 font-medium">Canal</th>
              <th className="text-left px-3 py-2.5 font-medium">Status</th>
              <th className="text-center px-3 py-2.5 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {paginados.map(contato => {
              const isWarning = contato.status === 'sem_resposta' || contato.status === 'nao_recebeu';
              return (
                <tr key={contato.id} className={cn('hover:bg-slate-800/30', isWarning && 'bg-amber-500/5')}>
                  <td className="px-3 py-2.5 text-slate-200 font-medium">{contato.alunos?.nome || 'Aluno'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{contato.alunos?.cursos?.nome || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{contato.alunos?.professores?.nome || '—'}</td>
                  <td className="px-3 py-2.5">
                    {contato.canal_contato ? (
                      <span className={cn('px-1.5 py-0.5 text-[10px] rounded font-medium', CANAL_COLORS[contato.canal_contato] || 'bg-slate-700/50 text-slate-400')}>
                        {contato.canal_contato}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('w-2 h-2 rounded-full', statusDotColors[contato.status] || 'bg-slate-400')} />
                      <Select value={contato.status} onValueChange={(v) => onAtualizarContato(contato.id, v)}>
                        <SelectTrigger className={cn('h-6 w-auto min-w-[100px] text-[10px] border-0 bg-transparent p-0', statusColors[contato.status])}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="relative inline-block">
                      <button
                        onClick={() => setAcoesAbertoId(acoesAbertoId === contato.id ? null : contato.id)}
                        className="text-slate-500 hover:text-violet-400 p-1 rounded hover:bg-slate-700/50"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      {acoesAbertoId === contato.id && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 w-44">
                          <button
                            onClick={() => {
                              const wp = contato.alunos?.whatsapp?.replace(/\D/g, '');
                              if (wp) window.open(`https://wa.me/55${wp}`, '_blank');
                              else alert('WhatsApp não cadastrado');
                              setAcoesAbertoId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 hover:text-emerald-400"
                          >
                            <MessageSquare className="w-3.5 h-3.5" /> Enviar WhatsApp
                          </button>
                          <button
                            onClick={() => {
                              const wp = contato.alunos?.whatsapp?.replace(/\D/g, '');
                              if (wp) window.open(`tel:+55${wp}`);
                              else alert('Telefone não cadastrado');
                              setAcoesAbertoId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 hover:text-amber-400"
                          >
                            <Phone className="w-3.5 h-3.5" /> Ligar
                          </button>
                          <div className="border-t border-slate-700/50 my-1" />
                          <button
                            onClick={() => {
                              onAtualizarContato(contato.id, 'respondeu', undefined, undefined);
                              setAcoesAbertoId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 hover:text-emerald-400"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> Marcar Respondeu
                          </button>
                          <button
                            onClick={() => {
                              onAtualizarContato(contato.id, 'sem_resposta', undefined, undefined);
                              setAcoesAbertoId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 hover:text-rose-400"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" /> Sem Resposta
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação (wireframe L451-461) */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Mostrando {paginados.length} de {filtrados.length}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPagina(p => Math.max(0, p - 1))}
              disabled={pagina === 0}
              className="px-2.5 py-1 text-xs text-slate-400 bg-slate-800/50 rounded-lg border border-slate-700/50 disabled:opacity-40"
            >
              ← Anterior
            </button>
            {Array.from({ length: Math.min(totalPaginas, 5) }, (_, i) => {
              const pg = totalPaginas <= 5 ? i : pagina <= 2 ? i : pagina >= totalPaginas - 3 ? totalPaginas - 5 + i : pagina - 2 + i;
              return (
                <button
                  key={pg}
                  onClick={() => setPagina(pg)}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-lg',
                    pagina === pg ? 'text-white bg-violet-600' : 'text-slate-400 bg-slate-800/50 border border-slate-700/50'
                  )}
                >
                  {pg + 1}
                </button>
              );
            })}
            {totalPaginas > 5 && pagina < totalPaginas - 3 && (
              <>
                <span className="text-xs text-slate-600">...</span>
                <button onClick={() => setPagina(totalPaginas - 1)} className="px-2.5 py-1 text-xs text-slate-400 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  {totalPaginas}
                </button>
              </>
            )}
            <button
              onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
              disabled={pagina >= totalPaginas - 1}
              className="px-2.5 py-1 text-xs text-slate-400 bg-slate-800/50 rounded-lg border border-slate-700/50 disabled:opacity-40"
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-tab: Sucesso (métricas)
// ============================================

interface SucessoSubTabProps {
  items: FarmerChecklistItem[];
  contatos: FarmerChecklistContato[];
  totalItems: number;
  itemsConcluidos: number;
  percentualProgresso: number;
  totalContatos: number;
  contatosResponderam: number;
  taxaSucesso: number;
}

function SucessoSubTab({
  items,
  contatos,
  totalItems,
  itemsConcluidos,
  percentualProgresso,
  totalContatos,
  contatosResponderam,
  taxaSucesso,
}: SucessoSubTabProps) {
  // Calcular métricas por canal
  const canais = contatos.reduce<Record<string, { total: number; responderam: number }>>((acc, c) => {
    const canal = c.canal_contato || 'Sem canal';
    if (!acc[canal]) acc[canal] = { total: 0, responderam: 0 };
    acc[canal].total++;
    if (c.status === 'respondeu') acc[canal].responderam++;
    return acc;
  }, {});

  const pendentes = contatos.filter(c => c.status === 'pendente' || c.status === 'sem_resposta').length;

  const canalCardColors: Record<string, { bg: string; text: string; bar: string; icon: React.ReactNode }> = {
    WhatsApp: { bg: 'from-emerald-500/10 to-emerald-600/10 border-emerald-500/20', text: 'text-emerald-400', bar: 'bg-emerald-500', icon: <MessageSquare className="w-6 h-6" /> },
    Email: { bg: 'from-blue-500/10 to-blue-600/10 border-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500', icon: <Mail className="w-6 h-6" /> },
    Telefone: { bg: 'from-amber-500/10 to-amber-600/10 border-amber-500/20', text: 'text-amber-400', bar: 'bg-amber-500', icon: <Phone className="w-6 h-6" /> },
    Presencial: { bg: 'from-purple-500/10 to-purple-600/10 border-purple-500/20', text: 'text-purple-400', bar: 'bg-purple-500', icon: <UserCheck className="w-6 h-6" /> },
    Instagram: { bg: 'from-pink-500/10 to-pink-600/10 border-pink-500/20', text: 'text-pink-400', bar: 'bg-pink-500', icon: <Instagram className="w-6 h-6" /> },
  };

  return (
    <div className="space-y-6">
      {/* Título da seção */}
      <h4 className="text-sm font-semibold text-white">Percentual de Sucesso por Canal</h4>

      {/* Cards por canal (wireframe Imagem 4) */}
      {Object.keys(canais).length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(canais).map(([canal, data]) => {
            const pct = data.total > 0 ? Math.round((data.responderam / data.total) * 100) : 0;
            const style = canalCardColors[canal] || { bg: 'from-slate-500/10 to-slate-600/10 border-slate-500/20', text: 'text-slate-400', bar: 'bg-slate-500', icon: <Circle className="w-6 h-6" /> };
            return (
              <div key={canal} className={cn('bg-gradient-to-br rounded-xl border p-4', style.bg)}>
                <div className="flex justify-center mb-2">
                  <div className={cn('w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center', style.text)}>
                    {style.icon}
                  </div>
                </div>
                <p className={cn('text-2xl font-bold text-center', style.text)}>{pct}%</p>
                <p className="text-xs text-slate-400 text-center mt-0.5">{canal}</p>
                <p className="text-[10px] text-slate-500 text-center">{data.responderam} de {data.total}</p>
                <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden mt-2">
                  <div className={cn('h-full rounded-full transition-all', style.bar)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Tarefas Concluídas" value={`${itemsConcluidos}/${totalItems}`} percentual={percentualProgresso} color="violet" />
          <MetricCard label="Progresso" value={`${percentualProgresso}%`} percentual={percentualProgresso} color={percentualProgresso >= 100 ? 'emerald' : 'violet'} />
        </div>
      )}

      {/* Resumo Geral (wireframe Imagem 4) */}
      {totalContatos > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Resumo Geral</h4>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className={cn('text-2xl font-bold', taxaSucesso >= 80 ? 'text-emerald-400' : taxaSucesso >= 50 ? 'text-amber-400' : 'text-rose-400')}>
                {taxaSucesso}%
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Taxa Geral</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalContatos}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total Contatos</p>
            </div>
            <div>
              <p className={cn('text-2xl font-bold', pendentes > 0 ? 'text-rose-400' : 'text-emerald-400')}>
                {pendentes}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Pendentes</p>
            </div>
          </div>
        </div>
      )}

      {/* Mensagem de conclusão */}
      {percentualProgresso >= 100 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
          <h4 className="text-lg font-bold text-emerald-300">Checklist Concluído! 🎉</h4>
          <p className="text-sm text-emerald-400/70 mt-1">
            Todas as tarefas foram finalizadas com sucesso.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-componente: Card de Métrica
// ============================================

interface MetricCardProps {
  label: string;
  value: string;
  percentual: number;
  color: 'violet' | 'emerald' | 'amber' | 'rose';
}

function MetricCard({ label, value, percentual, color }: MetricCardProps) {
  const colorStyles: Record<string, string> = {
    violet: 'from-violet-500/10 to-purple-500/10 border-violet-500/20 text-violet-400',
    emerald: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20 text-emerald-400',
    amber: 'from-amber-500/10 to-orange-500/10 border-amber-500/20 text-amber-400',
    rose: 'from-rose-500/10 to-pink-500/10 border-rose-500/20 text-rose-400',
  };

  return (
    <div className={cn('bg-gradient-to-br rounded-xl border p-4', colorStyles[color])}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default ChecklistDetail;
