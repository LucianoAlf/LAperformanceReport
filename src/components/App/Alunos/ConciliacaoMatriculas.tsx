import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Check, X, Loader2, Link2, UserX, Copy, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface ConciliacaoItem {
  id: number;
  aluno_id: number | null;
  aluno_nome: string | null;
  unidade_id: string | null;
  unidade_nome: string | null;
  tipo_divergencia: string;
  campo: string | null;
  valor_nosso: any;
  valor_api: any;
  sugestao: any;
  severidade: string | null;
  detectado_em: string | null;
  emusys_matricula_id: string | null;
  curso_nome: string | null;
}

interface ConciliacaoPayload {
  resumo: Record<string, number>;
  items: ConciliacaoItem[];
}

const TIPO_META: Record<string, { label: string; descricao: string; icon: typeof Link2; cor: string }> = {
  ambiguo: { label: 'Ambíguo', descricao: 'Várias matrículas ativas, nenhuma casa o curso do nosso cadastro', icon: Copy, cor: 'amber' },
  ausente_api: { label: 'Ausente na API', descricao: 'Ativo no nosso sistema, mas não existe na API do Emusys', icon: UserX, cor: 'red' },
  duas_matriculas: { label: '2× mesmo curso', descricao: 'Duas matrículas do mesmo curso (ex.: 2 aulas/semana)', icon: Copy, cor: 'cyan' },
  disciplina_nao_mapeada: { label: 'Disciplina nova', descricao: 'Disciplina do Emusys sem mapeamento para curso', icon: HelpCircle, cor: 'violet' },
  professor_nao_mapeado: { label: 'Professor novo', descricao: 'Professor do Emusys sem mapeamento', icon: HelpCircle, cor: 'violet' },
  valor_fixado_divergente: { label: 'Valor fixado diverge', descricao: 'Valor editado manualmente difere da API', icon: AlertTriangle, cor: 'orange' },
};

const COR_CLASSES: Record<string, string> = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  orange: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
};

function descreverApi(item: ConciliacaoItem): string {
  const v = item.valor_api;
  if (!v) return '—';
  if (Array.isArray(v.candidatos)) {
    return v.candidatos.map((c: any) => `#${c.id}: ${(c.disciplinas || []).join(', ')}`).join('  |  ');
  }
  if (v.nome) return '(não encontrado na API)';
  if (v.cursos) return `cursos: ${v.cursos.join(', ')}`;
  if (v.disciplina_id) return `disciplina ${v.disciplina_id}`;
  return JSON.stringify(v);
}

export function ConciliacaoMatriculas({ unidadeId }: { unidadeId?: string | null }) {
  const [dados, setDados] = useState<ConciliacaoPayload>({ resumo: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_conciliacao_matriculas', {
        p_unidade_id: unidadeId && unidadeId !== 'todos' ? unidadeId : null,
      });
      if (error) throw error;
      setDados((data as ConciliacaoPayload) || { resumo: {}, items: [] });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar a conciliação');
      setDados({ resumo: {}, items: [] });
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  const decidir = async (item: ConciliacaoItem, decisao: 'manter_nosso' | 'ignorar') => {
    setSalvando(item.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email || 'usuario_app';
      const { error } = await supabase.from('matriculas_divergencias_decisoes').upsert({
        divergencia_id: item.id,
        aluno_id: item.aluno_id,
        decisao,
        motivo: `Decisão manual via aba de conciliação: ${decisao}`,
        decidido_por: email,
        metadata: { tipo: item.tipo_divergencia, aluno_nome: item.aluno_nome },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'divergencia_id' });
      if (error) throw error;
      await supabase.from('matriculas_divergencias')
        .update({ resolvido: true, updated_at: new Date().toISOString() }).eq('id', item.id);
      toast.success('Decisão registrada.');
      setDados(prev => ({
        resumo: { ...prev.resumo, [item.tipo_divergencia]: Math.max(0, (prev.resumo[item.tipo_divergencia] || 1) - 1) },
        items: prev.items.filter(i => i.id !== item.id),
      }));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar a decisão');
    } finally {
      setSalvando(null);
    }
  };

  const totalAberto = (dados.items || []).length;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-cyan-400" /> Conciliação Emusys
          </h3>
          <p className="text-sm text-slate-400">
            Divergências entre o nosso cadastro e a API do Emusys que precisam de decisão humana.
          </p>
        </div>
        <button onClick={carregar} disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50 disabled:opacity-50">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {/* Cards de resumo por tipo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(dados.resumo || {}).map(([tipo, qtd]) => {
          const meta = TIPO_META[tipo] || { label: tipo, descricao: '', icon: HelpCircle, cor: 'amber' };
          const Icon = meta.icon;
          return (
            <div key={tipo} className={cn('rounded-lg border p-3', COR_CLASSES[meta.cor])}>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
                <Icon className="w-3.5 h-3.5" /> {meta.label}
              </div>
              <div className="mt-1 text-2xl font-bold">{qtd}</div>
              <div className="mt-1 text-[11px] opacity-70 leading-tight">{meta.descricao}</div>
            </div>
          );
        })}
        {Object.keys(dados.resumo || {}).length === 0 && !loading && (
          <div className="col-span-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300 text-sm flex items-center gap-2">
            <Check className="w-4 h-4" /> Nenhuma divergência pendente. Tudo conciliado.
          </div>
        )}
      </div>

      {/* Lista de divergências */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando…
        </div>
      ) : totalAberto > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-700/50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Aluno</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Nosso cadastro</th>
                <th className="px-4 py-3 font-medium">Na API do Emusys</th>
                <th className="px-4 py-3 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {dados.items.map((item) => {
                const meta = TIPO_META[item.tipo_divergencia] || { label: item.tipo_divergencia, cor: 'amber' };
                return (
                  <tr key={item.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-slate-200">{item.aluno_nome || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{item.unidade_nome || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', COR_CLASSES[meta.cor])}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{item.curso_nome || (item.valor_nosso?.curso_id ? `curso ${item.valor_nosso.curso_id}` : '—')}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-md truncate" title={descreverApi(item)}>{descreverApi(item)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => decidir(item, 'manter_nosso')}
                          disabled={salvando === item.id}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                          title="Manter o cadastro como está e tirar da fila">
                          {salvando === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Manter
                        </button>
                        <button
                          onClick={() => decidir(item, 'ignorar')}
                          disabled={salvando === item.id}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:bg-slate-700/50 disabled:opacity-50"
                          title="Ignorar esta divergência">
                          <X className="w-3 h-3" /> Ignorar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
