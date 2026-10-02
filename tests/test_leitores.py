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
