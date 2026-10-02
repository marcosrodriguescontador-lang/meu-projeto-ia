"""Auditor Contábil, Fiscal e Tributário - interface (Streamlit).

Para abrir: dê dois cliques em "iniciar.bat" (Windows) ou rode `streamlit run app.py`.
"""

from __future__ import annotations

import base64
import re
from datetime import date
from pathlib import Path

import pandas as pd
import streamlit as st

from auditor import ia
from auditor.analises import auditar
from auditor.consolidacao import consolidar
from auditor.formatacao import brl
from auditor.leitores import EXTENSOES, extrair_dados, ler_documento
from auditor.modelos import (
    DESCRICAO_COLUNAS, Atividade, Empresa, Regime, Severidade, TipoDocumento, tabela_mensal_vazia,
)
from auditor.relatorios import DadosRelatorio, relatorio_cliente_pdf, relatorio_docx, relatorio_interno_pdf
from auditor.tributos import DESCRICAO_ANEXOS

ASSETS = Path(__file__).parent / "assets"
VERMELHO = "#91181B"
def md(texto: str) -> str:
    """Escapa o cifrão: o Streamlit trataria "R$ ... R$" como fórmula matemática."""
    return str(texto).replace("$", "\\$")


ICONE_SEVERIDADE = {Severidade.ALTA: "🔴", Severidade.MEDIA: "🟠", Severidade.BAIXA: "🔵", Severidade.INFO: "⚪"}

st.set_page_config(page_title="Auditor Systema", page_icon="📊", layout="wide")
st.markdown(
    f"""<style>
    h1, h2, h3 {{ color: {VERMELHO}; }}
    div[data-testid="stMetricValue"] {{ font-size: 1.3rem; }}
    </style>""",
    unsafe_allow_html=True,
)

ss = st.session_state
ss.setdefault("docs", {})          # nome -> Documento
ss.setdefault("brutos", {})        # nome -> bytes
ss.setdefault("tabela_base", None)  # dados vindos dos documentos (entrada do editor)
ss.setdefault("tabela", None)       # dados após as correções do usuário
ss.setdefault("contas_base", {})
ss.setdefault("contas", {})
ss.setdefault("consolidacao", None)
ss.setdefault("resultado", None)
ss.setdefault("parecer", {})

# ---------------------------------------------------------------------------
# Barra lateral: dados da empresa
# ---------------------------------------------------------------------------

with st.sidebar:
    if (ASSETS / "logo.png").exists():
        st.image(str(ASSETS / "logo.png"), use_container_width=True)
    st.header("Empresa")
    nome = st.text_input("Razão social")
    cnpj = st.text_input("CNPJ")
    uf = st.text_input("UF", max_chars=2)
    ano = st.number_input("Ano analisado", min_value=2018, max_value=2100, value=date.today().year, step=1)
    regime = st.selectbox("Regime tributário", list(Regime), format_func=lambda r: r.value)
    atividade = st.selectbox("Atividade principal", list(Atividade), format_func=lambda a: a.value)
    anexo = "I"
    if regime == Regime.SIMPLES:
        anexo = st.selectbox("Anexo do Simples", list(DESCRICAO_ANEXOS), format_func=lambda a: DESCRICAO_ANEXOS[a])
        if anexo == "IV":
            st.caption("No Anexo IV o Fator R não se aplica: a CPP (20% + RAT sobre folha) é paga fora do DAS. "
                       "O Fator R de 28% vale para atividades dos Anexos III/V.")
        elif anexo in ("III", "V"):
            st.caption("O Fator R (folha ÷ receita, 12 meses) define se a atividade é tributada no Anexo III (≥ 28%) ou V.")
    margem = st.slider("Margem de lucro estimada (simulação Lucro Real)", 0, 50, 10, format="%d%%") / 100
    analista = st.text_input("Analista responsável")

    st.divider()
    st.subheader("IA (opcional)")
    api_key = st.text_input("Chave da API Anthropic", type="password",
                            help="Usada para ler documentos difíceis e redigir o parecer. Os dados enviados vão para a API da Anthropic.")
    ia_ok = ia.disponivel(api_key)
    st.caption("✅ IA disponível" if ia_ok else "IA desligada: a auditoria por regras funciona normalmente.")

