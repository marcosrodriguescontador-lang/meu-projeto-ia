// Cadastro único de pessoas físicas e jurídicas com múltiplos papéis.
import { and, asc, eq, inArray, isNull, like, ne, or, sql, type SQL } from 'drizzle-orm'
import { normalizarDocumento } from '@shared/documentos'
import type { PaginaResultado, PessoaDetalhe, PessoaResumo, RegistroAuditoria } from '@shared/dto'
import { erro } from '@shared/erros'
import { listarPessoasSchema, pessoaSchema, type ListarPessoasInput, type Papel, type PessoaDados, type PessoaInput } from '@shared/schemas'
import { contato, endereco, pessoa, pessoaPapel, pessoaRelacao, usuario } from '../../infra/db/schema'
import { agoraIso, exigir, pode, type Ator, type Infra } from '../../nucleo/contexto'
import { proximoNumero } from '../../nucleo/sequencia'
import { normalizarBusca } from '../../nucleo/texto'
import { auditar, historicoEntidade } from '../seguranca/auditoria'
import { listarDadosBancarios } from './bancarios'
import { vinculosImobiliarios } from '../imoveis/imoveis'
import { vinculosContratuais } from '../locacoes/contratos'

const ativa = isNull(pessoa.excluidoEm)

export function documentoEmUso(infra: Infra, documento: string, ignorarId?: number): { id: number; nome: string } | null {
  const doc = normalizarDocumento(documento)
  const cond = [eq(pessoa.documento, doc), ativa]
  if (ignorarId) cond.push(ne(pessoa.id, ignorarId))
  return infra.db.select({ id: pessoa.id, nome: pessoa.nome }).from(pessoa).where(and(...cond)).get() ?? null
}

export function listarPessoas(infra: Infra, ator: Ator, entrada: ListarPessoasInput): PaginaResultado<PessoaResumo> {
  exigir(ator, 'pessoas.ver')
  const f = listarPessoasSchema.parse(entrada)
  const cond: SQL[] = [ativa]
  if (f.busca) {
    const termo = normalizarBusca(f.busca)
    const doc = normalizarDocumento(f.busca)
    const opcoes: SQL[] = [like(pessoa.nomeBusca, `%${termo}%`)]
    if (/^[0-9A-Z]{3,}$/.test(doc)) opcoes.push(like(pessoa.documento, `${doc}%`))
    if (/^\d+$/.test(f.busca.trim())) opcoes.push(eq(pessoa.codigo, Number(f.busca.trim())))
    cond.push(or(...opcoes)!)
  }
  if (f.situacao) cond.push(eq(pessoa.situacao, f.situacao))
  if (f.papel) cond.push(sql`EXISTS (SELECT 1 FROM pessoa_papel pp WHERE pp.pessoa_id = ${pessoa.id} AND pp.papel = ${f.papel})`)
  const where = and(...cond)
  const total = infra.db.select({ n: sql<number>`count(*)` }).from(pessoa).where(where).get()!.n
  const linhas = infra.db
    .select({
      id: pessoa.id,
      codigo: pessoa.codigo,
      tipo: pessoa.tipo,
      nome: pessoa.nome,
      nomeFantasia: pessoa.nomeFantasia,
      documento: pessoa.documento,
      situacao: pessoa.situacao,
      papeis: sql<string | null>`(SELECT group_concat(papel) FROM pessoa_papel pp WHERE pp.pessoa_id = ${pessoa.id})`,
      contatoPrincipal: sql<string | null>`(SELECT valor FROM contato c WHERE c.pessoa_id = ${pessoa.id} ORDER BY c.principal DESC, c.id LIMIT 1)`,
      cidadeUf: sql<string | null>`(SELECT cidade || '/' || uf FROM endereco e WHERE e.pessoa_id = ${pessoa.id} ORDER BY e.principal DESC, e.id LIMIT 1)`
    })
    .from(pessoa)
    .where(where)
    .orderBy(asc(pessoa.nomeBusca))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina)
    .all()
  return {
    itens: linhas.map((l) => ({ ...l, papeis: (l.papeis ? l.papeis.split(',') : []) as Papel[] })),
    total,
    pagina: f.pagina,
    porPagina: f.porPagina
  }
}

