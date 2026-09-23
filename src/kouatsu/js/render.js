// 条文(Article)ノードを人間が読みやすいHTMLに変換する再帰レンダラー。
// e-Gov法令標準XMLスキーマの主要タグ(Paragraph/Item/Subitem1-3/List/Table等)を
// 明示的に扱い、未対応タグはテキストのみ安全に抽出するフォールバックを持つ。

import { extractText, extractSentenceText } from "./lawTree.js";

function renderEscapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderFindChild(node, tag) {
  if (!node || !Array.isArray(node.children)) return null;
  return node.children.find((c) => c && c.tag === tag) || null;
}
function renderFindChildren(node, tag) {
  if (!node || !Array.isArray(node.children)) return [];
  return node.children.filter((c) => c && c.tag === tag);
}
function textOf(node, tag) {
  const c = renderFindChild(node, tag);
  return c ? extractText(c).trim() : "";
}

export function renderArticle(articleNode) {
  const title = textOf(articleNode, "ArticleTitle");
  const caption = textOf(articleNode, "ArticleCaption");

  let html = '<div class="article">';
  html += '<div class="article-head">';
  if (caption) {
    html += `<span class="article-caption">${renderEscapeHtml(caption)}</span>`;
  }
  html += `<span class="article-title">${renderEscapeHtml(title)}</span>`;
  html += "</div>";

  for (const child of articleNode.children || []) {
    if (!child || typeof child !== "object") continue;
    if (child.tag === "Paragraph") {
      html += renderParagraph(child);
    } else if (child.tag === "ArticleCaption" || child.tag === "ArticleTitle") {
      // 見出しとして既に表示済み
    } else if (typeof child !== "string") {
      html += renderGenericBlock(child);
    }
  }

  html += "</div>";
  return html;
}

function renderParagraph(p) {
  const numText = textOf(p, "ParagraphNum"); // 第1項は空、第2項以降は全角数字
  const caption = textOf(p, "ParagraphCaption");
  const sentenceNode = renderFindChild(p, "ParagraphSentence");
  const sentenceText = sentenceNode ? extractSentenceText(sentenceNode) : "";

  let html = '<div class="paragraph">';
  if (caption) {
    html += `<div class="paragraph-caption">${renderEscapeHtml(caption)}</div>`;
  }
  html += '<div class="paragraph-line">';
  html += `<span class="para-num">${renderEscapeHtml(numText)}</span>`;
  html += `<span class="para-text">${renderEscapeHtml(sentenceText)}</span>`;
  html += "</div>";

  const items = renderFindChildren(p, "Item");
  if (items.length > 0) {
    html += '<div class="item-list">' + items.map(renderItem).join("") + "</div>";
  }

  const lists = renderFindChildren(p, "List");
  if (lists.length > 0) {
    html += lists.map(renderList).join("");
  }

  const tables = renderFindChildren(p, "TableStruct");
  if (tables.length > 0) {
    html += tables.map(renderTableStruct).join("");
  }

  const remarks = renderFindChildren(p, "Remarks");
  if (remarks.length > 0) {
    html += remarks.map(renderRemarks).join("");
  }

  html += "</div>";
  return html;
}

function renderItem(item) {
  const title = textOf(item, "ItemTitle");
  const sentenceNode = renderFindChild(item, "ItemSentence");
  const sentenceText = sentenceNode ? extractSentenceText(sentenceNode) : "";

  let html = '<div class="item">';
  html += '<div class="item-line">';
  html += `<span class="item-title">${renderEscapeHtml(title)}</span>`;
  html += `<span class="item-text">${renderEscapeHtml(sentenceText)}</span>`;
  html += "</div>";

  html += renderSubitems(item, 1);

  const tables = renderFindChildren(item, "TableStruct");
  if (tables.length > 0) {
    html += tables.map(renderTableStruct).join("");
  }

  html += "</div>";
  return html;
}

function renderSubitems(node, level) {
  const tag = `Subitem${level}`;
  const subs = renderFindChildren(node, tag);
  if (subs.length === 0) return "";

  const titleTag = `${tag}Title`;
  const sentenceTag = `${tag}Sentence`;

  let html = `<div class="subitem-list level-${level}">`;
  for (const sub of subs) {
    const title = textOf(sub, titleTag);
    const sentenceNode = renderFindChild(sub, sentenceTag);
    const sentenceText = sentenceNode ? extractSentenceText(sentenceNode) : "";
    html += `<div class="subitem level-${level}">`;
    html += '<div class="item-line">';
    html += `<span class="item-title">${renderEscapeHtml(title)}</span>`;
    html += `<span class="item-text">${renderEscapeHtml(sentenceText)}</span>`;
    html += "</div>";
    html += renderSubitems(sub, level + 1);
    html += "</div>";
  }
  html += "</div>";
  return html;
}

function renderList(listNode) {
  const sentences = renderFindChildren(listNode, "ListSentence");
  if (sentences.length === 0) {
    return `<div class="list-block">${renderEscapeHtml(extractText(listNode).trim())}</div>`;
  }
  return (
    '<div class="list-block">' +
    sentences.map((s) => `<div class="list-line">${renderEscapeHtml(extractSentenceText(s))}</div>`).join("") +
    "</div>"
  );
}

function renderRemarks(remarksNode) {
  const label = textOf(remarksNode, "RemarksLabel") || "備考";
  const paragraphs = renderFindChildren(remarksNode, "Paragraph");
  let html = '<div class="remarks">';
  html += `<div class="remarks-label">${renderEscapeHtml(label)}</div>`;
  if (paragraphs.length > 0) {
    html += paragraphs.map(renderParagraph).join("");
  } else {
    html += `<div class="remarks-text">${renderEscapeHtml(extractText(remarksNode).trim())}</div>`;
  }
  html += "</div>";
  return html;
}

function renderTableStruct(tableStructNode) {
  const table = renderFindChild(tableStructNode, "Table");
  if (!table) {
    return `<div class="table-fallback">${renderEscapeHtml(extractText(tableStructNode).trim())}</div>`;
  }
  const rows = renderFindChildren(table, "TableRow");
  let html = '<table class="law-table"><tbody>';
  for (const row of rows) {
    html += "<tr>";
    const cols = renderFindChildren(row, "TableColumn");
    for (const col of cols) {
      const attr = col.attr || {};
      const attrs = [];
      if (attr.colspan) attrs.push(`colspan="${renderEscapeHtml(attr.colspan)}"`);
      if (attr.rowspan) attrs.push(`rowspan="${renderEscapeHtml(attr.rowspan)}"`);
      html += `<td ${attrs.join(" ")}>${renderEscapeHtml(extractSentenceText(col))}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

// 上記で明示的に扱っていないタグに対する安全なフォールバック。
// 内容は失わず、プレーンテキストとして表示する。
function renderGenericBlock(node) {
  const text = extractText(node).trim();
  if (!text) return "";
  return `<div class="generic-block">${renderEscapeHtml(text)}</div>`;
}
