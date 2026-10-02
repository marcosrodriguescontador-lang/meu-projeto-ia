"""Integração opcional com o Claude (API da Anthropic).

Usada para: (1) ler documentos que a extração automática não entendeu (PDF escaneado,
layouts diferentes) e (2) redigir o parecer técnico e a carta ao cliente.
Requer uma chave de API (variável ANTHROPIC_API_KEY ou informada na tela).
"""

from __future__ import annotations

import base64
import json
import os

import pandas as pd

from .modelos import COLUNAS_MENSAIS, Achado, Area, Documento, Empresa, Severidade
from .leitores import CONTAS_DEMONSTRATIVO

MODELO = "claude-opus-5-5"


class ErroIA(Exception):
    pass


def disponivel(api_key: str | None = None) -> bool:
    return bool(api_key or os.environ.get("ANTHROPIC_API_KEY"))


def _cliente(api_key: str | None):
    import anthropic

    return anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()


def _chamar(api_key: str | None, system: str, conteudo: list[dict], schema: dict, effort: str = "high") -> dict:
    import anthropic

    try:
        with _cliente(api_key).beta.messages.stream(
            model=MODELO,
            max_tokens=64000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            thinking={"type": "adaptive"},
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            system=system,
            messages=[{"role": "user", "content": conteudo}],
        ) as stream:
            resposta = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise ErroIA("Chave de API inválida. Confira a chave informada.") from e
    except anthropic.RateLimitError as e:
        raise ErroIA("Limite de uso da API atingido. Aguarde alguns minutos e tente novamente.") from e
    except anthropic.APIStatusError as e:
        raise ErroIA(f"Erro da API ({e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise ErroIA("Sem conexão com a API da Anthropic. Verifique a internet.") from e

    if resposta.stop_reason == "refusal":
        raise ErroIA("A IA não pôde processar este conteúdo.")
    if resposta.stop_reason == "max_tokens":
        raise ErroIA("A resposta da IA ficou longa demais e foi interrompida. Tente com menos documentos.")
    texto = next((b.text for b in resposta.content if b.type == "text"), "")
    try:
        return json.loads(texto)
    except json.JSONDecodeError as e:
        raise ErroIA("A IA retornou uma resposta em formato inesperado.") from e


# ---------------------------------------------------------------------------
# Extração de valores de documentos
# ---------------------------------------------------------------------------

SCHEMA_EXTRACAO = {
    "type": "object",
    "properties": {
        "series": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "coluna": {"type": "string", "enum": COLUNAS_MENSAIS},
                    "competencia": {"type": "string", "description": "AAAA-MM"},
                    "valor": {"type": "number"},
                },
                "required": ["coluna", "competencia", "valor"],
                "additionalProperties": False,
            },
        },
        "contas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "conta": {"type": "string", "enum": list(CONTAS_DEMONSTRATIVO)},
                    "valor": {"type": "number"},
                },
                "required": ["conta", "valor"],
                "additionalProperties": False,
            },
        },
        "observacoes": {"type": "string"},
    },
    "required": ["series", "contas", "observacoes"],
    "additionalProperties": False,
}

SYSTEM_EXTRACAO = """Você é um analista contábil brasileiro que extrai números de documentos para uma auditoria.
Extraia totais MENSAIS (competência AAAA-MM) para as colunas abaixo, somente quando o documento trouxer o dado:
- faturamento: receita bruta de vendas/serviços (relatórios de vendas, notas emitidas)
- faturamento_declarado: receita informada ao fisco (PGDAS-D, DCTF, EFD, livros fiscais)
- compras: compras de mercadorias/insumos
- folha_salarios: salários e demais proventos dos empregados (sem pró-labore)
- pro_labore: pró-labore dos sócios
- encargos_folha: INSS patronal (CPP/RAT/terceiros) + FGTS a cargo da empresa
- creditos_bancarios / debitos_bancarios: total de entradas / saídas da conta corrente no mês
- creditos_nao_operacionais: entradas que não são venda (transferências entre contas da mesma empresa, resgates de aplicação, empréstimos, estornos, aportes de sócios)
- rendimentos_aplicacao / irrf_aplicacao: rendimentos brutos de aplicações e IR retido
- imposto_declarado: valor do DAS ou dos DARFs apurados/pagos no mês
Para balanços, balancetes e DREs preencha "contas" com os saldos finais (valores negativos se credores invertidos, ex.: caixa negativo).
Use valores positivos em reais. Não invente números: se não houver dado, deixe a lista vazia. Em "observacoes", descreva em português o que o documento contém e qualquer inconsistência visível."""


