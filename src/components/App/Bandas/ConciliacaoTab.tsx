import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, UserMinus, Trash2, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import {
  desativarIntegranteBanda, removerIntegranteBanda,
  type ConciliacaoItem,
} from '@/hooks/useBandas';

const PROBLEMA_LABEL: Record<ConciliacaoItem['problema'], string> = {
  'aluno inexistente': 'Aluno inexistente',
  'saiu da escola': 'Saiu da escola',
  'nao esta mais nesta turma': 'Não está mais nesta turma',
};

const PROBLEMA_VARIANT: Record<ConciliacaoItem['problema'], 'error' | 'warning'> = {
  'aluno inexistente': 'error',
  'saiu da escola': 'error',
  'nao esta mais nesta turma': 'warning',
};

interface ConciliacaoTabProps {
  unidadeAtual: string;
  itens: ConciliacaoItem[];
  onResolvido: () => void;
}

/**
 * Fila da Jéssica: integrantes com overlay ativo cujo aluno saiu da escola,
 * trocou de turma ou não existe mais. Resolver = desativar (mantém histórico
 * com data_saida) ou remover o registro.
 */
export function ConciliacaoTab({ unidadeAtual, itens, onResolvido }: ConciliacaoTabProps) {
  const [itemDesativando, setItemDesativando] = useState<ConciliacaoItem | null>(null);
  const [itemRemovendo, setItemRemovendo] = useState<ConciliacaoItem | null>(null);
  const [processando, setProcessando] = useState(false);

  async function confirmarDesativacao() {
    if (!itemDesativando) return;
    setProcessando(true);
    const { error } = await desativarIntegranteBanda(itemDesativando.banda_id, itemDesativando.aluno_id);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao desativar integrante', { description: error.message });
      return;
    }
    toast.success('Integrante desativado', {
      description: `${itemDesativando.aluno_nome || 'Aluno'} · ${itemDesativando.banda_nome}`,
    });
    setItemDesativando(null);
    onResolvido();
  }

  async function confirmarRemocao() {
    if (!itemRemovendo) return;
    setProcessando(true);
    const { error } = await removerIntegranteBanda(itemRemovendo.banda_id, itemRemovendo.aluno_id);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao remover registro', { description: error.message });
      return;
    }
    toast.success('Registro removido', {
      description: `${itemRemovendo.aluno_nome || 'Aluno'} · ${itemRemovendo.banda_nome}`,
    });
    setItemRemovendo(null);
    onResolvido();
  }

  return (
    <div className="space-y-4">
      <AlertBanner
        type="warning"
        title="Conciliação de roster"
        message="Integrantes com instrumento/função registrados cujo aluno saiu da escola ou trocou de turma. Desative para manter o histórico com data de saída, ou remova o registro."
        dismissible
      />

      {itens.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-10 text-center">
          <CheckCircle className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">Fila zerada</p>
          <p className="text-slate-500 text-sm mt-1">
            Nenhum integrante pendente de conciliação {unidadeAtual === 'todos' ? 'na rede' : 'nesta unidade'}.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl divide-y divide-slate-700/50">
          {itens.map((item) => (
            <div key={`${item.banda_id}-${item.aluno_id}`} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {item.aluno_nome || `Aluno #${item.aluno_id}`}
                </p>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  {item.banda_nome}
                </p>
              </div>
              <Badge variant={PROBLEMA_VARIANT[item.problema]}>
                {PROBLEMA_LABEL[item.problema]}
              </Badge>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setItemDesativando(item)}
                >
                  <UserMinus className="w-3.5 h-3.5 mr-1" />
                  Desativar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-rose-400 hover:text-rose-300"
                  onClick={() => setItemRemovendo(item)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalConfirmacao
        aberto={!!itemDesativando}
        onClose={() => setItemDesativando(null)}
        onConfirmar={confirmarDesativacao}
        titulo="Desativar integrante"
        mensagem={`Desativar "${itemDesativando?.aluno_nome || 'este aluno'}" em "${itemDesativando?.banda_nome}"? O histórico é mantido com a data de saída de hoje.`}
        tipo="warning"
        textoConfirmar="Desativar"
        carregando={processando}
      />
      <ModalConfirmacao
        aberto={!!itemRemovendo}
        onClose={() => setItemRemovendo(null)}
        onConfirmar={confirmarRemocao}
        titulo="Remover registro"
        mensagem={`Remover o registro de "${itemRemovendo?.aluno_nome || 'este aluno'}" em "${itemRemovendo?.banda_nome}"? Prefira desativar para manter o histórico — remover é definitivo.`}
        tipo="danger"
        textoConfirmar="Remover de vez"
        carregando={processando}
      />
    </div>
  );
}
