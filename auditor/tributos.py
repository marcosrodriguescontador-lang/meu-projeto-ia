"""Tabelas e cálculos tributários: Simples Nacional, Lucro Presumido e Lucro Real.

As tabelas do Simples Nacional seguem a LC 123/2006 com a redação da LC 155/2016
(vigentes desde 01/2018). Revise este arquivo sempre que a legislação mudar.
"""

from __future__ import annotations

from dataclasses import dataclass

from .modelos import Atividade

# ---------------------------------------------------------------------------
# Simples Nacional
# ---------------------------------------------------------------------------

LIMITE_SIMPLES = 4_800_000.00
SUBLIMITE_ICMS_ISS = 3_600_000.00
TOLERANCIA_EXCESSO = 0.20  # excesso de até 20% -> exclusão só no ano seguinte
LIMITE_LUCRO_PRESUMIDO = 78_000_000.00
FATOR_R_MINIMO = 0.28

# Faixas: (limite superior da RBT12, alíquota nominal, parcela a deduzir)
TABELAS_SIMPLES: dict[str, list[tuple[float, float, float]]] = {
    "I": [  # Comércio
        (180_000.00, 0.040, 0.00),
        (360_000.00, 0.073, 5_940.00),
        (720_000.00, 0.095, 13_860.00),
        (1_800_000.00, 0.107, 22_500.00),
        (3_600_000.00, 0.143, 87_300.00),
        (4_800_000.00, 0.190, 378_000.00),
    ],
    "II": [  # Indústria
        (180_000.00, 0.045, 0.00),
        (360_000.00, 0.078, 5_940.00),
        (720_000.00, 0.100, 13_860.00),
        (1_800_000.00, 0.112, 22_500.00),
        (3_600_000.00, 0.147, 85_500.00),
        (4_800_000.00, 0.300, 720_000.00),
    ],
    "III": [  # Serviços (inclui atividades do Anexo V com Fator R >= 28%)
        (180_000.00, 0.060, 0.00),
        (360_000.00, 0.112, 9_360.00),
        (720_000.00, 0.135, 17_640.00),
        (1_800_000.00, 0.160, 35_640.00),
        (3_600_000.00, 0.210, 125_640.00),
        (4_800_000.00, 0.330, 648_000.00),
    ],
    "IV": [  # Serviços com CPP recolhida fora do DAS (construção, vigilância, limpeza, advocacia...)
        (180_000.00, 0.045, 0.00),
        (360_000.00, 0.090, 8_100.00),
        (720_000.00, 0.102, 12_420.00),
        (1_800_000.00, 0.140, 39_780.00),
        (3_600_000.00, 0.220, 183_780.00),
        (4_800_000.00, 0.330, 828_000.00),
    ],
    "V": [  # Serviços intelectuais/técnicos sujeitos ao Fator R
        (180_000.00, 0.155, 0.00),
        (360_000.00, 0.180, 4_500.00),
        (720_000.00, 0.195, 9_900.00),
        (1_800_000.00, 0.205, 17_100.00),
        (3_600_000.00, 0.230, 62_100.00),
        (4_800_000.00, 0.305, 540_000.00),
    ],
}

DESCRICAO_ANEXOS = {
    "I": "Anexo I - Comércio",
    "II": "Anexo II - Indústria",
    "III": "Anexo III - Serviços",
    "IV": "Anexo IV - Serviços (CPP fora do DAS)",
    "V": "Anexo V - Serviços sujeitos ao Fator R",
}

# INSS patronal estimado para o Anexo IV (20% CPP + ~2% RAT); terceiros não incidem.
ALIQUOTA_CPP_ANEXO_IV = 0.22


@dataclass
class ResultadoSimples:
    anexo_aplicado: str
    faixa: int
    rbt12: float
    aliquota_nominal: float
    parcela_deduzir: float
    aliquota_efetiva: float
    valor_das: float
    fator_r: float | None = None


def faixa_simples(anexo: str, rbt12: float) -> tuple[int, float, float]:
    """Retorna (número da faixa 1-6, alíquota nominal, parcela a deduzir)."""
    tabela = TABELAS_SIMPLES[anexo]
    for i, (limite, aliquota, deduzir) in enumerate(tabela, start=1):
        if rbt12 <= limite:
            return i, aliquota, deduzir
    # Acima de 4,8 mi a empresa está fora do Simples; usa-se a última faixa como referência.
    limite, aliquota, deduzir = tabela[-1]
    return len(tabela), aliquota, deduzir


