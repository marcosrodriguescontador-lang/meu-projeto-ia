// Telas de acesso: primeiro acesso, login, esqueci minha senha e troca de senha.
import { api } from './api.js';
import { estado } from './estado.js';
import { h, limpar, campo, entrada, mensagem, processando, lerFormulario, marcarErro, limparErros,
  mascaraCpfCnpj, abrirJanela, aviso } from './util.js';
import { validarCPF, validarEmail } from '/lib/validacao.js';

function cartao(app, titulo, ...conteudo) {
  limpar(app, h('div', { class: 'acesso' }, h('main', { class: 'cartao', id: 'conteudo' },
    h('img', { class: 'logo', src: estado.empresa?.logo || '/img/logo.png', alt: 'AGRO S – Sustentabilidade no Agro' }),
    h('h1', titulo), ...conteudo)));
  app.querySelector('input')?.focus();
}

function formulario(campos, textoBotao, aoEnviar) {
  const area = h('div');
  const botao = h('button', { type: 'submit', class: 'btn primario bloco' }, textoBotao);
  const form = h('form', { novalidate: true }, area, ...campos, botao);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    limpar(area);
    try {
      await processando(botao, () => aoEnviar(lerFormulario(form), form, area));
    } catch (e) {
      limpar(area, mensagem('erro', e.message));
    }
  });
  return form;
}

const senhaInput = (nome, autocomplete) => entrada(nome, '', { type: 'password', autocomplete, maxlength: 128 });

export function telaPrimeiroAcesso(app, depois) {
  const cpf = mascaraCpfCnpj(entrada('cpf', '', { maxlength: 14 }), { soCpf: true });
  cartao(app, 'Primeiro acesso',
    mensagem('info', 'Nenhum usuário cadastrado. Crie o administrador do sistema. A senha inicial será o CPF (somente números).'),
    formulario([
      campo('Nome completo', entrada('nome', '', { autocomplete: 'name', maxlength: 120 }), { obrigatorio: true }),
      campo('E-mail', entrada('email', '', { type: 'email', autocomplete: 'email' }), { obrigatorio: true }),
      campo('CPF', cpf, { obrigatorio: true }),
    ], 'Criar administrador', async (d, form) => {
      let ok = true;
      if (d.nome.trim().length < 3) { marcarErro(form, 'nome', 'Informe o nome completo.'); ok = false; }
      if (!validarEmail(d.email)) { marcarErro(form, 'email', 'E-mail inválido.'); ok = false; }
      if (!validarCPF(d.cpf)) { marcarErro(form, 'cpf', 'CPF inválido. Confira os números.'); ok = false; }
      if (!ok) throw new Error('Corrija os campos destacados.');
      await api.post('/api/primeiro-acesso', d);
      aviso('Administrador criado. Entre com o e-mail e o CPF.');
      depois();
    }));
}

export function telaLogin(app, depois, emailInicial = '') {
  cartao(app, 'Controle Interno',
    formulario([
      campo('E-mail', entrada('email', emailInicial, { type: 'email', autocomplete: 'username' }), { obrigatorio: true }),
      campo('Senha', senhaInput('senha', 'current-password'), { obrigatorio: true, dica: 'No primeiro acesso, a senha é o seu CPF.' }),
    ], 'Entrar', async (d) => {
      if (!d.email || !d.senha) throw new Error('Informe o e-mail e a senha.');
      await api.post('/api/login', d);
      depois();
    }),
    h('p', { class: 'rodape' }, h('button', { type: 'button', class: 'btn link', onClick: () => telaEsqueci(app, depois) }, 'Esqueci minha senha')));
}

function telaEsqueci(app, depois) {
  cartao(app, 'Esqueci minha senha',
    h('p', 'Informe seu e-mail. Enviaremos um código de 6 dígitos, válido por 15 minutos.'),
    formulario([
      campo('E-mail', entrada('email', '', { type: 'email', autocomplete: 'email' }), { obrigatorio: true }),
    ], 'Enviar código', async (d, form) => {
      if (!validarEmail(d.email)) { marcarErro(form, 'email', 'E-mail inválido.'); throw new Error('Informe um e-mail válido.'); }
      const r = await api.post('/api/senha/esqueci', d);
      telaRedefinir(app, depois, d.email.trim(), r.mensagem);
    }),
    h('p', { class: 'rodape' }, h('button', { type: 'button', class: 'btn link', onClick: () => telaLogin(app, depois) }, 'Voltar ao login')));
}

