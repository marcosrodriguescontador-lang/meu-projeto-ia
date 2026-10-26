import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { gerarFichaHtml } from '../src/main/modules/imoveis/ficha'
import { adicionarFotos, definirCapa, listarFotos, removerFoto, reordenarFotos, verFoto } from '../src/main/modules/imoveis/fotos'
import { alterarSituacao, atualizarImovel, criarImovel, excluirImovel, historicoSituacao, imoveisDoProprietario, indicadoresImoveis, listarCaracteristicas, listarImoveis, obterImovel } from '../src/main/modules/imoveis/imoveis'
import { listarAnexos } from '../src/main/modules/anexos/anexos'
import { atualizarPessoa, criarPessoa, excluirPessoa, obterPessoa } from '../src/main/modules/pessoas/pessoas'
import { criarPerfil, listarPerfis, sincronizarPerfisSistema } from '../src/main/modules/seguranca/perfis'
import { carregarUsuarioSessao, criarUsuario } from '../src/main/modules/seguranca/usuarios'
import { TODAS_PERMISSOES } from '../src/shared/permissoes'
import { ambienteConfigurado, imovelBase, pessoaFisica, PNG_1PX } from './apoio'

let limpar: (() => void)[] = []
afterEach(() => {
  limpar.forEach((f) => f())
  limpar = []
})
async function amb() {
  const a = await ambienteConfigurado()
  limpar.push(() => (a.fechar(), a.apagar()))
  const maria = criarPessoa(a.infra, a.admin, pessoaFisica()).id
  const joao = criarPessoa(a.infra, a.admin, pessoaFisica({ nome: 'João Souza', documento: '111.444.777-35', papeis: ['LOCATARIO'] })).id
  const corretor = criarPessoa(a.infra, a.admin, pessoaFisica({ nome: 'Carlos Corretor', documento: '390.533.447-05', papeis: ['CORRETOR'], creci: '12345-F', estadoCivil: '', regimeBens: '' })).id
  return { ...a, maria, joao, corretor }
}

describe('cadastro de imóveis', () => {
  it('cria imóvel com código automático, coproprietários e ofertas de venda e locação', async () => {
    const { infra, admin, maria, joao, corretor } = await amb()
    const { id } = criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '50', principal: true }, { pessoaId: joao, percentual: '50', principal: false }], { corretorId: corretor }))
    const im = obterImovel(infra, admin, id)
    expect(im.codigo).toBe(1)
    expect(im.areaConstruida).toBe(8550)
    expect(im.condominioCentavos).toBe(120000)
    expect(im.internos!.proprietarios.map((p) => p.percentualBp)).toEqual([5000, 5000])
    expect(im.ofertas.map((o) => [o.modalidade, o.valorCentavos, o.comissaoBp, o.situacao])).toEqual([
      ['LOCACAO', 450000, 1000, 'DISPONIVEL'],
      ['VENDA', 85000000, 600, 'DISPONIVEL']
    ])
    // João não era proprietário: o papel é adicionado automaticamente e auditado.
    expect(obterPessoa(infra, admin, joao).papeis).toContain('PROPRIETARIO')
  })

  it('exige participações somando 100% e sem repetição', async () => {
    const { infra, admin, maria, joao } = await amb()
    expect(() => criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '60', principal: true }, { pessoaId: joao, percentual: '30', principal: false }]))).toThrow('100%')
    expect(() => criarImovel(infra, admin, imovelBase([]))).toThrow('ao menos um proprietário')
    expect(() => criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '50', principal: true }, { pessoaId: maria, percentual: '50', principal: false }]))).toThrow('repetido')
    expect(criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '33,34', principal: true }, { pessoaId: joao, percentual: '66,66', principal: false }])).id).toBeGreaterThan(0)
  })

  it('valida corretor, suítes, valor das ofertas e matrícula duplicada', async () => {
    const { infra, admin, maria, joao } = await amb()
    const dono = [{ pessoaId: maria, percentual: '100', principal: true }]
    expect(() => criarImovel(infra, admin, imovelBase(dono, { corretorId: joao }))).toThrow('não está cadastrada como corretor')
    expect(() => criarImovel(infra, admin, imovelBase(dono, { suites: '4' }))).toThrow()
    expect(() => criarImovel(infra, admin, imovelBase(dono, { venda: { ativa: true, valor: '', comissao: '6' } }))).toThrow()
    criarImovel(infra, admin, imovelBase(dono))
    expect(() => criarImovel(infra, admin, imovelBase(dono))).toThrow('Matrícula já cadastrada')
  })
})

