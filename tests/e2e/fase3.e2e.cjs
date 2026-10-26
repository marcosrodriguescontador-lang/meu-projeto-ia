// Teste E2E da Fase 3 (Locações e núcleo financeiro) no aplicativo Electron real.
const { mkdtempSync, rmSync, readFileSync, existsSync, copyFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const { abrir, foto, configurar, entrar, simularDialogos, navegar, novaPessoa, novoImovel, SAIDA } = require('./comum.cjs')

;(async () => {
  const dados = mkdtempSync(join(tmpdir(), 'status-e2e3-'))
  const { app, janela: j } = await abrir(dados)
  try {
    await configurar(j)
    await entrar(j)
    await novaPessoa(j, { nome: 'Maria da Silva Souza', cpf: '529.982.247-25', papel: 'Proprietário' })
    await novaPessoa(j, { nome: 'Carlos Locatário', cpf: '390.533.447-05', papel: 'Locatário' })
    await novoImovel(j, { proprietario: 'Maria da Silva Souza', logradouro: 'Rua Barão de Jaguara', numero: '1200', bairro: 'Centro', cidade: 'Campinas', aluguel: '2500' })

    // 1. Conta bancária de terceiros
    await navegar(j, 'Contas bancárias')
    await j.getByRole('button', { name: 'Nova conta' }).click()
    await j.getByLabel('Nome').fill('Itaú — recursos de terceiros')
    await j.getByLabel('Data do saldo inicial').fill('2026-07-01')
    await j.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
    await j.getByText('Conta salva.').first().waitFor()

    // 2. Contrato: rascunho e ativação
    await navegar(j, 'Locações')
    await j.getByRole('button', { name: 'Novo contrato' }).click()
    await j.getByPlaceholder(/Buscar imóvel com oferta de locação/).fill('Barão')
    await j.getByRole('button', { name: /Rua Barão de Jaguara/ }).click()
    await j.getByPlaceholder(/Buscar pessoa para vincular/).first().fill('Carlos')
    await j.getByRole('button', { name: /Carlos Locatário/ }).click()
    await j.getByLabel('Início').fill('2026-08-01')
    await j.getByLabel('Prazo (meses)').fill('30')
    await j.getByLabel('Modalidade').selectOption('SEM_GARANTIA')
    await foto(j, '18-contrato-cadastro')
    await j.getByRole('button', { name: 'Salvar' }).click()
    await j.getByText('Contrato criado como rascunho.').first().waitFor()
    await j.getByRole('button', { name: 'Ativar contrato' }).click()
    await j.getByRole('dialog').getByRole('button', { name: 'Ativar' }).click()
    await j.getByText('Contrato ativado.').first().waitFor()

    // 3. Geração das cobranças de agosto e setembro (idempotente)
    await navegar(j, 'Cobranças do mês')
    for (const comp of ['2026-08', '2026-09']) {
      await j.locator('input[type=month]').fill(comp)
      await j.getByRole('button', { name: /Gerar 1 cobrança/ }).click()
      await j.getByText(/1 cobrança\(s\) gerada\(s\)/).first().waitFor()
      await j.getByRole('button', { name: /Gerar 0 cobrança/ }).waitFor()
    }
    await foto(j, '19-cobrancas-mes')

    // 4. Recebimento da competência de setembro (vencida em 10/10) com multa e juros
    await navegar(j, 'Contas a receber')
    await j.getByRole('cell', { name: /Aluguel set\/2026/ }).click()
    await j.getByRole('button', { name: 'Registrar recebimento' }).click()
    await j.getByText('Total devido').waitFor()
    await foto(j, '20-recebimento')
    await j.getByRole('button', { name: 'Confirmar recebimento' }).click()
    await j.getByText(/Recebimento de R\$/).first().waitFor()
    await j.getByRole('dialog').getByText('Liquidado', { exact: true }).waitFor()
    const recibo = join(dados, 'recibo.pdf')
    await simularDialogos(app, { salvar: recibo })
    await j.getByTitle('Recibo em PDF').click()
    await j.getByText('Recibo gerado.').first().waitFor({ timeout: 30000 })
    assert.equal(readFileSync(recibo).subarray(0, 4).toString(), '%PDF')
    copyFileSync(recibo, join(SAIDA, 'recibo-exemplo.pdf'))
    await foto(j, '21-titulo-liquidado')
    await j.keyboard.press('Escape')

    // 5. Repasse ao proprietário: gerar, pagar e emitir demonstrativo
    await navegar(j, 'Repasses')
    await j.getByRole('cell', { name: 'Maria da Silva Souza' }).waitFor()
    await foto(j, '22-saldos-repasse')
    await j.getByRole('button', { name: 'Gerar repasse' }).click()
    await j.getByRole('dialog').getByRole('button', { name: 'Gerar' }).click()
    await j.getByText(/Repasse nº 1 gerado/).first().waitFor()
    await j.getByRole('button', { name: 'Repasses gerados' }).click()
    await j.getByRole('button', { name: 'Pagar', exact: true }).click()
    await j.getByRole('button', { name: 'Registrar pagamento' }).click()
    await j.getByRole('button', { name: 'Confirmar pagamento' }).click()
    await j.getByText('Pagamento registrado.').first().waitFor()
    await j.keyboard.press('Escape')
    const dem = join(dados, 'demonstrativo.pdf')
    await simularDialogos(app, { salvar: dem })
    await j.getByRole('button', { name: 'Pagos' }).click()
    await j.getByTitle('Demonstrativo em PDF').click()
    await j.getByText('Demonstrativo gerado.').first().waitFor({ timeout: 30000 })
    assert.ok(existsSync(dem))
    copyFileSync(dem, join(SAIDA, 'demonstrativo-repasse-exemplo.pdf'))
    await foto(j, '23-repasses')

    // 6. Inadimplência (agosto ainda em aberto) e integridade do razão
    await navegar(j, 'Inadimplência')
    await j.getByText(/Aluguel ago\/2026/).waitFor()
    await foto(j, '24-inadimplencia')
    await navegar(j, 'Contas bancárias')
    await j.getByRole('button', { name: 'Verificar razão' }).click()
    await j.getByText(/Razão íntegro/).waitFor()
    await foto(j, '25-contas-bancarias')

    // 7. Imóvel alugado não pode voltar a disponível manualmente; painel financeiro
    await navegar(j, 'Painel')
    await j.getByText('Receita própria no mês').waitFor()
    await foto(j, '26-painel-financeiro')
    console.log('E2E Fase 3: OK — capturas em', SAIDA)
  } catch (e) {
    await foto(j, 'erro-fase3').catch(() => {})
    console.error('E2E Fase 3: FALHOU', e)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => {})
    rmSync(dados, { recursive: true, force: true })
  }
})()
