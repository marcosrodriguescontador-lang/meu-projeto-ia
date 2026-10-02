"""Estruturas de dados usadas em toda a aplicação."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum

import pandas as pd


class Regime(str, Enum):
    SIMPLES = "Simples Nacional"
    PRESUMIDO = "Lucro Presumido"
    REAL_ANUAL = "Lucro Real Anual (estimativa mensal)"
    REAL_TRIMESTRAL = "Lucro Real Trimestral"


class Atividade(str, Enum):
    COMERCIO = "Comércio"
    INDUSTRIA = "Indústria"
    SERVICOS = "Serviços em geral"
    SERVICOS_HOSPITALARES = "Serviços hospitalares / transporte de cargas"
    TRANSPORTE_PASSAGEIROS = "Transporte de passageiros"
    REVENDA_COMBUSTIVEIS = "Revenda de combustíveis"


class TipoDocumento(str, Enum):
    EXTRATO_CC = "Extrato bancário - conta corrente"
    EXTRATO_APLICACAO = "Extrato bancário - aplicação financeira"
    RENDIMENTOS = "Informe de rendimentos de aplicação"
    FATURAMENTO = "Relatório de faturamento / vendas"
    COMPRAS = "Relatório de compras"
    FOLHA = "Folha de pagamento"
    DEMONSTRATIVO = "Demonstrativo contábil (Balanço / DRE / Balancete)"
    FISCAL = "Relatório fiscal (apuração / livros / PGDAS / SPED)"
    OUTRO = "Outro documento"


class Severidade(str, Enum):
    ALTA = "Alta"
    MEDIA = "Média"
    BAIXA = "Baixa"
    INFO = "Informativa"


ORDEM_SEVERIDADE = {Severidade.ALTA: 0, Severidade.MEDIA: 1, Severidade.BAIXA: 2, Severidade.INFO: 3}


class Area(str, Enum):
    FISCAL = "Fiscal / Tributária"
    CONTABIL = "Contábil"
    PESSOAL = "Departamento Pessoal"
    FINANCEIRO = "Financeiro"


@dataclass
class Lancamento:
    """Uma linha de extrato: valor positivo = crédito (entrada), negativo = débito (saída)."""

    data: date
    descricao: str
    valor: float
    documento: str = ""


@dataclass
class TotalPeriodo:
    """Total de um período com vários meses (ex.: livro fiscal anual), sem detalhe mensal."""

    coluna: str
    inicio: str  # "AAAA-MM"
    fim: str  # "AAAA-MM"
    valor: float
    documento: str = ""
    detalhe: dict[str, float] = field(default_factory=dict)


@dataclass
class Documento:
    nome: str
    tipo: TipoDocumento
    texto: str = ""
    tabelas: list[pd.DataFrame] = field(default_factory=list)
    lancamentos: list[Lancamento] = field(default_factory=list)
    # Séries por coluna da tabela mensal -> {competência "AAAA-MM": valor}
    series: dict[str, dict[str, float]] = field(default_factory=dict)
    # Contas/valores encontrados em demonstrativos (ex.: "caixa": 1234.5)
    contas: dict[str, float] = field(default_factory=dict)
    totais: list[TotalPeriodo] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)


@dataclass
class Empresa:
    nome: str
    cnpj: str
    regime: Regime
    atividade: Atividade
    anexo_simples: str = "I"  # I, II, III, IV, V
    uf: str = ""
    ano_referencia: int = date.today().year
    margem_lucro_estimada: float = 0.10  # usada só na simulação de Lucro Real
    inicio_atividades: date | None = None


@dataclass
class Achado:
    severidade: Severidade
    area: Area
    titulo: str
    descricao: str
    recomendacao: str
    fundamentacao: str = ""
    visivel_cliente: bool = True
    valor_envolvido: float | None = None


COLUNAS_MENSAIS = [
    "faturamento",
    "faturamento_declarado",
    "compras",
    "folha_salarios",
    "pro_labore",
    "encargos_folha",
    "creditos_bancarios",
    "debitos_bancarios",
    "creditos_nao_operacionais",
    "rendimentos_aplicacao",
    "irrf_aplicacao",
    "imposto_declarado",
    "retiradas_titular",
]

DESCRICAO_COLUNAS = {
    "faturamento": "Faturamento / receita bruta (relatórios)",
    "faturamento_declarado": "Receita declarada ao fisco (PGDAS / DCTF / SPED)",
    "compras": "Compras",
    "folha_salarios": "Salários (folha)",
    "pro_labore": "Pró-labore",
    "encargos_folha": "Encargos (INSS patronal + FGTS)",
    "creditos_bancarios": "Entradas nos bancos (total)",
    "debitos_bancarios": "Saídas dos bancos (total)",
    "creditos_nao_operacionais": "Entradas que não são venda (transferências, resgates, empréstimos)",
    "rendimentos_aplicacao": "Rendimentos de aplicação",
    "irrf_aplicacao": "IRRF sobre aplicação",
    "imposto_declarado": "Imposto declarado/pago (DAS ou DARFs)",
    "retiradas_titular": "Transferências ao titular/sócios (saídas bancárias)",
}


def meses_do_ano(ano: int) -> list[str]:
    return [f"{ano}-{m:02d}" for m in range(1, 13)]


def tabela_mensal_vazia(ano: int) -> pd.DataFrame:
    """Ano anterior + ano analisado: o ano anterior serve para calcular a RBT12 do Simples."""
    meses = meses_do_ano(ano - 1) + meses_do_ano(ano)
    return pd.DataFrame(0.0, index=pd.Index(meses, name="competencia"), columns=COLUNAS_MENSAIS)
