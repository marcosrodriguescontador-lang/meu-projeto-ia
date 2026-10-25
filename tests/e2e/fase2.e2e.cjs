// Teste E2E da Fase 2 (Imóveis) no aplicativo Electron real.
// Uso: npm run build && node tests/e2e/fase2.e2e.cjs  (Linux sem monitor: xvfb-run -a ...)
const { mkdtempSync, rmSync, readFileSync, existsSync, copyFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const { abrir, foto, configurar, entrar, simularDialogos, gerarPng, SAIDA } = require('./comum.cjs')

async function novaPessoa(j, { nome, cpf, papel, creci }) {
  await j.getByRole('navigation').getByRole('link', { name: 'Pessoas' }).click()
  await j.getByRole('button', { name: 'Nova pessoa' }).click()
  await j.getByLabel('CPF').fill(cpf)
  await j.getByLabel('Nome completo').fill(nome)
  await j.getByLabel(papel, { exact: true }).check()
  if (creci) await j.getByLabel('CRECI do corretor').fill(creci)
  await j.getByRole('button', { name: 'Salvar' }).click()
  await j.getByRole('heading', { name: nome }).waitFor()
}

;(async () => {
  const dados = mkdtempSync(join(tmpdir(), 'status-e2e2-'))
  let { app, janela: j } = await abrir(dados)
  try {
    await configurar(j)
    await entrar(j)
    await novaPessoa(j, { nome: 'Maria da Silva Souza', cpf: '529.982.247-25', papel: 'Proprietário' })
    await novaPessoa(j, { nome: 'Carlos Corretor', cpf: '390.533.447-05', papel: 'Corretor', creci: '123456-F' })

    // 1. Cadastro do imóvel com validações
    await j.getByRole('navigation').getByRole('link', { name: 'Imóveis' }).click()
    await j.getByRole('button', { name: 'Novo imóvel' }).click()
    await j.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('APARTAMENTO')
    await j.getByLabel('Matrícula').fill('45.678')
    await j.getByLabel('Cartório de registro').fill('1º CRI de Campinas')
    await j.getByLabel('CEP').fill('13010-100')
    await j.getByLabel('Logradouro').fill('Rua Barão de Jaguara')
    await j.getByLabel('Número').fill('1200')
    await j.getByLabel('Complemento').fill('Apto 82')
    await j.getByLabel('Bairro').fill('Centro')
    await j.getByLabel('Cidade').fill('Campinas')
    await j.getByRole('button', { name: 'Cômodos e características' }).click()
    await j.getByLabel('Dormitórios').fill('3')
    await j.getByLabel('Suítes').fill('1')
    await j.getByLabel('Banheiros').fill('2')
    await j.getByLabel('Vagas').fill('2')
    await j.getByLabel('Área construída').fill('92,5')
    await j.getByPlaceholder(/Texto usado na ficha/).fill('Apartamento reformado, andar alto, vista para o centro. Próximo a comércio e transporte.')
    await j.getByLabel('Piscina', { exact: true }).check()
    await j.getByLabel('Elevador').check()
    await j.getByLabel('Sacada / varanda').check()
    await j.getByRole('button', { name: 'Valores e disponibilidade' }).click()
    await j.getByLabel('Ofertar para venda').check()
    await j.getByLabel('Valor de venda').fill('650000')
    await j.getByLabel('Ofertar para locação').check()
    await j.getByLabel('Aluguel mensal').fill('3200')
    await j.getByLabel('Condomínio (mensal)').fill('780')
    await j.getByLabel('Corretor responsável').selectOption({ label: 'Carlos Corretor' })
    await j.getByRole('button', { name: 'Salvar' }).click()
    await j.getByRole('alert').getByText('Informe ao menos um proprietário.').waitFor()
    await j.getByRole('button', { name: /^Proprietários/ }).click()
    await j.getByPlaceholder(/Buscar pessoa para vincular/).fill('maria')
    await j.getByRole('button', { name: /Maria da Silva Souza/ }).click()
    await j.getByText('100%').waitFor()
    await foto(j, '11-imovel-proprietarios')
    await j.getByRole('button', { name: 'Salvar' }).click()
    await j.getByText('Imóvel cadastrado.').first().waitFor()
    await j.getByText(/Código 1 ·/).waitFor()

    // 2. Fotos (diálogo simulado com imagens reais)
    const imgs = [
      gerarPng(join(dados, 'fachada.png'), 1600, 1000, [40, 60, 80], [200, 210, 220]),
      gerarPng(join(dados, 'sala.png'), 1200, 800, [180, 150, 120], [240, 230, 210]),
      gerarPng(join(dados, 'cozinha.png'), 1200, 800, [90, 110, 90], [220, 230, 200])
    ]
    await simularDialogos(app, { abrir: imgs })
    await j.getByRole('button', { name: 'Fotos' }).click()
    await j.getByRole('button', { name: 'Adicionar fotos…' }).click()
    await j.getByText('Fotos (3)').waitFor()
    await j.getByText('CAPA').waitFor()
    await j.getByTitle('Definir como capa').first().click()
    await foto(j, '12-imovel-fotos')
    await j.locator('figure img').first().click()
    await j.getByText('1 / 3').waitFor()
    await j.keyboard.press('Escape')

    // 3. Situação independente: locação alugada, venda disponível
    await j.getByRole('button', { name: 'Valores e disponibilidade' }).click()
    await j.getByRole('button', { name: 'Alterar situação' }).nth(1).click()
    await j.getByRole('dialog').getByLabel('Nova situação').selectOption('ALUGADO')
    await j.getByRole('dialog').getByLabel('Motivo').fill('Contrato vigente antes da implantação do sistema')
    await j.getByRole('dialog').getByRole('button', { name: 'Alterar' }).click()
    await j.getByText('Situação alterada.').first().waitFor()
    await foto(j, '13-imovel-valores')

    // 4. Ficha em PDF (diálogo de salvar simulado)
    const pdf = join(dados, 'ficha.pdf')
    await simularDialogos(app, { salvar: pdf })
    await j.getByRole('button', { name: 'Ficha comercial' }).click()
    await j.getByText('Ficha gerada.').first().waitFor({ timeout: 30000 })
    assert.ok(existsSync(pdf), 'PDF não gerado')
    assert.equal(readFileSync(pdf).subarray(0, 4).toString(), '%PDF')
    copyFileSync(pdf, join(SAIDA, 'ficha-comercial-exemplo.pdf'))

    // 5. Histórico
    await j.getByRole('button', { name: 'Histórico' }).click()
    await j.getByRole('cell', { name: 'Contrato vigente antes da implantação do sistema', exact: true }).waitFor()
    await foto(j, '14-imovel-historico')

    // 6. Pesquisa e cards
    await j.getByRole('navigation').getByRole('link', { name: 'Imóveis' }).click()
    await j.getByText('1 imóvel(is) encontrado(s)').waitFor()
    await foto(j, '15-imoveis-lista')
    await j.getByTitle('Cards').click()
    await foto(j, '16-imoveis-cards')
    await j.getByRole('button', { name: /^Mais filtros/ }).click()
    await j.getByText('Preço máximo').locator('..').locator('input').fill('500.000,00')
    await j.getByRole('combobox', { name: 'Modalidade' }).selectOption('VENDA')
    await j.getByText('0 imóvel(is) encontrado(s)').waitFor()
    await j.getByText('Preço máximo').locator('..').locator('input').fill('700.000,00')
    await j.getByText('1 imóvel(is) encontrado(s)').waitFor()
    await j.getByTitle('Tabela').click()

    // 7. Integração com pessoas: aba Imóveis e bloqueio de remoção do papel
    await j.getByRole('navigation').getByRole('link', { name: 'Pessoas' }).click()
    await j.getByText('Maria da Silva Souza').click()
    await j.getByRole('button', { name: 'Imóveis' }).click()
    await j.getByText('Rua Barão de Jaguara, 1200').waitFor()
    await j.getByRole('button', { name: 'Dados gerais' }).click()
    await j.getByLabel('Proprietário', { exact: true }).uncheck()
    await j.getByLabel('Locatário').check()
    await j.getByRole('button', { name: 'Salvar' }).click()
    await j.getByText(/Não é possível remover o papel Proprietário/).waitFor()

    // 8. Painel com indicadores de imóveis
    await j.getByRole('navigation').getByRole('link', { name: 'Painel' }).click()
    await j.getByText('Disponíveis para venda').locator('..').getByText('1', { exact: true }).waitFor()
    await j.getByText('Imóveis alugados').locator('..').getByText('1', { exact: true }).waitFor()
    await foto(j, '17-painel-imoveis')
    console.log('E2E Fase 2: OK — capturas em', SAIDA)
  } catch (e) {
    await foto(j, 'erro-fase2').catch(() => {})
    console.error('E2E Fase 2: FALHOU', e)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => {})
    rmSync(dados, { recursive: true, force: true })
  }
})()
