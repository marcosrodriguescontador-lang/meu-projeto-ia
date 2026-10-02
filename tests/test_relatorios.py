import io

from pypdf import PdfReader

from auditor.analises import auditar
from auditor.modelos import Atividade, Empresa, Regime, tabela_mensal_vazia
from auditor.relatorios import DadosRelatorio, relatorio_cliente_pdf, relatorio_docx, relatorio_interno_pdf


def _dados():
    emp = Empresa("Empresa Ação Ltda", "12.345.678/0001-90", Regime.SIMPLES, Atividade.SERVICOS, "V", ano_referencia=2026)
    t = tabela_mensal_vazia(2026)
    t["faturamento"] = 100_000
    t["folha_salarios"] = 15_000
    t.loc[t.index.str.startswith("2026"), "creditos_bancarios"] = 130_000
    return DadosRelatorio(emp, auditar(emp, t, {"caixa": -1.0}), parecer_interno="Fiscal\nTexto.")


def test_pdfs_tem_timbre_e_conteudo():
    for gerar in (relatorio_interno_pdf, relatorio_cliente_pdf):
        leitor = PdfReader(io.BytesIO(gerar(_dados())))
        assert len(leitor.pages) >= 2
        texto = "".join(p.extract_text() for p in leitor.pages)
        assert "Empresa Ação Ltda" in texto


def test_relatorio_cliente_omite_achados_internos():
    d = _dados()
    internos = [a.titulo for a in d.resultado.achados if not a.visivel_cliente]
    texto = "".join(p.extract_text() for p in PdfReader(io.BytesIO(relatorio_cliente_pdf(d))).pages)
    for titulo in internos:
        assert titulo not in texto


def test_docx():
    import docx

    for interno in (True, False):
        doc = docx.Document(io.BytesIO(relatorio_docx(_dados(), interno)))
        assert any("Empresa Ação Ltda" in p.text for p in doc.paragraphs)
