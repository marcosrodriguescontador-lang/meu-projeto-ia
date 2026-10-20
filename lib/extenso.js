// Valor monetário por extenso em português (módulo ES puro, também usado no navegador).

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
// [singular, plural] de cada classe, a partir dos milhares.
const CLASSES = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões'], ['trilhão', 'trilhões']];

// 0 a 999 por extenso.
function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

// Número inteiro por extenso (até trilhões).
export function inteiroPorExtenso(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Número inválido.');
  if (n === 0) return 'zero';
  const grupos = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  if (grupos.length > CLASSES.length) throw new Error('Número grande demais.');
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let t;
    if (i === 1) t = g === 1 ? 'mil' : `${ate999(g)} mil`;
    else if (i > 1) t = `${ate999(g)} ${CLASSES[i][g === 1 ? 0 : 1]}`;
    else t = ate999(g);
    partes.push({ t, g });
  }
  // Une as classes: "e" antes da última se ela for menor que 100 ou centena exata; senão, vírgula.
  return partes.reduce((txt, p, idx) => {
    if (idx === 0) return p.t;
    const ultima = idx === partes.length - 1;
    const usaE = ultima && (p.g < 100 || p.g % 100 === 0);
    return `${txt}${usaE ? ' e ' : ', '}${p.t}`;
  }, '');
}

// Centavos (inteiro) por extenso em reais. Ex.: 110050 -> "mil e cem reais e cinquenta centavos".
export function valorPorExtenso(centavos) {
  const total = Math.round(Number(centavos));
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Valor inválido.');
  const reais = Math.floor(total / 100);
  const cent = total % 100;
  const partes = [];
  if (reais) {
    const txt = inteiroPorExtenso(reais);
    // "um milhão de reais", "dois bilhões de reais" (classe de milhão ou maior sem nada abaixo de mil)
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : '';
    partes.push(`${txt}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (cent) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
  if (!partes.length) return 'zero real';
  return partes.join(' e ');
}
