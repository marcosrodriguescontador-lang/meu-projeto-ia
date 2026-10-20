// Chamadas à API do servidor. Lança Error com a mensagem em português.

async function chamar(metodo, url, dados) {
  const opcoes = { method: metodo, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (metodo !== 'GET') opcoes.headers['X-AgroS'] = '1';
  if (dados !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(dados);
  }
  let resp;
  try {
    resp = await fetch(url, opcoes);
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a rede e tente novamente.');
  }
  const corpo = resp.headers.get('content-type')?.includes('json') ? await resp.json() : null;
  if (!resp.ok) {
    const e = new Error(corpo?.erro || `Erro ${resp.status}`);
    e.status = resp.status;
    if (resp.status === 401 && !url.endsWith('/login')) window.dispatchEvent(new CustomEvent('sessao-expirada'));
    throw e;
  }
  return corpo;
}

export const api = {
  get: (url, params) => {
    if (params) {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
      if ([...q].length) url += (url.includes('?') ? '&' : '?') + q;
    }
    return chamar('GET', url);
  },
  post: (url, dados = {}) => chamar('POST', url, dados),
  put: (url, dados = {}) => chamar('PUT', url, dados),
  del: (url) => chamar('DELETE', url),
};
