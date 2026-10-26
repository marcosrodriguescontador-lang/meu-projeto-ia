// Atividades (tarefas, ligações, reuniões) e visitas, com agenda unificada por responsável.
import { eq } from 'drizzle-orm'
import type { AgendaItem, AtividadeDto, VisitaDto } from '@shared/dto-crm'
import { erro } from '@shared/erros'
import { agoraLocal } from '@shared/financeiro/datas'
import { atividadeSchema, resultadoVisitaSchema, visitaSchema, SITUACOES_VISITA, type AtividadeInput, type ResultadoVisitaInput, type VisitaInput } from '@shared/schemas-crm'
import { atividade, lead, negocio, visita } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'
import { carteira, exigirCarteira } from './carteira'
import { avancarAte } from './etapas'

const SQL_ATIVIDADE = `SELECT a.id, a.tipo, a.titulo, a.descricao, a.agendada_para agendadaPara, a.concluida_em concluidaEm, a.resultado, a.cancelada_em canceladaEm,
  a.responsavel_id responsavelId, u.nome responsavel, a.negocio_id negocioId, n.titulo negocioTitulo, a.lead_id leadId, l.nome leadNome
  FROM atividade a JOIN usuario u ON u.id = a.responsavel_id LEFT JOIN negocio n ON n.id = a.negocio_id LEFT JOIN lead l ON l.id = a.lead_id`

const SQL_VISITA = `SELECT v.id, v.imovel_id imovelId, i.codigo imovelCodigo, i.logradouro || ', ' || i.numero || ' — ' || i.bairro imovelEndereco, v.negocio_id negocioId, v.lead_id leadId,
  coalesce(pc.nome, ln.nome, l.nome) cliente, v.corretor_id corretorId, c.nome corretor, v.data_hora dataHora, v.situacao, v.feedback, v.avaliacao
  FROM visita v JOIN imovel i ON i.id = v.imovel_id LEFT JOIN pessoa c ON c.id = v.corretor_id LEFT JOIN negocio n ON n.id = v.negocio_id
  LEFT JOIN pessoa pc ON pc.id = n.cliente_id LEFT JOIN lead ln ON ln.id = n.lead_id LEFT JOIN lead l ON l.id = v.lead_id`

function comAtraso(infra: Infra, a: Omit<AtividadeDto, 'atrasada'>): AtividadeDto {
  return { ...a, atrasada: !a.concluidaEm && !a.canceladaEm && a.agendadaPara < agoraLocal(infra.agora()) }
}

export function atividadesDe(infra: Infra, f: { negocioId?: number; leadId?: number }): AtividadeDto[] {
  const [col, v] = f.negocioId ? ['a.negocio_id', f.negocioId] : ['a.lead_id', f.leadId]
  return (infra.bruto.prepare(`${SQL_ATIVIDADE} WHERE ${col} = ? ORDER BY a.agendada_para DESC`).all(v) as Omit<AtividadeDto, 'atrasada'>[]).map((a) => comAtraso(infra, a))
}

export function visitasDe(infra: Infra, f: { negocioId?: number; leadId?: number; imovelId?: number }): VisitaDto[] {
  const [col, v] = f.negocioId ? ['v.negocio_id', f.negocioId] : f.leadId ? ['v.lead_id', f.leadId] : ['v.imovel_id', f.imovelId]
  return infra.bruto.prepare(`${SQL_VISITA} WHERE ${col} = ? ORDER BY v.data_hora DESC`).all(v) as VisitaDto[]
}

/** Confere se o usuário pode atuar no lead/negócio de referência. */
function exigirReferencia(infra: Infra, ator: Ator, negocioId: number | null, leadId: number | null): { leadId: number | null; corretorId: number | null } {
  const c = carteira(infra, ator)
  if (negocioId) {
    const n = infra.db.select().from(negocio).where(eq(negocio.id, negocioId)).get()
    if (!n) throw erro.naoEncontrado('Negócio')
    exigirCarteira(c, n)
    return { leadId: n.leadId, corretorId: n.corretorId }
  }
  if (leadId) {
    const l = infra.db.select().from(lead).where(eq(lead.id, leadId)).get()
    if (!l) throw erro.naoEncontrado('Lead')
    exigirCarteira(c, l)
    return { leadId, corretorId: l.corretorId }
  }
  return { leadId: null, corretorId: null }
}

export function criarAtividade(infra: Infra, ator: Ator, entrada: AtividadeInput): { id: number } {
  exigir(ator, 'crm.gerenciar')
  const d = atividadeSchema.parse(entrada)
  exigirReferencia(infra, ator, d.negocioId, d.leadId)
  const responsavelId = d.responsavelId ?? ator.id!
  if (responsavelId !== ator.id && !carteira(infra, ator).todos) throw erro.semPermissao()
  if (!infra.bruto.prepare('SELECT 1 FROM usuario WHERE id = ? AND ativo = 1').get(responsavelId)) throw erro.validacao('Responsável inválido.', { responsavelId: 'Usuário inativo' })
  return infra.bruto.transaction(() => {
    const r = infra.db
      .insert(atividade)
      .values({ negocioId: d.negocioId, leadId: d.leadId, responsavelId, tipo: d.tipo, titulo: d.titulo, descricao: d.descricao, agendadaPara: d.agendadaPara, criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: atividade.id })
      .get()
    auditar(infra, ator, { acao: 'ATIVIDADE_AGENDADA', entidade: d.negocioId ? 'negocio' : 'lead', entidadeId: d.negocioId ?? d.leadId, descricao: `${d.titulo} (${d.agendadaPara.replace('T', ' ')})` })
    return r
  })()
}