function telaRedefinir(app, depois, email, texto) {
  const codigo = entrada('codigo', '', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '\\d{6}' });
  cartao(app, 'Redefinir senha',
    mensagem('ok', texto),
    formulario([
      campo('Código recebido', codigo, { obrigatorio: true }),
      campo('Nova senha', senhaInput('senha', 'new-password'), { obrigatorio: true, dica: 'Mínimo de 8 caracteres.' }),
      campo('Repita a nova senha', senhaInput('senha2', 'new-password'), { obrigatorio: true }),
    ], 'Salvar nova senha', async (d, form) => {
      if (!/^\d{6}$/.test(d.codigo.trim())) { marcarErro(form, 'codigo', 'O código tem 6 números.'); throw new Error('Código inválido.'); }
      if (d.senha.length < 8) { marcarErro(form, 'senha', 'Mínimo de 8 caracteres.'); throw new Error('Senha muito curta.'); }
      if (d.senha !== d.senha2) { marcarErro(form, 'senha2', 'As senhas não conferem.'); throw new Error('As senhas não conferem.'); }
      const r = await api.post('/api/senha/redefinir', { email, codigo: d.codigo.trim(), senha: d.senha });
      aviso(r.mensagem);
      telaLogin(app, depois, email);
    }),
    h('p', { class: 'rodape' },
      h('button', { type: 'button', class: 'btn link', onClick: () => telaEsqueci(app, depois) }, 'Pedir novo código'), ' · ',
      h('button', { type: 'button', class: 'btn link', onClick: () => telaLogin(app, depois) }, 'Voltar ao login')));
}

function camposTroca() {
  return [
    campo('Senha atual', senhaInput('atual', 'current-password'), { obrigatorio: true }),
    campo('Nova senha', senhaInput('nova', 'new-password'), { obrigatorio: true, dica: 'Mínimo de 8 caracteres. Não use o CPF.' }),
    campo('Repita a nova senha', senhaInput('nova2', 'new-password'), { obrigatorio: true }),
  ];
}

function validarTroca(d, form) {
  if (!d.atual) { marcarErro(form, 'atual', 'Informe a senha atual.'); throw new Error('Informe a senha atual.'); }
  if (d.nova.length < 8) { marcarErro(form, 'nova', 'Mínimo de 8 caracteres.'); throw new Error('Senha muito curta.'); }
  if (d.nova !== d.nova2) { marcarErro(form, 'nova2', 'As senhas não conferem.'); throw new Error('As senhas não conferem.'); }
}

export function telaTrocarSenhaObrigatoria(app, depois) {
  cartao(app, 'Defina sua senha',
    mensagem('alerta', 'Por segurança, troque a senha inicial (CPF) por uma senha pessoal antes de continuar.'),
    formulario(camposTroca(), 'Salvar e continuar', async (d, form) => {
      validarTroca(d, form);
      await api.post('/api/senha/alterar', { atual: d.atual, nova: d.nova });
      aviso('Senha alterada.');
      depois();
    }),
    h('p', { class: 'rodape' }, h('button', { type: 'button', class: 'btn link', onClick: async () => {
      await api.post('/api/logout').catch(() => {});
      depois();
    } }, 'Sair')));
}

export function abrirAlterarSenha() {
  abrirJanela({
    titulo: 'Alterar minha senha',
    tamanho: 'estreita',
    conteudo: h('div', { class: 'grade' }, camposTroca().map((c) => { c.classList.add('largo'); return c; })),
    botoes: [h('button', { type: 'submit', class: 'btn primario' }, 'Salvar')],
    aoEnviar: async (d, { form, fechar }) => {
      validarTroca(d, form);
      const r = await api.post('/api/senha/alterar', { atual: d.atual, nova: d.nova });
      aviso(r.mensagem);
      fechar();
    },
  });
}
