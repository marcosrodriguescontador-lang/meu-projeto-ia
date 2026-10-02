"""Gera arquivos de exemplo (dados fictícios) para testar a aplicação.

Uso: python exemplos/gerar_exemplos.py
Cenário: prestadora de serviços no Simples (Anexo V) com Fator R abaixo de 28%,
entradas bancárias maiores que o faturamento e transferência entre contas próprias.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

PASTA = Path(__file__).parent
ANO = 2026
FATURAMENTO = [180_000, 175_000, 190_000, 200_000, 210_000, 205_000, 220_000, 215_000, 230_000, 240_000, 235_000, 250_000]


def faturamento_xlsx() -> None:
    linhas = []
    for mes, total in enumerate(FATURAMENTO, start=1):
        for nf in range(4):
            linhas.append({"Data Emissão": f"{5 + nf * 6:02d}/{mes:02d}/{ANO}", "Número NF": f"{mes}{nf:03d}",
                           "Cliente": f"Cliente {nf + 1}", "Valor Total": round(total / 4, 2)})
    df = pd.DataFrame(linhas)
    with pd.ExcelWriter(PASTA / "faturamento_2026.xlsx") as w:
        pd.DataFrame([["Relatório de Notas Fiscais Emitidas"], [f"Período: 01/01/{ANO} a 31/12/{ANO}"]]).to_excel(
            w, index=False, header=False)
        df.to_excel(w, index=False, startrow=3)


def extrato_ofx() -> None:
    trans = []
    for mes, total in enumerate(FATURAMENTO, start=1):
        recebido = total * (1.25 if mes in (3, 9) else 1.0)  # meses com entradas acima do faturamento
        trans.append((f"{ANO}{mes:02d}10", recebido, "PIX RECEBIDO CLIENTES"))
        trans.append((f"{ANO}{mes:02d}15", -total * 0.55, "PAGAMENTO FORNECEDORES"))
        trans.append((f"{ANO}{mes:02d}20", -30_000.00, "TRANSF ENVIADA BANCO B"))
    corpo = "".join(
        f"<STMTTRN><TRNTYPE>{'CREDIT' if v > 0 else 'DEBIT'}<DTPOSTED>{d}<TRNAMT>{v:.2f}<FITID>{i}<MEMO>{m}</STMTTRN>\n"
        for i, (d, v, m) in enumerate(trans)
    )
    (PASTA / "extrato_banco_A.ofx").write_text(
        "OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n"
        + corpo + "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n", encoding="latin-1")


def extrato_csv() -> None:
    linhas = ["Data;Histórico;Valor"]
    for mes in range(1, 13):
        linhas.append(f"20/{mes:02d}/{ANO};TRANSFERENCIA RECEBIDA BANCO A;30.000,00")
        linhas.append(f"25/{mes:02d}/{ANO};TARIFA BANCARIA;-89,90")
        linhas.append(f"28/{mes:02d}/{ANO};RENDIMENTO APLICACAO AUTOMATICA;350,00")
    (PASTA / "extrato_banco_B.csv").write_text("\n".join(linhas), encoding="utf-8")


def folha_pdf() -> None:
    c = canvas.Canvas(str(PASTA / "folha_2025_2026.pdf"), pagesize=A4)
    for ano in (ANO - 1, ANO):
        for mes in range(1, 13):
            y = 800
            for texto in ["RESUMO DA FOLHA DE PAGAMENTO", "Empresa: Exemplo Serviços Ltda",
                          f"Competência: {mes:02d}/{ano}", "", "Total de Proventos 38.000,00",
                          "Pró-labore 8.000,00", "INSS Empresa 0,00", "FGTS 2.400,00"]:
                c.drawString(60, y, texto)
                y -= 18
            c.showPage()
    c.save()


def faturamento_2025_csv() -> None:
    linhas = ["Competência;Receita Bruta"] + [f"{m:02d}/{ANO - 1};{150_000 + m * 2_000:.2f}".replace(".", ",") for m in range(1, 13)]
    (PASTA / "faturamento_2025.csv").write_text("\n".join(linhas), encoding="utf-8")


def balanco_pdf() -> None:
    c = canvas.Canvas(str(PASTA / "balanco_2026.pdf"), pagesize=A4)
    y = 800
    for texto in ["BALANÇO PATRIMONIAL EM 31/12/2026", "ATIVO", "Caixa Geral 185.000,00", "Bancos Conta Movimento 42.000,00",
                  "Total do Ativo 640.000,00", "PASSIVO", "Total do Passivo 640.000,00", "",
                  "DEMONSTRAÇÃO DO RESULTADO", "Receita Bruta 2.550.000,00", "Receitas Financeiras 0,00",
                  "Lucro Líquido do Exercício 310.000,00", "Lucros Distribuídos 420.000,00"]:
        c.drawString(60, y, texto)
        y -= 18
    c.save()


if __name__ == "__main__":
    faturamento_xlsx()
    faturamento_2025_csv()
    extrato_ofx()
    extrato_csv()
    folha_pdf()
    balanco_pdf()
    print("Arquivos de exemplo gerados em", PASTA)
