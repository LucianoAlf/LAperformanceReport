import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatarFrescor } from '@/lib/agenda';

export interface AlunoAgenda {
  // integer no banco (alunos.id), nao uuid. Null quando o participante e lead.
  aluno_id: number | null;
  nome: string;
  // Foto do aluno (foto_url da tabela alunos). Null = avatar com iniciais.
  foto_url: string | null;
  idade: number | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  status_presenca: string | null;
  // Campos da chamada (Fase 2, 11/08/2026):
  // aula_emusys_id = a linha DESTE aluno em aulas_emusys (em turma, cada
  // contrato tem a sua) — e o alvo da app_registrar_chamada_agenda.
  aula_emusys_id: number | null;
  respondido_por: string | null;
  // Evidencia bruta do Emusys; quando diverge do status final (humano), a tela
  // mostra badge de conflito em vez de esconder a divergencia.
  emusys_presenca_bruta: string | null;
  justificada_motivo: string | null;
  justificada_evidencia: string | null;
  // Saldo de creditos de reposicao abertos (aluno_reposicoes, status pendente).
  reposicoes_pendentes: number;
  // Numero da aula DESTE aluno no contrato dele. Vem por aluno, e nao da aula,
  // porque em turma o campo do topo e nulo.
  // ⚠️ nr_da_aula = 1 NAO significa aluno novo: renovacao abre contrato novo e
  // zera o contador. Em 03/08/2026, 7 dos 11 alunos com nr_da_aula = 1 eram
  // renovacao. Para "aluno novo" use `aluno_novo`.
  nr_da_aula: number | null;
  qtd_aulas_contrato: number | null;
  // 1a aula regular do aluno na escola (experimental nao conta). Calculado no
  // banco pela ausencia de aula anterior, nao por data_matricula.
  aluno_novo: boolean;
  risco_pct: number | null;
  inadimplente: boolean;
  nota_pesquisa: number | null;
  data_ultima_aula: string | null;
  risco_calculado_em: string | null;
}

export interface LeadExperimentalAgenda {
  experimental_id: number;
  lead_id: number | null;
  nome: string;
  curso: string | null;
  curso_interesse_id: number | null;
  telefone: string | null;
  status: string | null;
  observacoes: string | null;
}

export interface AulaAgenda {
  chave: string;
  unidade_id: string;
  unidade_nome: string;
  professor_nome: string | null;
  professor_id: number | null;
  sala_nome: string | null;
  curso_nome: string | null;
  turma_nome: string | null;
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number;
  categoria: string | null;
  tipo: string | null;
  cancelada: boolean;
  justificada: boolean;
  reagendada: boolean;
  hora_original: string | null;
  nr_da_aula: number | null;
  // Total de aulas do contrato. Como `nr_da_aula`, so vem preenchido quando a
  // aula tem exatamente 1 contrato — em turma seria o contrato de um aluno
  // arbitrario. Juntos rendem "aula 5 de 48".
  qtd_aulas_contrato: number | null;
  qtd_alunos: number;
  anotacoes: string | null;
  // Registro do professor pelo LA Teacher. Hoje quase sempre nulo (a base tem
  // ~17 aulas com esse campo), mas e barato trazer junto.
  anotacoes_fabio: string | null;
  // ⚠️ 'ausente' e o DEFAULT do Emusys, nao um fato: 100% das aulas FUTURAS
  // vem como 'ausente'. So tem significado depois que a aula ocorreu.
  professor_presenca: string | null;
  alunos: AlunoAgenda[];
  // Linhas de aulas_emusys que formam este slot (container de turma + uma por
  // contrato). Necessario para cancelar o slot inteiro via app_cancelar_aula.
  aula_ids: number[];
  // Cancelamento humano (secretaria pela Agenda). Null = nao cancelada por aqui.
  cancelada_motivo: string | null;
  cancelada_origem: 'emusys' | 'agenda_secretaria' | null;
  // Quem vai na aula EXPERIMENTAL, vindo de `lead_experimentais`. Vazio nas demais.
  // Existe porque `aula_alunos_emusys` nao tem UMA linha sequer de experimental —
  // sem isto a agenda mostra a aula sem saber quem vem. Traz junto a `observacoes`
  // do atendimento, que o Emusys manda em 100% dos payloads e ninguem gravava.
  experimental_leads: LeadExperimentalAgenda[];
}

interface Params {
  data: string;
  unidadeId: string | null;
}

