// Propostas e contrapropostas versionadas. Valores registrados são imutáveis (gatilho no banco).
import { and, desc, eq } from 'drizzle-orm'
import type { PropostaDto } from '@shared/dto-crm'
import { erro } from '@shared/erros'
import { propostaSchema, responderPropostaSchema, SITUACOES_PROPOSTA, type PropostaInput, type ResponderPropostaInput } from '@shared/schemas-crm'
import { negocio, proposta } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { carteira, exigirCarteira } from '../crm/carteira'
import { avancarAte } from '../crm/etapas'
import { aplicarSituacaoOferta } from '../imoveis/imoveis'
import { auditar } from '../seguranca/auditoria'

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function propostasDe(infra: Infra, negocioId: number): PropostaDto[] {
  const linhas = infra.bruto
    .prepare(
      `SELECT p.id, p.versao, p.anterior_id anteriorId, p.autor, p.valor_centavos valorCentavos, p.sinal_centavos sinalCentavos, p.parcelas,
        p.financiamento_banco financiamentoBanco, p.financiamento_centavos financiamentoCentavos, p.condicoes, p.validade, p.situacao,
        p.resposta_em respostaEm, p.motivo, p.criado_em criadoEm, u.nome criadoPor
       FROM proposta p LEFT JOIN usuario u ON u.id = p.criado_por WHERE p.negocio_id = ? ORDER BY p.versao DESC`
    )
    .all(negocioId) as (Omit<PropostaDto, 'parcelas' | 'saldoCentavos'> & { parcelas: string })[]
  return linhas.map((r) => {
    const parcelas = JSON.parse(r.parcelas) as PropostaDto['parcelas']
    return { ...r, parcelas, saldoCentavos: r.valorCentavos - r.sinalCentavos - r.financiamentoCentavos - parcelas.reduce((s, p) => s + p.valorCentavos, 0) }
  })
}

function negocioAberto(infra: Infra, ator: Ator, id: number) {
  const n = infra.db.select().from(negocio).where(eq(negocio.id, id)).get()
  if (!n) throw erro.naoEncontrado('Negócio')
  exigirCarteira(carteira(infra, ator), n)
  if (n.etapa === 'CONCLUIDO' || n.etapa === 'PERDIDO') throw erro.regra('Negócio encerrado.')
  return n
}

export function registrarProposta(infra: Infra, ator: Ator, entrada: PropostaInput): { id: number } {
  exigir(ator, 'vendas.propostas')
  const d = propostaSchema.parse(entrada)
  const n = negocioAberto(infra, ator, d.negocioId)
  if (!n.clienteId) throw erro.regra('Vincule o cliente ao cadastro de pessoas antes de registrar a proposta.')
  if (!n.imovelId) throw erro.regra('Informe o imóvel do negócio antes de registrar a proposta.')
  if (infra.bruto.prepare("SELECT 1 FROM venda WHERE negocio_id = ? AND situacao <> 'DISTRATADA'").get(n.id)) throw erro.regra('Negócio já possui venda registrada.')
  if (n.tipo === 'LOCACAO' && ((d.sinal ?? 0) > 0 || (d.financiamento ?? 0) > 0 || d.parcelas.length)) throw erro.validacao('Proposta de locação informa apenas o aluguel e as condições.')
  const ultima = infra.db.select().from(proposta).where(eq(proposta.negocioId, n.id)).orderBy(desc(proposta.versao)).get()
  let anterior: typeof proposta.$inferSelect | undefined
  if (d.anteriorId) {
    anterior = infra.db.select().from(proposta).where(and(eq(proposta.id, d.anteriorId), eq(proposta.negocioId, n.id))).get()
    if (!anterior) throw erro.naoEncontrado('Proposta anterior')
    if (anterior.situacao !== 'EM_ANALISE') throw erro.regra('Só é possível contrapropor uma proposta em análise.')
    if (anterior.autor === d.autor) throw erro.regra('A contraproposta deve partir da outra parte.')
  } else if (infra.db.select({ id: proposta.id }).from(proposta).where(and(eq(proposta.negocioId, n.id), eq(proposta.situacao, 'EM_ANALISE'))).get()) {
    throw erro.regra('Há uma proposta em análise. Responda-a ou registre uma contraproposta.')
  }
  return infra.bruto.transaction(() => {
    const ts = agoraIso(infra)
    if (anterior) infra.db.update(proposta).set({ situacao: 'CONTRAPROPOSTA', respostaEm: ts }).where(eq(proposta.id, anterior.id)).run()
    const r = infra.db
      .insert(proposta)
      .values({
        negocioId: n.id,
        versao: (ultima?.versao ?? 0) + 1,
        anteriorId: anterior?.id ?? null,
        autor: d.autor,
        valorCentavos: d.valor!,
        sinalCentavos: d.sinal ?? 0,
        parcelas: JSON.stringify(d.parcelas.map((p) => ({ descricao: p.descricao, valorCentavos: p.valor!, vencimento: p.vencimento }))),
        financiamentoBanco: d.financiamentoBanco,
        financiamentoCentavos: d.financiamento ?? 0,
        condicoes: d.condicoes,
        validade: d.validade,
        situacao: 'EM_ANALISE',
        criadoEm: ts,
        criadoPor: ator.id
      })
      .returning({ id: proposta.id })
      .get()
    avancarAte(infra, ator, n.id, anterior ? 'NEGOCIACAO' : 'PROPOSTA', anterior ? 'Contraproposta registrada' : 'Proposta registrada')
    auditar(infra, ator, {
      acao: anterior ? 'CONTRAPROPOSTA_REGISTRADA' : 'PROPOSTA_REGISTRADA',
      entidade: 'negocio',
      entidadeId: n.id,
      descricao: `${anterior ? 'Contraproposta' : 'Proposta'} v${(ultima?.versao ?? 0) + 1} do ${d.autor === 'CLIENTE' ? 'cliente' : 'proprietário'}: ${reais(d.valor!)}`
    })
    return r
  })()
}

export function responderProposta(infra: Infra, ator: Ator, entrada: ResponderPropostaInput): void {
  exigir(ator, 'vendas.propostas')
  const d = responderPropostaSchema.parse(entrada)
  const p = infra.db.select().from(proposta).where(eq(proposta.id, d.propostaId)).get()
  if (!p) throw erro.naoEncontrado('Proposta')
  const n = negocioAberto(infra, ator, p.negocioId)
  if (p.situacao !== 'EM_ANALISE') throw erro.regra('A proposta já foi respondida.')
  infra.bruto.transaction(() => {
    infra.db.update(proposta).set({ situacao: d.situacao, respostaEm: agoraIso(infra), motivo: d.motivo }).where(eq(proposta.id, p.id)).run()
    if (d.situacao === 'ACEITA') {
      avancarAte(infra, ator, n.id, 'NEGOCIACAO', `Proposta v${p.versao} aceita`)
      aplicarSituacaoOferta(infra, ator, n.imovelId!, n.tipo, 'EM_NEGOCIACAO', `Proposta aceita no negócio nº ${n.id}`, ['DISPONIVEL'])
    }
    auditar(infra, ator, { acao: 'PROPOSTA_RESPONDIDA', entidade: 'negocio', entidadeId: n.id, descricao: `Proposta v${p.versao} (${reais(p.valorCentavos)}): ${SITUACOES_PROPOSTA[d.situacao]}${d.motivo ? ` — ${d.motivo}` : ''}` })
  })()
}