def extrair_valores(doc: Documento, conteudo_original: bytes | None, ano: int, api_key: str | None = None) -> dict:
    partes: list[dict] = []
    if doc.nome.lower().endswith(".pdf") and conteudo_original:
        partes.append({
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf",
                       "data": base64.standard_b64encode(conteudo_original).decode()},
        })
    else:
        partes.append({"type": "text", "text": f"<documento nome=\"{doc.nome}\">\n{doc.texto}\n</documento>"})
    partes.append({"type": "text", "text": f"Tipo informado pelo usuário: {doc.tipo.value}. Ano em análise: {ano}. Extraia os valores."})
    dados = _chamar(api_key, SYSTEM_EXTRACAO, partes, SCHEMA_EXTRACAO, effort="medium")

    series: dict[str, dict[str, float]] = {}
    for item in dados.get("series", []):
        series.setdefault(item["coluna"], {})
        series[item["coluna"]][item["competencia"]] = series[item["coluna"]].get(item["competencia"], 0) + float(item["valor"])
    doc.series = series
    doc.contas = {c["conta"]: float(c["valor"]) for c in dados.get("contas", [])}
    if dados.get("observacoes"):
        doc.avisos.append("IA: " + dados["observacoes"])
    return dados


# ---------------------------------------------------------------------------
# Parecer técnico e carta ao cliente
# ---------------------------------------------------------------------------

SCHEMA_PARECER = {
    "type": "object",
    "properties": {
        "parecer_interno": {"type": "string"},
        "carta_cliente": {"type": "string"},
        "achados_adicionais": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "severidade": {"type": "string", "enum": [s.value for s in Severidade]},
                    "area": {"type": "string", "enum": [a.value for a in Area]},
                    "titulo": {"type": "string"},
                    "descricao": {"type": "string"},
                    "recomendacao": {"type": "string"},
                    "fundamentacao": {"type": "string"},
                    "visivel_cliente": {"type": "boolean"},
                },
                "required": ["severidade", "area", "titulo", "descricao", "recomendacao", "fundamentacao", "visivel_cliente"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["parecer_interno", "carta_cliente", "achados_adicionais"],
    "additionalProperties": False,
}

SYSTEM_PARECER = """Você é um auditor contábil, fiscal e tributário sênior de um escritório de contabilidade brasileiro (Systema Serviços Contábeis e Financeiros).
Recebe os dados consolidados de uma empresa cliente e os apontamentos já gerados por regras automáticas.

Produza:
1. parecer_interno: texto técnico para os analistas fiscais, contábeis e de departamento pessoal. Priorize riscos, explique as causas prováveis, indique o que conferir e a fundamentação legal (LC 123/2006, Resolução CGSN 140/2018, RIR/2018, Lei 9.430/96, CPCs/NBCs etc.). Separe por área com títulos em linhas próprias.
2. carta_cliente: texto cordial e claro para o empresário, sem jargão desnecessário, explicando a situação, os riscos e as recomendações práticas (ex.: Fator R, proximidade do limite do Simples, mudança de faixa/alíquota, regime tributário mais vantajoso). Não exponha falhas internas do escritório. Não inclua saudação de assinatura; o relatório já tem cabeçalho e rodapé.
3. achados_adicionais: apenas apontamentos NOVOS que as regras automáticas não captaram (pode ser lista vazia). Não repita os existentes.

Use somente os números fornecidos; quando um dado faltar, diga que precisa ser solicitado. Seja preciso com a legislação e sinalize quando algo depende de confirmação. Escreva em português do Brasil, em texto simples (sem markdown, sem tabelas)."""


def gerar_parecer(
    empresa: Empresa,
    tabela: pd.DataFrame,
    achados: list[Achado],
    indicadores: dict,
    comparativo: pd.DataFrame | None,
    contas: dict[str, float],
    resumo_documentos: list[str],
    api_key: str | None = None,
) -> dict:
    meses = tabela[(tabela != 0).any(axis=1)]
    contexto = {
        "empresa": {
            "nome": empresa.nome, "cnpj": empresa.cnpj, "regime": empresa.regime.value,
            "atividade": empresa.atividade.value,
            "anexo_simples": empresa.anexo_simples if empresa.regime.value == "Simples Nacional" else None,
            "uf": empresa.uf, "ano_analisado": empresa.ano_referencia,
        },
        "tabela_mensal": json.loads(meses.round(2).to_json(orient="index")),
        "indicadores": indicadores,
        "contas_demonstrativos": contas,
        "comparativo_regimes": json.loads(comparativo.to_json(orient="records")) if comparativo is not None else None,
        "documentos_analisados": resumo_documentos,
        "apontamentos_automaticos": [
            {"severidade": a.severidade.value, "area": a.area.value, "titulo": a.titulo, "descricao": a.descricao}
            for a in achados
        ],
    }
    texto = json.dumps(contexto, ensure_ascii=False, indent=1, default=str)
    dados = _chamar(api_key, SYSTEM_PARECER, [{"type": "text", "text": texto}], SCHEMA_PARECER, effort="high")
    dados["achados_adicionais"] = [
        Achado(
            severidade=Severidade(a["severidade"]), area=Area(a["area"]), titulo=a["titulo"],
            descricao=a["descricao"], recomendacao=a["recomendacao"], fundamentacao=a["fundamentacao"],
            visivel_cliente=a["visivel_cliente"],
        )
        for a in dados.get("achados_adicionais", [])
    ]
    return dados