empresa = Empresa(nome=nome, cnpj=cnpj, regime=regime, atividade=atividade, anexo_simples=anexo, uf=uf.upper(),
                  ano_referencia=int(ano), margem_lucro_estimada=margem)
chave = api_key or None

if (ASSETS / "logo_branco.png").exists():
    logo_b64 = base64.b64encode((ASSETS / "logo_branco.png").read_bytes()).decode()
    st.markdown(
        f"""<div style="background:#1E1E1E;border-bottom:4px solid {VERMELHO};border-radius:10px;
        padding:18px 26px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <img src="data:image/png;base64,{logo_b64}" style="height:46px">
        <span style="color:#FFFFFF;font-size:0.95rem;letter-spacing:.04em">Auditoria Contábil · Fiscal · Tributária</span>
        </div>""",
        unsafe_allow_html=True,
    )
st.title("Auditor Contábil, Fiscal e Tributário")
st.caption("Confronta faturamento, bancos, aplicações, compras, folha e demonstrativos e gera relatórios interno e para o cliente.")

aba_docs, aba_dados, aba_audit, aba_rel = st.tabs(
    ["1. Documentos", "2. Dados mensais", "3. Auditoria", "4. Relatórios"]
)

# ---------------------------------------------------------------------------
# 1. Documentos
# ---------------------------------------------------------------------------

with aba_docs:
    st.subheader("Anexe os documentos da empresa")
    st.write("Formatos aceitos: PDF, OFX, DOCX, XLS/XLSX e CSV. Confira o tipo sugerido para cada arquivo.")
    arquivos = st.file_uploader("Arquivos", type=list(EXTENSOES), accept_multiple_files=True, label_visibility="collapsed")

    nomes_atuais = {a.name for a in arquivos or []}
    for nome_doc in list(ss.docs):
        if nome_doc not in nomes_atuais:
            ss.docs.pop(nome_doc)
            ss.brutos.pop(nome_doc, None)
    for arq in arquivos or []:
        if arq.name not in ss.docs:
            conteudo = arq.getvalue()
            ss.brutos[arq.name] = conteudo
            with st.spinner(f"Lendo {arq.name}..."):
                ss.docs[arq.name] = ler_documento(arq.name, conteudo, ano_padrao=int(ano))

    tipos = list(TipoDocumento)
    for nome_doc, doc in ss.docs.items():
        with st.container(border=True):
            c1, c2, c3 = st.columns([3, 3, 1.4])
            c1.markdown(f"**{nome_doc}**")
            novo = c2.selectbox("Tipo", tipos, index=tipos.index(doc.tipo), format_func=lambda t: t.value,
                                key=f"tipo_{nome_doc}", label_visibility="collapsed")
            if novo != doc.tipo:
                doc.tipo = novo
                doc.avisos = [a for a in doc.avisos if a.startswith(("O PDF", "Arquivos .DOC", "Não foi possível"))]
                extrair_dados(doc, int(ano))
                st.rerun()
            if c3.button("Ler com IA", key=f"ia_{nome_doc}", disabled=not ia_ok, use_container_width=True):
                with st.spinner("A IA está lendo o documento..."):
                    try:
                        ia.extrair_valores(doc, ss.brutos.get(nome_doc), int(ano), chave)
                        st.success("Valores extraídos pela IA.")
                    except ia.ErroIA as e:
                        st.error(str(e))
            for aviso in doc.avisos:
                st.warning(md(aviso))
            resumo = []
            if doc.lancamentos:
                resumo.append(f"{len(doc.lancamentos)} lançamentos")
            for col, serie in doc.series.items():
                base = col.removesuffix("__anterior")
                extra = " (meses anteriores)" if base != col else ""
                resumo.append(f"{DESCRICAO_COLUNAS.get(base, base)}{extra}: {brl(sum(serie.values()))} em {len(serie)} mês(es)")
            if doc.contas:
                resumo.append(f"{len(doc.contas)} contas de demonstrativo")
            st.caption(md(" · ".join(resumo)) if resumo else "Nenhum valor reconhecido.")
            if doc.lancamentos:
                with st.expander("Ver lançamentos"):
                    st.dataframe(pd.DataFrame([vars(l) for l in doc.lancamentos]).drop(columns="documento"),
                                 use_container_width=True, hide_index=True)

    if ss.docs and st.button("Consolidar documentos na tabela mensal ➜", type="primary"):
        res = consolidar(list(ss.docs.values()), int(ano), cnpj)
        ss.consolidacao, ss.tabela_base, ss.contas_base, ss.resultado = res, res.tabela, dict(res.contas_demonstrativos), None
        ss.pop("editor_tabela", None)
        ss.pop("editor_contas", None)
        st.success("Pronto! Confira os valores na aba 2. Dados mensais.")

