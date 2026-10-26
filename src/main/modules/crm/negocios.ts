// Negócios (funis de venda e de locação): etapas com histórico, detalhe consolidado e indicadores de conversão.
import { eq } from 'drizzle-orm'
import type { EtapaHistDto, IndicadoresFunil, NegocioCartao, NegocioDetalhe } from '@shared/dto-crm'
import { erro } from '@shared/erros'
import { agoraLocal, diferencaDias, hojeIso } from '@shared/financeiro/datas'
import { ETAPAS, moverEtapaSchema, negocioSchema, SEQUENCIA_ETAPAS, type Etapa, type MoverEtapaInput, type NegocioInput } from '@shared/schemas-crm'
import { comissao, lead, negocio, venda } from '../../infra/db/schema'
import { agoraIso, exigir, pode, type Ator, type Infra } from '../../nucleo/contexto'
import { obterComissao } from '../financeiro/comissoes'
import { aplicarSituacaoOferta } from '../imoveis/imoveis'
import { auditar } from '../seguranca/auditoria'
import { propostasDe } from '../vendas/propostas'
import { vendaDe } from '../vendas/vendas'
import { atividadesDe, visitasDe } from './agenda'
import { carteira, exigirCarteira, filtroCarteira } from './carteira'
import { ordemEtapa, registrarEtapa } from './etapas'

const SQL_CARTAO = `SELECT n.id, n.tipo, n.titulo, n.etapa, n.etapa_desde etapaDesde, coalesce(pc.nome, l.nome, '—') cliente,
  CASE WHEN i.id IS NULL THEN NULL ELSE 'Cód. ' || i.codigo || ' — ' || i.logradouro || ', ' || i.numero END imovel,
  c.nome corretor, n.valor_estimado_centavos valorEstimadoCentavos,
  (SELECT a.titulo || '|' || a.agendada_para FROM atividade a WHERE a.negocio_id = n.id AND a.concluida_em IS NULL AND a.cancelada_em IS NULL ORDER BY a.agendada_para LIMIT 1) proxima
  FROM negocio n LEFT JOIN pessoa pc ON pc.id = n.cliente_id LEFT JOIN lead l ON l.id = n.lead_id LEFT JOIN imovel i ON i.id = n.imovel_id LEFT JOIN pessoa c ON c.id = n.corretor_id`

type LinhaCartao = Omit<NegocioCartao, 'diasNaEtapa' | 'proximaAtividade' | 'atrasada'> & { proxima: string | null }

function cartao(infra: Infra, r: LinhaCartao): NegocioCartao {
  const [titulo, quando] = r.proxima ? (r.proxima.split('|') as [string, string]) : [null, null]
  const { proxima: _p, ...resto } = r
  return {
    ...resto,
    diasNaEtapa: diferencaDias(r.etapaDesde.slice(0, 10), hojeIso(infra.agora())),
    proximaAtividade: titulo && quando ? { titulo, agendadaPara: quando } : null,
    atrasada: !!quando && quando < agoraLocal(infra.agora())
  }
}

export function listarNegocios(infra: Infra, ator: Ator, f: { tipo?: 'VENDA' | 'LOCACAO'; corretorId?: number; busca?: string; incluirEncerrados?: boolean; leadId?: number; imovelId?: number } = {}): NegocioCartao[] {
  exigir(ator, 'crm.ver')
  const c = filtroCarteira(carteira(infra, ator), 'n')
  const cond = [c.sql]
  const p: unknown[] = [...c.params]
  if (f.tipo) (cond.push('n.tipo = ?'), p.push(f.tipo))
  if (f.corretorId) (cond.push('n.corretor_id = ?'), p.push(f.corretorId))
  if (f.leadId) (cond.push('n.lead_id = ?'), p.push(f.leadId))
  if (f.imovelId) (cond.push('n.imovel_id = ?'), p.push(f.imovelId))
  // Encerrados aparecem por 30 dias no quadro, salvo pedido explícito.
  if (!f.incluirEncerrados) (cond.push("(n.etapa NOT IN ('CONCLUIDO','PERDIDO') OR n.encerrado_em >= ?)"), p.push(new Date(infra.agora().getTime() - 30 * 86_400_000).toISOString()))
  if (f.busca?.trim()) {
    const t = `%${f.busca.trim().toLowerCase()}%`
    cond.push("(lower(n.titulo) LIKE ? OR lower(coalesce(pc.nome, l.nome, '')) LIKE ? OR CAST(i.codigo AS TEXT) = ?)")
    p.push(t, t, f.busca.trim())
  }
  return (infra.bruto.prepare(`${SQL_CARTAO} WHERE ${cond.join(' AND ')} ORDER BY n.etapa_desde`).all(...p) as LinhaCartao[]).map((r) => cartao(infra, r))
}

