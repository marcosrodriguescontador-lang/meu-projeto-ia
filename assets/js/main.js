/* APSA — Relações com Investidores: layout compartilhado, tabelas e gráficos */
(function () {
  "use strict";
  var D = window.APSA || {};

  /* ---------- Formatação ---------- */
  var fmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function moeda(v) {
    if (v === null || v === undefined) return "";
    if (v === 0) return "–";
    return v < 0 ? "(" + fmt.format(-v) + ")" : fmt.format(v);
  }
  function compacto(v) {
    var a = Math.abs(v), s = v < 0 ? "−" : "";
    if (a >= 1e6) return s + "R$ " + (a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " mi";
    if (a >= 1e3) return s + "R$ " + (a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
    return s + "R$ " + fmt.format(a);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- Cabeçalho e rodapé ---------- */
  var paginas = [
    ["index.html", "Início", "inicio"],
    ["a-companhia.html", "A Companhia", "companhia"],
    ["informacoes-financeiras.html", "Informações Financeiras", "financeiras"],
    ["notas-explicativas.html", "Notas Explicativas", "notas"],
    ["central-de-resultados.html", "Central de Resultados", "resultados"],
    ["contato.html", "Fale com o RI", "contato"]
  ];

  var logo = '<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">' +
    '<rect width="48" height="48" rx="10" fill="#0f4d34"/>' +
    '<circle cx="24" cy="21" r="6.5" fill="#fff"/><circle cx="17" cy="17" r="5" fill="#fff"/><circle cx="31" cy="17" r="5" fill="#fff"/>' +
    '<circle cx="18.5" cy="25" r="5" fill="#fff"/><circle cx="29.5" cy="25" r="5" fill="#fff"/>' +
    '<path d="M24 30v10M24 35c-3-1-5-3-6-6M24 35c3-1 5-3 6-6" stroke="#e9c77f" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

  function montarLayout() {
    var atual = document.body.getAttribute("data-pagina");
    var nav = paginas.map(function (p) {
      return '<li><a href="' + p[0] + '"' + (p[2] === atual ? ' aria-current="page"' : "") + ">" + p[1] + "</a></li>";
    }).join("");

    var header = document.getElementById("site-header");
    if (header) {
      header.innerHTML =
        '<div class="topbar"><div class="container"><span>CNPJ ' + D.empresa.cnpj + " · NIRE " + D.empresa.nire + " · " + D.empresa.tipo + "</span>" +
        '<a href="documentos/APSA_Demonstracoes_Financeiras_2025.pdf" download>Baixar DF 2025 (PDF)</a></div></div>' +
        '<div class="site-header"><div class="container">' +
        '<a class="brand" href="index.html">' + logo + '<span class="brand-txt"><strong>APSA</strong><span>Relações com Investidores</span></span></a>' +
        '<button class="nav-toggle" aria-expanded="false" aria-controls="menu" aria-label="Abrir menu">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>' +
        '<nav class="main-nav" id="menu" aria-label="Principal"><ul>' + nav + "</ul></nav></div></div>";
      var btn = header.querySelector(".nav-toggle"), menu = header.querySelector(".main-nav");
      btn.addEventListener("click", function () {
        var aberto = menu.classList.toggle("aberto");
        btn.setAttribute("aria-expanded", aberto ? "true" : "false");
      });
    }

    var footer = document.getElementById("site-footer");
    if (footer) {
      footer.className = "site-footer";
      footer.innerHTML = '<div class="container"><div class="footer-grid">' +
        "<div><h4>Algodoeira Palmeirense S.A. – APSA</h4><p>" + D.empresa.razao + "<br>CNPJ nº " + D.empresa.cnpj + " · NIRE " + D.empresa.nire + "<br>" + D.empresa.tipo + " · " + D.empresa.sede + "</p></div>" +
        "<div><h4>Navegação</h4><ul>" + paginas.map(function (p) { return '<li><a href="' + p[0] + '">' + p[1] + "</a></li>"; }).join("") + "</ul></div>" +
        '<div><h4>Documentos</h4><ul><li><a href="documentos/APSA_Demonstracoes_Financeiras_2025.pdf" download>Demonstrações Financeiras 2025</a></li>' +
        '<li><a href="informacoes-financeiras.html#demonstracoes">Demonstrações interativas</a></li><li><a href="notas-explicativas.html">Notas explicativas</a></li></ul></div>' +
        '</div><div class="footer-base"><span>© ' + new Date().getFullYear() + " " + D.empresa.razao + ". Todos os direitos reservados.</span>" +
        "<span>As informações deste site não substituem as demonstrações financeiras publicadas.</span></div></div>";
    }
  }

  /* ---------- Tabelas ---------- */
  function linhaHTML(r, comNota) {
    var tipo = r[4] || "";
    var notaCel = comNota ? '<td class="nota">' + (r[1] ? '<a href="notas-explicativas.html#nota-' + r[1] + '" title="Ver nota ' + r[1] + '">' + r[1] + "</a>" : "") + "</td>" : "";
    var vals = [r[2], r[3]].map(function (v) {
      return '<td class="v' + (v < 0 ? " neg" : "") + '">' + moeda(v) + "</td>";
    }).join("");
    return '<tr class="' + tipo + '"><td>' + esc(r[0]) + "</td>" + notaCel + vals + "</tr>";
  }

  function tabela(titulo, colunas, linhas, comNota, legenda) {
    return '<div class="tabela-wrap"><table class="fin">' + (legenda ? "<caption>" + legenda + "</caption>" : "") +
      "<thead><tr><th>" + titulo + "</th>" + (comNota ? '<th class="nota">Nota</th>' : "") +
      colunas.map(function (c) { return '<th class="v">' + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
      linhas.map(function (r) { return linhaHTML(r, comNota); }).join("") + "</tbody></table></div>";
  }

  function tabelaDMPL(d) {
    return '<div class="tabela-wrap"><table class="fin" style="min-width:1000px"><thead><tr><th style="min-width:300px">Descrição</th>' +
      d.colunas.map(function (c) { return '<th class="v">' + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
      d.linhas.map(function (r) {
        return '<tr class="' + r[2] + '"><td>' + esc(r[0]) + "</td>" + r[1].map(function (v) {
          return '<td class="v' + (v < 0 ? " neg" : "") + '">' + moeda(v) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  function renderDemonstracoes() {
    var alvo = {
      bp: document.getElementById("painel-bp"),
      dre: document.getElementById("painel-dre"),
      dmpl: document.getElementById("painel-dmpl"),
      dfc: document.getElementById("painel-dfc")
    };
    if (!alvo.bp) return;
    var und = "Valores expressos em reais (R$)";
    alvo.bp.innerHTML = "<h2>" + D.bp.titulo + '</h2><p class="sub-h">' + und + "</p>" +
      tabela("Ativo", D.bp.colunas, D.bp.ativo, true) + '<div class="mt-2"></div>' +
      tabela("Passivo e patrimônio líquido", D.bp.colunas, D.bp.passivo, true) +
      '<p class="rodape-tabela">' + D.bp.rodape + "</p>";
    alvo.dre.innerHTML = "<h2>" + D.dre.titulo + '</h2><p class="sub-h">Exercícios findos em 31 de dezembro · ' + und + "</p>" +
      tabela("Descrição", D.dre.colunas, D.dre.linhas, true) +
      '<p class="rodape-tabela">Lucro líquido por ação (1.445.000 ações ordinárias): R$ ' +
      D.dre.lpa[0].toLocaleString("pt-BR", { minimumFractionDigits: 4 }) + " em 2025 e R$ " +
      D.dre.lpa[1].toLocaleString("pt-BR", { minimumFractionDigits: 4 }) + " em 2024.</p>" +
      '<h2 class="mt-3">' + D.dra.titulo + '</h2><p class="sub-h">' + und + "</p>" + tabela("Descrição", D.dra.colunas, D.dra.linhas, false);
    alvo.dmpl.innerHTML = "<h2>" + D.dmpl.titulo + '</h2><p class="sub-h">' + und + "</p>" + tabelaDMPL(D.dmpl);
    alvo.dfc.innerHTML = "<h2>" + D.dfc.titulo + '</h2><p class="sub-h">Exercícios findos em 31 de dezembro · ' + und + "</p>" +
      tabela("Descrição", D.dfc.colunas, D.dfc.linhas, true) +
      '<h3 class="mt-2">Transações sem efeito caixa e informação complementar</h3>' +
      tabela("Descrição", D.dfc.colunas, D.dfc.complementar, true);
  }

  /* ---------- Abas ---------- */
  function iniciarAbas() {
    document.querySelectorAll("[data-abas]").forEach(function (grupo) {
      var botoes = grupo.querySelectorAll("[role=tab]");
      function ativar(btn, foco) {
        botoes.forEach(function (b) {
          var sel = b === btn;
          b.setAttribute("aria-selected", sel ? "true" : "false");
          b.tabIndex = sel ? 0 : -1;
          document.getElementById(b.getAttribute("aria-controls")).hidden = !sel;
        });
        if (foco) btn.focus();
      }
      botoes.forEach(function (b, i) {
        b.addEventListener("click", function () { ativar(b); history.replaceState(null, "", "#" + b.dataset.hash); });
        b.addEventListener("keydown", function (e) {
          if (e.key === "ArrowRight") ativar(botoes[(i + 1) % botoes.length], true);
          if (e.key === "ArrowLeft") ativar(botoes[(i - 1 + botoes.length) % botoes.length], true);
        });
      });
      var hash = location.hash.replace("#", "");
      var inicial = Array.prototype.find.call(botoes, function (b) { return b.dataset.hash === hash; });
      ativar(inicial || botoes[0]);
      if (inicial) grupo.scrollIntoView();
    });
  }

  /* ---------- Gráficos (SVG) ---------- */
  var COR = { a: "#0f7a4f", b: "#b07a1a" };
  var NS = "http://www.w3.org/2000/svg";
  function el(nome, attrs, pai) {
    var e = document.createElementNS(NS, nome);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  // barra com topo arredondado (4px) ancorada na linha de base
  function barraPath(x, y0, y1, w, r) {
    var cima = y1 < y0, h = Math.abs(y1 - y0);
    r = Math.min(r, h, w / 2);
    if (cima) return "M" + x + "," + y0 + "V" + (y1 + r) + "Q" + x + "," + y1 + " " + (x + r) + "," + y1 + "H" + (x + w - r) + "Q" + (x + w) + "," + y1 + " " + (x + w) + "," + (y1 + r) + "V" + y0 + "Z";
    return "M" + x + "," + y0 + "V" + (y1 - r) + "Q" + x + "," + y1 + " " + (x + r) + "," + y1 + "H" + (x + w - r) + "Q" + (x + w) + "," + y1 + " " + (x + w) + "," + (y1 - r) + "V" + y0 + "Z";
  }
  function escala(min, max) {
    var span = max - min, passo = Math.pow(10, Math.floor(Math.log10(span / 4)));
    [1, 2, 2.5, 5, 10].some(function (m) { if (span / (passo * m) <= 5) { passo *= m; return true; } });
    var lo = Math.floor(min / passo) * passo, hi = Math.ceil(max / passo) * passo, t = [];
    for (var v = lo; v <= hi + passo / 2; v += passo) t.push(Math.round(v));
    return { lo: lo, hi: hi, ticks: t };
  }

  function graficoBarras(box) {
    var cfg = JSON.parse(box.getAttribute("data-grafico"));
    var series = cfg.series, cats = cfg.categorias;
    box.querySelectorAll("svg, .tooltip, details.tabela-grafico").forEach(function (n) { n.remove(); });
    var W = Math.max(280, box.clientWidth - 40);
    var estreito = W / cats.length < 110;
    var H = estreito ? 300 : 280, m = { t: 22, r: 8, b: estreito ? 60 : 40, l: 56 };
    var todos = []; series.forEach(function (s) { todos = todos.concat(s.valores); });
    var sc = escala(Math.min(0, Math.min.apply(null, todos)), Math.max(0, Math.max.apply(null, todos)));
    var y = function (v) { return m.t + (sc.hi - v) / (sc.hi - sc.lo) * (H - m.t - m.b); };
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": cfg.titulo });
    var tip = document.createElement("div"); tip.className = "tooltip"; box.appendChild(tip);

    sc.ticks.forEach(function (t) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: t === 0 ? "#9aa6a0" : "#e6ebe8", "stroke-width": t === 0 ? 1.2 : 1 }, svg);
      var tx = el("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end", "font-size": 11, fill: "#6f7a75" }, svg);
      tx.textContent = t === 0 ? "0" : compacto(t).replace("R$ ", "");
    });
    var bandaW = (W - m.l - m.r) / cats.length, gap = 2;
    var barW = Math.min(46, (bandaW * 0.62 - gap * (series.length - 1)) / series.length);
    cats.forEach(function (c, i) {
      var grupoW = barW * series.length + gap * (series.length - 1);
      var x0 = m.l + bandaW * i + (bandaW - grupoW) / 2;
      series.forEach(function (s, j) {
        var v = s.valores[i], x = x0 + j * (barW + gap);
        var p = el("path", { d: barraPath(x, y(0), y(v), barW, 4), fill: s.cor }, svg);
        if (cfg.rotulos !== false && v !== 0 && !(estreito && series.length > 1)) {
          var lb = el("text", { x: x + barW / 2, y: v >= 0 ? y(v) - 6 : y(v) + 14, "text-anchor": "middle", "font-size": 10.5, fill: "#4a5550", "font-weight": 600 }, svg);
          lb.textContent = compacto(v).replace("R$ ", "");
        }
        var alvo = el("rect", { x: x - 2, y: m.t, width: barW + 4, height: H - m.t - m.b, fill: "transparent" }, svg);
        alvo.addEventListener("mousemove", function (e) {
          var r = box.getBoundingClientRect();
          tip.innerHTML = "<strong>" + esc(c) + (s.nome ? " · " + esc(s.nome) : "") + "</strong><br>R$ " + moeda(v);
          tip.style.left = Math.min(e.clientX - r.left + 12, r.width - tip.offsetWidth - 4) + "px";
          tip.style.top = (e.clientY - r.top - 44) + "px";
          tip.classList.add("on"); p.setAttribute("opacity", ".85");
        });
        alvo.addEventListener("mouseleave", function () { tip.classList.remove("on"); p.removeAttribute("opacity"); });
      });
      var ct = el("text", { x: m.l + bandaW * i + bandaW / 2, y: H - m.b + 18, "text-anchor": "middle", "font-size": 11.5, fill: "#1b2420" }, svg);
      if (estreito) {
        ct.setAttribute("font-size", 10);
        ((cfg.curtas && cfg.curtas[i]) || c.replace("31/12/2024 ajustado", "31/12/2024 ajust.")).split(" ").forEach(function (pal, k) {
          var ts = el("tspan", { x: m.l + bandaW * i + bandaW / 2, dy: k ? 12 : 0 }, ct);
          ts.textContent = pal;
        });
      } else ct.textContent = c;
    });
    box.appendChild(svg);

    // tabela acessível
    var det = document.createElement("details"); det.className = "tabela-grafico";
    det.innerHTML = "<summary>Ver dados em tabela</summary><table><thead><tr><th></th>" +
      series.map(function (s) { return "<th>" + esc(s.nome || "Valor") + "</th>"; }).join("") + "</tr></thead><tbody>" +
      cats.map(function (c, i) { return "<tr><td>" + esc(c) + "</td>" + series.map(function (s) { return "<td>" + moeda(s.valores[i]) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table>";
    box.appendChild(det);
  }

  function iniciarGraficos() {
    var caixas = document.querySelectorAll("[data-grafico]"), larg = window.innerWidth, t;
    caixas.forEach(graficoBarras);
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { if (window.innerWidth !== larg) { larg = window.innerWidth; caixas.forEach(graficoBarras); } }, 150);
    });
  }

  /* ---------- Contato ---------- */
  function iniciarContato() {
    var c = D.contato || {};
    document.querySelectorAll("[data-contato]").forEach(function (n) {
      var k = n.getAttribute("data-contato"), v = c[k];
      if (!v) { n.textContent = "A definir"; n.classList.add("muted"); return; }
      if (k === "email") n.innerHTML = '<a href="mailto:' + esc(v) + '">' + esc(v) + "</a>";
      else n.textContent = v;
    });
    var form = document.getElementById("form-contato");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = form.querySelector(".form-msg");
      var dados = new FormData(form);
      var corpo = "Nome: " + dados.get("nome") + "\nE-mail: " + dados.get("email") + "\nPerfil: " + dados.get("perfil") + "\n\n" + dados.get("mensagem");
      if (!c.email) { msg.textContent = "O canal de e-mail de RI ainda não foi configurado. Configure o campo contato.email em assets/js/data.js."; return; }
      location.href = "mailto:" + c.email + "?subject=" + encodeURIComponent("[RI APSA] " + dados.get("assunto")) + "&body=" + encodeURIComponent(corpo);
      msg.textContent = "Abrindo seu aplicativo de e-mail…";
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    montarLayout();
    renderDemonstracoes();
    iniciarAbas();
    iniciarGraficos();
    iniciarContato();
  });
})();