# ---------------------------------------------------------------------------
# 2. Dados mensais
# ---------------------------------------------------------------------------

with aba_dados:
    st.subheader("Tabela mensal consolidada")
    st.write("Confira e corrija os valores. Você pode digitar diretamente nas células, inclusive quando não tiver "
             "o documento. O ano anterior serve para calcular a RBT12 e o Fator R do Simples.")
    if ss.tabela_base is None or str(int(ano)) not in ss.tabela_base.index[-1]:
        ss.tabela_base = tabela_mensal_vazia(int(ano))
        ss.pop("editor_tabela", None)
    exibir = ss.tabela_base.rename(columns=DESCRICAO_COLUNAS)
    config = {c: st.column_config.NumberColumn(c, format="%.2f", min_value=0.0) for c in exibir.columns}
    editada = st.data_editor(exibir, column_config=config, use_container_width=True, height=600, key="editor_tabela")
    ss.tabela = editada.rename(columns={v: k for k, v in DESCRICAO_COLUNAS.items()})

    st.subheader("Contas dos demonstrativos (Balanço / DRE)")
    st.caption("Saldos do fim do período. Caixa negativo deve ser informado com sinal de menos.")
    from auditor.leitores import CONTAS_DEMONSTRATIVO

    contas_df = pd.DataFrame({"Conta": list(CONTAS_DEMONSTRATIVO),
                              "Valor": [ss.contas_base.get(k) for k in CONTAS_DEMONSTRATIVO]})
    contas_ed = st.data_editor(contas_df, hide_index=True, disabled=["Conta"], use_container_width=True,
                               column_config={"Valor": st.column_config.NumberColumn(format="%.2f")}, key="editor_contas")
    ss.contas = {r.Conta: float(r.Valor) for r in contas_ed.itertuples() if pd.notna(r.Valor)}

    if ss.consolidacao is not None:
        cons = ss.consolidacao
        if cons.transferencias_internas:
            with st.expander(f"Transferências entre contas da empresa identificadas ({len(cons.transferencias_internas)})"):
                st.dataframe(pd.DataFrame([
                    {"Data saída": s.data, "Conta origem": s.documento, "Data entrada": e.data, "Conta destino": e.documento,
                     "Valor": e.valor} for s, e in cons.transferencias_internas]), hide_index=True, use_container_width=True)
        if cons.nao_operacionais:
            with st.expander(f"Entradas classificadas como não operacionais ({len(cons.nao_operacionais)})"):
                st.dataframe(pd.DataFrame([vars(l) for l in cons.nao_operacionais]), hide_index=True, use_container_width=True)

# ---------------------------------------------------------------------------
# 3. Auditoria
# ---------------------------------------------------------------------------

