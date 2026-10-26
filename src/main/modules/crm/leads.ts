// Leads: interessados ainda sem negócio, com origem, perfil de busca e imóveis de interesse.
import { and, eq } from 'drizzle-orm'
import type { ImovelInteresse, LeadDetalhe, LeadResumo } from '@shared/dto-crm'
import { erro } from '@shared/erros'
import { leadSchema, type LeadInput } from '@shared/schemas-crm'
import { lead, leadImovel, origemLead, pessoa } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { carteira, exigirCarteira, filtroCarteira } from './carteira'

const ENDERECO = `i.logradouro || ', ' || i.numero || ' — ' || i.bairro || ', ' || i.cidade`

export function listarOrigens(infra: Infra): { id: number; nome: string; ativa: boolean }[] {
  return infra.db.select().from(origemLead).orderBy(origemLead.nome).all()
}

export function criarOrigem(infra: Infra, ator: Ator, nome: string): { id: number } {
  exigir(ator, 'crm.gerenciar')
  const n = nome.trim()
  if (n.length < 2 || n.length > 60) throw erro.validacao('Nome inválido.')
  if (infra.db.select({ id: origemLead.id }).from(origemLead).where(eq(origemLead.nome, n)).get()) throw erro.conflito('Origem já cadastrada.')
  return infra.bruto.transaction(() => {
    const r = infra.db.insert(origemLead).values({ nome: n }).returning({ id: origemLead.id }).get()
    auditar(infra, ator, { acao: 'ORIGEM_LEAD_CRIADA', entidade: 'origem_lead', entidadeId: r.id, descricao: n })
    return r
  })()
}

export function listarLeads(infra: Infra, ator: Ator, f: { busca?: string; situacao?: string; origemId?: number; corretorId?: number; interesse?: string } = {}): LeadResumo[] {
  exigir(ator, 'crm.ver')
  const c = filtroCarteira(carteira(infra, ator), 'l')
  const cond = [c.sql]
  const p: unknown[] = [...c.params]
  if (f.situacao) (cond.push('l.situacao = ?'), p.push(f.situacao))
  else cond.push("l.situacao <> 'DESCARTADO'")
  if (f.origemId) (cond.push('l.origem_id = ?'), p.push(f.origemId))
  if (f.corretorId) (cond.push('l.corretor_id = ?'), p.push(f.corretorId))
  if (f.interesse) (cond.push('l.interesse = ?'), p.push(f.interesse))
  if (f.busca?.trim()) {
    const t = `%${f.busca.trim().toLowerCase()}%`
    cond.push("(lower(l.nome) LIKE ? OR coalesce(l.telefone, '') LIKE ? OR lower(coalesce(l.email, '')) LIKE ?)")
    p.push(t, `%${f.busca.trim()}%`, t)
  }
  return infra.bruto
    .prepare(
      `SELECT l.id, l.nome, l.telefone, l.email, l.origem_id origemId, o.nome origem, l.corretor_id corretorId, c.nome corretor, l.interesse, l.situacao, l.criado_em criadoEm,
        (SELECT count(*) FROM negocio n WHERE n.lead_id = l.id) negocios,
        (SELECT min(a.agendada_para) FROM atividade a WHERE a.lead_id = l.id AND a.concluida_em IS NULL AND a.cancelada_em IS NULL) proximaAtividade
       FROM lead l JOIN origem_lead o ON o.id = l.origem_id LEFT JOIN pessoa c ON c.id = l.corretor_id
       WHERE ${cond.join(' AND ')} ORDER BY l.id DESC LIMIT 500`
    )
    .all(...p) as LeadResumo[]
}

function imoveisDeInteresse(infra: Infra, leadId: number): ImovelInteresse[] {
  return infra.bruto
    .prepare(
      `SELECT i.id imovelId, i.codigo, ${ENDERECO} endereco, i.tipo, i.dormitorios,
        (SELECT valor_centavos FROM imovel_oferta WHERE imovel_id = i.id AND modalidade = 'VENDA') valorVendaCentavos,
        (SELECT valor_centavos FROM imovel_oferta WHERE imovel_id = i.id AND modalidade = 'LOCACAO') valorLocacaoCentavos
       FROM lead_imovel li JOIN imovel i ON i.id = li.imovel_id WHERE li.lead_id = ? ORDER BY li.criado_em`
    )
    .all(leadId) as ImovelInteresse[]
}

export function obterLead(infra: Infra, ator: Ator, id: number): LeadDetalhe {
  exigir(ator, 'crm.ver')
  const l = infra.db.select().from(lead).where(eq(lead.id, id)).get()
  if (!l) throw erro.naoEncontrado('Lead')
  exigirCarteira(carteira(infra, ator), l)
  const resumo = listarLeadsPorId(infra, id)
  return {
    ...resumo,
    pessoaId: l.pessoaId,
    pessoaNome: l.pessoaId ? (infra.db.select({ n: pessoa.nome }).from(pessoa).where(eq(pessoa.id, l.pessoaId)).get()?.n ?? null) : null,
    tipoImovel: l.tipoImovel,
    bairros: l.bairros,
    valorMinCentavos: l.valorMinCentavos,
    valorMaxCentavos: l.valorMaxCentavos,
    dormitoriosMin: l.dormitoriosMin,
    observacoes: l.observacoes,
    consentimentoContato: l.consentimentoContato,
    idExterno: l.idExterno,
    motivoDescarte: l.motivoDescarte,
    imoveis: imoveisDeInteresse(infra, id)
  }
}

