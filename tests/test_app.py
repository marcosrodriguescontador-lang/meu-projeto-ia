from pathlib import Path

from streamlit.testing.v1 import AppTest

APP = str(Path(__file__).resolve().parent.parent / "app.py")


def test_app_abre_sem_erros():
    at = AppTest.from_file(APP, default_timeout=60).run()
    assert not at.exception
    assert at.title[0].value == "Auditor Contábil, Fiscal e Tributário"


def test_app_executa_auditoria_com_tabela_vazia():
    at = AppTest.from_file(APP, default_timeout=60).run()
    at.button(key=None)  # garante que a API de botões está disponível
    botao = next(b for b in at.button if b.label == "Executar auditoria")
    botao.click().run()
    assert not at.exception