describe('disponibilidade de venda e locação', () => {
  it('controla situações independentes por modalidade e registra histórico', async () => {
    const { infra, admin, maria } = await amb()
    const { id } = criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '100', principal: true }]))
    const [loc, venda] = obterImovel(infra, admin, id).ofertas
    alterarSituacao(infra, admin, { ofertaId: loc!.id, situacao: 'ALUGADO', motivo: 'Contrato assinado (importação)' })
    const im = obterImovel(infra, admin, id)
    expect(im.ofertas.find((o) => o.modalidade === 'LOCACAO')!.situacao).toBe('ALUGADO')
    expect(im.ofertas.find((o) => o.modalidade === 'VENDA')!.situacao).toBe('DISPONIVEL')
    expect(() => alterarSituacao(infra, admin, { ofertaId: venda!.id, situacao: 'ALUGADO', motivo: 'teste' })).toThrow('não se aplica')
    expect(() => alterarSituacao(infra, admin, { ofertaId: loc!.id, situacao: 'ALUGADO', motivo: 'teste' })).toThrow('já está')
    expect(historicoSituacao(infra, admin, id).map((h) => `${h.modalidade}:${h.de}->${h.para}`)).toEqual(['LOCACAO:DISPONIVEL->ALUGADO', 'LOCACAO:null->DISPONIVEL', 'VENDA:null->DISPONIVEL'])
    expect(() => infra.bruto.prepare('DELETE FROM oferta_situacao_hist').run()).toThrow('não pode ser excluído')
  })

  it('venda concluída inativa a oferta de locação disponível', async () => {
    const { infra, admin, maria } = await amb()
    const { id } = criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '100', principal: true }]))
    const venda = obterImovel(infra, admin, id).ofertas.find((o) => o.modalidade === 'VENDA')!
    alterarSituacao(infra, admin, { ofertaId: venda.id, situacao: 'VENDIDO', motivo: 'Escritura lavrada' })
    expect(obterImovel(infra, admin, id).ofertas.find((o) => o.modalidade === 'LOCACAO')!.situacao).toBe('INATIVO')
  })

  it('não permite desativar oferta com negócio em andamento nem excluir imóvel alugado', async () => {
    const { infra, admin, maria } = await amb()
    const dono = [{ pessoaId: maria, percentual: '100', principal: true }]
    const { id } = criarImovel(infra, admin, imovelBase(dono))
    const loc = obterImovel(infra, admin, id).ofertas.find((o) => o.modalidade === 'LOCACAO')!
    alterarSituacao(infra, admin, { ofertaId: loc.id, situacao: 'ALUGADO', motivo: 'Contrato vigente' })
    expect(() => atualizarImovel(infra, admin, id, imovelBase(dono, { locacao: { ativa: false, valor: '4.500,00', comissao: '10' } }))).toThrow('Altere a situação')
    expect(() => excluirImovel(infra, admin, id, 'Cadastro errado')).toThrow('Alugado')
    // Desativar venda (disponível) é permitido e gera histórico.
    atualizarImovel(infra, admin, id, imovelBase(dono, { venda: { ativa: false, valor: '850.000,00', comissao: '6' } }))
    expect(obterImovel(infra, admin, id).ofertas.find((o) => o.modalidade === 'VENDA')!.situacao).toBe('INATIVO')
  })
})