function obterBruto(infra: Infra, ator: Ator, id: number) {
  const n = infra.db.select().from(negocio).where(eq(negocio.id, id)).get()
  if (!n) throw erro.naoEncontrado('Negócio')
  exigirCarteira(carteira(infra, ator), n)
  return n
}

function validarPartes(infra: Infra, d: { clienteId: number | null; imovelId: number | null; corretorId: number | null; leadId: number | null }, tipo: 'VENDA' | 'LOCACAO') {
  if (d.leadId && !infra.db.select({ id: lead.id }).from(lead).where(eq(lead.id, d.leadId)).get()) throw erro.validacao('Lead inválido.')
  if (d.clienteId && !infra.bruto.prepare('SELECT 1 FROM pessoa WHERE id = ? AND excluido_em IS NULL').get(d.clienteId)) throw erro.validacao('Cliente inválido.', { clienteId: 'Inválido' })
  if (d.corretorId && !infra.bruto.prepare("SELECT 1 FROM pessoa_papel pp JOIN pessoa p ON p.id = pp.pessoa_id WHERE pp.pessoa_id = ? AND pp.papel = 'CORRETOR' AND p.excluido_em IS NULL").get(d.corretorId))
    throw erro.validacao('A pessoa escolhida não está cadastrada como corretor.', { corretorId: 'Não é corretor' })
  if (d.imovelId && !infra.bruto.prepare('SELECT 1 FROM imovel_oferta o JOIN imovel i ON i.id = o.imovel_id WHERE o.imovel_id = ? AND o.modalidade = ? AND i.excluido_em IS NULL').get(d.imovelId, tipo))
    throw erro.validacao(`O imóvel não tem oferta de ${tipo === 'VENDA' ? 'venda' : 'locação'}.`, { imovelId: 'Sem oferta' })
}

export function criarNegocio(infra: Infra, ator: Ator, entrada: NegocioInput): { id: number } {
  exigir(ator, 'crm.gerenciar')
  const d = negocioSchema.parse(entrada)
  validarPartes(infra, d, d.tipo)
  const c = carteira(infra, ator)
  if (d.leadId) exigirCarteira(c, infra.db.select().from(lead).where(eq(lead.id, d.leadId)).get()!)
  if (!c.todos && c.pessoaId) d.corretorId = c.pessoaId
  return infra.bruto.transaction(() => {
    const ts = agoraIso(infra)
    const l = d.leadId ? infra.db.select().from(lead).where(eq(lead.id, d.leadId)).get()! : null
    const r = infra.db
      .insert(negocio)
      .values({ tipo: d.tipo, titulo: d.titulo, leadId: d.leadId, clienteId: d.clienteId ?? l?.pessoaId ?? null, imovelId: d.imovelId, corretorId: d.corretorId ?? l?.corretorId ?? null, etapa: d.etapa, etapaDesde: ts, valorEstimadoCentavos: d.valorEstimado, criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: negocio.id })
      .get()
    registrarEtapa(infra, ator, r.id, null, d.etapa, 'Negócio aberto')
    if (l && l.situacao === 'ATIVO') infra.db.update(lead).set({ situacao: 'CONVERTIDO', atualizadoEm: ts, atualizadoPor: ator.id }).where(eq(lead.id, l.id)).run()
    auditar(infra, ator, { acao: 'NEGOCIO_CRIADO', entidade: 'negocio', entidadeId: r.id, descricao: `${d.tipo === 'VENDA' ? 'Venda' : 'Locação'}: ${d.titulo}`, depois: d })
    return r
  })()
}

export function atualizarNegocio(infra: Infra, ator: Ator, id: number, entrada: Omit<NegocioInput, 'tipo' | 'etapa'>): void {
  exigir(ator, 'crm.gerenciar')
  const antes = obterBruto(infra, ator, id)
  const d = negocioSchema.parse({ ...entrada, tipo: antes.tipo })
  if (antes.etapa === 'CONCLUIDO' || antes.etapa === 'PERDIDO') throw erro.regra('Negócio encerrado.')
  const temVenda = !!infra.db.select({ id: venda.id }).from(venda).where(eq(venda.negocioId, id)).get()
  if (temVenda && (d.imovelId !== antes.imovelId || d.clienteId !== antes.clienteId)) throw erro.regra('Com a venda registrada, imóvel e cliente não podem mudar.')
  validarPartes(infra, d, antes.tipo)
  if (!carteira(infra, ator).todos) d.corretorId = antes.corretorId
  infra.bruto.transaction(() => {
    infra.db
      .update(negocio)
      .set({ titulo: d.titulo, leadId: d.leadId, clienteId: d.clienteId, imovelId: d.imovelId, corretorId: d.corretorId, valorEstimadoCentavos: d.valorEstimado, atualizadoEm: agoraIso(infra), atualizadoPor: ator.id })
      .where(eq(negocio.id, id))
      .run()
    auditar(infra, ator, { acao: 'NEGOCIO_ALTERADO', entidade: 'negocio', entidadeId: id, antes, depois: d })
  })()
}

