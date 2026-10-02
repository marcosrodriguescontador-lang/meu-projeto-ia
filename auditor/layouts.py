"""Leitores específicos para layouts conhecidos (documentos oficiais e bancos).

Cada função recebe o texto extraído do documento e devolve séries mensais
{coluna: {"AAAA-MM": valor}} ou None quando o documento não é daquele layout.
"""

from __future__ import annotations

import re
from collections import defaultdict

from .leitores import normalizar, parse_valor

VALOR = r"\d{1,3}(?:\.\d{3})*,\d{2}"
RE_MES_VALOR = re.compile(rf"(\d{{2}})/(\d{{4}})\s*({VALOR})")

# Séries vindas de "valores anteriores" de uma declaração: só preenchem um mês se nenhum
# documento trouxe o valor daquele mês diretamente (ver consolidacao.consolidar).
SUFIXO_ANTERIOR = "__anterior"


def _secao(texto: str, inicio: str, fim: str) -> str:
    i = texto.find(inicio)
    if i < 0:
        return ""
    j = texto.find(fim, i + len(inicio))
    return texto[i + len(inicio): j if j >= 0 else len(texto)]


def _ultimo_valor(linha: str) -> float | None:
    valores = re.findall(VALOR, linha)
    return parse_valor(valores[-1]) if valores else None


def pgdas_d(texto: str) -> dict[str, dict[str, float]] | None:
    """Declaração do PGDAS-D (Simples Nacional), layout da Receita Federal."""
    n = normalizar(texto)
    if "documento de arrecadacao" not in n or "simples nacional" not in n:
        return None
    m = re.search(r"Per[ií]odo de Apura[cç][aã]o:\s*\d{2}/(\d{2})/(\d{4})", texto)
    if not m:
        return None
    pa = f"{m.group(2)}-{m.group(1)}"
    series: dict[str, dict[str, float]] = defaultdict(dict)

    # Receita do próprio PA: última coluna (Total = mercado interno + externo).
    for linha in texto.splitlines():
        if "Receita Bruta do PA" in linha:
            v = _ultimo_valor(linha)
            if v is not None:
                series["faturamento_declarado"][pa] = v
            break

    # Débito total declarado: primeira linha de valores após o título do total geral.
    bloco = _secao(texto, "Total Geral da Empresa", "Exigibilidade Suspensa") or texto
    for linha in bloco.splitlines():
        if re.search(VALOR, linha) and "IRPJ" not in linha:
            v = _ultimo_valor(linha)
            if v is not None:
                series["imposto_declarado"][pa] = v
            break

    # Receitas dos 12 meses anteriores (mercado interno + externo) e folha anterior.
    anteriores: dict[str, float] = defaultdict(float)
    for trecho in (_secao(texto, "2.2.1)", "2.2.2)"), _secao(texto, "2.2.2)", "2.3)")):
        for mes, ano, valor in RE_MES_VALOR.findall(trecho):
            anteriores[f"{ano}-{mes}"] += parse_valor(valor) or 0.0
    if anteriores:
        series["faturamento_declarado" + SUFIXO_ANTERIOR] = dict(anteriores)

    folha = {f"{a}-{mes}": parse_valor(v) or 0.0 for mes, a, v in RE_MES_VALOR.findall(_secao(texto, "2.3)", "2.4)"))}
    if folha:
        series["folha_salarios" + SUFIXO_ANTERIOR] = folha  # folha + encargos declarados p/ Fator R
    return dict(series)



# ---------------------------------------------------------------------------
# Questor - "Totais ICMS por Natureza" (entradas e saídas por CFOP)
# ---------------------------------------------------------------------------

# Finais de CFOP (3 últimos dígitos) que representam venda/receita bruta.
CFOP_VENDA = {
    "101", "102", "103", "104", "105", "106", "109", "110", "111", "112", "113", "114", "115", "116",
    "117", "118", "119", "120", "122", "123", "124", "125", "401", "402", "403", "405", "933",
}
CFOP_DEVOLUCAO_VENDA = {"201", "202", "203", "204", "410", "411"}  # em CFOP de entrada (1/2/3)
CFOP_COMPRA = {"101", "102", "111", "113", "116", "117", "118", "120", "121", "122", "401", "403"}
CFOP_DEVOLUCAO_COMPRA = {"201", "202", "410", "411"}  # em CFOP de saída (5/6/7)
CFOP_IMOBILIZADO = {"406", "551", "552", "553", "554", "555"}
CFOP_USO_CONSUMO = {"407", "556", "557"}
CFOP_BONIFICACAO = {"910"}

RE_LINHA_CFOP = re.compile(rf"^\s*([1-7])\.(\d{{3}})(?:\.\d{{3}})?\s+(.*?)\s+({VALOR})")


