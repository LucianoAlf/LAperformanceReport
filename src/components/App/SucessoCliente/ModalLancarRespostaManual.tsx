import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Star, Search, Loader2, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

interface AlunoResultado {
  id: number;
  nome: string;
  status: string | null;
  unidade_nome: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  unidadeAtual: UnidadeId;
  onSaved: () => void;
}

export function ModalLancarRespostaManual({ open, onClose, unidadeAtual, onSaved }: Props) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<AlunoResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aluno, setAluno] = useState<AlunoResultado | null>(null);
  const [nota, setNota] = useState(0);
  const [hoverNota, setHoverNota] = useState(0);
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [salvando, setSalvando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset ao abrir/fechar
  useEffect(() => {
    if (open) {
      setBusca('');
      setResultados([]);
      setAluno(null);
      setNota(0);
      setHoverNota(0);
      setData(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open]);

  // Busca de aluno por nome (debounced)
  useEffect(() => {
    if (aluno) return; // já selecionou
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const termo = busca.trim();
    if (termo.length < 2) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        let query = supabase
          .from('alunos')
          .select('id, nome, status, unidades(nome)')
          .ilike('nome', `%${termo}%`)
          .order('nome')
          .limit(20);
        if (unidadeAtual !== 'todos') query = query.eq('unidade_id', unidadeAtual);
        const { data: rows, error } = await query;
        if (error) throw error;
        setResultados(
          (rows || []).map((r: any) => ({
            id: r.id,
            nome: r.nome,
            status: r.status,
            unidade_nome: r.unidades?.nome ?? null,
          })),
        );
      } catch (err: any) {
        toast.error('Erro ao buscar aluno: ' + (err.message || 'desconhecido'));
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [busca, aluno, unidadeAtual]);

  const handleSalvar = async () => {
    if (!aluno) {
      toast.error('Selecione um aluno');
      return;
    }
    if (nota < 1) {
      toast.error('Selecione a nota (estrelas)');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.rpc('registrar_resposta_pesquisa_manual', {
        p_aluno_id: aluno.id,
        p_nota: nota,
        p_data: data,
      });
      if (error) throw error;
      toast.success(`Resposta de ${aluno.nome} registrada (${nota}★)`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao registrar: ' + (err.message || 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            Lançar resposta manual
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <p className="text-sm text-slate-400">
            Para respostas da pesquisa pós-1ª aula coletadas fora do sistema.
          </p>

          {/* Aluno */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1.5 block">Aluno</label>
            {aluno ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-violet-500/10 border border-violet-500/40">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{aluno.nome}</p>
                  <p className="text-xs text-slate-400">
                    {aluno.unidade_nome || '—'}
                    {aluno.status && ` • ${aluno.status}`}
                  </p>
                </div>
                <button
                  onClick={() => { setAluno(null); setBusca(''); }}
                  className="p-1.5 hover:bg-slate-700 rounded-lg transition shrink-0"
                  title="Trocar aluno"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    autoFocus
                    placeholder="Buscar aluno por nome..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9"
                  />
                  {buscando && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-violet-500" />
                  )}
                </div>
                {resultados.length > 0 && (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
                    {resultados.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setAluno(r)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-700/40 transition"
                      >
                        <p className="text-sm text-white truncate">{r.nome}</p>
                        <p className="text-xs text-slate-500">
                          {r.unidade_nome || '—'}
                          {r.status && ` • ${r.status}`}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {busca.trim().length >= 2 && !buscando && resultados.length === 0 && (
                  <p className="text-xs text-slate-500 mt-2">Nenhum aluno encontrado.</p>
                )}
              </>
            )}
          </div>

          {/* Nota */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1.5 block">Nota</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setNota(n)}
                  onMouseEnter={() => setHoverNota(n)}
                  onMouseLeave={() => setHoverNota(0)}
                  className="p-1 transition"
                  title={`${n} estrela${n > 1 ? 's' : ''}`}
                >
                  <Star
                    className={`w-8 h-8 ${
                      n <= (hoverNota || nota)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-600'
                    }`}
                  />
                </button>
              ))}
              {nota > 0 && <span className="ml-2 text-sm text-slate-400">{nota}/5</span>}
            </div>
          </div>

          {/* Data */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1.5 block">Data da resposta</label>
            <Input
              type="date"
              value={data}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setData(e.target.value)}
              className="w-44"
            />
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={salvando || !aluno || nota < 1}
              className="bg-gradient-to-r from-violet-500 to-pink-500 hover:opacity-90"
            >
              {salvando ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
              ) : (
                <><Check className="w-4 h-4 mr-2" /> Registrar</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ModalLancarRespostaManual;
