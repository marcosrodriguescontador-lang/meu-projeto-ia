"""Motor de auditoria: cruza as informações e gera os achados (apontamentos)."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from . import tributos as T
from .formatacao import brl, mes_extenso, pct
from .modelos import Achado, Area, Empresa, Regime, Severidade, TotalPeriodo, meses_do_ano

TOLERANCIA_BANCO = 0.10  # créditos operacionais até 10% acima do faturamento são tolerados
TOLERANCIA_DECLARADO = 0.01
TOLERANCIA_IMPOSTO = 0.05
ALERTA_LIMITE = 0.80  # avisa quando a receita projetada passa de 80% do limite


@dataclass
class Resultado:
    achados: list[Achado] = field(default_factory=list)
    indicadores: dict[str, float | str] = field(default_factory=dict)
    simples_mensal: pd.DataFrame | None = None
    comparativo_regimes: pd.DataFrame | None = None
    conciliacao_bancaria: pd.DataFrame | None = None
    observacoes_metodo: list[str] = field(default_factory=list)

    def add(self, *args, **kwargs) -> None:
        self.achados.append(Achado(*args, **kwargs))


def receita_base(tab: pd.DataFrame) -> pd.Series:
    """Faturamento dos relatórios; se o mês estiver vazio, usa a receita declarada."""
    return tab["faturamento"].where(tab["faturamento"] > 0, tab["faturamento_declarado"])


def folha_total(tab: pd.DataFrame) -> pd.Series:
    return tab["folha_salarios"] + tab["pro_labore"] + tab["encargos_folha"]


def _acumulado_12(serie: pd.Series, comp: str) -> tuple[float, int]:
    """Soma dos 12 meses anteriores a `comp` e quantos meses com valor existiam."""
    idx = list(serie.index)
    pos = idx.index(comp)
    anteriores = serie.iloc[max(0, pos - 12) : pos]
    return float(anteriores.sum()), int((anteriores > 0).sum())


def rbt12(receitas: pd.Series, comp: str) -> tuple[float, bool]:
    """RBT12 do mês. Retorna (valor, foi_proporcionalizada).

    Sem 12 meses de histórico aplica-se a regra de início de atividade
    (média dos meses anteriores x 12; no 1º mês, a própria receita x 12).
    """
    soma, n = _acumulado_12(receitas, comp)
    if n >= 12:
        return soma, False
    if n == 0:
        return float(receitas[comp]) * 12, True
    return soma / n * 12, True


# ---------------------------------------------------------------------------
# Simples Nacional
# ---------------------------------------------------------------------------


def analisar_simples(emp: Empresa, tab: pd.DataFrame, res: Resultado) -> None:
    receitas = receita_base(tab)
    folha = folha_total(tab)
    meses = [m for m in meses_do_ano(emp.ano_referencia) if receitas[m] > 0]
    if not meses:
        res.add(Severidade.ALTA, Area.FISCAL, "Faturamento não informado",
                "Não foi encontrado faturamento no ano analisado; os cálculos do Simples Nacional não puderam ser feitos.",
                "Anexe o relatório de faturamento/vendas ou o extrato do PGDAS-D, ou preencha a tabela mensal.",
                visivel_cliente=False)
        return

    linhas, proporcional = [], False
    for m in meses:
        r12, prop = rbt12(receitas, m)
        proporcional |= prop
        f12, nf = _acumulado_12(folha, m)
        if nf and nf < 12 and r12 > 0:
            f12 = f12 / nf * 12  # proporcionaliza a folha na mesma base da receita
        calc = T.calcular_simples(emp.anexo_simples, float(receitas[m]), r12, f12 if emp.anexo_simples in ("III", "V") else None)
        linhas.append({
            "Competência": mes_extenso(m),
            "comp": m,
            "Receita do mês": float(receitas[m]),
            "RBT12": r12,
            "Folha 12m": f12,
            "Fator R": calc.fator_r,
            "Anexo aplicado": calc.anexo_aplicado,
            "Faixa": calc.faixa,
            "Alíquota efetiva": calc.aliquota_efetiva,
            "DAS calculado": calc.valor_das,
            "DAS declarado/pago": float(tab.loc[m, "imposto_declarado"]),
        })
    df = pd.DataFrame(linhas).set_index("comp")
    res.simples_mensal = df
    if proporcional:
        res.observacoes_metodo.append(
            "Parte da RBT12 foi proporcionalizada (média dos meses disponíveis x 12) porque não havia 12 meses "
            "anteriores de faturamento. Para maior precisão, preencha o faturamento do ano anterior."
        )

    ultimo = df.iloc[-1]
    res.indicadores.update({
        "Anexo cadastrado": T.DESCRICAO_ANEXOS[emp.anexo_simples],
        "RBT12 (último mês)": brl(ultimo["RBT12"]),
        "Alíquota efetiva (último mês)": pct(ultimo["Alíquota efetiva"]),
        "Faixa atual": f"{int(ultimo['Faixa'])}ª faixa",
        "DAS calculado no ano": brl(df["DAS calculado"].sum()),
    })
    if ultimo["Fator R"] is not None and pd.notna(ultimo["Fator R"]):
        res.indicadores["Fator R (último mês)"] = pct(ultimo["Fator R"])

    _limites_simples(emp, receitas, df, res)
    _fator_r(emp, tab, df, res)
    _anexo_iv(emp, tab, df, res)
    _das_declarado(df, res)
    _proximidade_faixa(df, emp, res)


def _limites_simples(emp: Empresa, receitas: pd.Series, df: pd.DataFrame, res: Resultado) -> None:
    meses_ano = [m for m in meses_do_ano(emp.ano_referencia)]
    acumulado = float(receitas[meses_ano].sum())
    n = int((receitas[meses_ano] > 0).sum())
    projecao = acumulado / n * 12 if n else 0
    res.indicadores["Receita acumulada no ano"] = brl(acumulado)
    res.indicadores["Receita projetada para o ano"] = brl(projecao)

    limite_excesso = T.LIMITE_SIMPLES * (1 + T.TOLERANCIA_EXCESSO)
    if acumulado > limite_excesso:
        res.add(Severidade.ALTA, Area.FISCAL, "Receita acima do limite do Simples Nacional em mais de 20%",
                f"A receita acumulada no ano ({brl(acumulado)}) ultrapassou {brl(limite_excesso)} "
                f"(limite de {brl(T.LIMITE_SIMPLES)} + 20%).",
                "A exclusão do Simples produz efeitos a partir do mês seguinte ao do excesso. Providenciar a "
                "comunicação de exclusão, recalcular os tributos pelo regime normal e avaliar Lucro Presumido x Real.",
                "LC 123/2006, art. 3º, §§ 9º e 9º-A; art. 30, IV e § 1º, IV.", valor_envolvido=acumulado)
    elif acumulado > T.LIMITE_SIMPLES:
        res.add(Severidade.ALTA, Area.FISCAL, "Receita acima do limite do Simples Nacional (excesso de até 20%)",
                f"A receita acumulada ({brl(acumulado)}) passou de {brl(T.LIMITE_SIMPLES)}.",
                "A empresa ficará excluída do Simples a partir de 1º de janeiro do ano seguinte. Planejar desde já "
                "a migração (Lucro Presumido ou Real) e comunicar a exclusão no prazo.",
                "LC 123/2006, art. 3º, § 9º-A; art. 30, IV.", valor_envolvido=acumulado)
    elif projecao >= T.LIMITE_SIMPLES * ALERTA_LIMITE:
        res.add(Severidade.MEDIA, Area.FISCAL, "Faturamento próximo do limite do Simples Nacional",
                f"Mantido o ritmo atual, a receita do ano será de aproximadamente {brl(projecao)}, "
                f"{pct(projecao / T.LIMITE_SIMPLES, 0)} do limite de {brl(T.LIMITE_SIMPLES)}.",
                "Acompanhar mensalmente o faturamento acumulado e preparar um estudo de regime tributário para o "
                "próximo ano antes de atingir o limite.",
                "LC 123/2006, art. 3º, II.", valor_envolvido=projecao)

    if emp.anexo_simples != "" and acumulado > T.SUBLIMITE_ICMS_ISS:
        res.add(Severidade.ALTA, Area.FISCAL, "Sublimite estadual/municipal ultrapassado",
                f"A receita acumulada ({brl(acumulado)}) passou do sublimite de {brl(T.SUBLIMITE_ICMS_ISS)}.",
                "ICMS e ISS deixam de ser recolhidos no DAS e passam a ser apurados pelas regras normais do "
                "estado/município (no mês seguinte, ou no ano seguinte se o excesso for de até 20%). Ajustar a "
                "escrituração fiscal e a emissão de notas.",
                "LC 123/2006, arts. 13-A e 20.", valor_envolvido=acumulado)
    elif projecao >= T.SUBLIMITE_ICMS_ISS * ALERTA_LIMITE:
        res.add(Severidade.MEDIA, Area.FISCAL, "Faturamento próximo do sublimite de ICMS/ISS",
                f"Receita projetada de {brl(projecao)} frente ao sublimite de {brl(T.SUBLIMITE_ICMS_ISS)}.",
                "Se o sublimite for ultrapassado, ICMS/ISS passam a ser recolhidos fora do DAS, com obrigações "
                "acessórias próprias (ex.: EFD ICMS/IPI). Planejar a transição.",
                "LC 123/2006, arts. 13-A e 20.", valor_envolvido=projecao)


def _fator_r(emp: Empresa, tab: pd.DataFrame, df: pd.DataFrame, res: Resultado) -> None:
    if emp.anexo_simples not in ("III", "V"):
        return
    ultimo = df.iloc[-1]
    fr = ultimo["Fator R"]
    if fr is None or pd.isna(fr):
        res.add(Severidade.MEDIA, Area.PESSOAL, "Folha de pagamento não informada (Fator R)",
                "A atividade está sujeita ao Fator R, mas não há folha/pró-labore informados; sem eles a empresa "
                "é tributada pelo Anexo V, que é mais caro.",
                "Anexar a folha de pagamento (com pró-labore e encargos) dos últimos 12 meses.",
                "LC 123/2006, art. 18, §§ 5º-J e 5º-M.", visivel_cliente=False)
        return

    meses_iii = df[df["Anexo aplicado"] == "III"]
    if emp.anexo_simples == "III" and fr < T.FATOR_R_MINIMO:
        das_v = ultimo["Receita do mês"] * T.aliquota_efetiva_simples("V", ultimo["RBT12"])
        das_iii = ultimo["Receita do mês"] * T.aliquota_efetiva_simples("III", ultimo["RBT12"])
        res.add(Severidade.ALTA, Area.FISCAL, "Fator R abaixo de 28%: tributação deveria ser pelo Anexo V",
                f"O Fator R do último mês é {pct(fr)}. Abaixo de 28% a atividade é tributada pelo Anexo V. Se o "
                f"DAS foi apurado pelo Anexo III, há recolhimento a menor de aproximadamente "
                f"{brl(das_v - das_iii)} no mês.",
                "Revisar a apuração do PGDAS-D dos meses com Fator R < 28% e retificar, se necessário. Para os "
                "próximos meses, avaliar o aumento do pró-labore para atingir 28%.",
                "LC 123/2006, art. 18, §§ 5º-J e 5º-M; Resolução CGSN 140/2018, art. 26.",
                valor_envolvido=das_v - das_iii)

    rbt = ultimo["RBT12"]
    folha12 = ultimo["Folha 12m"]
    faltante = T.FATOR_R_MINIMO * rbt - folha12
    if fr < T.FATOR_R_MINIMO and faltante > 0:
        aumento_mensal = faltante / 12
        receita_media = float(df["Receita do mês"].mean())
        economia_mensal = receita_media * (T.aliquota_efetiva_simples("V", rbt) - T.aliquota_efetiva_simples("III", rbt))
        # Pró-labore adicional: INSS do sócio (11%) - a CPP patronal já está no DAS nos Anexos III/V.
        custo_mensal = aumento_mensal * 0.11
        vale = economia_mensal > custo_mensal
        res.add(Severidade.MEDIA if vale else Severidade.INFO, Area.FISCAL,
                "Oportunidade: atingir Fator R de 28% e migrar do Anexo V para o III",
                f"Fator R atual de {pct(fr)}. Para chegar a 28% a folha dos últimos 12 meses precisa aumentar "
                f"{brl(faltante)} (cerca de {brl(aumento_mensal)} por mês, por exemplo em pró-labore). "
                f"Economia estimada no DAS: {brl(economia_mensal)}/mês, contra custo adicional estimado de "
                f"{brl(custo_mensal)}/mês de INSS do sócio (sem considerar IRPF).",
                "Simular com o cliente o aumento do pró-labore (considerando IRPF e INSS do sócio) antes de "
                "aplicar. O efeito é gradual, pois o Fator R considera os 12 meses anteriores."
                if vale else "No cenário atual o aumento de folha não compensa; reavaliar se o faturamento mudar.",
                "LC 123/2006, art. 18, §§ 5º-J, 5º-M e 24.", valor_envolvido=economia_mensal * 12)
    elif emp.anexo_simples == "V" and len(meses_iii):
        res.add(Severidade.MEDIA, Area.FISCAL, "Atividade cadastrada no Anexo V com Fator R acima de 28%",
                f"Em {len(meses_iii)} mês(es) o Fator R ficou em 28% ou mais, o que permite a tributação pelo "
                "Anexo III (mais barato).",
                "Conferir se o PGDAS-D está aplicando o Fator R (informar a folha de salários no PGDAS-D). Se o DAS "
                "foi pago pelo Anexo V, avaliar retificação e pedido de restituição/compensação.",
                "LC 123/2006, art. 18, § 5º-J; Resolução CGSN 140/2018, art. 26.")

    if float(tab.loc[meses_do_ano(emp.ano_referencia), "pro_labore"].sum()) == 0:
        res.add(Severidade.MEDIA, Area.PESSOAL, "Pró-labore não identificado",
                "Não foi encontrado pró-labore no período. Além de afetar o Fator R, sócios que trabalham na "
                "empresa devem ter pró-labore com recolhimento de INSS.",
                "Verificar se os sócios administradores recebem pró-labore e se ele está na folha/eSocial.",
                "Lei 8.212/91, art. 12, V, 'f'; LC 123/2006, art. 18, § 24.")


def _anexo_iv(emp: Empresa, tab: pd.DataFrame, df: pd.DataFrame, res: Resultado) -> None:
    if emp.anexo_simples != "IV":
        return
    meses = meses_do_ano(emp.ano_referencia)
    salarios = float(tab.loc[meses, ["folha_salarios", "pro_labore"]].sum().sum())
    encargos = float(tab.loc[meses, "encargos_folha"].sum())
    receita = float(df["Receita do mês"].sum())
    cpp_estimada = salarios * 0.20
    res.indicadores["Folha/receita (Anexo IV)"] = pct(salarios / receita) if receita else "-"
    res.add(Severidade.INFO, Area.FISCAL, "Anexo IV: INSS patronal (CPP) é pago fora do DAS",
            "No Anexo IV o Fator R não se aplica: a alíquota do DAS não depende da folha. Em compensação a CPP "
            f"(20% sobre folha e pró-labore, mais RAT) é recolhida à parte, via DCTFWeb. Na folha informada isso "
            f"representa cerca de {brl(cpp_estimada)} no ano.",
            "Considerar o custo da CPP ao comparar o Simples com o Lucro Presumido, principalmente se a folha for "
            "alta em relação ao faturamento.",
            "LC 123/2006, art. 13, VI; art. 18, § 5º-C.")
    if salarios > 0 and encargos < salarios * 0.20:
        res.add(Severidade.ALTA, Area.PESSOAL, "Anexo IV: encargos de INSS patronal abaixo do esperado",
                f"Os encargos informados ({brl(encargos)}) são menores que a CPP mínima esperada de 20% sobre "
                f"salários e pró-labore ({brl(cpp_estimada)}).",
                "Conferir se a CPP está sendo declarada na DCTFWeb/eSocial e paga. Há risco de autuação com multa "
                "e juros.",
                "LC 123/2006, art. 18, § 5º-C; Lei 8.212/91, art. 22.",
                valor_envolvido=cpp_estimada - encargos)


def _das_declarado(df: pd.DataFrame, res: Resultado) -> None:
    com_dado = df[df["DAS declarado/pago"] > 0]
    if com_dado.empty:
        return
    divergentes = com_dado[
        (com_dado["DAS calculado"] > 0)
        & ((com_dado["DAS declarado/pago"] - com_dado["DAS calculado"]).abs() > com_dado["DAS calculado"] * TOLERANCIA_IMPOSTO)
    ]
    for menor in (True, False):
        grupo = divergentes[(divergentes["DAS declarado/pago"] < divergentes["DAS calculado"]) == menor]
        if grupo.empty:
            continue
        dif = float((grupo["DAS calculado"] - grupo["DAS declarado/pago"]).abs().sum())
        detalhe = "; ".join(
            f"{l['Competência']}: pago {brl(l['DAS declarado/pago'])} x recalculado {brl(l['DAS calculado'])}"
            for _, l in grupo.head(6).iterrows()
        )
        res.add(Severidade.ALTA if menor else Severidade.MEDIA, Area.FISCAL,
                f"DAS {'menor' if menor else 'maior'} que o recalculado em {len(grupo)} mês(es)",
                f"{detalhe}{' ...' if len(grupo) > 6 else ''}. Diferença total: {brl(dif)}.",
                "Conferir receita, segregação de receitas (ST, monofásicos, exportação, ISS retido), anexo e "
                "Fator R informados no PGDAS-D." + (" Se confirmado, retificar e recolher a diferença." if menor
                else " Se houve pagamento a maior, avaliar restituição/compensação."),
                "LC 123/2006, art. 18; Resolução CGSN 140/2018, arts. 21 a 25.",
                visivel_cliente=False, valor_envolvido=dif)


def _proximidade_faixa(df: pd.DataFrame, emp: Empresa, res: Resultado) -> None:
    ultimo = df.iloc[-1]
    faixa = int(ultimo["Faixa"])
    tabela = T.TABELAS_SIMPLES[ultimo["Anexo aplicado"]]
    if faixa >= len(tabela):
        return
    limite = tabela[faixa - 1][0]
    if ultimo["RBT12"] >= limite * 0.9:
        prox = T.aliquota_efetiva_simples(ultimo["Anexo aplicado"], limite * 1.05)
        res.add(Severidade.INFO, Area.FISCAL, "Mudança de faixa do Simples se aproximando",
                f"A RBT12 ({brl(ultimo['RBT12'])}) está próxima do limite da {faixa}ª faixa ({brl(limite)}). Ao "
                f"passar para a faixa seguinte, a alíquota efetiva sobe gradualmente (ex.: cerca de {pct(prox)}).",
                "Considerar o aumento de alíquota na formação de preços e no fluxo de caixa dos próximos meses.",
                "LC 123/2006, art. 18, §§ 1º e 1º-A.")


# ---------------------------------------------------------------------------
# Cruzamentos comuns a todos os regimes
# ---------------------------------------------------------------------------


def analisar_bancos(emp: Empresa, tab: pd.DataFrame, res: Resultado, totais: list[TotalPeriodo] | None = None) -> None:
    meses = meses_do_ano(emp.ano_referencia)
    t = tab.loc[meses]
    if t["creditos_bancarios"].sum() == 0:
        res.add(Severidade.MEDIA, Area.FINANCEIRO, "Extratos bancários não informados",
                "Sem extratos não é possível confrontar o faturamento com a movimentação financeira.",
                "Solicitar ao cliente os extratos de todas as contas correntes e aplicações do período.",
                visivel_cliente=True)
        return
    receitas = receita_base(tab).loc[meses]
    operacionais = (t["creditos_bancarios"] - t["creditos_nao_operacionais"]).clip(lower=0)
    conc = pd.DataFrame({
        "Faturamento": receitas,
        "Entradas nos bancos": t["creditos_bancarios"],
        "Entradas não operacionais": t["creditos_nao_operacionais"],
        "Entradas operacionais": operacionais,
    })
    conc["Diferença"] = conc["Entradas operacionais"] - conc["Faturamento"]
    conc["Entradas / faturamento"] = conc["Entradas operacionais"] / conc["Faturamento"].where(conc["Faturamento"] > 0)
    conc.index = [mes_extenso(m) for m in conc.index]
    conc = conc[(conc["Faturamento"] > 0) | (conc["Entradas nos bancos"] > 0)]
    res.conciliacao_bancaria = conc

    total_fat, total_op = float(receitas.sum()), float(operacionais.sum())
    res.indicadores["Entradas operacionais nos bancos (ano)"] = brl(total_op)

    sem_fat = conc[(conc["Faturamento"] == 0) & (conc["Entradas operacionais"] > 0)]
    if len(sem_fat):
        res.add(Severidade.ALTA, Area.FISCAL, "Meses com entradas bancárias e sem faturamento",
                f"Em {', '.join(sem_fat.index)} há entradas nos bancos ({brl(sem_fat['Entradas operacionais'].sum())}) "
                "sem faturamento registrado.",
                "Identificar a origem dos créditos. Depósitos sem origem comprovada são presumidos como receita "
                "omitida pela fiscalização.",
                "Lei 9.430/96, art. 42.", valor_envolvido=float(sem_fat["Entradas operacionais"].sum()))

    acima = conc[(conc["Faturamento"] > 0) & (conc["Entradas operacionais"] > conc["Faturamento"] * (1 + TOLERANCIA_BANCO))]
    if len(acima):
        excesso = float(acima["Diferença"].sum())
        res.add(Severidade.ALTA, Area.FISCAL, "Entradas bancárias maiores que o faturamento",
                f"Em {len(acima)} mês(es) ({', '.join(acima.index)}) as entradas operacionais superaram o "
                f"faturamento em mais de {pct(TOLERANCIA_BANCO, 0)}. Excesso somado: {brl(excesso)}.",
                "Analisar os créditos desses meses: recebimentos de vendas sem nota, empréstimos de sócios, "
                "transferências entre contas ou resgates não identificados. Documentar a origem dos valores que não "
                "forem receita (contratos de mútuo, extratos da outra conta) e emitir/declarar as receitas omitidas.",
                "Lei 9.430/96, art. 42 (depósitos de origem não comprovada); RIR/2018, art. 293.",
                valor_envolvido=excesso)

    abaixo = conc[(conc["Faturamento"] > 0) & (conc["Entradas operacionais"] < conc["Faturamento"] * 0.5)]
    if len(abaixo):
        res.add(Severidade.BAIXA, Area.FINANCEIRO, "Faturamento muito maior que as entradas nos bancos",
                f"Em {', '.join(abaixo.index)} as entradas nos bancos ficaram abaixo da metade do faturamento.",
                "Verificar se há contas bancárias ou maquininhas de cartão não informadas, vendas a prazo ou "
                "recebimentos em dinheiro (que devem passar pelo caixa contábil).",
                "Boas práticas de controle interno; NBC TG Estrutura Conceitual.", visivel_cliente=True)

    if total_fat > 0:
        res.indicadores["Entradas operacionais / faturamento (ano)"] = pct(total_op / total_fat)

    if emp.regime == Regime.SIMPLES:
        ingressos = float(t["creditos_bancarios"].sum())
        despesas = float(t["debitos_bancarios"].sum())
        compras = float(t["compras"].sum()) or (total_no_ano(totais or [], "compras", emp.ano_referencia) or 0.0)
        if ingressos > 0 and despesas > ingressos * 1.2:
            res.add(Severidade.ALTA, Area.FISCAL, "Despesas pagas superam em mais de 20% os ingressos",
                    f"Saídas bancárias {brl(despesas)} contra entradas {brl(ingressos)} no ano.",
                    "Essa situação é hipótese de exclusão de ofício do Simples (exceto no ano de início). Identificar "
                    "a origem dos recursos usados nos pagamentos (saldo anterior, aportes, empréstimos) e documentar.",
                    "LC 123/2006, art. 29, IX.", valor_envolvido=despesas - ingressos)
        if ingressos > 0 and compras > ingressos * 0.8:
            res.add(Severidade.ALTA, Area.FISCAL, "Compras acima de 80% dos ingressos do ano",
                    f"Compras {brl(compras)} = {pct(compras / ingressos)} das entradas ({brl(ingressos)}).",
                    "Hipótese de exclusão de ofício do Simples (exceto no ano de início). Verificar estoques, "
                    "omissão de vendas ou compras registradas em duplicidade.",
                    "LC 123/2006, art. 29, XII.", valor_envolvido=compras)


def analisar_declarado(emp: Empresa, tab: pd.DataFrame, res: Resultado) -> None:
    meses = meses_do_ano(emp.ano_referencia)
    t = tab.loc[meses]
    if t["faturamento_declarado"].sum() == 0 or t["faturamento"].sum() == 0:
        return
    difs = []
    for m in meses:
        fat, dec = t.loc[m, "faturamento"], t.loc[m, "faturamento_declarado"]
        if fat > 0 and abs(dec - fat) > max(fat * TOLERANCIA_DECLARADO, 1.0):
            difs.append((m, fat, dec))
    if difs:
        total = sum(f - d for _, f, d in difs)
        detalhe = "; ".join(f"{mes_extenso(m)}: relatório {brl(f)} x declarado {brl(d)}" for m, f, d in difs[:6])
        res.add(Severidade.ALTA, Area.FISCAL, "Faturamento dos relatórios diferente da receita declarada",
                f"{len(difs)} mês(es) com diferença. {detalhe}{' ...' if len(difs) > 6 else ''}.",
                "Conciliar notas emitidas x apuração (canceladas, devoluções, notas fora do período). Se houver "
                "receita a menor na declaração, retificar (PGDAS-D/DCTF/EFD) e recolher a diferença antes de "
                "procedimento fiscal, para manter a espontaneidade.",
                "CTN, art. 138 (denúncia espontânea); LC 123/2006, art. 18.",
                visivel_cliente=False, valor_envolvido=total)


def analisar_compras(emp: Empresa, tab: pd.DataFrame, res: Resultado, totais: list[TotalPeriodo] | None = None) -> None:
    meses = meses_do_ano(emp.ano_referencia)
    compras = float(tab.loc[meses, "compras"].sum()) or (total_no_ano(totais or [], "compras", emp.ano_referencia) or 0.0)
    receita = float(receita_base(tab).loc[meses].sum())
    if compras == 0 or receita == 0:
        return
    relacao = compras / receita
    res.indicadores["Compras / faturamento"] = pct(relacao)
    if relacao > 1:
        res.add(Severidade.ALTA, Area.CONTABIL, "Compras maiores que o faturamento",
                f"Compras de {brl(compras)} contra faturamento de {brl(receita)} ({pct(relacao)}).",
                "Confirmar o estoque final (inventário). Sem aumento de estoque justificável, a situação indica "
                "possível omissão de vendas e costuma gerar malha fiscal (cruzamento de NF-e de entrada x saída).",
                "RIR/2018, art. 293; Lei 9.430/96, art. 42.", valor_envolvido=compras - receita)
    elif relacao > 0.85:
        res.add(Severidade.MEDIA, Area.CONTABIL, "Margem bruta muito baixa",
                f"As compras representam {pct(relacao)} do faturamento.",
                "Revisar formação de preço, perdas de estoque e se todas as vendas foram faturadas.",
                "Análise gerencial.")

    meses_comp = [m for m in meses if tab.loc[m, "compras"] > 0 and receita_base(tab)[m] == 0]
    if meses_comp:
        res.add(Severidade.MEDIA, Area.FISCAL, "Meses com compras e sem vendas",
                f"Compras sem faturamento em {', '.join(mes_extenso(m) for m in meses_comp)}.",
                "Verificar se houve vendas não registradas ou se as compras foram para formação de estoque.",
                visivel_cliente=False)


def analisar_aplicacoes(emp: Empresa, tab: pd.DataFrame, contas: dict[str, float], res: Resultado) -> None:
    meses = meses_do_ano(emp.ano_referencia)
    rend = float(tab.loc[meses, "rendimentos_aplicacao"].sum())
    irrf = float(tab.loc[meses, "irrf_aplicacao"].sum())
    if rend == 0:
        return
    res.indicadores["Rendimentos de aplicações (ano)"] = brl(rend)
    if emp.regime == Regime.SIMPLES:
        res.add(Severidade.INFO, Area.FISCAL, "Rendimentos de aplicação no Simples Nacional",
                f"Rendimentos de {brl(rend)} (IRRF {brl(irrf)}). No Simples eles não entram na receita bruta do "
                "DAS e o IRRF é definitivo.",
                "Garantir que os rendimentos não foram somados à receita do PGDAS-D e que estão contabilizados "
                "como receita financeira.",
                "LC 123/2006, art. 3º, § 1º; IN RFB 1.585/2015, art. 70.")
        dec = float(tab.loc[meses, "faturamento_declarado"].sum())
        fat = float(tab.loc[meses, "faturamento"].sum())
        if dec and fat and abs((dec - fat) - rend) < rend * 0.05:
            res.add(Severidade.MEDIA, Area.FISCAL, "Rendimentos possivelmente incluídos na receita do PGDAS-D",
                    "A diferença entre a receita declarada e o faturamento é praticamente igual aos rendimentos.",
                    "Retificar o PGDAS-D excluindo os rendimentos financeiros e pedir restituição do DAS pago a maior.",
                    "LC 123/2006, art. 3º, § 1º.", visivel_cliente=False)
    else:
        txt = ("No Lucro Presumido os rendimentos somam integralmente à base de IRPJ e CSLL" if emp.regime == Regime.PRESUMIDO
               else "No Lucro Real os rendimentos são receita financeira tributável (IRPJ/CSLL) e sofrem PIS 0,65% e COFINS 4%")
        res.add(Severidade.INFO, Area.FISCAL, "Rendimentos de aplicação: tributação e IRRF compensável",
                f"Rendimentos de {brl(rend)} e IRRF de {brl(irrf)}. {txt}; o IRRF é antecipação e pode ser "
                "compensado com o IRPJ devido.",
                "Conferir se os rendimentos entraram na base de cálculo e se o IRRF foi deduzido do IRPJ (evita "
                "pagamento a maior ou a menor).",
                "Lei 8.981/95, art. 76; Lei 9.430/96, art. 25, II; Decreto 8.426/2015.")
    if "receitas_financeiras" in contas:
        cont = abs(contas["receitas_financeiras"])
        if abs(cont - rend) > max(rend * 0.10, 100):
            res.add(Severidade.MEDIA, Area.CONTABIL, "Receitas financeiras contabilizadas diferentes dos rendimentos",
                    f"Contabilidade: {brl(cont)}; extratos/informes: {brl(rend)}.",
                    "Conciliar as contas de aplicação financeira mês a mês com os extratos do banco (rendimento, "
                    "IRRF e IOF).",
                    "NBC TG 48 / CPC 48; ITG 2000.", visivel_cliente=False, valor_envolvido=abs(cont - rend))
    elif contas:
        res.add(Severidade.MEDIA, Area.CONTABIL, "Rendimentos de aplicação não localizados no demonstrativo",
                f"Há {brl(rend)} de rendimentos nos extratos, mas não foi encontrada a conta de receitas financeiras.",
                "Verificar se as aplicações e seus rendimentos estão escriturados.",
                "ITG 2000 (escrituração contábil).", visivel_cliente=False)


def analisar_folha(emp: Empresa, tab: pd.DataFrame, res: Resultado) -> None:
    meses = meses_do_ano(emp.ano_referencia)
    sal = float(tab.loc[meses, "folha_salarios"].sum())
    pro = float(tab.loc[meses, "pro_labore"].sum())
    enc = float(tab.loc[meses, "encargos_folha"].sum())
    if sal + pro == 0:
        return
    rel = enc / (sal + pro)
    res.indicadores["Encargos / folha"] = pct(rel)
    simples_sem_cpp = emp.regime == Regime.SIMPLES and emp.anexo_simples != "IV"
    if simples_sem_cpp and rel > 0.15:
        res.add(Severidade.MEDIA, Area.PESSOAL, "Encargos de folha altos para empresa do Simples",
                f"Encargos de {pct(rel)} da folha. Nos Anexos I, II, III e V a CPP está dentro do DAS; o esperado "
                "é basicamente o FGTS (8%).",
                "Verificar se a empresa está recolhendo INSS patronal em duplicidade (DCTFWeb x DAS) ou se a "
                "classificação tributária no eSocial está errada. Se houve pagamento indevido, pedir restituição.",
                "LC 123/2006, art. 13, VI; eSocial - classificação tributária.", valor_envolvido=enc - 0.08 * sal)
    elif not simples_sem_cpp and enc > 0 and rel < 0.25:
        res.add(Severidade.MEDIA, Area.PESSOAL, "Encargos de folha abaixo do esperado",
                f"Encargos de {pct(rel)} da folha. Para empresas fora do Simples o esperado fica em torno de 30% a "
                "36% (INSS patronal 20% + RAT + terceiros + FGTS 8%); no Anexo IV, ao menos 20% + RAT + FGTS.",
                "Conferir a DCTFWeb/eSocial (desoneração, FAP/RAT, terceiros) e os recolhimentos de FGTS Digital.",
                "Lei 8.212/91, art. 22; Lei 8.036/90, art. 15.", visivel_cliente=False)


def analisar_demonstrativos(emp: Empresa, tab: pd.DataFrame, contas: dict[str, float], res: Resultado) -> None:
    if not contas:
        return
    meses = meses_do_ano(emp.ano_referencia)
    fat = float(receita_base(tab).loc[meses].sum())

    ativo, passivo = contas.get("total_ativo"), contas.get("total_passivo")
    if ativo and passivo and abs(abs(ativo) - abs(passivo)) > 1:
        res.add(Severidade.ALTA, Area.CONTABIL, "Balanço não fecha (ativo diferente de passivo + PL)",
                f"Total do ativo {brl(ativo)} x total do passivo {brl(passivo)}.",
                "Revisar o fechamento contábil: lançamentos sem contrapartida, resultado não transferido ao PL ou "
                "saldos de abertura divergentes.",
                "ITG 2000; NBC TG 26 / CPC 26.", visivel_cliente=False, valor_envolvido=abs(ativo - passivo))

    caixa = contas.get("caixa")
    if caixa is not None:
        if caixa < 0:
            res.add(Severidade.ALTA, Area.CONTABIL, "Saldo credor de caixa (caixa negativo)",
                    f"A conta caixa apresenta saldo negativo de {brl(caixa)}.",
                    "Caixa negativo é impossível fisicamente e é tratado pelo fisco como omissão de receita. Revisar "
                    "lançamentos de pagamentos/recebimentos, datas e suprimentos de caixa.",
                    "RIR/2018, art. 293.", valor_envolvido=abs(caixa))
        elif fat and caixa > (fat / 12) * 2 or (ativo and caixa > abs(ativo) * 0.2):
            res.add(Severidade.MEDIA, Area.CONTABIL, "Saldo de caixa elevado",
                    f"Caixa de {brl(caixa)} (faturamento médio mensal de {brl(fat / 12 if fat else 0)}).",
                    "Saldo de caixa alto costuma esconder pagamentos não lançados ou distribuição de lucros não "
                    "formalizada. Conferir com contagem física (termo de contagem de caixa) e ajustar.",
                    "ITG 2000; NBC TG 03.", valor_envolvido=caixa)

    rec = contas.get("receita_bruta")
    if rec and fat and abs(abs(rec) - fat) > fat * 0.02:
        res.add(Severidade.ALTA, Area.CONTABIL, "Receita contábil diferente do faturamento fiscal",
                f"Receita bruta no demonstrativo {brl(abs(rec))} x faturamento dos relatórios {brl(fat)}.",
                "Conciliar contabilidade x fiscal (integração do sistema, notas canceladas, devoluções, competência "
                "x caixa). A receita contábil deve bater com a escrituração fiscal.",
                "ITG 2000; NBC TG 47 / CPC 47.", visivel_cliente=False, valor_envolvido=abs(abs(rec) - fat))

    lucro = contas.get("lucro_liquido")
    prejuizo = contas.get("prejuizo")
    dist = contas.get("distribuicao_lucros")
    if dist:
        dist = abs(dist)
        base = lucro if lucro is not None else (-abs(prejuizo) if prejuizo else None)
        if base is not None and dist > max(base, 0) + 1:
            res.add(Severidade.ALTA, Area.CONTABIL, "Distribuição de lucros maior que o lucro apurado",
                    f"Lucros distribuídos {brl(dist)} x lucro do período {brl(base)}.",
                    "O excesso pode ser tributado como remuneração (IRPF/INSS). Verificar lucros acumulados de "
                    "exercícios anteriores e, no Simples/Presumido, se há escrituração contábil completa que "
                    "suporte a distribuição acima da presunção.",
                    "Lei 9.249/95, art. 10; IN RFB 1.700/2017, art. 238; LC 123/2006, art. 14.",
                    valor_envolvido=dist - max(base, 0))
        if dist / 12 > 50_000:
            res.add(Severidade.INFO, Area.FISCAL, "Distribuição de lucros: retenção de IRRF a partir de 2026",
                    f"A distribuição média é de {brl(dist / 12)}/mês. Desde 2026, lucros acima de R$ 50 mil por mês "
                    "pagos a uma mesma pessoa física têm retenção de 10% de IRRF.",
                    "Planejar a distribuição por sócio e mês e avaliar o impacto na tributação mínima do IRPF.",
                    "Lei 15.270/2025 (verificar regulamentação vigente).")

    pro_dre = contas.get("pro_labore")
    pro_folha = float(tab.loc[meses, "pro_labore"].sum())
    if pro_dre and pro_folha and abs(abs(pro_dre) - pro_folha) > pro_folha * 0.05:
        res.add(Severidade.MEDIA, Area.PESSOAL, "Pró-labore contábil diferente da folha",
                f"Contabilidade {brl(abs(pro_dre))} x folha {brl(pro_folha)}.",
                "Conciliar a integração folha x contabilidade.", "ITG 2000.", visivel_cliente=False)

    emp_socios = contas.get("emprestimos_socios")
    if emp_socios and fat and abs(emp_socios) > fat * 0.1:
        res.add(Severidade.MEDIA, Area.CONTABIL, "Saldo relevante de empréstimos/conta corrente de sócios",
                f"Saldo de {brl(abs(emp_socios))}.",
                "Formalizar contratos de mútuo. Recursos de sócios sem comprovação podem ser vistos como receita "
                "omitida (suprimento de caixa). Em mútuos com pessoa jurídica há IOF.",
                "RIR/2018, art. 293, II; Decreto 6.306/2007, art. 7º.", valor_envolvido=abs(emp_socios))


# ---------------------------------------------------------------------------
# Lucro Presumido / Real e comparação de regimes
# ---------------------------------------------------------------------------


def comparar_regimes(emp: Empresa, tab: pd.DataFrame, contas: dict[str, float], res: Resultado) -> None:
    meses = meses_do_ano(emp.ano_referencia)
    receitas = receita_base(tab).loc[meses]
    receita = float(receitas.sum())
    if receita <= 0:
        return
    fin = tab.loc[meses, "rendimentos_aplicacao"].tolist()
    compras = float(tab.loc[meses, "compras"].sum())
    salarios = float(tab.loc[meses, ["folha_salarios", "pro_labore"]].sum().sum())
    linhas = []

    if receita <= T.LIMITE_SIMPLES * (1 + T.TOLERANCIA_EXCESSO):
        anexo = emp.anexo_simples if emp.regime == Regime.SIMPLES else _anexo_provavel(emp)
        # Para comparar com Presumido/Real (calculados sem ICMS/ISS), retira do DAS a parcela de ICMS/ISS.
        if res.simples_mensal is not None and emp.regime == Regime.SIMPLES:
            sm = res.simples_mensal
            das = float(sum(
                l["DAS calculado"] * (1 - T.PARTILHA_ICMS_ISS[l["Anexo aplicado"]][int(l["Faixa"]) - 1])
                for _, l in sm.iterrows()
            ))
        else:
            das = 0.0
            for r in receitas:
                c = T.calcular_simples(anexo, float(r), receita)
                das += c.valor_das * (1 - T.PARTILHA_ICMS_ISS[c.anexo_aplicado][c.faixa - 1])
        cpp = salarios * T.ALIQUOTA_CPP_ANEXO_IV if anexo == "IV" else 0.0
        imposto = "ICMS" if anexo in ("I", "II") else "ISS"
        linhas.append({"Regime": f"Simples Nacional ({T.DESCRICAO_ANEXOS[anexo]})", "Tributos": das + cpp,
                       "Observação": f"DAS sem a parcela do {imposto}, para comparar com os demais regimes"
                                     + ("; inclui CPP de 22% fora do DAS" if cpp else "; CPP incluída no DAS")})

    cpp_normal = salarios * 0.268  # 20% + RAT ~1% + terceiros 5,8%
    pres = T.calcular_presumido_anual(receitas.tolist(), emp.atividade, fin, emp.ano_referencia)
    linhas.append({"Regime": "Lucro Presumido", "Tributos": pres.total + cpp_normal,
                   "Observação": "IRPJ/CSLL presumidos + PIS/COFINS cumulativos + INSS patronal estimado (26,8%). "
                                 "Sem ICMS/ISS."})

    lucro = contas.get("lucro_liquido")
    lucro_est = lucro + contas.get("impostos_resultado", 0) if lucro is not None else receita * emp.margem_lucro_estimada
    real = T.calcular_real_anual(receita, lucro_est, compras, sum(fin))
    linhas.append({"Regime": "Lucro Real", "Tributos": real.total + cpp_normal,
                   "Observação": f"lucro antes do IR de {brl(lucro_est)} "
                                 f"({'demonstrativo' if lucro is not None else 'margem estimada de ' + pct(emp.margem_lucro_estimada, 0)}); "
                                 "créditos de PIS/COFINS sobre compras; INSS patronal estimado. Sem ICMS/ISS."})

    df = pd.DataFrame(linhas)
    df["% da receita"] = df["Tributos"] / receita
    res.comparativo_regimes = df

    atual = _linha_regime_atual(emp, df)
    melhor = df.loc[df["Tributos"].idxmin()]
    if atual is not None and melhor["Regime"] != atual["Regime"]:
        economia = atual["Tributos"] - melhor["Tributos"]
        if economia > receita * 0.01:
            res.add(Severidade.MEDIA, Area.FISCAL, "Possível economia com mudança de regime tributário",
                    f"Pela simulação (tributos federais e INSS, sem ICMS/ISS), o {melhor['Regime']} custaria {brl(melhor['Tributos'])} no ano, contra "
                    f"{brl(atual['Tributos'])} no regime atual: economia estimada de {brl(economia)}.",
                    "Fazer um estudo de planejamento tributário completo (ICMS/ISS, benefícios, créditos, "
                    "obrigações acessórias) antes de janeiro, quando a opção é feita para o ano todo.",
                    "LC 123/2006, art. 16; Lei 9.718/98, art. 13; Lei 9.430/96, art. 26.",
                    valor_envolvido=economia)

    if emp.regime in (Regime.PRESUMIDO, Regime.REAL_ANUAL, Regime.REAL_TRIMESTRAL) and receita > T.LIMITE_LUCRO_PRESUMIDO:
        res.add(Severidade.ALTA, Area.FISCAL, "Receita acima do limite do Lucro Presumido",
                f"Receita de {brl(receita)} acima de {brl(T.LIMITE_LUCRO_PRESUMIDO)}.",
                "A empresa fica obrigada ao Lucro Real no ano seguinte.", "Lei 9.718/98, art. 13; art. 14, I.")

    if emp.regime == Regime.PRESUMIDO and emp.ano_referencia >= T.ANO_INICIO_ACRESCIMO and receita > T.LIMITE_ACRESCIMO_PRESUNCAO:
        res.add(Severidade.MEDIA, Area.FISCAL, "Lucro Presumido: acréscimo de 10% na presunção (receita acima de R$ 5 mi)",
                f"Receita de {brl(receita)}. Sobre a parcela acima de R$ 5 milhões no ano, os percentuais de "
                "presunção do IRPJ e da CSLL são acrescidos em 10%.",
                "Conferir se as apurações trimestrais estão aplicando o acréscimo e reavaliar a comparação com o "
                "Lucro Real.", "LC 224/2025 (verificar regulamentação vigente).")


def _anexo_provavel(emp: Empresa) -> str:
    return {"Comércio": "I", "Indústria": "II"}.get(emp.atividade.value, "III")


def _linha_regime_atual(emp: Empresa, df: pd.DataFrame):
    chave = {"Simples Nacional": "Simples", "Lucro Presumido": "Lucro Presumido"}.get(emp.regime.value, "Lucro Real")
    filtro = df[df["Regime"].str.startswith(chave)]
    return filtro.iloc[0] if len(filtro) else None


def analisar_lucro_real_presumido(emp: Empresa, tab: pd.DataFrame, res: Resultado) -> None:
    meses = meses_do_ano(emp.ano_referencia)
    receitas = receita_base(tab).loc[meses]
    if receitas.sum() == 0:
        res.add(Severidade.ALTA, Area.FISCAL, "Faturamento não informado",
                "Não há faturamento no ano analisado.", "Anexar relatórios de faturamento ou apuração.",
                visivel_cliente=False)
        return
    declarado = float(tab.loc[meses, "imposto_declarado"].sum())
    if emp.regime == Regime.PRESUMIDO:
        r = T.calcular_presumido_anual(receitas.tolist(), emp.atividade, tab.loc[meses, "rendimentos_aplicacao"].tolist(), emp.ano_referencia)
        res.indicadores.update({
            "IRPJ estimado (ano)": brl(r.irpj), "CSLL estimada (ano)": brl(r.csll),
            "PIS estimado (ano)": brl(r.pis), "COFINS estimada (ano)": brl(r.cofins),
        })
        esperado = r.total
    else:
        irpj = csll = 0.0
        for v in receitas:
            i, c = T.calcular_estimativa_mensal(float(v), emp.atividade)
            irpj, csll = irpj + i, csll + c
        res.indicadores.update({
            "IRPJ por estimativa (ano)": brl(irpj), "CSLL por estimativa (ano)": brl(csll),
        })
        esperado = irpj + csll
        if emp.regime == Regime.REAL_ANUAL:
            res.add(Severidade.INFO, Area.FISCAL, "Lucro Real anual: avaliar balancetes de suspensão/redução",
                    f"Pela receita bruta, a estimativa mensal somaria {brl(esperado)} de IRPJ/CSLL no ano.",
                    "Se o lucro real acumulado for menor que a base estimada, levantar balancetes mensais de "
                    "suspensão/redução e reduzir os recolhimentos (exige LALUR/ECD em dia).",
                    "Lei 8.981/95, art. 35; IN RFB 1.700/2017, arts. 47 a 50.")
    if declarado and esperado and abs(declarado - esperado) / esperado > 0.10:
        res.add(Severidade.MEDIA, Area.FISCAL, "Tributos declarados diferentes do estimado",
                f"Declarado/pago {brl(declarado)} x estimado {brl(esperado)} (IRPJ/CSLL{'/PIS/COFINS' if emp.regime == Regime.PRESUMIDO else ''}).",
                "Conferir bases de cálculo, retenções na fonte, adições/exclusões e créditos de PIS/COFINS. A "
                "estimativa não considera ajustes do LALUR nem retenções.",
                visivel_cliente=False, valor_envolvido=abs(declarado - esperado))
    if emp.ano_referencia >= 2026:
        res.add(Severidade.INFO, Area.FISCAL, "Reforma tributária: CBS e IBS em fase de teste",
                "Em 2026 as notas fiscais passam a destacar CBS (0,9%) e IBS (0,1%) de forma educativa, compensáveis "
                "com PIS/COFINS.",
                "Garantir que o emissor de notas e o ERP estão preparados para os novos campos e acompanhar o "
                "cronograma de transição.", "LC 214/2025.")


# ---------------------------------------------------------------------------
# Totais de período (livros fiscais anuais)
# ---------------------------------------------------------------------------


def _meses_entre(inicio: str, fim: str) -> list[str]:
    a, m = map(int, inicio.split("-"))
    fa, fm = map(int, fim.split("-"))
    meses = []
    while (a, m) <= (fa, fm):
        meses.append(f"{a}-{m:02d}")
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return meses


def total_no_ano(totais: list[TotalPeriodo], coluna: str, ano: int) -> float | None:
    """Soma dos totais de período de uma coluna contidos no ano (None se não houver)."""
    lista = [t for t in totais if t.coluna == coluna and t.inicio[:4] == t.fim[:4] == str(ano)]
    return sum(t.valor for t in lista) if lista else None


def analisar_totais_periodo(emp: Empresa, tab: pd.DataFrame, totais: list[TotalPeriodo], res: Resultado) -> None:
    ano = emp.ano_referencia
    for t in totais:
        meses = [m for m in _meses_entre(t.inicio, t.fim) if m in tab.index]
        if not meses or t.inicio[:4] != str(ano):
            continue
        periodo = f"{mes_extenso(t.inicio)} a {mes_extenso(t.fim)}"
        d = t.detalhe
        if t.coluna == "faturamento":
            res.indicadores["Vendas nos livros fiscais (CFOP)"] = brl(t.valor)
            declarado = float(tab.loc[meses, "faturamento_declarado"].sum())
            nome_decl = "PGDAS-D" if emp.regime == Regime.SIMPLES else "declarações (DCTF/EFD)"
            if declarado > 0:
                dif = t.valor - declarado
                res.indicadores[f"Receita declarada no {nome_decl} ({periodo})"] = brl(declarado)
                if abs(dif) > 1.0:
                    grave = abs(dif) > declarado * TOLERANCIA_DECLARADO
                    res.add(Severidade.ALTA if grave else Severidade.BAIXA, Area.FISCAL,
                            f"Vendas nos livros fiscais x receita declarada no {nome_decl}",
                            f"No período {periodo}, as saídas com CFOP de venda somam {brl(d.get('vendas', t.valor))}"
                            + (f" menos devoluções de venda de {brl(d['devolucoes_venda'])} = {brl(t.valor)}"
                               if d.get("devolucoes_venda") else "")
                            + f", enquanto a receita declarada foi {brl(declarado)}. "
                            f"Diferença de {brl(dif)} ({'receita declarada a menor' if dif > 0 else 'receita declarada a maior'}).",
                            "Conciliar mês a mês as notas de saída (livro de saídas / SPED Fiscal) com a receita informada "
                            "na declaração: notas canceladas, devoluções, CFOPs classificados como venda e meses trocados. "
                            + ("Se a receita foi declarada a menor, retificar e recolher a diferença antes de qualquer "
                               "procedimento fiscal." if dif > 0 else "Se foi declarada a maior, avaliar retificação e "
                               "restituição/compensação."),
                            "LC 123/2006, art. 18 e art. 25; CTN, art. 138." if emp.regime == Regime.SIMPLES
                            else "Lei 9.430/96; IN RFB 2.005/2021 (DCTF); CTN, art. 138.",
                            visivel_cliente=False, valor_envolvido=abs(dif))
            fat_mensal = float(tab.loc[meses, "faturamento"].sum())
            if fat_mensal > 0 and abs(fat_mensal - t.valor) > max(t.valor * TOLERANCIA_DECLARADO, 1.0):
                res.add(Severidade.MEDIA, Area.FISCAL, "Relatórios de faturamento diferentes dos livros fiscais",
                        f"Relatórios mensais de faturamento: {brl(fat_mensal)}; livros fiscais (CFOP de venda): {brl(t.valor)}.",
                        "Verificar se todos os documentos fiscais foram escriturados e se os relatórios gerenciais "
                        "incluem itens que não são venda.", visivel_cliente=False,
                        valor_envolvido=abs(fat_mensal - t.valor))
            if d.get("venda_imobilizado"):
                res.add(Severidade.INFO, Area.CONTABIL, "Venda de bens do ativo imobilizado",
                        f"Saídas de venda de ativo imobilizado de {brl(d['venda_imobilizado'])} no período.",
                        "Baixar o bem no imobilizado (custo e depreciação acumulada) e apurar o ganho ou perda. "
                        + ("No Simples, a venda de ativo imobilizado não compõe a receita bruta do DAS."
                           if emp.regime == Regime.SIMPLES else
                           "O ganho de capital integra a base do IRPJ/CSLL."),
                        "LC 123/2006, art. 3º, § 1º; NBC TG 27 / CPC 27.", visivel_cliente=False)
        elif t.coluna == "compras":
            res.indicadores["Compras para revenda nos livros fiscais (CFOP)"] = brl(t.valor)
            if d.get("entrada_imobilizado"):
                res.add(Severidade.INFO, Area.CONTABIL, "Aquisições de ativo imobilizado no período",
                        f"Entradas com CFOP de ativo imobilizado somam {brl(d['entrada_imobilizado'])}.",
                        "Conferir o registro no imobilizado (e não como compra/estoque ou despesa), o início da "
                        "depreciação e, quando houver financiamento, o passivo correspondente.",
                        "NBC TG 27 / CPC 27.", visivel_cliente=False, valor_envolvido=d["entrada_imobilizado"])
            if d.get("bonificacoes_recebidas"):
                res.add(Severidade.INFO, Area.CONTABIL, "Bonificações recebidas de fornecedores",
                        f"Entradas de bonificação, doação ou brinde somam {brl(d['bonificacoes_recebidas'])}.",
                        "Verificar a contabilização (redução do custo das mercadorias ou receita) e o controle de "
                        "estoque desses itens.", "NBC TG 16 / CPC 16.", visivel_cliente=False)


# ---------------------------------------------------------------------------
# Execução
# ---------------------------------------------------------------------------


def auditar(
    emp: Empresa, tab: pd.DataFrame, contas: dict[str, float] | None = None, totais: list[TotalPeriodo] | None = None
) -> Resultado:
    contas = contas or {}
    totais = totais or []
    res = Resultado()
    tab = tab.fillna(0.0)
    if emp.regime == Regime.SIMPLES:
        analisar_simples(emp, tab, res)
    else:
        analisar_lucro_real_presumido(emp, tab, res)
    analisar_bancos(emp, tab, res, totais)
    analisar_declarado(emp, tab, res)
    analisar_totais_periodo(emp, tab, totais, res)
    analisar_compras(emp, tab, res, totais)
    analisar_aplicacoes(emp, tab, contas, res)
    analisar_folha(emp, tab, res)
    analisar_demonstrativos(emp, tab, contas, res)
    comparar_regimes(emp, tab, contas, res)
    from .modelos import ORDEM_SEVERIDADE

    res.achados.sort(key=lambda a: ORDEM_SEVERIDADE[a.severidade])
    return res
