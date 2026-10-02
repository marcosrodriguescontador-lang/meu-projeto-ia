from datetime import date

import pytest

from auditor.leitores import (
    detectar_tipo, lancamentos_de_texto, ler_documento, parse_competencia, parse_valor,
)
from auditor.modelos import TipoDocumento


@pytest.mark.parametrize("bruto,esperado", [
    ("1.234,56", 1234.56), ("(1.234,56)", -1234.56), ("1.234,56 D", -1234.56), ("1.234,56C", 1234.56),
    ("-89,90", -89.90), ("R$ 10,00", 10.0), (1234.5, 1234.5), ("abc", None), ("", None), ("1234.56", 1234.56),
])
def test_parse_valor(bruto, esperado):
    assert parse_valor(bruto) == esperado


@pytest.mark.parametrize("bruto,esperado", [
    ("01/2025", "2025-01"), ("jan/25", "2025-01"), ("Março de 2026", "2026-03"), ("2025-11", "2025-11"),
    ("15/07/2025", "2025-07"),
])
def test_parse_competencia(bruto, esperado):
    assert parse_competencia(bruto) == esperado


def test_ofx():
    ofx = (b"<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260110<TRNAMT>1500.00<MEMO>PIX RECEBIDO</STMTTRN>"
           b"<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260111120000<TRNAMT>-200.50<MEMO>TARIFA</STMTTRN></BANKTRANLIST></OFX>")
    doc = ler_documento("extrato.ofx", ofx, ano_padrao=2026)
    assert doc.tipo == TipoDocumento.EXTRATO_CC
    assert [(l.data, l.valor) for l in doc.lancamentos] == [(date(2026, 1, 10), 1500.0), (date(2026, 1, 11), -200.5)]
    assert doc.series["creditos_bancarios"] == {"2026-01": 1500.0}
    assert doc.series["debitos_bancarios"] == {"2026-01": 200.5}


def test_extrato_csv_com_colunas_credito_debito():
    csv = "Data;Histórico;Crédito;Débito\n02/03/2026;PIX RECEBIDO;1.000,00;\n03/03/2026;BOLETO;;250,00\n".encode()
    doc = ler_documento("extrato conta corrente.csv", csv, ano_padrao=2026)
    assert doc.tipo == TipoDocumento.EXTRATO_CC
    assert sorted(l.valor for l in doc.lancamentos) == [-250.0, 1000.0]


def test_extrato_texto_pdf_com_data_curta_e_saldo():
    texto = "EXTRATO CONTA CORRENTE 01/01/2026 a 31/01/2026\n05/01 PIX RECEBIDO JOAO 1.200,00 C 5.000,00\n" \
            "06/01 PAGAMENTO BOLETO 300,00 D 4.700,00\n07/01 SALDO DO DIA 4.700,00\n"
    lancs = lancamentos_de_texto(texto, "x.pdf", 2025)
    assert [(l.data, l.valor) for l in lancs] == [(date(2026, 1, 5), 1200.0), (date(2026, 1, 6), -300.0)]


def test_faturamento_csv_por_competencia():
    csv = "Competência;Receita Bruta\n01/2026;10.000,00\n02/2026;12.500,50\nTotal;22.500,50\n".encode()
    doc = ler_documento("faturamento.csv", csv, ano_padrao=2026)
    assert doc.tipo == TipoDocumento.FATURAMENTO
    assert doc.series["faturamento"] == {"2026-01": 10000.0, "2026-02": 12500.5}


def test_detectar_tipo_folha():
    assert detectar_tipo("resumo.pdf", "RESUMO DA FOLHA DE PAGAMENTO Proventos FGTS") == TipoDocumento.FOLHA


def test_doc_antigo_gera_aviso():
    doc = ler_documento("arquivo.doc", b"xxx")
    assert any("DOCX" in a for a in doc.avisos)


PGDAS_FICTICIO = """Programa Gerador do Documento de Arrecadação
do Simples Nacional - Declaratório
Período de Apuração: 01/01/2026 a 31/01/2026
Receita Bruta do PA (RPA) - Competência 10.000,00 0,00 10.000,00
2.2) Receitas Brutas Anteriores (R$)
2.2.1) Mercado Interno
01/2025 1.000,0002/2025 2.000,0003/2025 3.000,0004/2025 4.000,00
2.2.2) Mercado Externo
01/2025 0,0002/2025 500,00 03/2025 0,00 04/2025 0,00
2.3) Folha de Salários Anteriores (R$)
Nenhuma
2.4) Fator r
2.8) Total Geral da Empresa
Total do Débito Declarado (exigível + suspenso) (R$)
IRPJ CSLL COFINS PIS/Pasep INSS/CPP ICMS IPI ISS Total
10,00 10,00 10,00 10,00 10,00 10,00 0,00 0,00 1.060,00
Total do Débito com Exigibilidade Suspensa (R$)
"""