/** Movimentação manual no funil. Contrato/conclusão de venda e conclusão de locação têm ações próprias. */
export function moverEtapa(infra: Infra, ator: Ator, entrada: MoverEtapaInput): void {
  exigir(ator, 'crm.gerenciar')
  const d = moverEtapaSchema.parse(entrada)
  const n = obterBruto(infra, ator, d.negocioId)
  if (n.etapa === d.etapa) return
  if (n.etapa === 'CONCLUIDO') throw erro.regra('Negócio concluído não muda de etapa.')
  if (d.etapa === 'CONCLUIDO') throw erro.regra(n.tipo === 'VENDA' ? 'A venda é concluída ao registrar a escritura ou a conclusão na aba Venda.' : 'Conclua a locação vinculando o contrato ativo.')
  const v = infra.db.select().from(venda).where(eq(venda.negocioId, n.id)).get()
  if (n.tipo === 'VENDA' && d.etapa === 'CONTRATO' && !v) throw erro.regra('Registre a venda para levar o negócio à etapa de contrato.')
  if (v && v.situacao !== 'DISTRATADA') throw erro.regra(d.etapa === 'PERDIDO' ? 'Há venda registrada: registre o distrato.' : 'Há venda registrada: a etapa acompanha a venda.')
  infra.bruto.transaction(() => {
    const obs = n.etapa === 'PERDIDO' ? `Reaberto${d.observacao ? `: ${d.observacao}` : ''}` : d.observacao
    registrarEtapa(infra, ator, n.id, n.etapa, d.etapa, obs, { motivoPerda: d.motivoPerda })
    // Negócio perdido libera a oferta que estava em negociação por causa dele.
    if (d.etapa === 'PERDIDO' && n.imovelId) aplicarSituacaoOferta(infra, ator, n.imovelId, n.tipo, 'DISPONIVEL', `Negócio nº ${n.id} perdido`, ['EM_NEGOCIACAO'])
    auditar(infra, ator, { acao: 'NEGOCIO_ETAPA', entidade: 'negocio', entidadeId: n.id, descricao: `${ETAPAS[n.etapa as Etapa]} → ${ETAPAS[d.etapa]}${d.motivoPerda ? ` (${d.motivoPerda})` : ''}${d.observacao ? ` — ${d.observacao}` : ''}` })
  })()
}

/** Conclui o negócio de locação vinculando o contrato ativo do imóvel. */
export function concluirLocacao(infra: Infra, ator: Ator, negocioId: number, contratoId: number): void {
  exigir(ator, 'crm.gerenciar')
  const n = obterBruto(infra, ator, negocioId)
  if (n.tipo !== 'LOCACAO') throw erro.regra('Negócio de venda: registre a venda.')
  if (n.etapa === 'CONCLUIDO' || n.etapa === 'PERDIDO') throw erro.regra('Negócio encerrado.')
  const c = infra.bruto.prepare('SELECT id, numero, imovel_id imovelId, situacao FROM contrato_locacao WHERE id = ?').get(contratoId) as { id: number; numero: number; imovelId: number; situacao: string } | undefined
  if (!c || c.situacao !== 'ATIVO') throw erro.regra('Selecione um contrato de locação ativo.')
  if (n.imovelId && c.imovelId !== n.imovelId) throw erro.regra('O contrato é de outro imóvel.')
  if (infra.db.select({ id: negocio.id }).from(negocio).where(eq(negocio.contratoId, contratoId)).get()) throw erro.regra('Este contrato já está vinculado a outro negócio.')
  const locatario = (infra.bruto.prepare("SELECT pessoa_id p FROM contrato_parte WHERE contrato_id = ? AND papel = 'LOCATARIO' ORDER BY principal DESC LIMIT 1").get(contratoId) as { p: number } | undefined)?.p
  infra.bruto.transaction(() => {
    infra.db.update(negocio).set({ contratoId, imovelId: c.imovelId, clienteId: n.clienteId ?? locatario ?? null }).where(eq(negocio.id, n.id)).run()
    registrarEtapa(infra, ator, n.id, n.etapa, 'CONCLUIDO', `Contrato de locação nº ${c.numero}`)
    auditar(infra, ator, { acao: 'NEGOCIO_CONCLUIDO', entidade: 'negocio', entidadeId: n.id, descricao: `Locação concluída — contrato nº ${c.numero}` })
  })()
}

