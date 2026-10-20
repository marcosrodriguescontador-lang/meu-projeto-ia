// Peças comuns dos documentos impressos (pedido, ficha de NF, duplicata, contrato).
import { api } from './api.js';
import { h } from './util.js';
import { formatarCpfCnpj } from '/lib/validacao.js';

let cacheEmpresa = null;
export async function obterEmpresa(recarregar = false) {
  if (!cacheEmpresa || recarregar) cacheEmpresa = await api.get('/api/empresa');
  return cacheEmpresa;
}

export function enderecoTexto(o) {
  const cep = String(o.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  return [
    [o.logradouro, o.numero].filter(Boolean).join(', '),
    o.complemento, o.bairro,
    [o.municipio, o.uf].filter(Boolean).join('/'),
    cep && `CEP ${cep}`,
  ].filter(Boolean).join(' – ');
}

export function cabecalhoDocumento(empresa, titulo, subtitulo) {
  return h('div', { class: 'doc-cabecalho' },
    h('img', { src: empresa.logo, alt: 'Logo' }),
    h('div', { class: 'doc-empresa' },
      h('strong', empresa.razao_social || empresa.nome_fantasia || 'AGRO S'),
      h('br'), empresa.cnpj ? `CNPJ ${formatarCpfCnpj(empresa.cnpj)}` : '', empresa.ie ? ` · IE ${empresa.ie}` : '',
      h('br'), enderecoTexto(empresa),
      empresa.telefone ? [h('br'), `Tel. ${empresa.telefone}`] : null),
    h('div', { class: 'doc-titulo' }, h('h2', titulo), subtitulo ? h('div', subtitulo) : null));
}

export function info(rotulo, valor) {
  return h('div', { class: 'bloco' }, h('span', { class: 'rotulo' }, rotulo), valor || '—');
}
