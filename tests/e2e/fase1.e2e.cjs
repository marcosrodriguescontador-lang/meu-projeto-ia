// Teste E2E da Fase 1 no aplicativo Electron real (Playwright).
// Uso: npm run build && node tests/e2e/fase1.e2e.cjs  (em Linux sem monitor: xvfb-run -a node ...)
const { _electron: electron } = require('playwright')
const { mkdtempSync, rmSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const assert = require('node:assert/strict')

const RAIZ = join(__dirname, '..', '..')
const SAIDA = process.env.E2E_CAPTURAS || join(RAIZ, 'docs', 'capturas')
mkdirSync(SAIDA, { recursive: true })

async function abrir(dados) {
  const app = await electron.launch({
    // E2E_EXECUTAVEL permite testar o aplicativo já empacotado.
    executablePath: process.env.E2E_EXECUTAVEL || require('electron'),
    args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), ...(process.env.E2E_EXECUTAVEL ? [] : [RAIZ])],
    env: { ...process.env, STATUS_ERP_DADOS: dados, ELECTRON_RENDERER_URL: '', STATUS_ERP_PROTETOR_TESTE: '1' }
  })
  const janela = await app.firstWindow()
  janela.on('pageerror', (e) => {
    console.error('Erro na interface:', e.message)
    process.exitCode = 1
  })
  await janela.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
  return { app, janela }
}

const foto = (j, nome) => j.screenshot({ path: join(SAIDA, `${nome}.png`) })