def aliquota_efetiva_simples(anexo: str, rbt12: float) -> float:
    if rbt12 <= 0:
        return TABELAS_SIMPLES[anexo][0][1]
    _, aliquota, deduzir = faixa_simples(anexo, rbt12)
    return max((rbt12 * aliquota - deduzir) / rbt12, 0.0)


def anexo_efetivo(anexo_cadastrado: str, fator_r: float | None) -> str:
    """Atividades do Anexo V migram para o III quando o Fator R é >= 28% (e vice-versa)."""
    if fator_r is None:
        return anexo_cadastrado
    if anexo_cadastrado in ("III", "V"):
        return "III" if fator_r >= FATOR_R_MINIMO else "V"
    return anexo_cadastrado


def calcular_simples(
    anexo_cadastrado: str,
    receita_mes: float,
    rbt12: float,
    folha12: float | None = None,
) -> ResultadoSimples:
    fator_r = (folha12 / rbt12) if (folha12 is not None and rbt12 > 0) else None
    anexo = anexo_efetivo(anexo_cadastrado, fator_r)
    faixa, aliquota, deduzir = faixa_simples(anexo, rbt12)
    efetiva = aliquota_efetiva_simples(anexo, rbt12)
    return ResultadoSimples(
        anexo_aplicado=anexo,
        faixa=faixa,
        rbt12=rbt12,
        aliquota_nominal=aliquota,
        parcela_deduzir=deduzir,
        aliquota_efetiva=efetiva,
        valor_das=receita_mes * efetiva,
        fator_r=fator_r,
    )


# ---------------------------------------------------------------------------
# Lucro Presumido
# ---------------------------------------------------------------------------

# Percentuais de presunção (IRPJ, CSLL) - Lei 9.249/95 arts. 15 e 20
PRESUNCAO: dict[Atividade, tuple[float, float]] = {
    Atividade.COMERCIO: (0.08, 0.12),
    Atividade.INDUSTRIA: (0.08, 0.12),
    Atividade.SERVICOS: (0.32, 0.32),
    Atividade.SERVICOS_HOSPITALARES: (0.08, 0.12),
    Atividade.TRANSPORTE_PASSAGEIROS: (0.16, 0.12),
    Atividade.REVENDA_COMBUSTIVEIS: (0.016, 0.12),
}

# LC 224/2025: acréscimo de 10% nos percentuais de presunção sobre a parcela da
# receita bruta anual que exceder R$ 5 milhões (a partir de 2026).
LIMITE_ACRESCIMO_PRESUNCAO = 5_000_000.00
ACRESCIMO_PRESUNCAO = 0.10
ANO_INICIO_ACRESCIMO = 2026

ALIQ_IRPJ = 0.15
ALIQ_ADICIONAL_IRPJ = 0.10
ADICIONAL_LIMITE_MES = 20_000.00
ALIQ_CSLL = 0.09
PIS_CUMULATIVO = 0.0065
COFINS_CUMULATIVO = 0.03
PIS_NAO_CUMULATIVO = 0.0165
COFINS_NAO_CUMULATIVO = 0.076
PIS_RECEITA_FINANCEIRA = 0.0065
COFINS_RECEITA_FINANCEIRA = 0.04


@dataclass
class ResultadoTributos:
    regime: str
    irpj: float
    csll: float
    pis: float
    cofins: float
    cpp: float = 0.0  # INSS patronal fora do DAS
    das: float = 0.0
    observacoes: str = ""

    @property
    def total(self) -> float:
        return self.irpj + self.csll + self.pis + self.cofins + self.cpp + self.das


def _base_presumida(receita: float, percentual: float, acumulado_antes: float, ano: int) -> float:
    """Base presumida considerando o acréscimo da LC 224/2025 sobre o excedente de R$ 5 mi."""
    if ano < ANO_INICIO_ACRESCIMO:
        return receita * percentual
    livre = max(0.0, LIMITE_ACRESCIMO_PRESUNCAO - acumulado_antes)
    normal = min(receita, livre)
    excedente = receita - normal
    return normal * percentual + excedente * percentual * (1 + ACRESCIMO_PRESUNCAO)


