import { escapeHtml } from "./escape.js";
import { formatBytes, formatCount } from "./format.js";
import { I18N } from "./i18n.js";
import type { HtmlReportInput, HtmlSourceReport } from "./types.js";

function renderSource(source: HtmlSourceReport, oldFileYears: number, index: number): string {
  const s = source.stats;
  const byTypeRows = s.byType
    .map(
      (t) =>
        `<tr><td>${escapeHtml(t.type)}</td><td>${formatCount(t.count)}</td><td>${escapeHtml(formatBytes(t.bytes))}</td></tr>`,
    )
    .join("");

  const dupBlocks =
    source.topDuplicates.length === 0
      ? `<p class="muted" data-i18n="noDuplicates"></p>`
      : source.topDuplicates
          .map((g) => {
            const paths = g.paths
              .map((p) => `<li><code>${escapeHtml(p)}</code></li>`)
              .join("");
            return `<div class="dup"><p><strong>${escapeHtml(formatBytes(g.size))}</strong> × ${formatCount(g.paths.length)}</p><ul>${paths}</ul></div>`;
          })
          .join("");

  const issueRows =
    source.issues.length === 0
      ? ""
      : source.issues
          .slice(0, 50)
          .map(
            (i) =>
              `<tr><td><code>${escapeHtml(i.path)}</code></td><td>${escapeHtml(i.code)}</td><td>${escapeHtml(i.message)}</td></tr>`,
          )
          .join("");

  const piiBlock =
    source.piiLikelyFiles !== undefined
      ? `<tr><th data-i18n="piiEstimate"></th><td>${formatCount(source.piiLikelyFiles)}</td></tr>`
      : `<tr><th data-i18n="piiEstimate"></th><td class="muted" data-i18n="piiNotEstimated"></td></tr>`;

  return `
<section class="source" id="source-${index}">
  <h2><span data-i18n="source"></span>: <code>${escapeHtml(s.sourceId)}</code></h2>
  ${s.scannedAt ? `<p class="meta"><span data-i18n="scannedAt"></span>: ${escapeHtml(s.scannedAt)}</p>` : ""}
  <div class="grid">
    <div class="card">
      <h3 data-i18n="files"></h3>
      <p class="big">${formatCount(s.fileCount)}</p>
      <p><span data-i18n="totalSize"></span>: ${escapeHtml(formatBytes(s.totalBytes))}</p>
    </div>
    <div class="card">
      <h3 data-i18n="health"></h3>
      <table class="kv">
        <tr><th data-i18n="duplicates"></th><td>${formatCount(s.duplicateFiles)}</td></tr>
        <tr><th data-i18n="duplicateBytes"></th><td>${escapeHtml(formatBytes(s.duplicateBytes))}</td></tr>
        <tr><th data-i18n="oldFiles" data-years="${oldFileYears}"></th><td>${formatCount(s.oldFiles)}</td></tr>
        <tr><th data-i18n="emptyFiles"></th><td>${formatCount(s.emptyFiles)}</td></tr>
        <tr><th data-i18n="unreadable"></th><td>${formatCount(s.issues)}</td></tr>
        ${piiBlock}
      </table>
    </div>
  </div>
  <h3 data-i18n="byType"></h3>
  <table>
    <thead><tr><th data-i18n="type"></th><th data-i18n="count"></th><th data-i18n="size"></th></tr></thead>
    <tbody>${byTypeRows || `<tr><td colspan="3">—</td></tr>`}</tbody>
  </table>
  <h3 data-i18n="topDuplicates"></h3>
  ${dupBlocks}
  <h3 data-i18n="issues"></h3>
  ${
    issueRows
      ? `<table><thead><tr><th data-i18n="path"></th><th data-i18n="code"></th><th data-i18n="message"></th></tr></thead><tbody>${issueRows}</tbody></table>`
      : `<p class="muted" data-i18n="noIssues"></p>`
  }
</section>`;
}

