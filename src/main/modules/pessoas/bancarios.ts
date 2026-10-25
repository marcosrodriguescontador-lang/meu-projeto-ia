// Dados bancários: campos sensíveis cifrados, visualização completa sob permissão e auditada.
import { and, asc, eq, isNull } from 'drizzle-orm'
import type { DadoBancarioDto, DadoBancarioRevelado } from '@shared/dto'
import { erro } from '@shared/erros'
import { dadoBancarioSchema, type DadoBancarioInput } from '@shared/schemas'
import { cifrarTexto, decifrarTexto } from '../../infra/crypto'
import { dadoBancario, pessoa } from '../../infra/db/schema'
import { agoraIso, exigir, type Ator, type Infra } from '../../nucleo/contexto'
import { auditar } from '../seguranca/auditoria'

const ativo = isNull(dadoBancario.excluidoEm)

function mascarar(conta: string, digito: string): string {
  return `•••${conta.slice(-3)}${digito ? `-${digito}` : ''}`
}

function paraDto(r: typeof dadoBancario.$inferSelect): DadoBancarioDto {
  return {
    id: r.id,
    bancoCodigo: r.bancoCodigo,
    bancoNome: r.bancoNome,
    tipoConta: r.tipoConta,
    contaMascara: r.contaMascara,
    pixTipo: r.pixTipo,
    titularNome: r.titularNome,
    titularDocumento: r.titularDocumento,
    principal: r.principal
  }
}

export function listarDadosBancarios(infra: Infra, pessoaId: number): DadoBancarioDto[] {
  return infra.db
    .select()
    .from(dadoBancario)
    .where(and(eq(dadoBancario.pessoaId, pessoaId), ativo))
    .orderBy(asc(dadoBancario.id))
    .all()
    .map(paraDto)
}

function colunas(infra: Infra, d: ReturnType<typeof dadoBancarioSchema.parse>) {
  const k = infra.chaves.campos
  return {
    bancoCodigo: d.bancoCodigo,
    bancoNome: d.bancoNome,
    tipoConta: d.tipoConta,
    agenciaCifrada: cifrarTexto(k, d.agencia),
    contaCifrada: cifrarTexto(k, d.conta),
    digitoCifrado: cifrarTexto(k, d.digito.toUpperCase()),
    contaMascara: mascarar(d.conta, d.digito.toUpperCase()),
    pixTipo: d.pixTipo,
    pixChaveCifrada: d.pixChave ? cifrarTexto(k, d.pixChave) : null,
    titularNome: d.titularNome,
    titularDocumento: d.titularDocumento,
    principal: d.principal
  }
}

function desmarcarPrincipal(infra: Infra, pessoaId: number): void {
  infra.db.update(dadoBancario).set({ principal: false }).where(eq(dadoBancario.pessoaId, pessoaId)).run()
}

function obterAtivo(infra: Infra, id: number) {
  const r = infra.db.select().from(dadoBancario).where(and(eq(dadoBancario.id, id), ativo)).get()
  if (!r) throw erro.naoEncontrado('Dado bancário')
  return r
}

export function adicionarDadoBancario(infra: Infra, ator: Ator, pessoaId: number, entrada: DadoBancarioInput): { id: number } {
  exigir(ator, 'pessoas.dados_bancarios.editar')
  const d = dadoBancarioSchema.parse(entrada)
  return infra.bruto.transaction(() => {
    if (!infra.db.select({ id: pessoa.id }).from(pessoa).where(and(eq(pessoa.id, pessoaId), isNull(pessoa.excluidoEm))).get()) throw erro.naoEncontrado('Pessoa')
    const primeiro = listarDadosBancarios(infra, pessoaId).length === 0
    if (d.principal) desmarcarPrincipal(infra, pessoaId)
    const { id } = infra.db
      .insert(dadoBancario)
      .values({ ...colunas(infra, { ...d, principal: d.principal || primeiro }), pessoaId, criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: dadoBancario.id })
      .get()
    auditar(infra, ator, { acao: 'DADO_BANCARIO_CRIADO', entidade: 'pessoa', entidadeId: pessoaId, descricao: `${d.bancoCodigo} ${mascarar(d.conta, d.digito)}`, depois: d })
    return { id }
  })()
}

export function atualizarDadoBancario(infra: Infra, ator: Ator, id: number, entrada: DadoBancarioInput): void {
  exigir(ator, 'pessoas.dados_bancarios.editar')
  const d = dadoBancarioSchema.parse(entrada)
  infra.bruto.transaction(() => {
    const atual = obterAtivo(infra, id)
    if (d.principal) desmarcarPrincipal(infra, atual.pessoaId)
    infra.db
      .update(dadoBancario)
      .set({ ...colunas(infra, d), atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) })
      .where(eq(dadoBancario.id, id))
      .run()
    auditar(infra, ator, { acao: 'DADO_BANCARIO_ALTERADO', entidade: 'pessoa', entidadeId: atual.pessoaId, descricao: `${atual.bancoCodigo} ${atual.contaMascara} → ${d.bancoCodigo} ${mascarar(d.conta, d.digito)}`, antes: paraDto(atual), depois: d })
  })()
}

export function removerDadoBancario(infra: Infra, ator: Ator, id: number): void {
  exigir(ator, 'pessoas.dados_bancarios.editar')
  infra.bruto.transaction(() => {
    const atual = obterAtivo(infra, id)
    infra.db.update(dadoBancario).set({ excluidoEm: agoraIso(infra), excluidoPor: ator.id, principal: false }).where(eq(dadoBancario.id, id)).run()
    auditar(infra, ator, { acao: 'DADO_BANCARIO_REMOVIDO', entidade: 'pessoa', entidadeId: atual.pessoaId, descricao: `${atual.bancoCodigo} ${atual.contaMascara}`, antes: paraDto(atual) })
  })()
}

export function revelarDadoBancario(infra: Infra, ator: Ator, id: number): DadoBancarioRevelado {
  exigir(ator, 'pessoas.dados_bancarios.ver')
  const r = obterAtivo(infra, id)
  const k = infra.chaves.campos
  infra.bruto.transaction(() => auditar(infra, ator, { acao: 'DADO_BANCARIO_VISUALIZADO', entidade: 'pessoa', entidadeId: r.pessoaId, descricao: `${r.bancoCodigo} ${r.contaMascara}` }))()
  return {
    ...paraDto(r),
    agencia: decifrarTexto(k, r.agenciaCifrada),
    conta: decifrarTexto(k, r.contaCifrada),
    digito: decifrarTexto(k, r.digitoCifrado),
    pixChave: r.pixChaveCifrada ? decifrarTexto(k, r.pixChaveCifrada) : null
  }
}
