import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Send, Loader2, RefreshCw, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { usePesquisaPrimeiraAula, type CandidatoPesquisa } from './hooks/usePesquisaPrimeiraAula';

interface Props {
  unidadeAtual: UnidadeId;
}

function formatarJid(jid: string | null): string {
  if (!jid) return '—';
  const numero = jid.replace('@s.whatsapp.net', '');
  const d = numero.replace(/\D/g, '');
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return numero;
}

export function PesquisaPrimeiraAulaTab({ unidadeAtual }: Props) {
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const {
    candidatos, loading, enviando, resultados, buscarCandidatos, enviar,
    autoPesquisaAtivo, loadingConfig, toggleAutoPesquisa,
  } = usePesquisaPrimeiraAula(unidadeAtual);

  useEffect(() => {
    setSelecionados(new Set(
      candidatos.filter(c => c.whatsapp_jid && c.status === 'pendente').map(c => c.aluno_id)
    ));
  }, [candidatos]);

  useEffect(() => {
    if (unidadeAtual !== 'todos') {
      buscarCandidatos();
    }
  }, [unidadeAtual]);

  const toggleSelecionado = (alunoId: number) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(alunoId) ? next.delete(alunoId) : next.add(alunoId);
      return next;
    });
  };

  const pendentes = candidatos.filter(c => c.status === 'pendente');
  const pendentesComContato = pendentes.filter(c => c.whatsapp_jid);
  const todosSelecionados =
    pendentesComContato.length > 0 &&
    pendentesComContato.every(c => selecionados.has(c.aluno_id));
  const selecionadosList = candidatos.filter(c => selecionados.has(c.aluno_id));
  const resultadoPorId = new Map(resultados.map(r => [r.aluno_id, r]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">
            1ª aula de ontem{' '}
            <span className="text-slate-400 font-normal">
              ({format(new Date(Date.now() - 86400000), 'dd/MM', { locale: ptBR })})
            </span>
          </span>
          <span className="text-sm text-slate-400">
            {loading
              ? 'Buscando...'
              : candidatos.length === 0
                ? 'Nenhum calouro fez a 1ª aula ontem'
                : pendentes.length === 0
                  ? `${candidatos.length} de ${candidatos.length} já processado${candidatos.length !== 1 ? 's' : ''}`
                  : `${pendentes.length} pendente${pendentes.length !== 1 ? 's' : ''} de ${candidatos.length}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => buscarCandidatos()}
            disabled={loading}
            className="text-slate-400"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Auto-disparo diário (11h): dispara sozinho a pesquisa de quem fez a 1ª aula ontem.
              Governa o robô desta mesma lista, por isso o liga/desliga vive aqui. */}
          <div
            className="flex items-center gap-2"
            title="Dispara sozinho, às 11h, a pesquisa de quem fez a 1ª aula ontem. Teto de 15/dia — o restante fica aqui para você enviar."
          >
            <span className="text-sm text-slate-300">Auto-disparo diário (11h)</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoPesquisaAtivo}
              disabled={loadingConfig}
              onClick={() => toggleAutoPesquisa(!autoPesquisaAtivo)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                autoPesquisaAtivo ? 'bg-violet-500' : 'bg-slate-600'
              } disabled:opacity-50`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoPesquisaAtivo ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          <Button
            onClick={() => enviar(selecionadosList)}
            disabled={enviando || selecionadosList.length === 0}
            className="bg-violet-500 hover:bg-violet-600 text-white"
          >
            {enviando ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Enviar pesquisa ({selecionadosList.length})
          </Button>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/80 border-b border-slate-700">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={e =>
                      setSelecionados(
                        e.target.checked
                          ? new Set(pendentesComContato.map(c => c.aluno_id))
                          : new Set()
                      )
                    }
                    className="w-4 h-4 accent-violet-500"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Unidade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Curso</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Professor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">1ª Aula</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400">Contato</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-500 mx-auto" />
                  </td>
                </tr>
              ) : candidatos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Nenhum calouro fez a primeira aula ontem
                  </td>
                </tr>
              ) : (
                candidatos.map(c => {
                  const resultado = resultadoPorId.get(c.aluno_id);
                  const semContato = !c.whatsapp_jid;
                  const naoSelecionavel = semContato || c.status !== 'pendente';
                  return (
                    <tr
                      key={c.aluno_id}
                      className={`transition-colors ${resultado?.erro ? 'bg-red-900/10' : 'hover:bg-slate-700/30'}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selecionados.has(c.aluno_id) && !naoSelecionavel}
                          disabled={naoSelecionavel}
                          onChange={() => !naoSelecionavel && toggleSelecionado(c.aluno_id)}
                          className="w-4 h-4 accent-violet-500 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{c.nome}</td>
                      <td className="px-4 py-3 text-slate-300">{c.unidade_nome || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{c.curso_nome || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{c.professor_nome || '—'}</td>
                      <td className="px-4 py-3 text-center text-slate-300">
                        {format(new Date(c.data_primeira_aula + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3">
                        {semContato ? (
                          <span className="text-xs text-red-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            Sem contato
                          </span>
                        ) : (
                          <span className="text-sm text-slate-300 font-mono">{formatarJid(c.whatsapp_jid)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.status === 'respondido' ? (
                          <span className="text-xs text-amber-400">{'⭐'.repeat(c.nota ?? 0)}</span>
                        ) : c.status === 'aguardando' ? (
                          <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">
                            Aguardando resposta
                          </span>
                        ) : resultado ? (
                          resultado.ok ? (
                            <span className="text-xs text-green-400">Enviado ✓</span>
                          ) : (
                            <span className="text-xs text-red-400" title={resultado.erro}>
                              Erro ✗
                            </span>
                          )
                        ) : semContato ? (
                          <span className="text-xs text-slate-500">—</span>
                        ) : (
                          <span className="text-xs text-slate-500">Pendente</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
