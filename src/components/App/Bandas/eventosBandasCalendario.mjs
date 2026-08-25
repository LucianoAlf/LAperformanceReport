import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export const MAX_EVENTOS_POR_DIA = 3;

export function construirGradeMes(mes) {
  const inicioMes = startOfMonth(mes);
  const fimMes = endOfMonth(mes);

  return eachDayOfInterval({
    start: startOfWeek(inicioMes, { weekStartsOn: 0 }),
    end: endOfWeek(fimMes, { weekStartsOn: 0 }),
  });
}

export function chaveDiaLocal(valor) {
  const data = typeof valor === 'string' ? parseISO(valor) : valor;
  return format(data, 'yyyy-MM-dd');
}

export function agruparEventosPorDia(eventos) {
  const grupos = new Map();

  for (const item of [...eventos].sort(
    (a, b) => parseISO(a.data_inicio).getTime() - parseISO(b.data_inicio).getTime(),
  )) {
    const chave = chaveDiaLocal(item.data_inicio);
    const grupo = grupos.get(chave) ?? [];
    grupo.push(item);
    grupos.set(chave, grupo);
  }

  return grupos;
}

export function filtrarEventosDaLista(eventos, mostrarPassados, agora) {
  if (mostrarPassados) return eventos;
  return eventos.filter((item) => parseISO(item.data_inicio).getTime() >= agora.getTime());
}

export function limitarEventosDoDia(eventos, limite = MAX_EVENTOS_POR_DIA) {
  return {
    visiveis: eventos.slice(0, limite),
    restantes: Math.max(0, eventos.length - limite),
  };
}
