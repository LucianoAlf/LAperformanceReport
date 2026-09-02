import { useCallback, useEffect, useState } from 'react';
import { Archive, Info, Loader2, RefreshCw } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

/**
 * Avisos previos que ja venceram e ninguem resolveu — INDEPENDENTE do mes.
 *
 * Existe porque as outras sub-abas apenas refiltram o array do mes que a
 * pagina ja carregou, e os avisos que incomodam sao de meses anteriores.
 * Foi essa lacuna que fez o Arthur dizer "eles nao aparecem pra mim pra
 * retirar esse aviso previo do report" (02/09/2026): o registro existia e o
 * botao de arquivar existia, mas o filtro de mes escondia os dois.
 */

export interface AvisoVencido {
  id: number;
  aluno_nome: string;
  unidade_id: string | null;
  unidade_codigo: string | null;
  data: string;
  mes_saida: string | null;
  fim: string;
  estimada: boolean;
  motivo: string | null;
  observacoes: string | null;
  professor_nome: string | null;
  valor_parcela: number | null;
  situacao: 'cancelado' | 'cobrar' | 'divergente' | 'nao_verificado';
  aulas_agendadas: number | null;
  ultima_agendada: string | null;
  ultima_presenca: string | null;
  matricula_status: string | null;
  verificado_em: string | null;
}

interface Props {
  unidadeId: string | null;
}

const dia = (iso: string | null) =>
  iso
    ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : '—';

/**
 * Cada situacao pede uma acao DIFERENTE — e duas delas sao opostas entre si.
 * Misturar numa instrucao unica mandaria a recepcao finalizar a matricula de
 * um aluno que esta em aula.
 */
const SITUACAO = {
  cancelado: {
    rotulo: 'Aluno voltou',
    acao: 'O aviso não vale mais: remova o registro aqui.',
    classe: 'bg-sky-500/20 text-sky-300',
  },
  cobrar: {
    rotulo: 'Aguardando conclusão',
    acao: 'O aluno saiu, mas a matrícula segue ativa: concluir no Emusys.',
    classe: 'bg-orange-500/20 text-orange-300',
  },
  divergente: {
    rotulo: 'Divergente',
    acao: 'O Emusys já finalizou, mas o LA Report diz ativo: corrigir aqui.',
    classe: 'bg-fuchsia-500/20 text-fuchsia-300',
  },
  nao_verificado: {
    rotulo: 'Não verificado',
    acao: 'O cron da Sol ainda não passou por este aviso.',
    classe: 'bg-slate-600/40 text-slate-300',
  },
} as const;