;(async () => {
  const dados = mkdtempSync(join(tmpdir(), 'status-e2e-'))
  let { app, janela: j } = await abrir(dados)
  try {
    // 1. Configuração inicial
    await j.getByText('Bem-vindo ao STATUS ERP').waitFor()
    await foto(j, '01-configuracao-inicial')
    await j.getByLabel('Razão social').fill('Status Negócios Imobiliários Ltda')
    await j.getByRole('textbox', { name: 'Nome', exact: true }).fill('Marcos Rodrigues')
    await j.getByLabel('Usuário (login)').fill('marcos')
    const senhas = j.locator('input[type=password]')
    await senhas.nth(0).fill('Administrador2026')
    await senhas.nth(1).fill('Administrador2026')
    await senhas.nth(2).fill('CofreBackup2026')
    await senhas.nth(3).fill('CofreBackup2026')
    await j.getByRole('button', { name: 'Concluir configuração' }).click()

    // 2. Login (com tentativa inválida)
    await j.getByRole('heading', { name: 'Entrar' }).waitFor()
    await j.getByLabel('Usuário').fill('marcos')
    await j.getByLabel('Senha').fill('errada')
    await j.getByRole('button', { name: 'Entrar' }).click()
    await j.getByText('Usuário ou senha inválidos').waitFor()
    await foto(j, '02-login')
    await j.getByLabel('Senha').fill('Administrador2026')
    await j.getByRole('button', { name: 'Entrar' }).click()
    await j.getByText('Olá, Marcos').waitFor()
    await foto(j, '03-painel')

    // 3. Cadastro de pessoa com validação no front
    await j.getByRole('link', { name: 'Pessoas', exact: true }).click()
    await j.getByRole('button', { name: 'Nova pessoa' }).click()
    await j.getByLabel('CPF').fill('123.456.789-00')
    await j.getByRole('button', { name: 'Salvar' }).click()
    await j.getByText('CPF inválido').waitFor()
    await j.getByText('Selecione ao menos um papel').waitFor()
    await j.getByLabel('CPF').fill('529.982.247-25')
    await j.getByLabel('Nome completo').fill('Maria da Silva Souza')
    await j.getByLabel('Proprietário').check()
    await j.getByLabel('Locatário').check()
    await j.getByRole('button', { name: /^Endereços/ }).click()
    await j.getByRole('button', { name: 'Adicionar endereço' }).click()
    await j.getByLabel('CEP').fill('01310-100')
    await j.getByLabel('Logradouro').fill('Avenida Paulista')
    await j.getByLabel('Número').fill('1000')
    await j.getByLabel('Bairro').fill('Bela Vista')
    await j.getByLabel('Cidade').fill('São Paulo')
    await j.getByRole('button', { name: /^Contatos/ }).click()
    await j.getByRole('button', { name: 'Adicionar contato' }).click()
    await j.getByPlaceholder('(00) 00000-0000').fill('(11) 98888-7777')
    await j.getByRole('button', { name: 'Salvar' }).click()
    await j.getByText('Pessoa cadastrada.').waitFor()
    await j.getByText(/Código 1 ·/).waitFor()
    await j.getByText('Pessoa cadastrada.').waitFor({ state: 'hidden', timeout: 8000 })

    // 4. Dados bancários
    await j.getByRole('button', { name: /^Dados bancários/ }).click()
    await j.getByRole('button', { name: 'Adicionar conta' }).click()
    await j.getByLabel('Código').fill('341')
    await j.getByRole('textbox', { name: 'Banco', exact: true }).fill('Itaú Unibanco')
    await j.getByLabel('Agência').fill('1234')
    await j.getByRole('textbox', { name: 'Conta', exact: true }).fill('567890')
    await j.getByLabel('Dígito').fill('1')
    await j.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
    await j.getByText('•••• / •••890-1').waitFor()
    await foto(j, '04-dados-bancarios')

    // 5. Duplicidade de CPF bloqueada (cadastro único)
    await j.getByRole('link', { name: 'Pessoas', exact: true }).first().click()
    await j.getByRole('button', { name: 'Nova pessoa' }).click()
    await j.getByLabel('CPF').fill('52998224725')
    await j.getByLabel('Nome completo').click()
    await j.getByText('Documento já cadastrado para').waitFor()
    await j.getByRole('link', { name: 'Pessoas', exact: true }).first().click()
    await j.getByText('Maria da Silva Souza').waitFor()
    await foto(j, '05-lista-pessoas')

    // 6. Tema escuro
    await j.getByTitle('Modo escuro').click()
    await foto(j, '06-lista-pessoas-escuro')
    await j.getByTitle('Modo claro').click()

    // 7. Backup manual
    await j.getByRole('link', { name: 'Backup' }).click()
    await j.getByRole('button', { name: 'Gerar backup' }).click()
    await j.getByText('Backup gerado e validado').waitFor({ timeout: 60000 })
    await foto(j, '07-backup')

    // 8. Auditoria + verificação de integridade
    await j.getByRole('link', { name: 'Auditoria' }).click()
    await j.getByRole('button', { name: 'Verificar integridade' }).click()
    await j.getByText(/Cadeia íntegra/).waitFor()
    await foto(j, '08-auditoria')

    // 9. Usuários e perfis
    await j.getByRole('link', { name: 'Usuários e perfis' }).click()
    await j.getByRole('button', { name: 'Perfis e permissões' }).click()
    await j.getByText('Protegido').waitFor()
    await foto(j, '09-perfis')

    // 10. Bloqueio de tela
    await j.getByTitle('Bloquear tela').click()
    await j.getByText('Sessão bloqueada').waitFor()
    await foto(j, '10-bloqueio')
    await j.getByPlaceholder('Senha').fill('Administrador2026')
    await j.getByRole('button', { name: 'Desbloquear' }).click()
    await j.getByRole('heading', { name: 'Usuários e perfis' }).waitFor()

    // 11. Persistência: reabre o aplicativo e confere os dados
    await app.close()
    ;({ app, janela: j } = await abrir(dados))
    await j.getByLabel('Usuário').fill('marcos')
    await j.getByLabel('Senha').fill('Administrador2026')
    await j.getByRole('button', { name: 'Entrar' }).click()
    await j.getByRole('link', { name: 'Pessoas', exact: true }).click()
    await j.getByText('Maria da Silva Souza').waitFor()
    const linhas = await j.locator('tbody tr').count()
    assert.equal(linhas, 1)
    console.log('E2E Fase 1: OK — capturas em', SAIDA)
  } catch (e) {
    await foto(j, 'erro').catch(() => {})
    console.error('E2E Fase 1: FALHOU', e)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => {})
    rmSync(dados, { recursive: true, force: true })
  }
})()
