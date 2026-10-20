import { api } from './api.js';
import { estado } from './estado.js';
import { h, aviso, processando, lerFormulario, limparErros, mensagem } from './util.js';
import { montarCampos, validarCampos } from './form.js';
import { validarCNPJ } from '/lib/validacao.js';

const REGIMES = ['', 'Simples Nacional', 'Simples Nacional – excesso de sublimite', 'Lucro Presumido', 'Lucro Real'];

const CAMPOS = [
  { secao: 'Dados da empresa (emitente)' },
  { nome: 'razao_social', rotulo: 'Razão social', max: 150, classe: 'duplo', obrig: true },
  { nome: 'nome_fantasia', rotulo: 'Nome fantasia', max: 100, padrao: 'AGRO S' },
  { nome: 'cnpj', rotulo: 'CNPJ', tipo: 'doc', obrig: true, validar: (v) => (!validarCNPJ(v) ? 'CNPJ inválido.' : '') },
  { nome: 'ie', rotulo: 'Inscrição estadual', max: 20, obrig: true },
  { nome: 'regime_tributario', rotulo: 'Regime tributário', tipo: 'select', opcoes: REGIMES },
  { nome: 'logradouro', rotulo: 'Endereço', max: 150, classe: 'duplo' },
  { nome: 'numero', rotulo: 'Número', max: 20 },
  { nome: 'complemento', rotulo: 'Complemento', max: 80 },
  { nome: 'bairro', rotulo: 'Bairro', max: 80 },
  { nome: 'municipio', rotulo: 'Município', max: 80, padrao: 'Paraguaçu Paulista' },
  { nome: 'uf', rotulo: 'UF', tipo: 'uf', padrao: 'SP' },
  { nome: 'cep', rotulo: 'CEP', tipo: 'cep' },
  { nome: 'telefone', rotulo: 'Telefone', tipo: 'telefone' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 254 },
  { secao: 'Cobrança e contratos (padrões)' },
  { nome: 'banco_padrao', rotulo: 'Banco padrão', tipo: 'select', opcoes: ['Bradesco', 'Banco do Brasil'] },
  { nome: 'praca_pagamento', rotulo: 'Praça de pagamento', max: 120, padrao: 'Paraguaçu Paulista/SP' },
  { nome: 'foro', rotulo: 'Foro padrão (comarca)', max: 120, padrao: 'Comarca de Paraguaçu Paulista/SP' },
  { nome: 'multa_padrao', rotulo: 'Multa por atraso (%)', tipo: 'percentual', padrao: '2' },
  { nome: 'juros_padrao', rotulo: 'Juros por atraso (% ao mês)', tipo: 'percentual', padrao: '1' },
  { secao: 'Segurança' },
  { nome: 'exigir_troca_senha', rotulo: 'Exigir que o usuário troque a senha inicial (CPF) no primeiro acesso (recomendado)', tipo: 'check', classe: 'largo' },
];

// Reduz a imagem no navegador para no máximo 400 px de largura (PNG).
function reduzirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) return reject(new Error('Escolha uma imagem PNG, JPG ou WEBP.'));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 400 / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * escala);
      c.height = Math.round(img.naturalHeight * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}

export async function render(main) {
  const cfg = await api.get('/api/empresa');
  let novaLogo;
  const previa = h('img', { src: cfg.logo, alt: 'Logo atual', class: 'previa-logo' });
  const arquivo = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Escolher logo' });
  arquivo.addEventListener('change', async () => {
    try {
      novaLogo = await reduzirImagem(arquivo.files[0]);
      previa.src = novaLogo;
    } catch (e) { aviso(e.message, 'erro'); }
  });
  const btnRemover = h('button', { type: 'button', class: 'btn perigo pequeno', onClick: () => { novaLogo = null; previa.src = '/img/logo.png'; } }, 'Voltar à logo padrão');

  const area = h('div');
  const botao = h('button', { type: 'submit', class: 'btn primario' }, 'Salvar configurações');
  const form = h('form', { novalidate: true, class: 'painel' },
    area,
    h('div', { class: 'grade' }, montarCampos(CAMPOS, cfg)),
    h('h3', 'Logo'),
    h('div', { class: 'botoes' }, previa, h('label', { class: 'campo' }, h('span', 'Trocar logo (será reduzida para até 400 px)'), arquivo), btnRemover),
    h('div', { class: 'botoes fim' }, botao));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    area.replaceChildren();
    if (!validarCampos(form, CAMPOS)) { area.append(mensagem('erro', 'Corrija os campos destacados.')); return; }
    const dados = lerFormulario(form);
    if (novaLogo !== undefined) dados.logo = novaLogo;
    try {
      const r = await processando(botao, () => api.put('/api/config', dados));
      estado.empresa.logo = `${r.logo}?v=${Date.now()}`;
      document.querySelectorAll('.topo .logo').forEach((i) => { i.src = estado.empresa.logo; });
      aviso('Configurações salvas.');
    } catch { /* aviso já exibido */ }
  });
  main.append(h('div', { class: 'cabecalho-pagina' }, h('h1', 'Configurações da empresa')), form);
}