function exigirAtividade(infra: Infra, ator: Ator, id: number) {
  const a = infra.db.select().from(atividade).where(eq(atividade.id, id)).get()
  if (!a) throw erro.naoEncontrado('Atividade')
  if (a.responsavelId !== ator.id) exigirReferencia(infra, ator, a.negocioId, a.leadId)
  if (a.concluidaEm || a.canceladaEm) throw erro.regra('Atividade já encerrada.')
  return a
}

export function concluirAtividade(infra: Infra, ator: Ator, id: number, resultado: string): void {
  exigir(ator, 'crm.gerenciar')
  if (!resultado || resultado.trim().length < 2) throw erro.validacao('Descreva o resultado.')
  const a = exigirAtividade(infra, ator, id)
  infra.bruto.transaction(() => {
    infra.db.update(atividade).set({ concluidaEm: agoraIso(infra), resultado: resultado.trim(), atualizadoEm: agoraIso(infra), atualizadoPor: ator.id }).where(eq(atividade.id, id)).run()
    auditar(infra, ator, { acao: 'ATIVIDADE_CONCLUIDA', entidade: a.negocioId ? 'negocio' : 'lead', entidadeId: a.negocioId ?? a.leadId, descricao: `${a.titulo}: ${resultado.trim()}` })
  })()
}

export function cancelarAtividade(infra: Infra, ator: Ator, id: number, motivo: string): void {
  exigir(ator, 'crm.gerenciar')
  const a = exigirAtividade(infra, ator, id)
  infra.bruto.transaction(() => {
    infra.db.update(atividade).set({ canceladaEm: agoraIso(infra), resultado: motivo?.trim() || 'Cancelada', atualizadoEm: agoraIso(infra), atualizadoPor: ator.id }).where(eq(atividade.id, id)).run()
    auditar(infra, ator, { acao: 'ATIVIDADE_CANCELADA', entidade: a.negocioId ? 'negocio' : 'lead', entidadeId: a.negocioId ?? a.leadId, descricao: a.titulo })
  })()
}

export function reagendarAtividade(infra: Infra, ator: Ator, id: number, agendadaPara: string): void {
  exigir(ator, 'crm.gerenciar')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(agendadaPara)) throw erro.validacao('Data e hora inválidas.')
  const a = exigirAtividade(infra, ator, id)
  infra.bruto.transaction(() => {
    infra.db.update(atividade).set({ agendadaPara, atualizadoEm: agoraIso(infra), atualizadoPor: ator.id }).where(eq(atividade.id, id)).run()
    auditar(infra, ator, { acao: 'ATIVIDADE_REAGENDADA', entidade: a.negocioId ? 'negocio' : 'lead', entidadeId: a.negocioId ?? a.leadId, descricao: `${a.titulo}: ${a.agendadaPara} → ${agendadaPara}` })
  })()
}

export function agendarVisita(infra: Infra, ator: Ator, entrada: VisitaInput): { id: number } {
  exigir(ator, 'crm.gerenciar')
  const d = visitaSchema.parse(entrada)
  const ref = exigirReferencia(infra, ator, d.negocioId, d.leadId)
  if (!infra.bruto.prepare('SELECT 1 FROM imovel WHERE id = ? AND excluido_em IS NULL').get(d.imovelId)) throw erro.validacao('Imóvel inválido.', { imovelId: 'Imóvel inválido' })
  const corretorId = d.corretorId ?? ref.corretorId
  // Conflito de agenda: mesmo imóvel ou mesmo corretor no mesmo horário.
  const conflito = infra.bruto
    .prepare("SELECT v.id FROM visita v WHERE v.situacao = 'AGENDADA' AND v.data_hora = ? AND (v.imovel_id = ? OR (v.corretor_id IS NOT NULL AND v.corretor_id = ?))")
    .get(d.dataHora, d.imovelId, corretorId ?? -1)
  if (conflito) throw erro.conflito('Já há visita agendada neste horário para o imóvel ou para o corretor.')
  return infra.bruto.transaction(() => {
    const r = infra.db
      .insert(visita)
      .values({ imovelId: d.imovelId, negocioId: d.negocioId, leadId: d.leadId ?? ref.leadId, corretorId, dataHora: d.dataHora, situacao: 'AGENDADA', criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: visita.id })
      .get()
    auditar(infra, ator, { acao: 'VISITA_AGENDADA', entidade: 'imovel', entidadeId: d.imovelId, descricao: `Visita em ${d.dataHora.replace('T', ' ')}${d.negocioId ? ` — negócio nº ${d.negocioId}` : ''}` })
    return r
  })()
}

