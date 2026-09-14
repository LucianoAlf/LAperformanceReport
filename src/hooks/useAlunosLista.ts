import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

import { supabase } from '@/lib/supabase';

/**
 * A lista de alunos, para quem só precisa LER a lista.
 *
 * Existe porque a consulta de alunos morava inteira dentro de
 * `AlunosPage.tsx` (2.307 linhas), misturada com filtros, KPIs, turmas e
 * modais — não havia de onde a tela do celular puxar, como houve no
 * Dashboard (`useDashboardDados`).
 *
 * ⚠️ O desktop AINDA não consome este hook. Enquanto não consumir, existem
 * duas leituras da mesma lista, e a daqui é deliberadamente um SUBCONJUNTO:
 * os mesmos filtros de linha (`arquivado_em is null` + unidade) e os campos
 * que a tela do celular mostra. `tests/alunosListaFonteUnica.test.mjs` trava
 * os dois filtros contra `AlunosPage.tsx` — se o desktop mudar o recorte da
 * lista, o teste fica vermelho aqui em vez de as duas telas divergirem em
 * silêncio, que é a causa-raiz documentada das duplicatas de renovação.
 */

export type StatusAluno = 'ativo' | 'aviso_previo' | 'trancado' | 'inativo';

export interface AlunoLista {
  id: number;
  nome: string;
  status: string | null;
  status_pagamento: string | null;
  aguardando_renovacao: boolean | null;
  dia_aula: string | null;
  horario_aula: string | null;
  valor_parcela: number | null;
  dia_vencimento: number | null;
  data_matricula: string | null;
  data_saida: string | null;
  tempo_permanencia_meses: number | null;
  anamnese_preenchida: boolean | null;
  telefone: string | null;
  whatsapp: string | null;
  responsavel_telefone: string | null;
  unidade_id: string | null;
  professor_atual_id: number | null;
  curso_id: number | null;
  /** Achatados no hook — ver `primeiro()`. */
  professor_nome: string | null;
  curso_nome: string | null;
  curso_is_banda: boolean;
  unidade_codigo: string | null;
  tipo_matricula_nome: string | null;
}

interface OutletContextLista {
  filtroAtivo?: string | null;
}

/**
 * O PostgREST devolve o join `!left` como objeto quando a FK é única e como
 * array quando não consegue provar que é — e o formato muda com a versão.
 * Ler `a.professores.nome` direto já deixou tela em branco neste repo.
 */
function primeiro<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

/** Cópia literal do `selectFields` de AlunosPage.tsx, reduzida aos campos lidos aqui. */
const CAMPOS = `
  id, nome, status, status_pagamento, aguardando_renovacao,
  dia_aula, horario_aula, valor_parcela, dia_vencimento,
  data_matricula, data_saida, tempo_permanencia_meses, anamnese_preenchida,
  telefone, whatsapp, responsavel_telefone,
  unidade_id, professor_atual_id, curso_id, tipo_matricula_id,
  professores:professor_atual_id!left(nome),
  cursos:curso_id!left(nome, is_projeto_banda),
  tipos_matricula:tipo_matricula_id!left(nome),
  unidades:unidade_id!inner(codigo)
`;

/**
 * ⚠️ Teto de linhas do PostgREST. Sem paginar, a lista para em 1.000 e a
 * unidade some do fim do alfabeto sem nenhum erro — a rede tem mais de 1.151
 * pagantes. É a mesma paginação de `fetchAllAlunos` em AlunosPage.tsx.
 */
const PAGINA = 1000;

export function useAlunosLista() {
  const contexto = useOutletContext<OutletContextLista>();
  const unidade = contexto?.filtroAtivo ?? null;

  const [alunos, setAlunos] = useState<AlunoLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);

    const linhas: AlunoLista[] = [];
    let inicio = 0;

    for (;;) {
      let consulta = supabase
        .from('alunos')
        .select(CAMPOS)
        .is('arquivado_em', null)
        .order('nome');

      if (unidade && unidade !== 'todos') consulta = consulta.eq('unidade_id', unidade);

      const { data, error } = await consulta.range(inicio, inicio + PAGINA - 1);

      if (error) {
        // Falha não pode ser muda: sem isto a tela mostraria "nenhum aluno",
        // que é indistinguível de uma unidade realmente vazia.
        setErro(error.message);
        setCarregando(false);
        return;
      }

      const pagina = (data ?? []) as unknown as Record<string, unknown>[];
      for (const bruto of pagina) {
        const professor = primeiro(bruto.professores as { nome?: string } | null);
        const curso = primeiro(bruto.cursos as { nome?: string; is_projeto_banda?: boolean } | null);
        const unidadeJoin = primeiro(bruto.unidades as { codigo?: string } | null);
        const tipo = primeiro(bruto.tipos_matricula as { nome?: string } | null);

        linhas.push({
          ...(bruto as unknown as AlunoLista),
          professor_nome: professor?.nome ?? null,
          curso_nome: curso?.nome ?? null,
          curso_is_banda: curso?.is_projeto_banda === true,
          unidade_codigo: unidadeJoin?.codigo ?? null,
          tipo_matricula_nome: tipo?.nome ?? null,
        });
      }

      if (pagina.length < PAGINA) break;
      inicio += PAGINA;
    }

    setAlunos(linhas);
    setCarregando(false);
  }, [unidade]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** `unidade === null` é a visão consolidada: o código da unidade passa a importar na linha. */
  const consolidado = useMemo(() => !unidade || unidade === 'todos', [unidade]);

  return { alunos, carregando, erro, recarregar: carregar, consolidado };
}

export default useAlunosLista;
