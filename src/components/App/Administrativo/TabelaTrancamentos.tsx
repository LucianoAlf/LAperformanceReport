import { useState, useEffect, useCallback } from 'react';
import { Trash2, Play, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { CelulaEditavelInline } from '@/components/ui/CelulaEditavelInline';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface MotivoTrancamento {
  id: number;
  nome: string;
}

interface TabelaTrancamentosProps {
  data: MovimentacaoAdmin[];
  onEdit: (item: MovimentacaoAdmin) => void;
  onDelete: (id: number) => void;
  onDestrancar?: (item: MovimentacaoAdmin) => Promise<void>;
  professores: { id: number; nome: string }[];
  onSaveInline?: (id: number, data: Partial<MovimentacaoAdmin>) => Promise<boolean>;
}

export function TabelaTrancamentos({ data, onEdit, onDelete, onDestrancar, professores, onSaveInline }: TabelaTrancamentosProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  
  const [motivosTrancamento, setMotivosTrancamento] = useState<MotivoTrancamento[]>([]);

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

  // Função para salvar campo individual
  const salvarCampo = useCallback(async (itemId: number, campo: string, valor: string | number | null) => {
    if (!onSaveInline) return;
    
    const updateData: Partial<MovimentacaoAdmin> = {};
    
    switch (campo) {
      case 'data':
        updateData.data = valor as string;
        break;
      case 'aluno_nome':
        updateData.aluno_nome = valor as string;
        break;
      case 'professor_id':
        updateData.professor_id = valor ? Number(valor) : null;
        break;
      case 'previsao_retorno':
        updateData.previsao_retorno = valor as string | null;
        break;
      case 'motivo':
        updateData.motivo = valor as string | null;
        break;
    }
    
    await onSaveInline(itemId, updateData);
  }, [onSaveInline]);

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
              const previsaoFormatada = item.previsao_retorno 
                ? new Date(item.previsao_retorno + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
                : null;

              return (
                <tr 
                  key={item.id} 
                  className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors"
                >
                  <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                  
                  {/* Data - Edição inline */}
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    <CelulaEditavelInline
                      value={item.data}
                      onChange={async (valor) => item.id && salvarCampo(item.id, 'data', valor)}
                      tipo="data"
                      textClassName="text-slate-300"
                    />
                  </td>
                  
                  {/* Aluno - Edição inline */}
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    <CelulaEditavelInline
                      value={item.aluno_nome}
                      onChange={async (valor) => item.id && salvarCampo(item.id, 'aluno_nome', valor)}
                      tipo="texto"
                      textClassName="text-white font-medium"
                    />
                  </td>
                  
                  {/* Escola - Não editável */}
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
                  
                  {/* Professor - Edição inline */}
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    <CelulaEditavelInline
                      value={item.professor_id}
                      onChange={async (valor) => item.id && salvarCampo(item.id, 'professor_id', valor)}
                      tipo="select"
                      opcoes={professores.map(p => ({ value: p.id, label: p.nome }))}
                      placeholder="-"
                      formatarExibicao={() => item.professor_nome || '-'}
                      textClassName="text-slate-300"
                    />
                  </td>
                  
                  {/* Previsão Retorno - Edição inline */}
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    <CelulaEditavelInline
                      value={item.previsao_retorno}
                      onChange={async (valor) => item.id && salvarCampo(item.id, 'previsao_retorno', valor)}
                      tipo="data"
                      placeholder="Não informado"
                      formatarExibicao={() => previsaoFormatada ? (
                        <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-xs font-medium">
                          {previsaoFormatada}
                        </span>
                      ) : <span className="text-slate-500 text-sm">Não informado</span>}
                    />
                  </td>
                  
                  {/* Motivo - Edição inline */}
                  <td className="py-3 px-2 border-r border-slate-700/30">
                    <div className="flex items-center gap-1.5">
                      <CelulaEditavelInline
                        value={motivosTrancamento.find(m => m.nome === item.motivo)?.id || null}
                        onChange={async (valor) => {
                          if (!item.id) return;
                          const motivo = motivosTrancamento.find(m => m.id.toString() === String(valor));
                          await salvarCampo(item.id, 'motivo', motivo?.nome || null);
                        }}
                        tipo="select"
                        opcoes={motivosTrancamento.map(m => ({ value: m.id, label: m.nome }))}
                        placeholder="-"
                        formatarExibicao={() => item.motivo || '-'}
                        textClassName="text-slate-400 text-sm max-w-xs truncate"
                      />
                      {item.observacoes && (
                        <Tooltip content={item.observacoes} side="top">
                          <Info className="w-4 h-4 text-blue-400 cursor-help flex-shrink-0" />
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  
                  {/* Ações */}
                  <td className="py-3 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onDestrancar && (
                        <Tooltip content="Destrancar aluno (voltar para ativo)" side="top">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDestrancar(item)}
                            className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip content="Excluir trancamento" side="top">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => item.id && onDelete(item.id)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </Tooltip>
                    </div>
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