export function registrarResultadoVisita(infra: Infra, ator: Ator, entrada: ResultadoVisitaInput): void {
  exigir(ator, 'crm.gerenciar')
  const d = resultadoVisitaSchema.parse(entrada)
  const v = infra.db.select().from(visita).where(eq(visita.id, d.visitaId)).get()
  if (!v) throw erro.naoEncontrado('Visita')
  exigirReferencia(infra, ator, v.negocioId, v.leadId)
  if (v.situacao !== 'AGENDADA') throw erro.regra('Visita já encerrada.')
  if (d.situacao === 'REALIZADA' && v.dataHora > agoraLocal(infra.agora())) throw erro.regra('A visita ainda não aconteceu.')
  infra.bruto.transaction(() => {
    infra.db.update(visita).set({ situacao: d.situacao, feedback: d.feedback, avaliacao: d.avaliacao, atualizadoEm: agoraIso(infra), atualizadoPor: ator.id }).where(eq(visita.id, v.id)).run()
    if (d.situacao === 'REALIZADA' && v.negocioId) avancarAte(infra, ator, v.negocioId, 'VISITA', 'Visita realizada')
    auditar(infra, ator, { acao: 'VISITA_REGISTRADA', entidade: 'imovel', entidadeId: v.imovelId, descricao: `Visita de ${v.dataHora.replace('T', ' ')}: ${SITUACOES_VISITA[d.situacao]}${d.feedback ? ` — ${d.feedback}` : ''}` })
  })()
}

/** Agenda unificada (atividades e visitas) de um período. Sem carteira toda: só as do próprio usuário/corretor. */
export function agenda(infra: Infra, ator: Ator, f: { de: string; ate: string; responsavelId?: number; incluirConcluidas?: boolean }): AgendaItem[] {
  exigir(ator, 'crm.ver')
  const c = carteira(infra, ator)
  const agora = agoraLocal(infra.agora())
  const fim = `${f.ate}T23:59`
  const condA = ['a.agendada_para <= ?', '(a.agendada_para >= ? OR (a.concluida_em IS NULL AND a.cancelada_em IS NULL))']
  const pA: unknown[] = [fim, `${f.de}T00:00`]
  if (!f.incluirConcluidas) condA.push('a.concluida_em IS NULL AND a.cancelada_em IS NULL')
  if (!c.todos) (condA.push('a.responsavel_id = ?'), pA.push(ator.id))
  else if (f.responsavelId) (condA.push('a.responsavel_id = ?'), pA.push(f.responsavelId))
  const atividades = (infra.bruto.prepare(`${SQL_ATIVIDADE} WHERE ${condA.join(' AND ')} ORDER BY a.agendada_para`).all(...pA) as Omit<AtividadeDto, 'atrasada'>[]).map((a) => comAtraso(infra, a))
  const condV = ['v.data_hora BETWEEN ? AND ?']
  const pV: unknown[] = [`${f.de}T00:00`, fim]
  if (!f.incluirConcluidas) condV.push("v.situacao = 'AGENDADA'")
  if (!c.todos) (condV.push('(v.corretor_id = ? OR v.criado_por = ?)'), pV.push(c.pessoaId ?? -1, ator.id))
  else if (f.responsavelId) {
    const p = (infra.bruto.prepare('SELECT pessoa_id p FROM usuario WHERE id = ?').get(f.responsavelId) as { p: number | null } | undefined)?.p
    condV.push('(v.corretor_id = ? OR v.criado_por = ?)')
    pV.push(p ?? -1, f.responsavelId)
  }
  const visitas = infra.bruto.prepare(`${SQL_VISITA} WHERE ${condV.join(' AND ')} ORDER BY v.data_hora`).all(...pV) as VisitaDto[]
  const itens: AgendaItem[] = [
    ...atividades.map((a) => ({
      tipo: 'ATIVIDADE' as const,
      id: a.id,
      quando: a.agendadaPara,
      titulo: a.titulo,
      detalhe: a.negocioTitulo ?? a.leadNome,
      situacao: a.concluidaEm ? 'CONCLUIDA' : a.canceladaEm ? 'CANCELADA' : 'PENDENTE',
      atrasada: a.atrasada,
      negocioId: a.negocioId,
      leadId: a.leadId,
      responsavel: a.responsavel
    })),
    ...visitas.map((v) => ({
      tipo: 'VISITA' as const,
      id: v.id,
      quando: v.dataHora,
      titulo: `Visita — imóvel ${v.imovelCodigo}`,
      detalhe: `${v.cliente ?? ''} · ${v.imovelEndereco}`,
      situacao: v.situacao,
      atrasada: v.situacao === 'AGENDADA' && v.dataHora < agora,
      negocioId: v.negocioId,
      leadId: v.leadId,
      responsavel: v.corretor
    }))
  ]
  return itens.sort((a, b) => a.quando.localeCompare(b.quando))
}
