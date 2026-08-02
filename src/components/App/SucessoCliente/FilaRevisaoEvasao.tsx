import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown, ChevronUp, ClipboardCheck, Sparkles } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import { ConversaPesquisaEvasao } from './ConversaPesquisaEvasao';
import type { PesquisaEvasaoFilaRevisaoItem } from './pesquisaEvasao.types';

interface Props {
  unidadeAtual: UnidadeId;
  onAlteracao?: () => void;
}

export function FilaRevisaoEvasao({ unidadeAtual, onAlteracao }: Props) {
  const { error: mostrarErro } = useToast();
  const [itens, setItens] = useState<PesquisaEvasaoFilaRevisaoItem[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_pesquisas_evasao_revisao', {
      p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
      p_limite: 20,
      p_offset: 0,
    });
    if (error) {
      mostrarErro('Não foi possível carregar a fila de revisão');
      return;
    }
    setItens((data ?? []) as PesquisaEvasaoFilaRevisaoItem[]);
  }, [mostrarErro, unidadeAtual]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (itens.length === 0) return null;

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-violet-300" />
        <h3 className="font-semibold text-white">Fila de revisão</h3>
        <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-xs font-semibold text-violet-200">
          {itens[0]?.total_count ?? itens.length}
        </span>
      </div>

      <div className="space-y-2">
        {itens.map((item) => (
          <div key={item.pesquisa_id} className="rounded-xl border border-slate-700/60 bg-slate-900/55">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-white">{item.aluno_nome}</p>
                  {item.modo_teste && (
                    <span className="rounded bg-yellow-400/10 px-1.5 py-0.5 text-[10px] font-bold text-yellow-200">
                      TESTE
                    </span>
                  )}
                  {item.conteudo_novo_desde_revisao && (
                    <span className="flex items-center gap-1 rounded bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-200">
                      <Sparkles className="h-3 w-3" />
                      Novo conteúdo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Rodada {item.ultima_versao} · {item.ultima_rodada_status.replaceAll('_', ' ')}
                  {item.ultima_mensagem_em
                    ? ` · ${formatDistanceToNow(new Date(item.ultima_mensagem_em), { addSuffix: true, locale: ptBR })}`
                    : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-violet-300 hover:text-violet-200"
                onClick={() => setExpandida(expandida === item.pesquisa_id ? null : item.pesquisa_id)}
              >
                {expandida === item.pesquisa_id ? (
                  <ChevronUp className="mr-1 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-1 h-4 w-4" />
                )}
                Revisar
              </Button>
            </div>
            {expandida === item.pesquisa_id && (
              <div className="border-t border-slate-700/60 p-3">
                <ConversaPesquisaEvasao
                  pesquisaId={item.pesquisa_id}
                  onAlteracao={() => {
                    carregar();
                    onAlteracao?.();
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