function carregar(infra: Infra, id: number) {
  const p = infra.db.select().from(pessoa).where(and(eq(pessoa.id, id), ativa)).get()
  if (!p) throw erro.naoEncontrado('Pessoa')
  const papeis = infra.db.select().from(pessoaPapel).where(eq(pessoaPapel.pessoaId, id)).all()
  const enderecos = infra.db.select().from(endereco).where(eq(endereco.pessoaId, id)).orderBy(asc(endereco.id)).all()
  const contatos = infra.db.select().from(contato).where(eq(contato.pessoaId, id)).orderBy(asc(contato.id)).all()
  const relacoes = infra.db
    .select({ pessoaId: pessoaRelacao.relacionadaId, tipo: pessoaRelacao.tipo, nome: pessoa.nome, documento: pessoa.documento })
    .from(pessoaRelacao)
    .innerJoin(pessoa, eq(pessoa.id, pessoaRelacao.relacionadaId))
    .where(eq(pessoaRelacao.pessoaId, id))
    .all()
  const creci = papeis.find((x) => x.papel === 'CORRETOR')?.dados
  return {
    id: p.id,
    codigo: p.codigo,
    criadoEm: p.criadoEm,
    atualizadoEm: p.atualizadoEm,
    tipo: p.tipo,
    nome: p.nome,
    nomeFantasia: p.nomeFantasia,
    documento: p.documento,
    rgIe: p.rgIe,
    orgaoEmissor: p.orgaoEmissor,
    nascimento: p.nascimento,
    nacionalidade: p.nacionalidade,
    estadoCivil: p.estadoCivil,
    regimeBens: p.regimeBens,
    profissao: p.profissao,
    situacao: p.situacao,
    observacoes: p.observacoes,
    creci: creci ? ((JSON.parse(creci) as { creci?: string }).creci ?? null) : null,
    papeis: papeis.map((x) => x.papel as Papel),
    enderecos: enderecos.map(({ id: _i, pessoaId: _p, ...e }) => e),
    contatos: contatos.map(({ id: _i, pessoaId: _p, ...c }) => c),
    relacoes
  } as Omit<PessoaDetalhe, 'dadosBancarios'>
}

export function obterPessoa(infra: Infra, ator: Ator, id: number): PessoaDetalhe {
  exigir(ator, 'pessoas.ver')
  const p = carregar(infra, id)
  return { ...p, dadosBancarios: pode(ator, 'pessoas.dados_bancarios.ver') || pode(ator, 'pessoas.dados_bancarios.editar') ? listarDadosBancarios(infra, id) : null }
}

function validarRelacoes(infra: Infra, dados: PessoaDados, id?: number): void {
  for (const r of dados.relacoes) {
    if (r.pessoaId === id) throw erro.validacao('Uma pessoa não pode ser relacionada a si mesma.')
    const existe = infra.db.select({ id: pessoa.id }).from(pessoa).where(and(eq(pessoa.id, r.pessoaId), ativa)).get()
    if (!existe) throw erro.validacao('Pessoa relacionada não encontrada.')
  }
  if (dados.relacoes.filter((r) => r.tipo === 'CONJUGE').length > 1) throw erro.validacao('Informe apenas um cônjuge/companheiro(a).')
}

