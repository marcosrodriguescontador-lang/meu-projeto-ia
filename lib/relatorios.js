// Agrupamento de vendas por período (dia, semana, quinzena, mês, trimestre, semestre, ano).

export const AGRUPAMENTOS = { dia: 'Dia', semana: 'Semana', quinzena: 'Quinzena', mes: 'Mês', trimestre: 'Trimestre', semestre: 'Semestre', ano: 'Ano' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const p2 = (n) => String(n).padStart(2, '0');
const br = (iso) => iso.split('-').reverse().join('/');

function utc(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
const iso = (dt) => dt.toISOString().slice(0, 10);

// Retorna { chave, rotulo } do período ao qual a data (aaaa-mm-dd) pertence.
export function periodoDe(dataIso, agrupamento) {
  const [a, m, d] = dataIso.split('-').map(Number);
  switch (agrupamento) {
    case 'dia':
      return { chave: dataIso, rotulo: br(dataIso) };
    case 'semana': { // semana de segunda a domingo
      const dt = utc(dataIso);
      const desloc = (dt.getUTCDay() + 6) % 7;
      const ini = new Date(dt.getTime() - desloc * 86400000);
      const fim = new Date(ini.getTime() + 6 * 86400000);
      return { chave: iso(ini), rotulo: `${br(iso(ini))} a ${br(iso(fim))}` };
    }
    case 'quinzena': {
      const q = d <= 15 ? 1 : 2;
      return { chave: `${a}-${p2(m)}-Q${q}`, rotulo: `${q}ª quinzena de ${MESES[m - 1]}/${a}` };
    }
    case 'mes':
      return { chave: `${a}-${p2(m)}`, rotulo: `${MESES[m - 1]}/${a}` };
    case 'trimestre': {
      const t = Math.ceil(m / 3);
      return { chave: `${a}-T${t}`, rotulo: `${t}º trimestre de ${a}` };
    }
    case 'semestre': {
      const s = m <= 6 ? 1 : 2;
      return { chave: `${a}-S${s}`, rotulo: `${s}º semestre de ${a}` };
    }
    case 'ano':
      return { chave: String(a), rotulo: String(a) };
    default:
      throw new Error('Agrupamento inválido.');
  }
}

// vendas: [{ pedido_id, data, valor, quantidade }] (uma linha por pedido ou por item filtrado).
// Retorna períodos ordenados com nº de vendas (pedidos distintos), valor, ticket médio e quantidade.
export function agruparPorPeriodo(vendas, agrupamento) {
  const mapa = new Map();
  for (const v of vendas) {
    const { chave, rotulo } = periodoDe(v.data, agrupamento);
    let g = mapa.get(chave);
    if (!g) mapa.set(chave, g = { chave, rotulo, pedidos: new Set(), valor: 0, quantidade: 0 });
    g.pedidos.add(v.pedido_id);
    g.valor += v.valor;
    g.quantidade += Number(v.quantidade) || 0;
  }
  return [...mapa.values()]
    .sort((x, y) => (x.chave < y.chave ? -1 : 1))
    .map(({ pedidos, ...g }) => ({ ...g, vendas: pedidos.size, ticket: pedidos.size ? Math.round(g.valor / pedidos.size) : 0,
      quantidade: Math.round(g.quantidade * 1000) / 1000 }));
}

export function totalizar(vendas) {
  const pedidos = new Set(vendas.map((v) => v.pedido_id));
  const valor = vendas.reduce((s, v) => s + v.valor, 0);
  const quantidade = Math.round(vendas.reduce((s, v) => s + (Number(v.quantidade) || 0), 0) * 1000) / 1000;
  return { vendas: pedidos.size, valor, quantidade, ticket: pedidos.size ? Math.round(valor / pedidos.size) : 0 };
}

// Ranking genérico: agrupa por campo, soma valor e conta pedidos distintos; ordena por valor.
export function ranking(vendas, campoId, campoNome, extras = () => ({})) {
  const mapa = new Map();
  for (const v of vendas) {
    let g = mapa.get(v[campoId]);
    if (!g) mapa.set(v[campoId], g = { id: v[campoId], nome: v[campoNome], pedidos: new Set(), valor: 0, quantidade: 0, ...extras(v) });
    g.pedidos.add(v.pedido_id);
    g.valor += v.valor;
    g.quantidade += Number(v.quantidade) || 0;
  }
  return [...mapa.values()].map(({ pedidos, ...g }) => ({ ...g, vendas: pedidos.size,
    ticket: pedidos.size ? Math.round(g.valor / pedidos.size) : 0, quantidade: Math.round(g.quantidade * 1000) / 1000 }))
    .sort((a, b) => b.valor - a.valor);
}