describe('pesquisa', () => {
  it('filtra por modalidade, faixa de preço, localização, características e dormitórios', async () => {
    const { infra, admin, maria } = await amb()
    const dono = [{ pessoaId: maria, percentual: '100', principal: true }]
    const caracs = listarCaracteristicas(infra)
    const piscina = caracs.find((c) => c.nome === 'Piscina')!.id
    const elevador = caracs.find((c) => c.nome === 'Elevador')!.id
    const a = criarImovel(infra, admin, imovelBase(dono, { caracteristicas: [piscina, elevador] })).id
    const b = criarImovel(infra, admin, imovelBase(dono, { matricula: '999', tipo: 'CASA', bairro: 'Moema', dormitorios: '2', suites: '0', caracteristicas: [piscina], venda: { ativa: false, valor: '', comissao: '' }, locacao: { ativa: true, valor: '2.800,00', comissao: '10' } })).id
    const c = criarImovel(infra, admin, imovelBase(dono, { matricula: '1000', cidade: 'Campinas', locacao: { ativa: false, valor: '', comissao: '' }, venda: { ativa: true, valor: '400.000,00', comissao: '6' } })).id
    const ids = async (f: Parameters<typeof listarImoveis>[2]) => (await listarImoveis(infra, admin, f)).itens.map((i) => i.id).sort()

    expect(await ids({ modalidade: 'LOCACAO' })).toEqual([a, b].sort())
    expect(await ids({ modalidade: 'VENDA', precoMax: '500.000,00' })).toEqual([c])
    expect(await ids({ modalidade: 'LOCACAO', precoMin: '3.000,00' })).toEqual([a])
    expect(await ids({ cidade: 'são paulo', bairro: 'moema' })).toEqual([b])
    expect(await ids({ caracteristicas: [piscina, elevador] })).toEqual([a])
    expect(await ids({ caracteristicas: [piscina] })).toEqual([a, b].sort())
    expect(await ids({ dormitoriosMin: 3 })).toEqual([a, c].sort())
    expect(await ids({ busca: 'paulista' })).toHaveLength(3)
    expect(await ids({ tipo: 'CASA' })).toEqual([b])
    const ordenado = await listarImoveis(infra, admin, { modalidade: 'VENDA', ordenar: 'valor_asc' })
    expect(ordenado.itens.map((i) => i.id)).toEqual([c, a])
    expect(await ids({ proprietarioId: maria })).toHaveLength(3)
  })
})

describe('fotos', () => {
  it('adiciona, define capa, reordena, exibe e remove fotos', async () => {
    const { infra, admin, maria, dir } = await amb()
    const { id } = criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '100', principal: true }]))
    const arquivos = ['sala.png', 'quarto.png', 'cozinha.png'].map((n) => {
      const p = join(dir, n)
      writeFileSync(p, PNG_1PX)
      return p
    })
    let fotos = await adicionarFotos(infra, admin, id, arquivos)
    expect(fotos.map((f) => [f.nome, f.capa])).toEqual([['sala.png', true], ['quarto.png', false], ['cozinha.png', false]])
    expect(fotos[0]!.miniatura.startsWith('data:image/png;base64,')).toBe(true)
    expect((await verFoto(infra, admin, fotos[1]!.id)).length).toBeGreaterThan(30)
    definirCapa(infra, admin, fotos[2]!.id)
    reordenarFotos(infra, admin, id, [fotos[2]!.id, fotos[0]!.id, fotos[1]!.id])
    fotos = await listarFotos(infra, admin, id)
    expect(fotos.map((f) => f.nome)).toEqual(['cozinha.png', 'sala.png', 'quarto.png'])
    expect((await listarImoveis(infra, admin, {})).itens[0]!.capa).toMatch(/^data:image/)
    removerFoto(infra, admin, fotos[0]!.id, 'Foto desatualizada')
    fotos = await listarFotos(infra, admin, id)
    expect(fotos.map((f) => [f.nome, f.ordem, f.capa])).toEqual([['sala.png', 1, true], ['quarto.png', 2, false]])
    // Fotos não aparecem na lista de documentos do imóvel.
    expect(listarAnexos(infra, admin, 'imovel', id)).toHaveLength(0)
    const txt = join(dir, 'nota.txt')
    writeFileSync(txt, 'x')
    await expect(adicionarFotos(infra, admin, id, [txt])).rejects.toThrow('não permitido')
  })
})

