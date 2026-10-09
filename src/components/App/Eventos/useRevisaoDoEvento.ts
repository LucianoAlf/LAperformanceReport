import { useMemo } from 'react';

import {
  idadeHoje,
  levantarPendencias,
  resumirEvento,
  type EntradaDaRevisao,
} from '@/lib/eventos';
import { marcaDaClassificacao, type DadosDaImpressao } from '@/lib/eventosImpressao';
import {
  useAlunosDoEvento,
  useGradeDoEvento,
  useRelatoriosDoEvento,
  type EventoComResumo,
} from '@/hooks/useEventos';

/**
 * O que a Revisão e a aba Documentos perguntam ao recital, montado num lugar só.
 *
 * ⚠️ As duas abas fazem a MESMA pergunta ("o papel sai certo?") — a Revisão para listar as
 * pendências, Documentos para avisar ao lado do botão de imprimir. Montar a entrada em cada
 * aba daria duas respostas no primeiro ajuste; a regra em si continua em `src/lib/eventos.ts`.
 */
export function useRevisaoDoEvento(evento: EventoComResumo) {
  const { blocos, loading: carregandoGrade, erro: erroGrade } = useGradeDoEvento(evento.id);
  const { alunos, loading: carregandoAlunos, erro: erroAlunos } = useAlunosDoEvento(
    evento.id,
    evento.unidade_id,
  );
  const {
    relatorios,
    loading: carregandoRelatorios,
    erro: erroRelatorios,
  } = useRelatoriosDoEvento(evento.id);

  const entrada = useMemo<EntradaDaRevisao>(
    () => ({
      evento: {
        horario_inicio: evento.horario_inicio,
        duracao_padrao_segundos: evento.duracao_padrao_segundos,
        intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
      },
      blocos: blocos.map((b) => ({
        id: b.id,
        nome: b.nome,
        ordem: b.ordem,
        data: b.data,
        horario_inicial: b.horario_inicial,
        inicio_manual: b.inicio_manual,
        apresentacoes: b.apresentacoes.map((a) => ({
          id: a.id,
          ordem: a.ordem,
          duracao_segundos: a.duracao_segundos,
          pessoa_chave: a.pessoa_chave,
          aluno_nome: a.aluno_nome,
          curso_nome: a.curso_nome,
          musica: a.musica,
          grupo_id: a.grupo_id,
        })),
      })),
      alunos: alunos.map((a) => ({
        pessoa_chave: a.pessoa_chave,
        nome: a.nome,
        status: a.status,
        cursos_no_recital: a.cursos_no_recital,
        cursos: a.cursos.map((c) => ({ curso_id: c.curso_id, curso_nome: c.curso_nome })),
        alocacoes: a.alocacoes.map((x) => ({ curso_id: x.curso_id })),
      })),
      // Relatorio lancado para quem nao esta na grade e pendencia DO EVENTO, nao do
      // professor — a revisao tem de apontar para poder destravar o canal.
      relatorios: relatorios.map((r) => ({
        aluno_nome: r.aluno_nome,
        curso: r.curso,
        professor_nome: r.professor_nome,
        apresentacao_id: r.apresentacao_id,
      })),
    }),
    [evento, blocos, alunos, relatorios],
  );

  const pendencias = useMemo(() => levantarPendencias(entrada), [entrada]);
  const resumo = useMemo(() => resumirEvento(entrada), [entrada]);
  const impedimentos = useMemo(
    () => pendencias.filter((p) => p.gravidade === 'impede'),
    [pendencias],
  );

  const dadosDaImpressao = useMemo<DadosDaImpressao>(
    () => ({
      evento: {
        titulo: evento.titulo,
        data_evento: evento.data_evento,
        data_fim: evento.data_fim,
        local: evento.local,
        unidade_nome: evento.unidade_nome,
        horario_inicio: evento.horario_inicio,
        duracao_padrao_segundos: evento.duracao_padrao_segundos,
        intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
      },
      blocos: blocos.map((b) => ({
        id: b.id,
        nome: b.nome,
        ordem: b.ordem,
        data: b.data,
        horario_inicial: b.horario_inicial,
        inicio_manual: b.inicio_manual,
        apresentacoes: b.apresentacoes.map((a) => ({
          id: a.id,
          ordem: a.ordem,
          duracao_segundos: a.duracao_segundos,
          aluno_nome: a.aluno_nome,
          curso_nome: a.curso_nome,
          professor_nome: a.professor_nome,
          musica: a.musica,
          musica_artista: a.musica_artista,
          musica_link: a.musica_link,
          playback_path: a.playback_path,
          tem_playback: a.tem_playback,
          observacao_mapa: a.observacao_mapa,
          grupo_id: a.grupo_id,
          idade: idadeHoje(a.aluno_data_nascimento),
          marca: marcaDaClassificacao(a.aluno_classificacao),
          itens: a.itens.map((i) => ({
            tipo: i.tipo,
            nome: i.nome,
            quantidade: i.quantidade,
          })),
        })),
      })),
      // `window.location.origin` e lido AQUI, nao dentro do gerador: a funcao que monta o
      // documento fica pura e testavel em Node, onde `window` nao existe.
      origem: typeof window === 'undefined' ? undefined : window.location.origin,
    }),
    [evento, blocos],
  );

  return {
    blocos,
    relatorios,
    entrada,
    pendencias,
    resumo,
    impedimentos,
    dadosDaImpressao,
    carregando: (carregandoGrade || carregandoAlunos) && blocos.length === 0,
    carregandoRelatorios,
    erro: erroGrade ?? erroAlunos,
    erroRelatorios,
  };
}