function listarLeadsPorId(infra: Infra, id: number): LeadResumo {
  return infra.bruto
    .prepare(
      `SELECT l.id, l.nome, l.telefone, l.email, l.origem_id origemId, o.nome origem, l.corretor_id corretorId, c.nome corretor, l.interesse, l.situacao, l.criado_em criadoEm,
        (SELECT count(*) FROM negocio n WHERE n.lead_id = l.id) negocios,
        (SELECT min(a.agendada_para) FROM atividade a WHERE a.lead_id = l.id AND a.concluida_em IS NULL AND a.cancelada_em IS NULL) proximaAtividade
       FROM lead l JOIN origem_lead o ON o.id = l.origem_id LEFT JOIN pessoa c ON c.id = l.corretor_id WHERE l.id = ?`
    )
    .get(id) as LeadResumo
}

function valores(d: ReturnType<typeof leadSchema.parse>) {
  return {
    nome: d.nome,
    telefone: d.telefone,
    email: d.email,
    pessoaId: d.pessoaId,
    origemId: d.origemId,
    corretorId: d.corretorId,
    interesse: d.interesse,
    tipoImovel: d.tipoImovel,
    bairros: d.bairros,
    valorMinCentavos: d.valorMin,
    valorMaxCentavos: d.valorMax,
    dormitoriosMin: d.dormitoriosMin,
    observacoes: d.observacoes,
    consentimentoContato: d.consentimentoContato,
    idExterno: d.idExterno
  }
}

function validarReferencias(infra: Infra, d: ReturnType<typeof leadSchema.parse>, proprioId: number | null = null) {
  if (!infra.db.select({ id: origemLead.id }).from(origemLead).where(eq(origemLead.id, d.origemId)).get()) throw erro.validacao('Origem inválida.', { origemId: 'Origem inválida' })
  if (d.corretorId && !infra.bruto.prepare("SELECT 1 FROM pessoa_papel pp JOIN pessoa p ON p.id = pp.pessoa_id WHERE pp.pessoa_id = ? AND pp.papel = 'CORRETOR' AND p.excluido_em IS NULL").get(d.corretorId))
    throw erro.validacao('A pessoa escolhida não está cadastrada como corretor.', { corretorId: 'Não é corretor' })
  const mesmo = d.idExterno ? infra.db.select({ id: lead.id }).from(lead).where(and(eq(lead.origemId, d.origemId), eq(lead.idExterno, d.idExterno))).get() : null
  if (mesmo && mesmo.id !== proprioId)
    throw erro.conflito('Já existe um lead com este identificador nesta origem.')
}

export function criarLead(infra: Infra, ator: Ator, entrada: LeadInput): { id: number } {
  exigir(ator, 'crm.gerenciar')
  const d = leadSchema.parse(entrada)
  validarReferencias(infra, d)
  const c = carteira(infra, ator)
  // Corretor sem acesso à carteira toda cadastra para si mesmo.
  if (!c.todos && c.pessoaId) d.corretorId = c.pessoaId
  return infra.bruto.transaction(() => {
    const r = infra.db.insert(lead).values({ ...valores(d), criadoPor: ator.id, atualizadoPor: ator.id }).returning({ id: lead.id }).get()
    auditar(infra, ator, { acao: 'LEAD_CRIADO', entidade: 'lead', entidadeId: r.id, depois: valores(d) })
    return r
  })()
}

export function atualizarLead(infra: Infra, ator: Ator, id: number, entrada: LeadInput): void {
  exigir(ator, 'crm.gerenciar')
  const d = leadSchema.parse(entrada)
  const antes = infra.db.select().from(lead).where(eq(lead.id, id)).get()
  if (!antes) throw erro.naoEncontrado('Lead')
  const c = carteira(infra, ator)
  exigirCarteira(c, antes)
  if (!c.todos) d.corretorId = antes.corretorId
  validarReferencias(infra, d, id)
  infra.bruto.transaction(() => {
    infra.db.update(lead).set({ ...valores(d), atualizadoEm: agoraIso(infra), atualizadoPor: ator.id }).where(eq(lead.id, id)).run()
    auditar(infra, ator, { acao: 'LEAD_ALTERADO', entidade: 'lead', entidadeId: id, antes, depois: valores(d) })
  })()
}