describe('integração com pessoas e permissões', () => {
  it('impede remover papel ou excluir pessoa vinculada a imóvel', async () => {
    const { infra, admin, maria, corretor } = await amb()
    criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '100', principal: true }], { corretorId: corretor }))
    expect(() => atualizarPessoa(infra, admin, maria, pessoaFisica({ papeis: ['LOCATARIO'] }))).toThrow('proprietária do(s) imóvel(is) 1')
    expect(() => excluirPessoa(infra, admin, corretor, 'Não trabalha mais aqui')).toThrow('corretora responsável')
    expect(imoveisDoProprietario(infra, admin, maria)).toHaveLength(1)
  })

  it('usuário sem acesso a dados internos não vê nem altera proprietários e matrícula', async () => {
    const { infra, admin, maria, joao } = await amb()
    const { id } = criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '100', principal: true }]))
    const perfil = criarPerfil(infra, admin, { nome: 'Divulgação', descricao: '', permissoes: ['imoveis.ver', 'imoveis.editar'] })
    const u = await criarUsuario(infra, admin, { nome: 'Divulgação', login: 'divulga', email: '', perfilId: perfil.id, pessoaId: null, ativo: true, senhaInicial: 'Divulga123456' })
    const s = carregarUsuarioSessao(infra, u.id)
    expect(obterImovel(infra, s, id).internos).toBeNull()
    atualizarImovel(infra, s, id, imovelBase([{ pessoaId: joao, percentual: '100', principal: true }], { matricula: 'HACK', descricaoComercial: 'Nova descrição' }))
    const im = obterImovel(infra, admin, id)
    expect(im.descricaoComercial).toBe('Nova descrição')
    expect(im.internos!.matricula).toBe('12345')
    expect(im.internos!.proprietarios.map((p) => p.pessoaId)).toEqual([maria])
    await expect(listarImoveis(infra, s, { proprietarioId: maria })).rejects.toThrow('permissão')
  })

  it('concede permissões novas aos perfis padrão de instalações existentes, sem reconceder as removidas', async () => {
    const { infra, admin } = await amb()
    const corretor = () => listarPerfis(infra, admin).find((p) => p.nome === 'Corretor')!
    expect(corretor().permissoes).toContain('imoveis.editar')
    // Simula instalação da Fase 1: permissões de imóveis ainda desconhecidas.
    infra.bruto.prepare("DELETE FROM perfil_permissao WHERE permissao LIKE 'imoveis.%'").run()
    infra.bruto.prepare("UPDATE configuracao SET valor = ? WHERE chave = 'permissoes_conhecidas'").run(JSON.stringify(TODAS_PERMISSOES.filter((p) => !p.startsWith('imoveis.'))))
    infra.bruto.prepare("DELETE FROM perfil_permissao WHERE permissao = 'pessoas.excluir' AND perfil_id = (SELECT id FROM perfil WHERE nome = 'Gerente')").run()
    sincronizarPerfisSistema(infra)
    expect(corretor().permissoes).toContain('imoveis.editar')
    expect(listarPerfis(infra, admin).find((p) => p.nome === 'Gerente')!.permissoes).not.toContain('pessoas.excluir')
  })
})

describe('ficha e indicadores', () => {
  it('ficha comercial omite dados internos; ficha interna os inclui', async () => {
    const { infra, admin, maria } = await amb()
    const { id } = criarImovel(infra, admin, imovelBase([{ pessoaId: maria, percentual: '100', principal: true }]))
    const base = { imovel: obterImovel(infra, admin, id), caracteristicas: ['Piscina'], fotos: { capa: null, demais: [] }, empresa: null, logo: null, emitidoEm: new Date(), emitidoPor: 'Admin' }
    const comercial = gerarFichaHtml({ ...base, interna: false })
    expect(comercial).toContain('R$')
    expect(comercial).toContain('850.000,00')
    expect(comercial).toContain('CRECI 038595-J')
    expect(comercial).not.toContain('Maria da Silva')
    expect(comercial).not.toContain('12345')
    const interna = gerarFichaHtml({ ...base, interna: true })
    expect(interna).toContain('Maria da Silva Souza')
    expect(interna).toContain('4º CRI de São Paulo')
    expect(gerarFichaHtml({ ...base, interna: false, imovel: { ...base.imovel, descricaoComercial: '<script>x</script>' } })).not.toContain('<script>x')
  })

  it('indicadores refletem as situações reais', async () => {
    const { infra, admin, maria } = await amb()
    const dono = [{ pessoaId: maria, percentual: '100', principal: true }]
    const a = criarImovel(infra, admin, imovelBase(dono)).id
    criarImovel(infra, admin, imovelBase(dono, { matricula: '2' }))
    const loc = obterImovel(infra, admin, a).ofertas.find((o) => o.modalidade === 'LOCACAO')!
    alterarSituacao(infra, admin, { ofertaId: loc.id, situacao: 'ALUGADO', motivo: 'Contrato' })
    expect(indicadoresImoveis(infra)).toEqual({ total: 2, disponiveisVenda: 2, disponiveisLocacao: 1, alugados: 1, emNegociacao: 0, vendidos: 0 })
  })
})
