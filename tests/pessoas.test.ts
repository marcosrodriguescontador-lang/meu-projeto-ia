import { writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { adicionarAnexo, exportarAnexo, listarAnexos, removerAnexo } from '../src/main/modules/anexos/anexos'
import { adicionarDadoBancario, revelarDadoBancario } from '../src/main/modules/pessoas/bancarios'
import { atualizarPessoa, criarPessoa, excluirPessoa, historicoPessoa, listarPessoas, obterPessoa } from '../src/main/modules/pessoas/pessoas'
import { criarPerfil } from '../src/main/modules/seguranca/perfis'
import { criarUsuario, carregarUsuarioSessao } from '../src/main/modules/seguranca/usuarios'
import { ambienteConfigurado, pessoaFisica } from './apoio'

let limpar: (() => void)[] = []
afterEach(() => {
  limpar.forEach((f) => f())
  limpar = []
})
async function amb() {
  const a = await ambienteConfigurado()
  limpar.push(() => {
    a.fechar()
    a.apagar()
  })
  return a
}

const banco = { bancoCodigo: '341', bancoNome: 'Itaú Unibanco', agencia: '1234', conta: '567890', digito: '1', tipoConta: 'CORRENTE' as const, pixTipo: 'EMAIL' as const, pixChave: 'maria@exemplo.com', titularNome: 'Maria da Silva Souza', titularDocumento: '52998224725', principal: true }

describe('cadastro de pessoas', () => {
  it('cria pessoa com papéis, endereço e contato, com código automático', async () => {
    const { infra, admin } = await amb()
    const { id } = criarPessoa(infra, admin, pessoaFisica())
    const p = obterPessoa(infra, admin, id)
    expect(p.codigo).toBe(1)
    expect(p.documento).toBe('52998224725')
    expect(p.papeis).toEqual(['PROPRIETARIO'])
    expect(p.enderecos[0]!.cep).toBe('01310100')
    expect(criarPessoa(infra, admin, pessoaFisica({ documento: '111.444.777-35', nome: 'José' })).id).toBeGreaterThan(id)
    expect(obterPessoa(infra, admin, id + 1).codigo).toBe(2)
  })

  it('uma pessoa assume vários papéis sem duplicar o CPF', async () => {
    const { infra, admin } = await amb()
    const { id } = criarPessoa(infra, admin, pessoaFisica())
    expect(() => criarPessoa(infra, admin, pessoaFisica({ papeis: ['LOCATARIO'] }))).toThrow('Documento já cadastrado')
    atualizarPessoa(infra, admin, id, pessoaFisica({ papeis: ['PROPRIETARIO', 'LOCATARIO', 'FIADOR'] }))
    expect(obterPessoa(infra, admin, id).papeis.sort()).toEqual(['FIADOR', 'LOCATARIO', 'PROPRIETARIO'])
    expect(listarPessoas(infra, admin, { papel: 'LOCATARIO' }).itens.map((p) => p.id)).toEqual([id])
    expect(listarPessoas(infra, admin, { papel: 'CORRETOR' }).total).toBe(0)
  })

  it('valida dados no backend mesmo sem passar pela interface', async () => {
    const { infra, admin } = await amb()
    expect(() => criarPessoa(infra, admin, pessoaFisica({ documento: '123.456.789-00' }))).toThrow()
    expect(() => criarPessoa(infra, admin, pessoaFisica({ papeis: [] }))).toThrow()
    expect(() => criarPessoa(infra, admin, pessoaFisica({ papeis: ['CORRETOR'] }))).toThrow()
    expect(() => criarPessoa(infra, admin, pessoaFisica({ estadoCivil: 'SOLTEIRO' }))).toThrow()
    expect(() => criarPessoa(infra, admin, pessoaFisica({ contatos: [{ tipo: 'EMAIL', valor: 'invalido', nomeContato: '', principal: true }] }))).toThrow()
    expect(() => criarPessoa(infra, admin, { ...pessoaFisica(), tipo: 'PJ', documento: '11.222.333/0001-81' })).toThrow('jurídica')
  })

  it('busca por nome sem acento, documento e código', async () => {
    const { infra, admin } = await amb()
    criarPessoa(infra, admin, pessoaFisica({ nome: 'José Antônio' }))
    criarPessoa(infra, admin, { ...pessoaFisica({ nome: 'Imobiliária Parceira Ltda', documento: '11.222.333/0001-81', papeis: ['FORNECEDOR'] }), tipo: 'PJ', estadoCivil: '', regimeBens: '', nascimento: '' })
    expect(listarPessoas(infra, admin, { busca: 'jose antonio' }).total).toBe(1)
    expect(listarPessoas(infra, admin, { busca: '11222333' }).itens[0]!.nome).toContain('Parceira')
    expect(listarPessoas(infra, admin, { busca: '1' }).total).toBeGreaterThanOrEqual(1)
  })

  it('exclusão é lógica, exige motivo, respeita vínculos e fica no histórico', async () => {
    const { infra, admin } = await amb()
    const { id: conjuge } = criarPessoa(infra, admin, pessoaFisica({ documento: '111.444.777-35', nome: 'João Souza' }))
    const { id } = criarPessoa(infra, admin, pessoaFisica({ relacoes: [{ pessoaId: conjuge, tipo: 'CONJUGE' }] }))
    expect(() => excluirPessoa(infra, admin, conjuge, 'duplicado')).toThrow('vínculos')
    expect(() => excluirPessoa(infra, admin, id, '')).toThrow('motivo')
    excluirPessoa(infra, admin, id, 'Cadastro duplicado por engano')
    expect(() => obterPessoa(infra, admin, id)).toThrow('não encontrad')
    const linha = infra.bruto.prepare('SELECT excluido_em, motivo_exclusao FROM pessoa WHERE id=?').get(id) as Record<string, string>
    expect(linha.excluido_em).toBeTruthy()
    expect(historicoPessoa(infra, admin, id).map((h) => h.acao)).toEqual(['PESSOA_CRIADA', 'PESSOA_EXCLUIDA'])
  })
})

describe('dados bancários', () => {
  it('cifra agência/conta/PIX no banco e audita a visualização', async () => {
    const { infra, admin } = await amb()
    const { id } = criarPessoa(infra, admin, pessoaFisica())
    const { id: dbId } = adicionarDadoBancario(infra, admin, id, banco)
    const bruto = infra.bruto.prepare('SELECT * FROM dado_bancario WHERE id=?').get(dbId) as Record<string, string>
    expect(JSON.stringify(bruto)).not.toContain('567890')
    expect(JSON.stringify(bruto)).not.toContain('maria@exemplo.com')
    expect(bruto.conta_mascara).toBe('•••890-1')
    const r = revelarDadoBancario(infra, admin, dbId)
    expect(r.conta).toBe('567890')
    expect(r.pixChave).toBe('maria@exemplo.com')
    const aud = infra.bruto.prepare('SELECT * FROM auditoria').all()
    expect(JSON.stringify(aud)).not.toContain('567890')
    expect((aud as { acao: string }[]).some((a) => a.acao === 'DADO_BANCARIO_VISUALIZADO')).toBe(true)
  })

  it('usuário sem permissão não recebe dados bancários', async () => {
    const { infra, admin } = await amb()
    const { id } = criarPessoa(infra, admin, pessoaFisica())
    const { id: dbId } = adicionarDadoBancario(infra, admin, id, banco)
    const perfil = criarPerfil(infra, admin, { nome: 'Recepção', descricao: '', permissoes: ['pessoas.ver'] })
    const u = await criarUsuario(infra, admin, { nome: 'Recepção', login: 'recepcao', email: '', perfilId: perfil.id, pessoaId: null, ativo: true, senhaInicial: 'Recepcao12345' })
    const s = carregarUsuarioSessao(infra, u.id)
    expect(obterPessoa(infra, s, id).dadosBancarios).toBeNull()
    expect(() => revelarDadoBancario(infra, s, dbId)).toThrow('permissão')
  })
})

describe('anexos', () => {
  it('armazena cifrado, confere integridade e permite remoção lógica', async () => {
    const { infra, admin, dir } = await amb()
    const { id } = criarPessoa(infra, admin, pessoaFisica())
    const origem = join(dir, 'rg.pdf')
    writeFileSync(origem, '%PDF-1.4 documento de identidade confidencial')
    const anexoId = await adicionarAnexo(infra, admin, 'pessoa', id, 'Documento de identificação', origem)
    const sub = readdirSync(infra.caminhos.anexos)[0]!
    const armazenado = readFileSync(join(infra.caminhos.anexos, sub, readdirSync(join(infra.caminhos.anexos, sub))[0]!))
    expect(armazenado.toString()).not.toContain('confidencial')
    const saida = join(dir, 'saida.pdf')
    await exportarAnexo(infra, admin, anexoId, saida)
    expect(readFileSync(saida, 'utf8')).toContain('confidencial')
    await expect(adicionarAnexo(infra, admin, 'pessoa', id, 'Outros', join(dir, 'x.exe'))).rejects.toThrow('não permitido')
    removerAnexo(infra, admin, anexoId, 'Documento vencido')
    expect(listarAnexos(infra, admin, 'pessoa', id)).toHaveLength(0)
  })
})
