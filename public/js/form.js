// Gera campos de formulário a partir de definições e valida no navegador.
import { h, campo, entrada, selecao, decimal, mascaraCpfCnpj, marcarErro } from './util.js';
import { validarCPF, validarCpfCnpj, validarEmail, formatarCpfCnpj, UFS } from '/lib/validacao.js';

// def: { nome, rotulo, tipo, obrig, classe, dica, opcoes, max, attrs }
function controle(def, valor) {
  const a = { maxlength: def.max, ...def.attrs };
  switch (def.tipo) {
    case 'email': return entrada(def.nome, valor, { type: 'email', ...a });
    case 'cpf': return mascaraCpfCnpj(entrada(def.nome, formatarCpfCnpj(valor), { maxlength: 14, ...def.attrs }), { soCpf: true });
    case 'doc': return mascaraCpfCnpj(entrada(def.nome, formatarCpfCnpj(valor), { maxlength: 18, ...def.attrs }));
    case 'telefone': return entrada(def.nome, valor, { type: 'tel', inputmode: 'tel', maxlength: 30, ...def.attrs });
    case 'cep': return entrada(def.nome, String(valor || '').replace(/^(\d{5})(\d{3})$/, '$1-$2'), { inputmode: 'numeric', maxlength: 9, ...def.attrs });
    case 'uf': return selecao(def.nome, [['', '–'], ...UFS], valor, def.attrs);
    case 'moeda': return entrada(def.nome, valor == null || valor === '' ? '' : decimal(valor), { inputmode: 'decimal', placeholder: '0,00', ...def.attrs });
    case 'percentual': return entrada(def.nome, valor == null || valor === '' ? '' : String(valor).replace('.', ','), { inputmode: 'decimal', placeholder: '0,00', ...def.attrs });
    case 'numero': return entrada(def.nome, valor, { inputmode: 'numeric', ...a });
    case 'data': return entrada(def.nome, valor, { type: 'date', ...def.attrs });
    case 'select': return selecao(def.nome, def.opcoes, valor, def.attrs);
    case 'textarea': return h('textarea', { name: def.nome, maxlength: def.max, rows: 3, ...def.attrs }, valor ?? '');
    case 'check': return h('input', { type: 'checkbox', name: def.nome, checked: valor === undefined ? def.padrao !== false : Boolean(valor), ...def.attrs });
    default: return entrada(def.nome, valor, a);
  }
}

export function montarCampos(defs, registro = {}) {
  return defs.map((def) => {
    if (def.secao) return h('h3', { class: 'largo' }, def.secao);
    const bruto = registro[def.nome];
    const valor = bruto == null || bruto === '' ? (def.padrao ?? '') : bruto;
    const c = controle(def, def.tipo === 'check' ? registro[def.nome] : valor);
    if (def.tipo === 'check') {
      return h('label', { class: ['check', def.classe] }, c, h('span', def.rotulo));
    }
    return campo(def.rotulo, c, { obrigatorio: def.obrig, dica: def.dica, classe: def.classe });
  });
}

// Retorna true se não houver erros; marca os campos com problema.
export function validarCampos(form, defs) {
  let ok = true;
  const d = (n) => form.elements[n]?.value?.trim() ?? '';
  for (const def of defs) {
    if (!def.nome || def.tipo === 'check') continue;
    const v = d(def.nome);
    let msg = '';
    if (def.obrig && !v) msg = 'Campo obrigatório.';
    else if (v && def.tipo === 'email' && !validarEmail(v)) msg = 'E-mail inválido.';
    else if (v && def.tipo === 'cpf' && !validarCPF(v)) msg = 'CPF inválido.';
    else if (v && def.tipo === 'doc' && !validarCpfCnpj(v)) msg = 'CPF/CNPJ inválido.';
    else if (v && def.tipo === 'cep' && v.replace(/\D/g, '').length !== 8) msg = 'CEP deve ter 8 números.';
    else if (v && def.validar) msg = def.validar(v) || '';
    if (msg) { marcarErro(form, def.nome, msg); ok = false; }
  }
  if (!ok) form.querySelector('[aria-invalid="true"]')?.focus();
  return ok;
}
