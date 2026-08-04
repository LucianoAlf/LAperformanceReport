import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import type {
  PesquisaEvasaoCategoria,
  PesquisaEvasaoDesfecho,
  PesquisaEvasaoRelacaoMotivo,
} from '../pesquisaEvasao.types';

export type PesquisaEvasaoEstadoOperacional =
  | 'aguardando_revisao_textual'
  | 'aguardando_classificacao'
  | 'acao_pendente'
  | 'em_acompanhamento'
  | 'encerrado';

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
  motivo_categoria: string | null;
  motivo_conta_score: boolean;
  resposta_texto: string | null;
  resposta_tipo: string | null;
  tem_audio: boolean;
  transcrita: boolean;
  respondido_em: string | null;
  enviado_em: string | null;
  analise_id: string | null;
  analise_versao: number | null;
  analise_status: string | null;
  classificacao_id: string | null;
  classificacao_versao: number | null;
  categorias: PesquisaEvasaoCategoria[];
  relacao_motivo: PesquisaEvasaoRelacaoMotivo | null;
  justificativa: string | null;
  classificacao_desatualizada: boolean;
  total_acoes: number;
  acoes_pendentes: number;
  desfecho_atual: PesquisaEvasaoDesfecho | null;
  estado_operacional: PesquisaEvasaoEstadoOperacional;
}

/** Read model produtivo e somente leitura; classificação é feita na conversa revisada. */
export function useRespostasEvasao(unidadeAtual: UnidadeId, ano: number, mes: number | null) {
  const [respostas, setRespostas] = useState<RespostaEvasaoLinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const { data, error } = await supabase.rpc(
      'listar_respostas_evasao_analytics_v1' as never,
      {
        p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
        p_ano: ano,
        p_mes: mes,
      } as never,
    );
    if (error) {
      setErro(error.message);
      setRespostas([]);
    } else {
      setRespostas((data ?? []) as unknown as RespostaEvasaoLinha[]);
    }
    setCarregando(false);
  }, [unidadeAtual, ano, mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { respostas, carregando, erro, recarregar: carregar };
}
