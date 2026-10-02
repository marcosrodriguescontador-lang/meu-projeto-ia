"""Formatação de valores no padrão brasileiro."""


def brl(valor: float | None) -> str:
    if valor is None:
        return "-"
    s = f"{abs(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"-R$ {s}" if valor < 0 else f"R$ {s}"


def pct(valor: float | None, casas: int = 2) -> str:
    if valor is None:
        return "-"
    return f"{valor * 100:.{casas}f}%".replace(".", ",")


NOMES_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def mes_extenso(comp: str) -> str:
    ano, mes = comp.split("-")
    return f"{NOMES_MESES[int(mes) - 1]}/{ano}"