def questor_icms_natureza(texto: str, nome: str = ""):
    """Relatório 'Totais ICMS por Natureza' do Questor. Retorna lista de TotalPeriodo ou None."""
    from .modelos import TotalPeriodo

    if "totais icms por natureza" not in normalizar(texto):
        return None
    m = re.search(r"Per[ií]odo:\s*\d{2}/(\d{2})/(\d{4})\s*a\s*\d{2}/(\d{2})/(\d{4})", texto)
    if not m:
        return None
    inicio, fim = f"{m.group(2)}-{m.group(1)}", f"{m.group(4)}-{m.group(3)}"

    soma: dict[str, float] = defaultdict(float)
    for linha in texto.splitlines():
        lm = RE_LINHA_CFOP.match(linha)
        if not lm:
            continue
        grupo, final, valor = lm.group(1), lm.group(2), parse_valor(lm.group(4)) or 0.0
        entrada = grupo in "123"
        if entrada:
            if final in CFOP_COMPRA:
                soma["compras"] += valor
            elif final in CFOP_DEVOLUCAO_VENDA:
                soma["devolucoes_venda"] += valor
            elif final in CFOP_IMOBILIZADO:
                soma["entrada_imobilizado"] += valor
            elif final in CFOP_USO_CONSUMO:
                soma["uso_consumo"] += valor
            elif final in CFOP_BONIFICACAO:
                soma["bonificacoes_recebidas"] += valor
            else:
                soma["outras_entradas"] += valor
            soma["total_entradas"] += valor
        else:
            if final in CFOP_VENDA:
                soma["vendas"] += valor
            elif final in CFOP_DEVOLUCAO_COMPRA:
                soma["devolucoes_compra"] += valor
            elif final in CFOP_IMOBILIZADO:
                soma["venda_imobilizado"] += valor
            else:
                soma["outras_saidas"] += valor
            soma["total_saidas"] += valor
    if not soma:
        return None
    detalhe = {k: round(v, 2) for k, v in soma.items()}
    faturamento = soma["vendas"] - soma["devolucoes_venda"]
    compras = soma["compras"] - soma["devolucoes_compra"]
    return [
        TotalPeriodo("faturamento", inicio, fim, round(faturamento, 2), nome, detalhe),
        TotalPeriodo("compras", inicio, fim, round(compras, 2), nome, detalhe),
    ]


# ---------------------------------------------------------------------------
# Balanço patrimonial (lido por seção: ativo e passivo)
# ---------------------------------------------------------------------------

_ATIVO = [
    ("total_ativo", r"(total do )?ativo( total)?\s+[\d(]"),
    ("ativo_circulante", r"(ativo )?circulante\b"),
    ("disponivel", r"(disponivel|disponibilidades|caixa e equivalentes)"),
    ("caixa", r"(bens numerarios|caixa\b(?! e equiv))"),
    ("bancos", r"bancos"),
    ("aplicacoes", r"aplicac(oes|ao)"),
    ("clientes", r"(clientes|duplicatas a receber|contas a receber)"),
    ("cartoes_receber", r"(operacoes com cartao|cartoes? de credito|cartoes a receber)"),
    ("estoques", r"estoques?\b"),
    ("ativo_nao_circulante", r"(ativo )?nao circulante"),
    ("realizavel_longo_prazo", r"realizavel a longo prazo"),
    ("imobilizado", r"imobilizado\b(?! em andamento)"),
]
_PASSIVO = [
    ("total_passivo", r"(total do )?passivo( total)?( e patrimonio liquido)?\s+[\d(]"),
    ("passivo_circulante", r"(passivo )?circulante\b"),
    ("fornecedores", r"fornecedores"),
    ("emprestimos", r"(emprestimos e financiamentos|financiamentos|emprestimos bancarios)"),
    ("emprestimos_socios", r"(emprestimos de socios|mutuo|conta corrente de socios)"),
    ("passivo_nao_circulante", r"((passivo )?nao circulante|exigivel a longo prazo)"),
    ("patrimonio_liquido", r"patrimonio liquido"),
    ("capital_social", r"capital social"),
    ("lucros_acumulados", r"lucros? (e prejuizos )?acumulados"),
    ("lucro_exercicio_balanco", r"(lucros? e prejuizos do exercicio|lucros? do exercicio|resultado do exercicio|lucro liquido do exercicio)"),
]


def _ler_secao(linhas: list[str], padroes: list[tuple[str, str]]) -> dict[str, float]:
    contas: dict[str, float] = {}
    for linha in linhas:
        n = normalizar(linha)
        for chave, padrao in padroes:
            if chave in contas or not re.match(padrao, n):
                continue
            valores = re.findall(rf"\(?{VALOR}\)?", linha)
            if valores:
                contas[chave] = parse_valor(valores[-1]) or 0.0
            break
    return contas


def balanco_patrimonial(texto: str) -> dict[str, float] | None:
    linhas = texto.splitlines()
    n = [normalizar(l) for l in linhas]
    tem_titulo = any("balanco" in l for l in n)
    if not tem_titulo and not (any(re.match(r"ativo\b", l) for l in n) and any(re.match(r"passivo\b", l) for l in n)):
        return None
    i_ativo = next((i for i, l in enumerate(n) if re.match(r"(total do )?ativo\b", l)), None)
    i_passivo = next((i for i, l in enumerate(n) if re.match(r"(total do )?passivo\b", l)), None)
    if i_ativo is None or i_passivo is None or i_passivo <= i_ativo:
        return None
    contas = _ler_secao(linhas[i_ativo:i_passivo], _ATIVO)
    contas.update(_ler_secao(linhas[i_passivo:], _PASSIVO))
    return contas if len(contas) >= 3 else None