/** Render a self-contained offline HTML scan report. */
export function renderScanReportHtml(input: HtmlReportInput): string {
  const sourcesHtml = input.sources
    .map((s, i) => renderSource(s, input.oldFileYears, i))
    .join("\n");
  const i18nJson = JSON.stringify(I18N).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KnotSync scan report</title>
<style>
:root {
  --bg: #f6f4ef;
  --fg: #1a1a1a;
  --muted: #5c5c5c;
  --card: #ffffff;
  --border: #d9d4c8;
  --accent: #0b6e4f;
  --code-bg: #efebe3;
  font-family: "Segoe UI", "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans", sans-serif;
}
html[data-theme="dark"] {
  --bg: #12141a;
  --fg: #e8e6e1;
  --muted: #a0a0a0;
  --card: #1c1f28;
  --border: #2e3340;
  --accent: #3ecf8e;
  --code-bg: #262b36;
}
@media (prefers-color-scheme: dark) {
  html[data-theme="auto"] {
    --bg: #12141a;
    --fg: #e8e6e1;
    --muted: #a0a0a0;
    --card: #1c1f28;
    --border: #2e3340;
    --accent: #3ecf8e;
    --code-bg: #262b36;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); line-height: 1.5; }
header, main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
header { border-bottom: 1px solid var(--border); }
h1 { margin: 0 0 0.5rem; font-size: 1.6rem; color: var(--accent); }
h2 { margin-top: 2rem; font-size: 1.25rem; }
h3 { margin-top: 1.25rem; font-size: 1.05rem; }
.meta, .muted { color: var(--muted); font-size: 0.92rem; }
.toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-top: 1rem; }
.toolbar button {
  background: var(--card); color: var(--fg); border: 1px solid var(--border);
  border-radius: 6px; padding: 0.35rem 0.7rem; cursor: pointer;
}
.toolbar button.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }
.big { font-size: 1.8rem; font-weight: 700; margin: 0.25rem 0; }
table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); }
th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--border); vertical-align: top; }
table.kv th { width: 55%; font-weight: 500; color: var(--muted); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code-bg); padding: 0.1rem 0.3rem; border-radius: 4px; word-break: break-all; }
.dup { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; margin: 0.5rem 0; }
.dup ul { margin: 0.35rem 0 0; padding-left: 1.2rem; }
.source { margin-bottom: 2.5rem; }
</style>
</head>
<body>
<header>
  <h1 data-i18n="title">KnotSync scan report</h1>
  <p class="meta"><span data-i18n="generated"></span>: ${escapeHtml(input.generatedAt)} · <span data-i18n="version"></span>: ${escapeHtml(input.version)}</p>
  <p class="meta"><span data-i18n="store"></span>: <code>${escapeHtml(input.storePath)}</code></p>
  <div class="toolbar" role="group">
    <span data-i18n="language"></span>:
    <button type="button" data-lang="en">EN</button>
    <button type="button" data-lang="ja">日本語</button>
    <button type="button" data-lang="vi">Tiếng Việt</button>
    <span data-i18n="theme"></span>:
    <button type="button" data-theme-set="auto" data-i18n="themeAuto"></button>
    <button type="button" data-theme-set="light" data-i18n="themeLight"></button>
    <button type="button" data-theme-set="dark" data-i18n="themeDark"></button>
  </div>
</header>
<main>
${sourcesHtml || `<p class="muted">No sources.</p>`}
</main>
<script>
(function () {
  var I18N = ${i18nJson};
  var years = ${JSON.stringify(input.oldFileYears)};
  function applyLang(lang) {
    if (!I18N[lang]) lang = "en";
    document.documentElement.lang = lang === "ja" ? "ja" : lang === "vi" ? "vi" : "en";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var text = (I18N[lang] && I18N[lang][key]) || (I18N.en && I18N.en[key]) || key;
      if (key === "oldFiles") text = text.replace("{years}", String(years));
      el.textContent = text;
    });
    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
    });
    try { localStorage.setItem("knot-sync-report-lang", lang); } catch (e) {}
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll("[data-theme-set]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-theme-set") === theme);
    });
    try { localStorage.setItem("knot-sync-report-theme", theme); } catch (e) {}
  }
  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () { applyLang(btn.getAttribute("data-lang")); });
  });
  document.querySelectorAll("[data-theme-set]").forEach(function (btn) {
    btn.addEventListener("click", function () { applyTheme(btn.getAttribute("data-theme-set")); });
  });
  var lang = "en";
  var theme = "auto";
  try {
    lang = localStorage.getItem("knot-sync-report-lang") || "en";
    theme = localStorage.getItem("knot-sync-report-theme") || "auto";
  } catch (e) {}
  applyLang(lang);
  applyTheme(theme);
})();
</script>
</body>
</html>
`;
}
