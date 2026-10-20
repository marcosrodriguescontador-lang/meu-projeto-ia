import { api } from './api.js';
import { h, etiqueta, aviso, confirmar, icone } from './util.js';
import { paginaCadastro } from './cadastro.js';
import { formatarCPF } from '/lib/validacao.js';

const PERFIS = [['vendedor', 'Vendedor'], ['financeiro', 'Financeiro'], ['admin', 'Administrador']];
const nomePerfil = (p) => PERFIS.find(([v]) => v === p)?.[1] || p;

export function render(main) {
  paginaCadastro(main, {
    titulo: 'Colaboradores',
    nomeItem: 'colaborador',
    novoTexto: 'Novo colaborador',
    endpoint: '/api/colaboradores',
    buscaDica: 'Nome, e-mail ou CPF',
    podeEditar: true,
    ajuda: h('div', { class: 'msg info' }, 'Ao criar um colaborador, a senha inicial é o CPF (somente números). ',
      'Colaboradores não são excluídos: desative-os para bloquear o acesso.'),
    colunas: [
      { titulo: 'Nome', valor: (l) => l.nome, principal: true },
      { titulo: 'E-mail', valor: (l) => l.email },
      { titulo: 'CPF', valor: (l) => formatarCPF(l.cpf), classe: 'nowrap' },
      { titulo: 'Perfil', valor: (l) => etiqueta(nomePerfil(l.perfil), l.perfil === 'admin' ? 'azul' : 'verde') },
      { titulo: 'Situação', valor: (l) => (l.ativo ? etiqueta('Ativo', 'verde') : etiqueta('Inativo', 'vermelha')) },
    ],
    campos: () => [
      { nome: 'nome', rotulo: 'Nome completo', obrig: true, max: 120, classe: 'duplo' },
      { nome: 'email', rotulo: 'E-mail (usado no login)', tipo: 'email', obrig: true, max: 254 },
      { nome: 'cpf', rotulo: 'CPF', tipo: 'cpf', obrig: true },
      { nome: 'telefone', rotulo: 'Telefone', tipo: 'telefone' },
      { nome: 'perfil', rotulo: 'Perfil', tipo: 'select', opcoes: PERFIS, obrig: true, padrao: 'vendedor' },
      { nome: 'ativo', rotulo: 'Ativo (pode acessar o sistema)', tipo: 'check', classe: 'largo' },
    ],
    acoesExtras: (reg) => [h('button', { type: 'button', class: 'btn', onClick: async () => {
      const ok = await confirmar(`Redefinir a senha de ${reg.nome} para o CPF? A pessoa deverá criar uma nova senha no próximo acesso.`,
        { titulo: 'Redefinir senha', sim: 'Redefinir senha' });
      if (!ok) return;
      try {
        const r = await api.post(`/api/colaboradores/${reg.id}/redefinir-senha`);
        aviso(r.mensagem);
      } catch (e) { aviso(e.message, 'erro'); }
    } }, icone('chave'), 'Redefinir senha para o CPF')],
  });
}
