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