def test_pgdas_d():
    from auditor.consolidacao import consolidar
    from auditor.modelos import Documento

    doc = Documento("PGDASD-DECLARACAO.pdf", TipoDocumento.FISCAL, texto=PGDAS_FICTICIO)
    from auditor.leitores import extrair_dados

    extrair_dados(doc, 2026)
    assert doc.series["faturamento_declarado"] == {"2026-01": 10000.0}
    assert doc.series["imposto_declarado"] == {"2026-01": 1060.0}
    assert doc.series["faturamento_declarado__anterior"]["2025-02"] == 2500.0

    tab = consolidar([doc], 2026).tabela
    assert tab.loc["2025-02", "faturamento_declarado"] == 2500.0
    assert tab.loc["2026-01", "faturamento_declarado"] == 10000.0
    # Duas declarações com os mesmos meses anteriores não podem somar em dobro
    tab2 = consolidar([doc, doc], 2026).tabela
    assert tab2.loc["2025-02", "faturamento_declarado"] == 2500.0


QUESTOR_FICTICIO = """0001 EMPRESA FICTICIA - Matriz 15/04/2026 14:55 Pág:0001
CNPJ: 00.000.000/0001-00 Período: 01/01/2025 a 31/12/2025
Totais ICMS por Natureza
- Entradas
1.102.002 Compra para comerc - a prazo 1.000,00 0,00 0,00 0,00 1.000,00
1.202.001 Devolucao de venda 50,00 0,00 0,00 0,00 50,00
1.551.002 Compra de bem para o ativo imobilizado - a prazo 300,00 0,00 0,00 0,00 300,00
*** Totais no Estado 1.350,00 0,00 0,00 0,00 1.350,00
- Saídas
5.102.001 Venda de merc adq/receb de terc - a vista 5.000,00 0,00 0,00 0,00 5.000,00
5.202 Devolução de compra para comercialização 100,00 0,00 0,00 0,00 100,00
5.551.001 Venda de bem do ativo imobilizado - a vista 70,00 0,00 0,00 0,00 70,00
"""


def test_questor_totais_icms_por_natureza():
    from auditor.leitores import extrair_dados
    from auditor.modelos import Documento

    doc = Documento("Totais ICMS por Natureza.pdf", TipoDocumento.COMPRAS, texto=QUESTOR_FICTICIO)
    extrair_dados(doc, 2025)
    totais = {t.coluna: t for t in doc.totais}
    assert totais["faturamento"].valor == 4950.0  # vendas - devoluções de venda
    assert totais["compras"].valor == 900.0  # compras - devoluções de compra
    assert (totais["faturamento"].inicio, totais["faturamento"].fim) == ("2025-01", "2025-12")
    assert totais["compras"].detalhe["entrada_imobilizado"] == 300.0
    assert totais["faturamento"].detalhe["venda_imobilizado"] == 70.0


BALANCO_FICTICIO = """BALANÇO PATRIMONIAL
ATIVO 1.000,00
CIRCULANTE 600,00
DISPONÍVEL 200,00
BENS NUMERÁRIOS 50,00
APLICAÇÕES DE LIQUIDEZ IMEDIATA 150,00
OPERACOES COM CARTAO DE CREDITO/DEBITO 300,00
ESTOQUES 100,00
NÃO CIRCULANTE 400,00
IMOBILIZADO 400,00
(-) DEP/AMORT/EXAUSTAO ACUMULADA (50,00)
PASSIVO 1.000,00
CIRCULANTE 250,00
FORNECEDORES 200,00
PATRIMÔNIO LÍQUIDO 750,00
CAPITAL SOCIAL 10,00
LUCROS E PREJUÍZOS ACUMULADOS 740,00
LUCROS E PREJUÍZOS DO EXERCÍCIO 300,00
"""

DRE_FICTICIA = """DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO
RECEITA OPERACIONAL BRUTA 5.000,00
(-) DEDUCÕES DA RECEITA BRUTA (400,00)
(-) CUSTO DAS MERCADORIAS VENDIDAS (2.000,00)
Vendas do Ativo Imobilizado 70,00
RECEITAS FINANCEIRAS 30,00
(=) RESULTADO LIQUIDO DO EXERCICIO 500,00
"""


