import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { abreviarNomesSemColisao } from '@/lib/nomeExibicao.mjs';

export interface ColaboradorOcorrencia {
  /** Valor gravado em professor_360_ocorrencias.registrado_por (coluna text, exibida crua na UI). */
  nome: string;
  /** Rotulo exibido ao lado do nome, ex. "Farmer - CG". */
  cargo: string;
}

const LABEL_POR_TIPO: Record<string, string> = {
  farmer: 'Farmer',
  hunter: 'Hunter',
  admin: 'Admin',
};

// O gerente nao tem cadastro em `colaboradores` (so em `usuarios`, perfil admin),
// e e quem mais registra ocorrencia. Sem esta entrada, trocar a fonte para a
// tabela o removeria da lista.
const GERENTE: ColaboradorOcorrencia = { nome: 'Luciano Alf', cargo: 'Gerente' };

/**
 * Lista de quem pode registrar uma ocorrencia do 360 de professores.
 *
 * Le `colaboradores` em vez de um array fixo no codigo — antes a lista era
 * hardcoded em dois arquivos e quem entrava na equipe ficava de fora ate
 * alguem lembrar de editar os dois.
 *
 * Fora da lista: professores (sao os avaliados) e os cadastros de teste.
 * Dentro: `situacao = 'candidato'`, que e como entra quem acabou de ser
 * contratado e ainda nao teve a ficha fechada.
 *
 * Nome longo e abreviado para os dois primeiros nomes (ver `nomeExibicao.mjs`).
 * A abreviacao acontece AQUI, na origem, e nao so no texto da tela: o valor
 * exibido e o mesmo que vai para `registrado_por` e para a mensagem enviada ao
 * professor. Truncar apenas a exibicao faria a tela mostrar "Mayra Alves" e o
 * banco gravar o nome inteiro do cadastro.
 */
export function useColaboradoresOcorrencia() {
  const [colaboradores, setColaboradores] = useState<ColaboradorOcorrencia[]>([GERENTE]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function fetchColaboradores() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from('colaboradores')
          .select('id, nome, tipo, unidades ( codigo )')
          .eq('ativo', true)
          .in('tipo', ['farmer', 'hunter', 'admin'])
          .neq('situacao', 'desligado')
          .not('nome', 'ilike', '%teste%')
          .order('nome');

        if (queryError) throw queryError;
        if (cancelado) return;

        // Linha sem nome quebraria o Select do Radix, que proibe value="".
        const linhas = (data || []).filter((row: any) => String(row?.nome ?? '').trim());
        const nomesCurtos = abreviarNomesSemColisao(linhas.map((row: any) => row.nome));

        const lista = linhas.map((row: any, i: number) => {
          const tipo = LABEL_POR_TIPO[row.tipo] || row.tipo;
          const codigo = row.unidades?.codigo;
          return {
            nome: nomesCurtos[i] as string,
            cargo: codigo ? `${tipo} - ${codigo}` : tipo,
          };
        });

        setColaboradores([GERENTE, ...lista]);
      } catch (err: any) {
        if (cancelado) return;
        console.error('[useColaboradoresOcorrencia] falha ao carregar colaboradores:', err);
        // Mantem o gerente para a tela nao ficar sem nenhuma opcao.
        setError(err?.message || 'Falha ao carregar colaboradores');
        setColaboradores([GERENTE]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }

    fetchColaboradores();
    return () => {
      cancelado = true;
    };
  }, []);

  return { colaboradores, loading, error };
}