export function obterNegocio(infra: Infra, ator: Ator, id: number): NegocioDetalhe {
  exigir(ator, 'crm.ver')
  const n = obterBruto(infra, ator, id)
  const base = cartao(infra, infra.bruto.prepare(`${SQL_CARTAO} WHERE n.id = ?`).get(id) as LinhaCartao)
  const extra = infra.bruto
    .prepare(
      `SELECT l.nome leadNome, pc.nome clienteNome, i.codigo imovelCodigo, i.corretor_id captadorId,
        (SELECT valor_centavos FROM imovel_oferta WHERE imovel_id = n.imovel_id AND modalidade = n.tipo) ofertaValorCentavos,
        (SELECT comissao_bp FROM imovel_oferta WHERE imovel_id = n.imovel_id AND modalidade = n.tipo) ofertaComissaoBp,
        (SELECT numero FROM contrato_locacao WHERE id = n.contrato_id) contratoNumero
       FROM negocio n LEFT JOIN lead l ON l.id = n.lead_id LEFT JOIN pessoa pc ON pc.id = n.cliente_id LEFT JOIN imovel i ON i.id = n.imovel_id WHERE n.id = ?`
    )
    .get(id) as Pick<NegocioDetalhe, 'leadNome' | 'clienteNome' | 'imovelCodigo' | 'captadorId' | 'ofertaValorCentavos' | 'ofertaComissaoBp' | 'contratoNumero'>
  const historico = infra.bruto
    .prepare('SELECT h.de, h.para, h.ts, u.nome usuario, h.observacao FROM negocio_etapa_hist h LEFT JOIN usuario u ON u.id = h.usuario_id WHERE h.negocio_id = ? ORDER BY h.id')
    .all(id) as EtapaHistDto[]
  const c = infra.db.select({ id: comissao.id }).from(comissao).where(eq(comissao.negocioId, id)).all().at(-1)
  return {
    ...base,
    ...extra,
    leadId: n.leadId,
    clienteId: n.clienteId,
    imovelId: n.imovelId,
    corretorId: n.corretorId,
    motivoPerda: n.motivoPerda,
    contratoId: n.contratoId,
    encerradoEm: n.encerradoEm,
    criadoEm: n.criadoEm,
    historico,
    propostas: propostasDe(infra, id),
    visitas: visitasDe(infra, { negocioId: id }),
    atividades: atividadesDe(infra, { negocioId: id }),
    venda: vendaDe(infra, id),
    comissao: c && pode(ator, 'comissoes.ver') ? obterComissao(infra, ator, c.id) : null
  }
}