export function TabelaAvisosVencidos({ unidadeId }: Props) {
  const [itens, setItens] = useState<AvisoVencido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [arquivando, setArquivando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const { data, error } = await supabase.rpc('aviso_previo_vencidos', {
      p_unidade_id: unidadeId,
    });
    // O erro precisa APARECER: lista vazia por falha de consulta e "nao ha
    // pendencia" sao indistinguiveis na tela, e a segunda leitura e a errada.
    if (error) {
      setErro(error.message);
      setItens([]);
    } else {
      setItens((data ?? []) as AvisoVencido[]);
    }
    setCarregando(false);
  }, [unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function arquivar(item: AvisoVencido) {
    setArquivando(item.id);
    const evidencia = item.aulas_agendadas
      ? ` — ${item.aulas_agendadas} aula(s) marcada(s)` +
        (item.ultima_agendada ? ` ate ${dia(item.ultima_agendada)}` : '') +
        (item.ultima_presenca ? `, ultima presenca em ${dia(item.ultima_presenca)}` : '')
      : '';
    // Motivo PADRONIZADO: permite contar retencoes depois sem exigir que a
    // recepcao escreva justificativa a cada clique.
    const { error } = await supabase.rpc('arquivar_movimentacao_admin', {
      p_id: item.id,
      p_motivo: `Aviso cancelado — o aluno permaneceu${evidencia}. Arquivado pela aba Vencidos.`,
    });
    setArquivando(null);
    setConfirmando(null);
    if (error) {
      setErro(`Não foi possível arquivar ${item.aluno_nome}: ${error.message}`);
      return;
    }
    await carregar();
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Consultando avisos vencidos...
      </div>
    );
  }

  const verificadoEm = itens.find((i) => i.verificado_em)?.verificado_em ?? null;

  return (
    <div className="overflow-x-auto">
      {erro && (
        <div className="mx-4 my-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {erro}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-slate-400">
        <span>
          Avisos já vencidos e ainda não resolvidos —{' '}
          <strong className="text-slate-300">independente do mês selecionado</strong>.
        </span>
        <div className="flex items-center gap-2">
          {/* Dado apurado por cron: dizer QUANDO evita que dado velho passe por fresco. */}
          {verificadoEm && (
            <span>
              Verificado em{' '}
              {new Date(verificadoEm).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void carregar()}
            className="h-7 px-2 text-slate-400 hover:text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="py-10 text-center text-slate-500">
          Nenhum aviso prévio vencido em aberto.
        </div>
      ) : (
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr className="text-xs text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4 text-left">#</th>
              <th className="py-3 px-4 text-left">Aluno</th>
              <th className="py-3 px-4 text-left">Escola</th>
              <th className="py-3 px-4 text-left">Venceu</th>
              <th className="py-3 px-4 text-left">Motivo</th>
              <th className="py-3 px-4 text-left">Situação</th>
              <th className="py-3 px-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item, i) => {
              const s = SITUACAO[item.situacao] ?? SITUACAO.nao_verificado;
              const plural = (item.aulas_agendadas ?? 0) > 1;
              return (
                <tr key={item.id} className="border-t border-slate-700/30 hover:bg-slate-800/30">
                  <td className="py-3 px-4 text-slate-500">{i + 1}</td>
                  <td className="py-3 px-4 text-white font-medium">{item.aluno_nome}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                      {item.unidade_codigo ?? '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {dia(item.fim)}
                    {item.estimada && (
                      <Tooltip
                        content="O aviso não veio do Emusys, então a data é o fim do mês informado."
                        side="top"
                      >
                        <span className="ml-1 text-slate-500 cursor-help">~</span>
                      </Tooltip>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 text-sm max-w-[14rem] truncate">
                        {item.motivo || '—'}
                      </span>
                      {item.observacoes && (
                        <Tooltip content={item.observacoes} side="top">
                          <Info className="w-4 h-4 text-blue-400 cursor-help flex-shrink-0" />
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-0.5">
                      <Tooltip content={s.acao} side="top">
                        <span
                          className={`self-start px-2 py-1 rounded text-xs font-medium cursor-help ${s.classe}`}
                        >
                          {s.rotulo}
                        </span>
                      </Tooltip>
                      {/* A evidencia na propria linha e o que dispensa abrir o Emusys para conferir. */}
                      {item.situacao === 'cancelado' && item.aulas_agendadas ? (
                        <span className="text-[11px] text-slate-400">
                          {item.aulas_agendadas} aula{plural ? 's' : ''} marcada{plural ? 's' : ''}
                          {item.ultima_agendada ? ` até ${dia(item.ultima_agendada)}` : ''}
                          {item.ultima_presenca ? ` · presente em ${dia(item.ultima_presenca)}` : ''}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {item.situacao === 'cancelado' ? (
                      confirmando === item.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            onClick={() => void arquivar(item)}
                            disabled={arquivando === item.id}
                            className="h-7 px-2 bg-sky-600 hover:bg-sky-500 text-white text-xs"
                          >
                            {arquivando === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              'Confirmar'
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmando(null)}
                            className="h-7 px-2 text-slate-400 text-xs"
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <Tooltip
                          content="Arquiva o aviso: ele sai dos KPIs e a Sol para de cobrar. O registro vai para a lixeira com autor, data e motivo."
                          side="top"
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmando(item.id)}
                            className="h-7 px-2 text-slate-400 hover:text-sky-300 text-xs gap-1.5"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            Aluno permaneceu
                          </Button>
                        </Tooltip>
                      )
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