/**
 * Cache dos dias ja carregados, vivo enquanto a pagina estiver montada. Navegar
 * pela agenda e ir e voltar o tempo todo: sem isto, cada seta refaz a RPC e o
 * usuario espera de novo por um dia que ele acabou de ver. A chave inclui a
 * unidade porque o mesmo dia rende conjuntos diferentes por escola.
 */
function chaveDoCache(data: string, unidadeId: string | null): string {
  return `${unidadeId ?? 'todas'}|${data}`;
}

export function useAgendaDia({ data, unidadeId }: Params) {
  const cacheRef = useRef(new Map<string, AulaAgenda[]>());
  const chave = chaveDoCache(data, unidadeId);
  const emCache = cacheRef.current.get(chave);

  const [aulas, setAulas] = useState<AulaAgenda[]>(emCache ?? []);
  const [carregando, setCarregando] = useState(emCache === undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [frescor, setFrescor] = useState('sem dado de sincronizacao');

  // Contador de requisicao: cada chamada de `buscar` pega o proximo id.
  // Um `useCallback` com deps [data, unidadeId] cria uma NOVA closure a cada
  // troca de data/unidade — comparar contra `data`/`unidadeId` capturados no
  // topo da funcao e um no-op, porque dentro daquela closure eles nunca mudam
  // (o closure inteiro e descartado e substituido por outro). O contador foge
  // desse problema por viver fora de qualquer closure, num ref mutavel: so a
  // busca cujo id bate com o `current` mais recente pode gravar no estado.
  const idRequisicaoRef = useRef(0);

  const buscar = useCallback(async () => {
    const dataDaBusca = data;
    const unidadeIdDaBusca = unidadeId;
    const chaveDaBusca = chaveDoCache(dataDaBusca, unidadeIdDaBusca);
    const minhaRequisicaoId = ++idRequisicaoRef.current;
    const aindaValida = () => idRequisicaoRef.current === minhaRequisicaoId;

    // Ja visto: mostra na hora e revalida em silencio (sem estado de carga, pra
    // nao piscar). Inedito: mantem o que estava na tela e sinaliza carregando.
    const doCache = cacheRef.current.get(chaveDaBusca);
    if (doCache) setAulas(doCache);
    setCarregando(doCache === undefined);
    setErro(null);

    const { data: linhas, error } = await supabase.rpc('get_agenda_dia', {
      p_data: dataDaBusca,
      p_unidade_id: unidadeIdDaBusca,
    });

    if (!aindaValida()) return;

    if (error) {
      setErro(error.message);
      setAulas([]);
      setCarregando(false);
      return;
    }

    const resultado = (linhas || []) as unknown as AulaAgenda[];
    cacheRef.current.set(chaveDaBusca, resultado);
    setAulas(resultado);

    // Frescor: ultima linha inserida em aulas_emusys para o escopo atual.
    let q = supabase
      .from('aulas_emusys')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    if (unidadeIdDaBusca) q = q.eq('unidade_id', unidadeIdDaBusca);
    const { data: ultima, error: erroFrescor } = await q;

    if (!aindaValida()) return;

    if (erroFrescor) {
      // Frescor e informacao acessoria: falha aqui nao deve derrubar a tela
      // nem se misturar com `erro` (que e da RPC principal). So loga p/ diagnostico.
      console.error('[useAgendaDia] falha ao consultar frescor (aulas_emusys):', {
        unidadeId: unidadeIdDaBusca,
        error: erroFrescor,
      });
    }

    setFrescor(formatarFrescor(ultima?.[0]?.created_at ?? null, new Date()));
    setCarregando(false);
  }, [data, unidadeId]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  /**
   * Carrega um dia para o cache sem mexer no estado da tela. Serve para os dias
   * vizinhos: a navegacao e quase sempre sequencial (seta pra frente, seta pra
   * tras), entao adiantar o proximo transforma a troca seguinte em instantanea.
   * Nao refaz o que ja esta em cache e engole erro de proposito — e trabalho
   * especulativo, nao pode acender aviso de falha para o usuario.
   */
  const prefetch = useCallback(
    async (dataAlvo: string) => {
      const chaveAlvo = chaveDoCache(dataAlvo, unidadeId);
      if (cacheRef.current.has(chaveAlvo)) return;

      const { data: linhas, error } = await supabase.rpc('get_agenda_dia', {
        p_data: dataAlvo,
        p_unidade_id: unidadeId,
      });
      if (error) return;

      cacheRef.current.set(chaveAlvo, (linhas || []) as unknown as AulaAgenda[]);
    },
    [unidadeId],
  );

  return { aulas, carregando, erro, frescor, recarregar: buscar, prefetch };
}