def calcular_presumido_trimestre(
    receita_trimestre: float,
    atividade: Atividade,
    receitas_financeiras: float = 0.0,
    receita_acumulada_ano_antes: float = 0.0,
    ano: int = 2026,
) -> ResultadoTributos:
    p_irpj, p_csll = PRESUNCAO[atividade]
    base_irpj = _base_presumida(receita_trimestre, p_irpj, receita_acumulada_ano_antes, ano)
    base_csll = _base_presumida(receita_trimestre, p_csll, receita_acumulada_ano_antes, ano)
    base_irpj += receitas_financeiras
    base_csll += receitas_financeiras
    irpj = base_irpj * ALIQ_IRPJ + max(0.0, base_irpj - 3 * ADICIONAL_LIMITE_MES) * ALIQ_ADICIONAL_IRPJ
    csll = base_csll * ALIQ_CSLL
    return ResultadoTributos(
        regime="Lucro Presumido",
        irpj=irpj,
        csll=csll,
        pis=receita_trimestre * PIS_CUMULATIVO,
        cofins=receita_trimestre * COFINS_CUMULATIVO,
    )


def calcular_presumido_anual(
    receitas_mensais: list[float],
    atividade: Atividade,
    receitas_financeiras_mensais: list[float] | None = None,
    ano: int = 2026,
) -> ResultadoTributos:
    fin = receitas_financeiras_mensais or [0.0] * len(receitas_mensais)
    total = ResultadoTributos("Lucro Presumido", 0, 0, 0, 0)
    acumulado = 0.0
    for t in range(0, len(receitas_mensais), 3):
        rec = sum(receitas_mensais[t : t + 3])
        r = calcular_presumido_trimestre(rec, atividade, sum(fin[t : t + 3]), acumulado, ano)
        acumulado += rec
        total.irpj += r.irpj
        total.csll += r.csll
        total.pis += r.pis
        total.cofins += r.cofins
    return total


# ---------------------------------------------------------------------------
# Lucro Real (simulação)
# ---------------------------------------------------------------------------


def calcular_real_anual(
    receita_anual: float,
    lucro_antes_irpj: float,
    compras_com_credito: float = 0.0,
    receitas_financeiras: float = 0.0,
    meses: int = 12,
) -> ResultadoTributos:
    """Simulação simplificada do Lucro Real anual.

    O lucro real depende do LALUR (adições/exclusões); aqui usamos o lucro contábil
    informado/estimado como aproximação. Créditos de PIS/COFINS estimados sobre compras.
    """
    lucro = max(0.0, lucro_antes_irpj)
    irpj = lucro * ALIQ_IRPJ + max(0.0, lucro - ADICIONAL_LIMITE_MES * meses) * ALIQ_ADICIONAL_IRPJ
    csll = lucro * ALIQ_CSLL
    pis = max(0.0, (receita_anual - compras_com_credito) * PIS_NAO_CUMULATIVO)
    cofins = max(0.0, (receita_anual - compras_com_credito) * COFINS_NAO_CUMULATIVO)
    pis += receitas_financeiras * PIS_RECEITA_FINANCEIRA
    cofins += receitas_financeiras * COFINS_RECEITA_FINANCEIRA
    return ResultadoTributos(
        regime="Lucro Real",
        irpj=irpj,
        csll=csll,
        pis=pis,
        cofins=cofins,
        observacoes="Simulação: lucro contábil como aproximação do lucro real; créditos de PIS/COFINS estimados sobre compras.",
    )


def calcular_estimativa_mensal(receita_mes: float, atividade: Atividade) -> tuple[float, float]:
    """IRPJ e CSLL por estimativa mensal (Lucro Real anual), sem balancete de suspensão."""
    p_irpj, p_csll = PRESUNCAO[atividade]
    base_irpj = receita_mes * p_irpj
    irpj = base_irpj * ALIQ_IRPJ + max(0.0, base_irpj - ADICIONAL_LIMITE_MES) * ALIQ_ADICIONAL_IRPJ
    csll = receita_mes * p_csll * ALIQ_CSLL
    return irpj, csll
