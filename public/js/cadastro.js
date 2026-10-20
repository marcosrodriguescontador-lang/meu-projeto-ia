// Página genérica de cadastro: lista com busca e paginação + formulário em janela.
import { api } from './api.js';
import { h, anexar, limpar, icone, tabela, paginacao, abrirJanela, aviso, debounce, selecao, entrada } from './util.js';
import { montarCampos, validarCampos } from './form.js';

export function paginaCadastro(main, cfg) {
  const st = { pagina: 1, busca: '', ativo: '1' };
  const lista = h('div');
  const busca = entrada('busca', '', { type: 'search', placeholder: cfg.buscaDica || 'Buscar…', 'aria-label': 'Buscar' });
  const filtroAtivo = selecao('ativo', [['1', 'Somente ativos'], ['0', 'Somente inativos'], ['', 'Todos']], '1', { 'aria-label': 'Situação' });
  busca.addEventListener('input', debounce(() => { st.busca = busca.value; st.pagina = 1; carregar(); }));
  filtroAtivo.addEventListener('change', () => { st.ativo = filtroAtivo.value; st.pagina = 1; carregar(); });

  const btnNovo = cfg.podeEditar
    ? h('button', { class: 'btn primario', onClick: () => abrirForm(null) }, icone('mais'), cfg.novoTexto)
    : null;

  anexar(main, [
    h('div', { class: 'cabecalho-pagina' }, h('h1', cfg.titulo), btnNovo),
    cfg.ajuda,
    h('div', { class: 'painel' },
      h('div', { class: 'filtros' }, h('label', { class: 'campo busca' }, h('span', 'Buscar'), busca),
        h('label', { class: 'campo' }, h('span', 'Situação'), filtroAtivo)),
      lista)]);

  async function carregar() {
    try {
      const r = await api.get(cfg.endpoint, { busca: st.busca, ativo: st.ativo, pagina: st.pagina });
      limpar(lista,
        tabela(cfg.colunas, r.linhas, { aoClicar: (l) => abrirForm(l) }),
        paginacao({ ...r, aoMudar: (p) => { st.pagina = p; carregar(); } }));
    } catch (e) {
      limpar(lista, h('div', { class: 'msg erro' }, e.message));
    }
  }

  function abrirForm(reg) {
    const editar = cfg.podeEditar;
    const defs = cfg.campos(reg);
    const campos = montarCampos(defs, reg || {});
    if (!editar) campos.forEach((c) => c.querySelectorAll('input, select, textarea').forEach((i) => { i.disabled = true; }));
    const botoes = [];
    const extras = reg && cfg.acoesExtras ? cfg.acoesExtras(reg, () => janela) : [];
    botoes.push(...extras);
    if (editar) botoes.push(h('button', { type: 'submit', class: 'btn primario' }, 'Salvar'));
    const janela = abrirJanela({
      titulo: reg ? (editar ? `Editar ${cfg.nomeItem}` : cfg.nomeItem[0].toUpperCase() + cfg.nomeItem.slice(1)) : cfg.novoTexto,
      conteudo: h('div', { class: 'grade' }, campos),
      botoes,
      aoEnviar: editar ? async (dados, { form, fechar }) => {
        if (!validarCampos(form, defs)) throw new Error('Corrija os campos destacados.');
        const corpo = cfg.preparar ? cfg.preparar(dados, reg) : dados;
        if (reg) await api.put(`${cfg.endpoint}/${reg.id}`, corpo);
        else await api.post(cfg.endpoint, corpo);
        aviso(reg ? 'Alterações salvas.' : 'Cadastro criado.');
        fechar();
        carregar();
      } : null,
    });
    janela.form?.querySelector('input:not([type=checkbox]), select')?.focus();
  }

  carregar();
  return { recarregar: carregar };
}
