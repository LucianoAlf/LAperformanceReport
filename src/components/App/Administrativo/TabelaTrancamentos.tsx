import { useState, useEffect } from 'react';
import { Pencil, Trash2, Check, X, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface MotivoTrancamento {
  id: number;
  nome: string;
}

interface TabelaTrancamentosProps {
  data: MovimentacaoAdmin[];
  onEdit: (item: MovimentacaoAdmin) => void;
  onDelete: (id: number) => void;
  professores: { id: number; nome: string }[];
  onSaveInline?: (id: number, data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
}

export function TabelaTrancamentos({ data, onEdit, onDelete, professores, onSaveInline }: TabelaTrancamentosProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Partial<MovimentacaoAdmin>>({});
  const [motivosTrancamento, setMotivosTrancamento] = useState<MotivoTrancamento[]>([]);
  const [saving, setSaving] = useState(false);

  // Carregar motivos de trancamento
  useEffect(() => {
    async function loadMotivos() {
      const { data } = await supabase
        .from('motivos_trancamento')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      setMotivosTrancamento(data || []);
    }
    loadMotivos();
  }, []);

  function handleStartEdit(item: MovimentacaoAdmin) {
    setEditingId(item.id || null);
    setEditingData({
      data: item.data,
      aluno_nome: item.aluno_nome,
      professor_id: item.professor_id,
      previsao_retorno: item.previsao_retorno,
      motivo: item.motivo,
    });
  }

  async function handleSaveEdit() {
    if (!editingId || !onSaveInline) return;
    
    setSaving(true);
    const success = await onSaveInline(editingId, editingData);
    setSaving(false);
    
    if (success) {
      setEditingId(null);
      setEditingData({});
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditingData({});
  }

  return (
    <div className="p-4 overflow-x-auto">
      {data.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Data</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Aluno</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Escola</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Professor</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Previsão Retorno</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Motivo</th>
              <th className="pb-3 px-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => {
              const isEditing = editingId === item.id;
              const previsaoFormatada = item.previsao_retorno 
                ? new Date(item.previsao_retorno + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
                : null;

              return (
                <tr 
                  key={item.id} 
                  className={cn(
                    "border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors",
                    isEditing && "bg-amber-500/10"
                  )}
                >
                  <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    {isEditing ? (
                      <DatePicker
                        date={editingData.data ? new Date(editingData.data + 'T00:00:00') : undefined}
                        onDateChange={(date) => setEditingData({ 
                          ...editingData, 
                          data: date ? format(date, 'yyyy-MM-dd') : '' 
                        })}
                        placeholder="Selecione"
                      />
                    ) : (
                      <span className="text-slate-300">
                        {new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    {isEditing ? (
                      <Input
                        type="text"
                        value={editingData.aluno_nome || ''}
                        onChange={(e) => setEditingData({ ...editingData, aluno_nome: e.target.value })}
                        className="w-full h-8 text-sm"
                      />
                    ) : (
                      <span className="text-white font-medium">{item.aluno_nome}</span>
                    )}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.alunos?.classificacao === 'EMLA'
                          ? 'bg-violet-500/20 text-violet-400' 
                          : 'bg-cyan-500/20 text-cyan-400'
                      }`}>
                        {item.alunos?.classificacao || 'LAMK'}
                      </span>
                      {isAdmin && item.unidades?.codigo && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                          {item.unidades.codigo}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    {isEditing ? (
                      <Select
                        value={editingData.professor_id?.toString() || ''}
                        onValueChange={(value) => setEditingData({ ...editingData, professor_id: parseInt(value) || null })}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          {professores.map((p) => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-slate-300">{item.professor_nome || '-'}</span>
                    )}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    {isEditing ? (
                      <DatePicker
                        date={editingData.previsao_retorno ? new Date(editingData.previsao_retorno + 'T00:00:00') : undefined}
                        onDateChange={(date) => setEditingData({ 
                          ...editingData, 
                          previsao_retorno: date ? format(date, 'yyyy-MM-dd') : null 
                        })}
                        placeholder="Selecione"
                      />
                    ) : previsaoFormatada ? (
                      <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-xs font-medium">
                        {previsaoFormatada}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-sm">Não informado</span>
                    )}
                  </td>
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    {isEditing ? (
                      <Select
                        value={motivosTrancamento.find(m => m.nome === editingData.motivo)?.id.toString() || ''}
                        onValueChange={(value) => {
                          const motivo = motivosTrancamento.find(m => m.id.toString() === value);
                          setEditingData({ ...editingData, motivo: motivo?.nome || '' });
                        }}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          {motivosTrancamento.map((m) => (
                            <SelectItem key={m.id} value={m.id.toString()}>{m.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-sm max-w-xs truncate">
                          {item.motivo || '-'}
                        </span>
                        {item.observacoes && (
                          <Tooltip content={item.observacoes} side="top">
                            <Info className="w-4 h-4 text-blue-400 cursor-help flex-shrink-0" />
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(item)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => item.id && onDelete(item.id)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600">
              <td colSpan={8} className="py-3 px-2 text-slate-400 font-medium">
                Total: {data.length} trancamento{data.length !== 1 ? 's' : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className="py-8 text-center text-slate-500">
          Nenhum trancamento registrado neste período
        </div>
      )}
    </div>
  );
}
