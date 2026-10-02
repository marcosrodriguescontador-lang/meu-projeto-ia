import pytest

from auditor import tributos as T
from auditor.modelos import Atividade


def test_aliquota_efetiva_anexo_i_segunda_faixa():
    # RBT12 de 300 mil no Anexo I: (300.000 x 7,3% - 5.940) / 300.000 = 5,32%
    assert T.aliquota_efetiva_simples("I", 300_000) == pytest.approx(0.0532)


def test_primeira_faixa_usa_aliquota_nominal():
    assert T.aliquota_efetiva_simples("III", 100_000) == pytest.approx(0.06)


def test_fator_r_define_anexo():
    assert T.anexo_efetivo("V", 0.28) == "III"
    assert T.anexo_efetivo("V", 0.2799) == "V"
    assert T.anexo_efetivo("III", 0.10) == "V"
    assert T.anexo_efetivo("IV", 0.10) == "IV"  # Fator R não se aplica ao Anexo IV


def test_calcular_simples_com_fator_r():
    r = T.calcular_simples("V", 50_000, 600_000, folha12=200_000)
    assert r.anexo_aplicado == "III"
    assert r.fator_r == pytest.approx(1 / 3)
    assert r.valor_das == pytest.approx(50_000 * (600_000 * 0.135 - 17_640) / 600_000)


def test_presumido_servicos_trimestre_com_adicional():
    r = T.calcular_presumido_trimestre(900_000, Atividade.SERVICOS, ano=2025)
    base = 900_000 * 0.32
    assert r.irpj == pytest.approx(base * 0.15 + (base - 60_000) * 0.10)
    assert r.csll == pytest.approx(base * 0.09)
    assert r.pis == pytest.approx(900_000 * 0.0065)
    assert r.cofins == pytest.approx(900_000 * 0.03)


def test_presumido_acrescimo_lc_224_acima_de_5_milhoes():
    sem = T.calcular_presumido_trimestre(1_000_000, Atividade.COMERCIO, receita_acumulada_ano_antes=4_500_000, ano=2025)
    com = T.calcular_presumido_trimestre(1_000_000, Atividade.COMERCIO, receita_acumulada_ano_antes=4_500_000, ano=2026)
    base_esperada = 500_000 * 0.08 + 500_000 * 0.08 * 1.10
    assert com.irpj == pytest.approx(base_esperada * 0.15 + (base_esperada - 60_000) * 0.10)
    assert com.irpj > sem.irpj


def test_real_anual_adicional_sobre_240_mil():
    r = T.calcular_real_anual(1_000_000, 300_000)
    assert r.irpj == pytest.approx(300_000 * 0.15 + 60_000 * 0.10)
    assert r.csll == pytest.approx(27_000)
