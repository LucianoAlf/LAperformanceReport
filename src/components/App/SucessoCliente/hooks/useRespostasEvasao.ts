import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface RespostaEvasaoLinha {
  pesquisa_id: string;
  aluno_id: number | null;
  aluno_nome: string;
  aluno_curso: string | null;
  aluno_professor: string | null;
  unidade_id: string;
  unidade_nome: string | null;
  data_evasao: string;
  tempo_permanencia_meses: number | null;
  motivo_cadastrado: string | null;
  /** `categoria` do catalogo motivos_saida. Pode ser null — "Saúde" nao tem. */
  motivo_categoria: string | null;
  /** Se o motivo REGISTRADO penaliza o professor no score (3 dos 16 penalizam). */
  motivo_conta_score: boolean;
  categoria_resposta: string | null;
  resposta_texto: string | null;
  resposta_tipo: string | null;
  tem_audio: boolean;
  transcrita: boolean;
  /** Passou pela fila de revisao. Em 03/08/2026 nenhuma passou ainda. */
  revisada: boolean;
  respondido_em: string | null;
  enviado_em: string | null;
}

/**
 * Respostas de producao da pesquisa de evasao (modo teste fica de fora na RPC).
 *
 * O periodo filtra por `data_evasao`, nao por data da resposta: a pergunta do
 * usuario e "das pessoas que sairam em julho, o que descobrimos?" — e a resposta
 * costuma chegar semanas depois da saida.
 */
export function useRespostasEvasao(unidadeAtual: UnidadeId, ano: number, mes: number | null) {
  const [respostas, setRespostas] = useState<RespostaEvasaoLinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    const { data, error } = await supabase.rpc('get_respostas_evasao', {
      p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
      p_ano: ano,
      p_mes: mes,
    });

    if (error) {
      setErro(error.message);
      setRespostas([]);
    } else {
      setRespostas((data || []) as unknown as RespostaEvasaoLinha[]);
    }
    setCarregando(false);
  }, [unidadeAtual, ano, mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Marca (ou desmarca, com null) o tema declarado. Atualiza a linha na hora e
   * so depois confirma no banco — classificar e um clique repetido dezenas de
   * vezes seguidas, e esperar o round-trip a cada chip deixaria a lista travada.
   * Em caso de erro, desfaz.
   */
  const classificar = useCallback(async (pesquisaId: string, tema: string | null) => {
    const anterior = respostas;
    setRespostas((atual) =>
      atual.map((r) => (r.pesquisa_id === pesquisaId ? { ...r, categoria_resposta: tema } : r)),
    );

    const { error } = await supabase.rpc('classificar_resposta_evasao', {
      p_pesquisa_id: pesquisaId,
      p_categoria: tema,
    });

    if (error) {
      setRespostas(anterior);
      return { ok: false as const, erro: error.message };
    }
    return { ok: true as const };
  }, [respostas]);

  return { respostas, carregando, erro, recarregar: carregar, classificar };
}
