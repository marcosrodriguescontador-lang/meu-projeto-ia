"""Junta os valores de todos os documentos em uma tabela mensal única."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

import pandas as pd

from .leitores import competencia, normalizar
from .layouts import SUFIXO_ANTERIOR
from .modelos import Documento, Lancamento, TipoDocumento, TotalPeriodo, tabela_mensal_vazia

COLUNAS_DECLARADAS = {"faturamento_declarado", "imposto_declarado"}

# Entradas bancárias que normalmente NÃO são receita de vendas/serviços.
PALAVRAS_NAO_OPERACIONAIS = [
    "mesma titularidade", "entre contas", "transf propria", "transferencia propria", "transf. propria",
    "resgate", "resg ", "rendimento", "rend pago", "juros s/ aplic", "emprestimo", "financiamento",
    "capital de giro", "credito pessoal", "cdc ", "estorno", "devolucao", "devol ", "aporte",
    "integralizacao", "mutuo", "antecipacao", "desconto de duplicata", "desconto de recebiveis",
    "cheque devolvido", "credito em conta corrente garantida", "cheque especial", "limite",
    "rende facil", "contamax", "brasilcap", "capitaliz", "aplicacao automatica", "resg aplic", "bb rf",
    "transferencia programada",
]


@dataclass
class ResultadoConsolidacao:
    tabela: pd.DataFrame
    nao_operacionais: list[Lancamento] = field(default_factory=list)
    transferencias_internas: list[tuple[Lancamento, Lancamento]] = field(default_factory=list)
    contas_demonstrativos: dict[str, float] = field(default_factory=dict)
    totais_periodo: list[TotalPeriodo] = field(default_factory=list)
    retiradas_titular: list[Lancamento] = field(default_factory=list)


def e_nao_operacional(lanc: Lancamento, cnpj_empresa: str = "", nome_empresa: str = "") -> bool:
    desc = normalizar(lanc.descricao)
    if any(p in desc for p in PALAVRAS_NAO_OPERACIONAIS):
        return True
    if _cnpj_no_historico(lanc, cnpj_empresa):
        return True  # crédito vindo do próprio CNPJ (outra conta da empresa)
    if _nome_no_historico(lanc, nome_empresa):
        return True  # transferência da própria empresa ou do titular (nome no histórico)
    return False


def _cnpj_no_historico(lanc: Lancamento, cnpj_empresa: str) -> bool:
    raiz = "".join(c for c in cnpj_empresa if c.isdigit())[:8]
    return bool(raiz) and raiz in "".join(c for c in lanc.descricao if c.isdigit())


def _nome_no_historico(lanc: Lancamento, nome_empresa: str) -> bool:
    palavras = [p for p in normalizar(nome_empresa).split() if len(p) > 2][:2]
    return len(palavras) == 2 and " ".join(palavras) in normalizar(lanc.descricao)


def transferencias_entre_contas(extratos: list[Documento], tolerancia_dias: int = 2) -> list[tuple[Lancamento, Lancamento]]:
    """Pares (saída em um banco, entrada no outro) de mesmo valor em datas próximas."""
    if len(extratos) < 2:
        return []
    saidas = [(l, d.nome) for d in extratos for l in d.lancamentos if l.valor < 0]
    entradas = [(l, d.nome) for d in extratos for l in d.lancamentos if l.valor > 0]
    usados: set[int] = set()
    pares = []
    for s, origem in saidas:
        for i, (e, destino) in enumerate(entradas):
            if i in usados or destino == origem:
                continue
            if abs(abs(s.valor) - e.valor) < 0.005 and abs((e.data - s.data).days) <= tolerancia_dias:
                usados.add(i)
                pares.append((s, e))
                break
    return pares


def consolidar(documentos: list[Documento], ano: int, cnpj_empresa: str = "", nome_empresa: str = "") -> ResultadoConsolidacao:
    tabela = tabela_mensal_vazia(ano)
    anteriores: dict[str, dict[str, float]] = defaultdict(dict)
    for doc in documentos:
        for coluna, serie in doc.series.items():
            if coluna.endswith(SUFIXO_ANTERIOR):
                # Valores "anteriores" de declarações (ex.: PGDAS-D) se repetem em várias
                # declarações: guarda o último informado e só usa se o mês ficar vazio.
                anteriores[coluna[: -len(SUFIXO_ANTERIOR)]].update(serie)
                continue
            for comp, valor in serie.items():
                if comp in tabela.index and coluna in tabela.columns:
                    if coluna in COLUNAS_DECLARADAS:
                        tabela.loc[comp, coluna] = valor  # declaração retificadora substitui a anterior
                    else:
                        tabela.loc[comp, coluna] += valor
    totais: list[TotalPeriodo] = []
    for doc in documentos:
        for t in doc.totais:
            if t.inicio == t.fim and t.inicio in tabela.index and t.coluna in tabela.columns:
                tabela.loc[t.inicio, t.coluna] += t.valor  # relatório de um único mês
            else:
                totais.append(t)
    for coluna, serie in anteriores.items():
        for comp, valor in serie.items():
            if comp in tabela.index and coluna in tabela.columns and tabela.loc[comp, coluna] == 0:
                tabela.loc[comp, coluna] = valor

    extratos = [d for d in documentos if d.tipo == TipoDocumento.EXTRATO_CC]
    pares = transferencias_entre_contas(extratos)
    ids_transferencia = {id(e) for _, e in pares}

    # Saídas para o titular/sócios (nome da empresa no histórico), exceto transferências entre contas próprias.
    ids_saida_interna = {id(s) for s, _ in pares}
    retiradas: list[Lancamento] = []
    for doc in extratos:
        for l in doc.lancamentos:
            if l.valor < 0 and id(l) not in ids_saida_interna and _nome_no_historico(l, nome_empresa) \
                    and not _cnpj_no_historico(l, cnpj_empresa):
                retiradas.append(l)
                comp = competencia(l.data)
                if comp in tabela.index:
                    tabela.loc[comp, "retiradas_titular"] += abs(l.valor)

    nao_op: list[Lancamento] = []
    for doc in extratos:
        for l in doc.lancamentos:
            if l.valor > 0 and (id(l) in ids_transferencia or e_nao_operacional(l, cnpj_empresa, nome_empresa)):
                nao_op.append(l)
    soma: dict[str, float] = defaultdict(float)
    for l in nao_op:
        soma[competencia(l.data)] += l.valor
    for comp, v in soma.items():
        if comp in tabela.index:
            tabela.loc[comp, "creditos_nao_operacionais"] += v

    contas: dict[str, float] = {}
    for doc in documentos:
        if doc.tipo == TipoDocumento.DEMONSTRATIVO:
            for k, v in doc.contas.items():
                contas.setdefault(k, v)

    return ResultadoConsolidacao(tabela.round(2), nao_op, pares, contas, totais, retiradas)