with aba_audit:
    st.subheader("Executar auditoria")
    if st.button("Executar auditoria", type="primary"):
        ss.resultado = auditar(empresa, ss.tabela, ss.contas)
        ss.parecer = {}

    r = ss.resultado
    if r is None:
        st.info("Clique em **Executar auditoria** depois de conferir os dados mensais.")
    else:
        cols = st.columns(4)
        for col, sev in zip(cols, Severidade):
            col.metric(f"{ICONE_SEVERIDADE[sev]} {sev.value}", sum(1 for a in r.achados if a.severidade == sev))

        if r.indicadores:
            with st.expander("Indicadores", expanded=True):
                st.dataframe(pd.DataFrame(r.indicadores.items(), columns=["Indicador", "Valor"]),
                             hide_index=True, use_container_width=True)

        st.subheader("Apontamentos")
        for i, a in enumerate(r.achados):
            alvo = "" if a.visivel_cliente else " · uso interno"
            with st.expander(md(f"{ICONE_SEVERIDADE[a.severidade]} {a.titulo} — {a.area.value}{alvo}")):
                st.markdown(md(a.descricao))
                st.markdown(md(f"**Recomendação:** {a.recomendacao}"))
                if a.valor_envolvido:
                    st.markdown(md(f"**Valor envolvido:** {brl(a.valor_envolvido)}"))
                if a.fundamentacao:
                    st.caption(md(f"Fundamentação: {a.fundamentacao}"))
                a.visivel_cliente = st.checkbox("Incluir no relatório do cliente", value=a.visivel_cliente,
                                                key=f"vis_{i}")

        if r.simples_mensal is not None:
            st.subheader("Simples Nacional - apuração recalculada")
            st.dataframe(r.simples_mensal, use_container_width=True, hide_index=True)
        if r.conciliacao_bancaria is not None:
            st.subheader("Faturamento x bancos")
            st.dataframe(r.conciliacao_bancaria, use_container_width=True)
        if r.comparativo_regimes is not None:
            st.subheader("Comparativo de regimes (simulação)")
            st.dataframe(r.comparativo_regimes, use_container_width=True, hide_index=True)
        for obs in r.observacoes_metodo:
            st.caption("ℹ️ " + md(obs))

        st.divider()
        st.subheader("Parecer com IA (opcional)")
        if st.button("Gerar parecer técnico e carta ao cliente com IA", disabled=not ia_ok):
            with st.spinner("A IA está analisando os dados. Isso pode levar alguns minutos..."):
                try:
                    resumo_docs = [f"{d.nome} ({d.tipo.value})" for d in ss.docs.values()]
                    ss.parecer = ia.gerar_parecer(empresa, ss.tabela, r.achados, r.indicadores,
                                                  r.comparativo_regimes, ss.contas, resumo_docs, chave)
                    r.achados.extend(ss.parecer.get("achados_adicionais", []))
                    st.success("Parecer gerado. Revise os textos abaixo antes de emitir os relatórios.")
                except ia.ErroIA as e:
                    st.error(str(e))
        if ss.parecer:
            ss.parecer["parecer_interno"] = st.text_area("Parecer interno", ss.parecer.get("parecer_interno", ""), height=300)
            ss.parecer["carta_cliente"] = st.text_area("Carta ao cliente", ss.parecer.get("carta_cliente", ""), height=300)

# ---------------------------------------------------------------------------
# 4. Relatórios
# ---------------------------------------------------------------------------

with aba_rel:
    st.subheader("Relatórios")
    if ss.resultado is None:
        st.info("Execute a auditoria primeiro (aba 3).")
    else:
        dados = DadosRelatorio(
            empresa=empresa, resultado=ss.resultado, documentos=list(ss.docs.values()),
            parecer_interno=ss.parecer.get("parecer_interno", ""), carta_cliente=ss.parecer.get("carta_cliente", ""),
            analista=analista,
        )
        base = re.sub(r"[^A-Za-z0-9]+", "_", nome or "empresa").strip("_")
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("#### Relatório interno")
            st.caption("Para os analistas fiscais, contábeis e de pessoal. Traz todos os apontamentos e quadros.")
            st.download_button("⬇️ PDF (com timbre)", relatorio_interno_pdf(dados), f"{base}_interno_{ano}.pdf",
                               "application/pdf", use_container_width=True)
            st.download_button("⬇️ Word (editável)", relatorio_docx(dados, interno=True), f"{base}_interno_{ano}.docx",
                               use_container_width=True)
        with c2:
            st.markdown("#### Relatório para o cliente")
            st.caption("Linguagem acessível, apenas os apontamentos marcados para o cliente.")
            st.download_button("⬇️ PDF (com timbre)", relatorio_cliente_pdf(dados), f"{base}_cliente_{ano}.pdf",
                               "application/pdf", use_container_width=True)
            st.download_button("⬇️ Word (editável)", relatorio_docx(dados, interno=False), f"{base}_cliente_{ano}.docx",
                               use_container_width=True)
