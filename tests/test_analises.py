from auditor.analises import auditar
from auditor.consolidacao import consolidar, transferencias_entre_contas
from auditor.modelos import (
    Atividade, Documento, Empresa, Lancamento, Regime, Severidade, TipoDocumento, tabela_mensal_vazia,
)
from datetime import date


def _empresa(regime=Regime.SIMPLES, anexo="I", atividade=Atividade.COMERCIO):
    return Empresa("Teste", "12.345.678/0001-90", regime, atividade, anexo, ano_referencia=2026)


def _tabela(fat=100_000.0, **extras):
    t = tabela_mensal_vazia(2026)
    t["faturamento"] = fat
    for col, v in extras.items():
        t.loc[t.index.str.startswith("2026"), col] = v
    return t


def _titulos(res):
    return [a.titulo for a in res.achados]


def test_omissao_de_receita_por_creditos_bancarios():
    res = auditar(_empresa(), _tabela(creditos_bancarios=150_000))
    achado = next(a for a in res.achados if a.titulo == "Entradas bancárias maiores que o faturamento")
    assert achado.severidade == Severidade.ALTA
    assert achado.valor_envolvido == 12 * 50_000


def test_creditos_nao_operacionais_sao_descontados():
    res = auditar(_empresa(), _tabela(creditos_bancarios=150_000, creditos_nao_operacionais=50_000))
    assert "Entradas bancárias maiores que o faturamento" not in _titulos(res)


def test_proximo_do_limite_do_simples():
    res = auditar(_empresa(), _tabela(fat=350_000))  # projeção 4,2 mi
    assert "Faturamento próximo do limite do Simples Nacional" in _titulos(res)
    assert "Sublimite estadual/municipal ultrapassado" in _titulos(res)


def test_excesso_acima_de_20_porcento():
    res = auditar(_empresa(), _tabela(fat=500_000))
    assert "Receita acima do limite do Simples Nacional em mais de 20%" in _titulos(res)


def test_fator_r_abaixo_de_28_no_anexo_iii():
    t = _tabela(fat=100_000)
    t["folha_salarios"] = 10_000
    t["pro_labore"] = 5_000
    res = auditar(_empresa(anexo="III", atividade=Atividade.SERVICOS), t)
    assert "Fator R abaixo de 28%: tributação deveria ser pelo Anexo V" in _titulos(res)
    assert res.simples_mensal["Anexo aplicado"].iloc[-1] == "V"


def test_anexo_iv_sem_cpp():
    t = _tabela(fat=100_000)
    t["folha_salarios"] = 40_000
    t["encargos_folha"] = 3_200  # só FGTS
    res = auditar(_empresa(anexo="IV", atividade=Atividade.SERVICOS), t)
    assert "Anexo IV: encargos de INSS patronal abaixo do esperado" in _titulos(res)


def test_das_pago_a_menor():
    res = auditar(_empresa(), _tabela(imposto_declarado=1_000))
    assert any(t.startswith("DAS menor que o recalculado") for t in _titulos(res))


def test_caixa_negativo_e_balanco_desequilibrado():
    res = auditar(_empresa(), _tabela(), {"caixa": -10.0, "total_ativo": 100.0, "total_passivo": 90.0})
    assert "Saldo credor de caixa (caixa negativo)" in _titulos(res)
    assert "Balanço não fecha (ativo diferente de passivo + PL)" in _titulos(res)


def test_presumido_gera_comparativo():
    res = auditar(_empresa(regime=Regime.PRESUMIDO, atividade=Atividade.SERVICOS), _tabela())
    assert res.comparativo_regimes is not None and len(res.comparativo_regimes) == 3


def test_transferencia_entre_contas():
    a = Documento("a.ofx", TipoDocumento.EXTRATO_CC, lancamentos=[Lancamento(date(2026, 1, 5), "TED", -1000.0)])
    b = Documento("b.ofx", TipoDocumento.EXTRATO_CC, lancamentos=[Lancamento(date(2026, 1, 6), "TED RECEBIDA", 1000.0)])
    assert len(transferencias_entre_contas([a, b])) == 1
    for d in (a, b):
        d.series = {"creditos_bancarios": {"2026-01": sum(l.valor for l in d.lancamentos if l.valor > 0)}}
    res = consolidar([a, b], 2026)
    assert res.tabela.loc["2026-01", "creditos_nao_operacionais"] == 1000.0