function gravarFilhos(infra: Infra, id: number, dados: PessoaDados): void {
  infra.db.delete(endereco).where(eq(endereco.pessoaId, id)).run()
  infra.db.delete(contato).where(eq(contato.pessoaId, id)).run()
  infra.db.delete(pessoaRelacao).where(eq(pessoaRelacao.pessoaId, id)).run()
  const temPrincipal = dados.enderecos.some((e) => e.principal)
  if (dados.enderecos.length)
    infra.db.insert(endereco).values(dados.enderecos.map((e, i) => ({ ...e, pessoaId: id, principal: e.principal || (!temPrincipal && i === 0) }))).run()
  if (dados.contatos.length) infra.db.insert(contato).values(dados.contatos.map((c) => ({ ...c, pessoaId: id }))).run()
  if (dados.relacoes.length) infra.db.insert(pessoaRelacao).values(dados.relacoes.map((r) => ({ pessoaId: id, relacionadaId: r.pessoaId, tipo: r.tipo }))).run()

  const atuais = infra.db.select().from(pessoaPapel).where(eq(pessoaPapel.pessoaId, id)).all().map((p) => p.papel)
  const remover = atuais.filter((p) => !dados.papeis.includes(p as Papel))
  if (remover.length) {
    verificarRemocaoPapeis(infra, id, remover)
    infra.db.delete(pessoaPapel).where(and(eq(pessoaPapel.pessoaId, id), inArray(pessoaPapel.papel, remover))).run()
  }
  for (const papel of dados.papeis) {
    const extra = papel === 'CORRETOR' ? JSON.stringify({ creci: dados.creci }) : null
    infra.db.insert(pessoaPapel).values({ pessoaId: id, papel, dados: extra }).onConflictDoUpdate({ target: [pessoaPapel.pessoaId, pessoaPapel.papel], set: { dados: extra } }).run()
  }
}

/** Impede remover papéis em uso. Fases seguintes acrescentam contratos (locatário, fiador etc.). */
function verificarRemocaoPapeis(infra: Infra, id: number, papeis: string[]): void {
  const v = vinculosImobiliarios(infra, id)
  if (papeis.includes('PROPRIETARIO') && v.proprietarioDe.length)
    throw erro.regra(`Não é possível remover o papel Proprietário: a pessoa é proprietária do(s) imóvel(is) ${v.proprietarioDe.join(', ')}.`)
  const contratos = vinculosContratuais(infra, id)
  for (const papel of ['LOCATARIO', 'FIADOR'] as const) {
    const em = contratos.filter((c) => c.papel === papel)
    if (papeis.includes(papel) && em.length)
      throw erro.regra(`Não é possível remover o papel ${papel === 'LOCATARIO' ? 'Locatário' : 'Fiador'}: há contrato(s) ativo(s) ou em rascunho nº ${em.map((c) => c.numero).join(', ')}.`)
  }
  if (papeis.includes('CORRETOR') && v.corretorDe.length)
    throw erro.regra(`Não é possível remover o papel Corretor: a pessoa é corretora responsável pelo(s) imóvel(is) ${v.corretorDe.join(', ')}.`)
}

function colunasPessoa(dados: PessoaDados) {
  return {
    tipo: dados.tipo,
    nome: dados.nome,
    nomeBusca: normalizarBusca(`${dados.nome} ${dados.nomeFantasia ?? ''}`),
    nomeFantasia: dados.nomeFantasia,
    documento: dados.documento,
    rgIe: dados.rgIe,
    orgaoEmissor: dados.orgaoEmissor,
    nascimento: dados.nascimento,
    nacionalidade: dados.nacionalidade,
    estadoCivil: dados.estadoCivil,
    regimeBens: dados.regimeBens,
    profissao: dados.profissao,
    situacao: dados.situacao,
    observacoes: dados.observacoes
  }
}

export function criarPessoa(infra: Infra, ator: Ator, entrada: PessoaInput): { id: number } {
  exigir(ator, 'pessoas.criar')
  const dados = pessoaSchema.parse(entrada)
  return infra.bruto.transaction(() => {
    const dup = documentoEmUso(infra, dados.documento)
    if (dup) throw erro.conflito(`Documento já cadastrado para "${dup.nome}" (código ${dup.id}). Adicione o novo papel ao cadastro existente.`, { documento: 'Documento já cadastrado' })
    validarRelacoes(infra, dados)
    const { id } = infra.db
      .insert(pessoa)
      .values({ ...colunasPessoa(dados), codigo: proximoNumero(infra.db, 'pessoa'), criadoPor: ator.id, atualizadoPor: ator.id })
      .returning({ id: pessoa.id })
      .get()
    gravarFilhos(infra, id, dados)
    auditar(infra, ator, { acao: 'PESSOA_CRIADA', entidade: 'pessoa', entidadeId: id, descricao: dados.nome, depois: dados })
    return { id }
  })()
}