/** Indicadores de conversão calculados do histórico real de etapas (negócios abertos no período). */
export function indicadoresFunil(infra: Infra, ator: Ator, f: { tipo: 'VENDA' | 'LOCACAO'; de: string; ate: string; corretorId?: number }): IndicadoresFunil {
  exigir(ator, 'crm.ver')
  const c = filtroCarteira(carteira(infra, ator), 'n')
  const cond = [c.sql, 'n.tipo = ?', 'substr(n.criado_em, 1, 10) BETWEEN ? AND ?']
  const p: unknown[] = [...c.params, f.tipo, f.de, f.ate]
  if (f.corretorId) (cond.push('n.corretor_id = ?'), p.push(f.corretorId))
  const negocios = infra.bruto
    .prepare(
      `SELECT n.id, n.etapa, n.criado_em criadoEm, n.encerrado_em encerradoEm, n.motivo_perda motivoPerda, coalesce(cr.nome, 'Sem corretor') corretor,
        coalesce(o.nome, 'Sem lead') origem, coalesce((SELECT valor_centavos FROM venda v WHERE v.negocio_id = n.id AND v.situacao <> 'DISTRATADA'), n.valor_estimado_centavos, 0) valor
       FROM negocio n LEFT JOIN pessoa cr ON cr.id = n.corretor_id LEFT JOIN lead l ON l.id = n.lead_id LEFT JOIN origem_lead o ON o.id = l.origem_id
       WHERE ${cond.join(' AND ')}`
    )
    .all(...p) as { id: number; etapa: string; criadoEm: string; encerradoEm: string | null; motivoPerda: string | null; corretor: string; origem: string; valor: number }[]
  const hist = new Map<number, { para: string; ts: string }[]>()
  if (negocios.length)
    for (const h of infra.bruto.prepare(`SELECT negocio_id n, para, ts FROM negocio_etapa_hist WHERE negocio_id IN (${negocios.map(() => '?').join(',')}) ORDER BY id`).all(...negocios.map((n) => n.id)) as { n: number; para: string; ts: string }[])
      hist.set(h.n, [...(hist.get(h.n) ?? []), { para: h.para, ts: h.ts }])
  const maximo = new Map(negocios.map((n) => [n.id, Math.max(...(hist.get(n.id) ?? []).map((h) => ordemEtapa(h.para)), ordemEtapa(n.etapa))]))
  const permanencias = new Map<string, number[]>()
  for (const n of negocios) {
    const h = hist.get(n.id) ?? []
    h.forEach((x, i) => {
      const prox = h[i + 1]
      if (!prox || x.para === 'PERDIDO' || x.para === 'CONCLUIDO') return
      permanencias.set(x.para, [...(permanencias.get(x.para) ?? []), (Date.parse(prox.ts) - Date.parse(x.ts)) / 86_400_000])
    })
  }
  const alcancaram = SEQUENCIA_ETAPAS.map((e) => negocios.filter((n) => maximo.get(n.id)! >= ordemEtapa(e)).length)
  const ganhos = negocios.filter((n) => n.etapa === 'CONCLUIDO')
  const perdidos = negocios.filter((n) => n.etapa === 'PERDIDO')
  const media = (v: number[]) => (v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null)
  const motivos = new Map<string, number>()
  for (const n of perdidos) {
    const m = (n.motivoPerda ?? 'Não informado').split(':')[0]!.trim()
    motivos.set(m, (motivos.get(m) ?? 0) + 1)
  }
  const leadsPorOrigem = infra.bruto
    .prepare(`SELECT o.nome origem, count(*) n FROM lead l JOIN origem_lead o ON o.id = l.origem_id WHERE substr(l.criado_em, 1, 10) BETWEEN ? AND ? AND ${filtroCarteira(carteira(infra, ator), 'l').sql} GROUP BY o.nome`)
    .all(f.de, f.ate, ...filtroCarteira(carteira(infra, ator), 'l').params) as { origem: string; n: number }[]
  const origens = new Set([...leadsPorOrigem.map((o) => o.origem), ...negocios.map((n) => n.origem)])
  const corretores = new Set(negocios.map((n) => n.corretor))
  return {
    total: negocios.length,
    emAndamento: negocios.length - ganhos.length - perdidos.length,
    ganhos: ganhos.length,
    perdidos: perdidos.length,
    taxaGanhoBp: ganhos.length + perdidos.length ? Math.round((ganhos.length * 10_000) / (ganhos.length + perdidos.length)) : null,
    cicloMedioDias: media(ganhos.filter((n) => n.encerradoEm).map((n) => (Date.parse(n.encerradoEm!) - Date.parse(n.criadoEm)) / 86_400_000)),
    valorGanhoCentavos: ganhos.reduce((s, n) => s + n.valor, 0),
    etapas: SEQUENCIA_ETAPAS.map((e, i) => ({
      etapa: e,
      alcancaram: alcancaram[i]!,
      conversaoProximaBp: i < SEQUENCIA_ETAPAS.length - 1 && alcancaram[i]! > 0 ? Math.round((alcancaram[i + 1]! * 10_000) / alcancaram[i]!) : null,
      tempoMedioDias: media(permanencias.get(e) ?? [])
    })),
    motivosPerda: [...motivos].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
    porOrigem: [...origens]
      .map((o) => ({ origem: o, leads: leadsPorOrigem.find((x) => x.origem === o)?.n ?? 0, negocios: negocios.filter((n) => n.origem === o).length, ganhos: ganhos.filter((n) => n.origem === o).length }))
      .sort((a, b) => b.negocios - a.negocios || b.leads - a.leads),
    porCorretor: [...corretores]
      .map((c) => ({ corretor: c, negocios: negocios.filter((n) => n.corretor === c).length, ganhos: ganhos.filter((n) => n.corretor === c).length, valorGanhoCentavos: ganhos.filter((n) => n.corretor === c).reduce((s, n) => s + n.valor, 0) }))
      .sort((a, b) => b.ganhos - a.ganhos || b.negocios - a.negocios)
  }
}