def test_balanco_em_secoes_e_dre():
    from auditor.leitores import extrair_contas

    b = extrair_contas(BALANCO_FICTICIO)
    assert b["ativo_circulante"] == 600.0 and b["passivo_circulante"] == 250.0
    assert b["caixa"] == 50.0 and b["cartoes_receber"] == 300.0
    assert b["ativo_nao_circulante"] == 400.0 and b["patrimonio_liquido"] == 750.0
    assert b["lucro_exercicio_balanco"] == 300.0
    d = extrair_contas(DRE_FICTICIA)
    assert d["receita_bruta"] == 5000.0
    assert d["lucro_liquido"] == 500.0
    assert "imobilizado" not in d


def test_indices_e_balanco_x_dre():
    from auditor.analises import auditar
    from auditor.leitores import extrair_contas
    from auditor.modelos import Atividade, Empresa, Regime, tabela_mensal_vazia

    contas = {**extrair_contas(DRE_FICTICIA), **extrair_contas(BALANCO_FICTICIO)}
    emp = Empresa("X", "", Regime.SIMPLES, Atividade.COMERCIO, "I", ano_referencia=2025)
    r = auditar(emp, tabela_mensal_vazia(2025), contas)
    idx = dict(zip(r.indices["Índice"], r.indices["Valor"]))
    assert idx["Liquidez corrente"] == "2,40"
    assert any(a.titulo.startswith("Resultado da DRE diferente") for a in r.achados)


EXTRATO_BB = """Período do extrato 12 / 2025
26/11/2025 0000 00000000 Saldo Anterior 0,00 C
01/12/2025 8763 14849911 Depósito bloquead.1d útil 1.195.500.952 3.000,00 * 0,00 C
02/12/2025 0000 00000351 BB Rende Fácil 9.903 3.000,00 D
Rende Facil
02/12/2025 0000 10846631 Dep cheque caixa agencia 1.195.500.952 3.000,00 C 0,00 C
30/12/2025 0000 14397821 Pix - Recebido 300.959.018.997.962 10.000,00 C
30/12 09:59 12345678000100 EMPRESA TESTE
31/12/2025 0000 00000999 S A L D O 0,00 C
"""

EXTRATO_SANTANDER = """Períodos:01/05/2025 a 31/05/2025
02/05/2025 SALDO ANTERIOR 0,00
02/05/2025 TARIFA PIX RECEBIDO QR CHECKOUT 000000 -1,97
02/05/2025 PAGAMENTO CARTAO DE DEBITO GETNET-ELO DEBITO 469247 86,68
02/05/2025 PIX ENVIADO EMPRESA TESTE LTDA 052032 -1.000,00
02/05/2025 APLICACAO CONTAMAX 000000 -1.767,05 0,00
07/05/2025 RESGATE CONTAMAX AUTOMATICO 000000 14.995,66 0,00
"""


def test_extrato_banco_do_brasil():
    lancs = lancamentos_de_texto(EXTRATO_BB, "bb.pdf", 2025)
    assert [l.valor for l in lancs] == [-3000.0, 3000.0, 10000.0]  # bloqueado e saldos ignorados
    assert "12345678000100" in lancs[-1].descricao  # complemento da linha de baixo


def test_extrato_santander_sinal_negativo():
    lancs = lancamentos_de_texto(EXTRATO_SANTANDER, "santander.pdf", 2025)
    assert [l.valor for l in lancs] == [-1.97, 86.68, -1000.0, -1767.05, 14995.66]


def test_classificacao_nao_operacional_e_retiradas():
    from auditor.consolidacao import consolidar
    from auditor.leitores import extrair_dados
    from auditor.modelos import Documento

    docs = []
    for nome, texto in (("bb.pdf", EXTRATO_BB), ("santander.pdf", EXTRATO_SANTANDER)):
        d = Documento(nome, TipoDocumento.EXTRATO_CC, texto=texto)
        extrair_dados(d, 2025)
        docs.append(d)
    c = consolidar(docs, 2025, "12.345.678/0001-00", "EMPRESA TESTE LTDA")
    nao_op = sorted(l.valor for l in c.nao_operacionais)
    assert nao_op == [10000.0, 14995.66]  # Pix da própria empresa e resgate de aplicação
    assert c.tabela.loc["2025-05", "retiradas_titular"] == 1000.0