export function descartarLead(infra: Infra, ator: Ator, id: number, motivo: string): void {
  exigir(ator, 'crm.gerenciar')
  if (!motivo || motivo.trim().length < 3) throw erro.validacao('Informe o motivo.')
  const l = infra.db.select().from(lead).where(eq(lead.id, id)).get()
  if (!l) throw erro.naoEncontrado('Lead')
  exigirCarteira(carteira(infra, ator), l)
  if (infra.bruto.prepare("SELECT 1 FROM negocio WHERE lead_id = ? AND etapa NOT IN ('CONCLUIDO','PERDIDO')").get(id)) throw erro.regra('O lead tem negócio em andamento. Encerre o negócio antes.')
  infra.bruto.transaction(() => {
    infra.db.update(lead).set({ situacao: 'DESCARTADO', motivoDescarte: motivo.trim(), atualizadoEm: agoraIso(infra), atualizadoPor: ator.id }).where(eq(lead.id, id)).run()
    auditar(infra, ator, { acao: 'LEAD_DESCARTADO', entidade: 'lead', entidadeId: id, descricao: motivo.trim() })
  })()
}

export function reativarLead(infra: Infra, ator: Ator, id: number): void {
  exigir(ator, 'crm.gerenciar')
  const l = infra.db.select().from(lead).where(eq(lead.id, id)).get()
  if (!l) throw erro.naoEncontrado('Lead')
  exigirCarteira(carteira(infra, ator), l)
  if (l.situacao !== 'DESCARTADO') throw erro.regra('O lead não está descartado.')
  infra.bruto.transaction(() => {
    const negocios = (infra.bruto.prepare('SELECT count(*) n FROM negocio WHERE lead_id = ?').get(id) as { n: number }).n
    infra.db.update(lead).set({ situacao: negocios ? 'CONVERTIDO' : 'ATIVO', motivoDescarte: null, atualizadoEm: agoraIso(infra), atualizadoPor: ator.id }).where(eq(lead.id, id)).run()
    auditar(infra, ator, { acao: 'LEAD_REATIVADO', entidade: 'lead', entidadeId: id })
  })()
}

export function definirInteresse(infra: Infra, ator: Ator, leadId: number, imovelId: number, incluir: boolean): void {
  exigir(ator, 'crm.gerenciar')
  const l = infra.db.select().from(lead).where(eq(lead.id, leadId)).get()
  if (!l) throw erro.naoEncontrado('Lead')
  exigirCarteira(carteira(infra, ator), l)
  if (incluir) infra.db.insert(leadImovel).values({ leadId, imovelId }).onConflictDoNothing().run()
  else infra.db.delete(leadImovel).where(and(eq(leadImovel.leadId, leadId), eq(leadImovel.imovelId, imovelId))).run()
}

/** Imóveis disponíveis compatíveis com o perfil de busca do lead (tipo, bairros, faixa de valor, dormitórios). */
export function sugerirImoveis(infra: Infra, ator: Ator, leadId: number): ImovelInteresse[] {
  const l = obterLead(infra, ator, leadId)
  exigir(ator, 'imoveis.ver')
  const modalidades = l.interesse === 'AMBOS' ? ['VENDA', 'LOCACAO'] : [l.interesse === 'COMPRA' ? 'VENDA' : 'LOCACAO']
  const cond = [`o.modalidade IN (${modalidades.map(() => '?').join(',')})`, "o.situacao = 'DISPONIVEL'", 'i.excluido_em IS NULL']
  const p: unknown[] = [...modalidades]
  if (l.tipoImovel) (cond.push('i.tipo = ?'), p.push(l.tipoImovel))
  if (l.valorMinCentavos != null) (cond.push('o.valor_centavos >= ?'), p.push(l.valorMinCentavos))
  if (l.valorMaxCentavos != null) (cond.push('o.valor_centavos <= ?'), p.push(l.valorMaxCentavos))
  if (l.dormitoriosMin != null) (cond.push('coalesce(i.dormitorios, 0) >= ?'), p.push(l.dormitoriosMin))
  const bairros = (l.bairros ?? '').split(/[,;]/).map((b) => b.trim().toLowerCase()).filter(Boolean)
  if (bairros.length) (cond.push(`lower(i.bairro) IN (${bairros.map(() => '?').join(',')})`), p.push(...bairros))
  const jaMarcados = new Set(l.imoveis.map((i) => i.imovelId))
  return (
    infra.bruto
      .prepare(
        `SELECT DISTINCT i.id imovelId, i.codigo, ${ENDERECO} endereco, i.tipo, i.dormitorios,
          (SELECT valor_centavos FROM imovel_oferta WHERE imovel_id = i.id AND modalidade = 'VENDA') valorVendaCentavos,
          (SELECT valor_centavos FROM imovel_oferta WHERE imovel_id = i.id AND modalidade = 'LOCACAO') valorLocacaoCentavos
         FROM imovel i JOIN imovel_oferta o ON o.imovel_id = i.id WHERE ${cond.join(' AND ')} ORDER BY o.valor_centavos LIMIT 30`
      )
      .all(...p) as ImovelInteresse[]
  ).filter((i) => !jaMarcados.has(i.imovelId))
}
