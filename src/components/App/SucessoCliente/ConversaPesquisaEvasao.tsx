import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquare,
  Mic,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import type {
  PesquisaEvasaoConversa,
  PesquisaEvasaoRodada,
} from './pesquisaEvasao.types';

interface Props {
  pesquisaId: string;
  onAlteracao?: () => void;
}

const rotulosStatus: Record<PesquisaEvasaoRodada['status'], string> = {
  rascunho: 'Coletando',
  pronta_para_revisao: 'Pronta para revisão',
  em_revisao: 'Em revisão',
  revisada: 'Revisada',
};

function formatarData(valor: string | null) {
  return valor
    ? format(new Date(valor), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : 'Horário indisponível';
}

export function ConversaPesquisaEvasao({ pesquisaId, onAlteracao }: Props) {
  const { error: mostrarErro, success: mostrarSucesso } = useToast();
  const [conversa, setConversa] = useState<PesquisaEvasaoConversa | null>(null);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [textoRevisao, setTextoRevisao] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_conversa_pesquisa_evasao', {
      p_pesquisa_id: pesquisaId,
    });
    if (error) {
      mostrarErro('Não foi possível carregar a conversa');
      setLoading(false);
      return;
    }
    setConversa(data as PesquisaEvasaoConversa);
    setLoading(false);
  }, [mostrarErro, pesquisaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const iniciarRevisao = async (rodada: PesquisaEvasaoRodada) => {
    setProcessando(rodada.id);
    const { error } = await supabase.rpc('iniciar_revisao_pesquisa_evasao', {
      p_analise_id: rodada.id,
    });
    if (error) {
      mostrarErro('Não foi possível iniciar a revisão');
      setProcessando(null);
      return;
    }
    setEditando(rodada.id);
    setTextoRevisao(rodada.texto_consolidado ?? '');
    await carregar();
    onAlteracao?.();
    setProcessando(null);
  };

  const concluirRevisao = async (rodada: PesquisaEvasaoRodada) => {
    setProcessando(rodada.id);
    const { error } = await supabase.rpc('concluir_revisao_pesquisa_evasao', {
      p_analise_id: rodada.id,
      p_texto_consolidado: textoRevisao.trim() || null,
    });
    if (error) {
      mostrarErro('Não foi possível concluir a revisão');
      setProcessando(null);
      return;
    }
    mostrarSucesso(`Rodada ${rodada.versao} revisada`);
    setEditando(null);
    setTextoRevisao('');
    await carregar();
    onAlteracao?.();
    setProcessando(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando conversa…
      </div>
    );
  }

  if (!conversa) return null;

  if (conversa.rodadas.length === 0) {
    return conversa.resposta_texto_legado ? (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Resposta no formato legado
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
          {conversa.resposta_texto_legado}
        </p>
      </div>
    ) : (
      <p className="py-3 text-sm text-slate-500">Nenhuma mensagem recebida.</p>
    );
  }

  return (
    <div className="space-y-4">
      {conversa.conteudo_novo_desde_revisao && (
        <div className="flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm text-violet-200">
          <Sparkles className="h-4 w-4" />
          Novo conteúdo recebido depois da revisão anterior
        </div>
      )}

      {conversa.rodadas.map((rodada, indice) => {
        const ehUltima = indice === conversa.rodadas.length - 1;
        const mostrarNovo = ehUltima && conversa.conteudo_novo_desde_revisao;
        return (
          <section
            key={rodada.id}
            className="rounded-xl border border-slate-700/60 bg-slate-900/45 p-4"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  Rodada {rodada.versao}
                </span>
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                  {rotulosStatus[rodada.status]}
                </span>
                {mostrarNovo && (
                  <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
                    Novo conteúdo
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500">
                {formatarData(rodada.iniciada_em)}
              </span>
            </div>

            <div className="space-y-2">
              {rodada.mensagens.map((mensagem) => (
                <div
                  key={mensagem.id}
                  className="rounded-lg border border-slate-700/50 bg-slate-800/55 px-3 py-2.5"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      {mensagem.tipo === 'audio' ? (
                        <Mic className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
                      )}
                      {mensagem.tipo === 'audio' ? 'Áudio' : 'Texto'}
                      {mensagem.substantividade !== 'conteudo_substantivo' && (
                        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {mensagem.substantividade}
                        </span>
                      )}
                    </span>
                    <span>{formatarData(mensagem.recebido_em)}</span>
                  </div>
                  {mensagem.tipo === 'audio' ? (
                    mensagem.transcricao_texto ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                        {mensagem.transcricao_texto}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">
                        Transcrição {mensagem.transcricao_status ?? 'pendente'}
                      </p>
                    )
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                      {mensagem.texto}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {rodada.texto_consolidado && (
              <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Consolidação desta rodada
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                  {rodada.texto_consolidado}
                </p>
              </div>
            )}

            {rodada.status === 'pronta_para_revisao' && (
              <Button
                size="sm"
                className="mt-4 bg-violet-600 hover:bg-violet-500"
                onClick={() => iniciarRevisao(rodada)}
                disabled={processando === rodada.id}
              >
                {processando === rodada.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Clock3 className="mr-2 h-4 w-4" />
                )}
                Iniciar revisão
              </Button>
            )}

            {(rodada.status === 'em_revisao' || editando === rodada.id) && (
              <div className="mt-4 space-y-3">
                {rodada.revisao_iniciada_em && (
                  <p className="text-xs text-violet-300">
                    Revisão iniciada por {rodada.revisao_iniciada_por_nome ?? 'usuário interno'} em{' '}
                    {formatarData(rodada.revisao_iniciada_em)}
                  </p>
                )}
                <Textarea
                  value={editando === rodada.id ? textoRevisao : rodada.texto_consolidado ?? ''}
                  onChange={(event) => {
                    setEditando(rodada.id);
                    setTextoRevisao(event.target.value);
                  }}
                  rows={6}
                  className="border-slate-700 bg-slate-950/60 text-slate-100"
                />
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-500"
                  onClick={() => concluirRevisao(rodada)}
                  disabled={processando === rodada.id}
                >
                  {processando === rodada.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Concluir revisão
                </Button>
              </div>
            )}

            {rodada.status === 'revisada' && (
              <p className="mt-4 flex items-center gap-2 text-xs text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Revisada por {rodada.revisor_nome ?? 'usuário interno'} em{' '}
                {formatarData(rodada.revisado_em)} — versão preservada
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
