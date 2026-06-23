import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Star, MessageSquare, Clock, Plus, Pencil, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ModalLancarRespostaManual } from './ModalLancarRespostaManual';

export interface MarcoTimeline {
  tipo: string;
  label: string;
  ativo: boolean;
  nota: number | null;
  comentario: string | null;
  status: string | null;
  respondido_em: string | null;
  enviado_em: string | null;
}

interface Props {
  alunoId: number;
  alunoNome?: string;
}

export function TimelinePesquisasAluno({ alunoId, alunoNome }: Props) {
  const [marcos, setMarcos] = useState<MarcoTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalTipo, setModalTipo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_timeline_pesquisas_aluno', { p_aluno_id: alunoId });
      if (error) throw error;
      setMarcos((data as MarcoTimeline[]) || []);
    } catch (err: any) {
      toast.error('Erro ao carregar pesquisas: ' + (err.message || 'desconhecido'));
      setMarcos([]);
    } finally {
      setLoading(false);
    }
  }, [alunoId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>;
  }

  return (
    <div className="space-y-1">
      {marcos.map((m, i) => (
        <MarcoLinha key={m.tipo} marco={m} ultimo={i === marcos.length - 1} onRegistrar={() => setModalTipo(m.tipo)} />
      ))}

      {modalTipo && (
        <ModalLancarRespostaManual
          open={!!modalTipo}
          onClose={() => setModalTipo(null)}
          unidadeAtual="todos"
          onSaved={carregar}
          alunoFixo={{ id: alunoId, nome: alunoNome || '' }}
          tipoFixo={modalTipo}
        />
      )}
    </div>
  );
}

function MarcoLinha({ marco, ultimo, onRegistrar }: { marco: MarcoTimeline; ultimo: boolean; onRegistrar: () => void }) {
  const respondida = marco.status === 'respondida' && marco.nota != null;
  const naoRespondeu = marco.status === 'nao_respondida';
  const pendente = marco.status === 'pendente';
  const semRegistro = !marco.status;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full mt-1.5 ${
          respondida ? 'bg-amber-400' : naoRespondeu ? 'bg-slate-500' : marco.ativo ? 'bg-violet-500/50' : 'bg-slate-700'
        }`} />
        {!ultimo && <div className="w-px flex-1 bg-slate-700 my-1" />}
      </div>

      <div className="flex-1 pb-5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-white">{marco.label}</span>
          {marco.respondido_em && (
            <span className="text-xs text-slate-500">{format(new Date(marco.respondido_em), 'dd/MM/yy', { locale: ptBR })}</span>
          )}
        </div>

        {respondida && (
          <div className="mt-1">
            <span className="text-amber-400">{'⭐'.repeat(marco.nota!)}</span>
            {marco.comentario && (
              <p className="mt-1 text-sm text-slate-300 flex items-start gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-slate-500 shrink-0" />
                {marco.comentario}
              </p>
            )}
            <button onClick={onRegistrar} className="mt-1 text-xs text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Editar
            </button>
          </div>
        )}

        {naoRespondeu && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Não respondeu</span>
            <button onClick={onRegistrar} className="text-xs text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Editar
            </button>
          </div>
        )}

        {(pendente || semRegistro) && marco.ativo && (
          <div className="mt-1 flex items-center gap-2">
            {pendente && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> Aguardando resposta
              </span>
            )}
            <button onClick={onRegistrar} className="text-xs text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> Registrar
            </button>
          </div>
        )}

        {!marco.ativo && <span className="mt-1 inline-block text-xs text-slate-600">Em breve</span>}
      </div>
    </div>
  );
}

export default TimelinePesquisasAluno;