export function atualizarPessoa(infra: Infra, ator: Ator, id: number, entrada: PessoaInput): void {
  exigir(ator, 'pessoas.editar')
  const dados = pessoaSchema.parse(entrada)
  infra.bruto.transaction(() => {
    const antes = carregar(infra, id)
    const dup = documentoEmUso(infra, dados.documento, id)
    if (dup) throw erro.conflito(`Documento já cadastrado para "${dup.nome}".`, { documento: 'Documento já cadastrado' })
    if (antes.tipo !== dados.tipo) throw erro.regra('Não é possível alterar o tipo (PF/PJ) de um cadastro existente.')
    validarRelacoes(infra, dados, id)
    infra.db
      .update(pessoa)
      .set({ ...colunasPessoa(dados), atualizadoPor: ator.id, atualizadoEm: agoraIso(infra) })
      .where(eq(pessoa.id, id))
      .run()
    gravarFilhos(infra, id, dados)
    const { id: _i, codigo: _c, criadoEm: _ce, atualizadoEm: _ae, ...antesDados } = antes
    auditar(infra, ator, { acao: 'PESSOA_ALTERADA', entidade: 'pessoa', entidadeId: id, descricao: dados.nome, antes: antesDados, depois: dados })
  })()
}

export function excluirPessoa(infra: Infra, ator: Ator, id: number, motivo: string): void {
  exigir(ator, 'pessoas.excluir')
  if (!motivo || motivo.trim().length < 5) throw erro.validacao('Informe o motivo da exclusão.', { motivo: 'Descreva o motivo' })
  infra.bruto.transaction(() => {
    const antes = carregar(infra, id)
    const vinculos: string[] = []
    if (infra.db.select({ id: usuario.id }).from(usuario).where(eq(usuario.pessoaId, id)).get()) vinculos.push('usuário do sistema')
    const relacionados = infra.db
      .select({ nome: pessoa.nome })
      .from(pessoaRelacao)
      .innerJoin(pessoa, eq(pessoa.id, pessoaRelacao.pessoaId))
      .where(and(eq(pessoaRelacao.relacionadaId, id), ativa))
      .all()
    if (relacionados.length) vinculos.push(`relacionada a ${relacionados.map((r) => r.nome).join(', ')}`)
    const imoveis = vinculosImobiliarios(infra, id)
    if (imoveis.proprietarioDe.length) vinculos.push(`proprietária do(s) imóvel(is) ${imoveis.proprietarioDe.join(', ')}`)
    if (imoveis.corretorDe.length) vinculos.push(`corretora responsável pelo(s) imóvel(is) ${imoveis.corretorDe.join(', ')}`)
    const contratos = vinculosContratuais(infra, id)
    if (contratos.length) vinculos.push(`parte do(s) contrato(s) ${[...new Set(contratos.map((c) => c.numero))].join(', ')}`)
    if (infra.bruto.prepare('SELECT 1 FROM titulo WHERE pessoa_id = ? LIMIT 1').get(id)) vinculos.push('possui títulos financeiros')
    if (vinculos.length) throw erro.regra(`Não é possível excluir: possui vínculos (${vinculos.join('; ')}).`)
    infra.db
      .update(pessoa)
      .set({ excluidoEm: agoraIso(infra), excluidoPor: ator.id, motivoExclusao: motivo.trim() })
      .where(eq(pessoa.id, id))
      .run()
    auditar(infra, ator, { acao: 'PESSOA_EXCLUIDA', entidade: 'pessoa', entidadeId: id, descricao: `${antes.nome} — motivo: ${motivo.trim()}`, antes })
  })()
}

export function historicoPessoa(infra: Infra, ator: Ator, id: number): RegistroAuditoria[] {
  exigir(ator, 'pessoas.ver')
  return historicoEntidade(infra, 'pessoa', id)
}
