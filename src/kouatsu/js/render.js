// 条文(Article)ノードを人間が読みやすいHTMLに変換する再帰レンダラー。
// e-Gov法令標準XMLスキーマの主要タグ(Paragraph/Item/Subitem1-3/List/Table等)を
// 明示的に扱い、未対応タグはテキストのみ安全に抽出するフォールバックを持つ。

import { extractText, extractSentenceText } from "./lawTree.js";

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function findChild(node, tag) {
  if (!node || !Array.isArray(node.children)) return null;
  return node.children.find((c) => c && c.tag === tag) || null;
}
function findChildren(node, tag) {
  if (!node || !Array.isArray(node.children)) return [];
  return node.children.filter((c) => c && c.tag === tag);
}
function textOf(node, tag) {
  const c = findChild(node, tag);
  return c ? extractText(c).trim() : "";
}

export function renderArticle(articleNode) {
  const title = textOf(articleNode, "ArticleTitle");
  const caption = textOf(articleNode, "ArticleCaption");

  let html = '<div class="article">';
  html += '<div class="article-head">';
  if (caption) {
    html += `<span class="article-caption">${escapeHtml(caption)}</span>`;
  }
  html += `<span class="article-title">${escapeHtml(title)}</span>`;
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
  const sentenceNode = findChild(p, "ParagraphSentence");
  const sentenceText = sentenceNode ? extractSentenceText(sentenceNode) : "";

  let html = '<div class="paragraph">';
  if (caption) {
    html += `<div class="paragraph-caption">${escapeHtml(caption)}</div>`;
  }
  html += '<div class="paragraph-line">';
  html += `<span class="para-num">${escapeHtml(numText)}</span>`;
  html += `<span class="para-text">${escapeHtml(sentenceText)}</span>`;
  html += "</div>";

  const items = findChildren(p, "Item");
  if (items.length > 0) {
    html += '<div class="item-list">' + items.map(renderItem).join("") + "</div>";
  }

  const lists = findChildren(p, "List");
  if (lists.length > 0) {
    html += lists.map(renderList).join("");
  }

  const tables = findChildren(p, "TableStruct");
  if (tables.length > 0) {
    html += tables.map(renderTableStruct).join("");
  }

  const remarks = findChildren(p, "Remarks");
  if (remarks.length > 0) {
    html += remarks.map(renderRemarks).join("");
  }

  html += "</div>";
  return html;
}

function renderItem(item) {
  const title = textOf(item, "ItemTitle");
  const sentenceNode = findChild(item, "ItemSentence");
  const sentenceText = sentenceNode ? extractSentenceText(sentenceNode) : "";

  let html = '<div class="item">';
  html += '<div class="item-line">';
  html += `<span class="item-title">${escapeHtml(title)}</span>`;
  html += `<span class="item-text">${escapeHtml(sentenceText)}</span>`;
  html += "</div>";

  html += renderSubitems(item, 1);

  const tables = findChildren(item, "TableStruct");
  if (tables.length > 0) {
    html += tables.map(renderTableStruct).join("");
  }

  html += "</div>";
  return html;
}

function renderSubitems(node, level) {
  const tag = `Subitem${level}`;
  const subs = findChildren(node, tag);
  if (subs.length === 0) return "";

  const titleTag = `${tag}Title`;
  const sentenceTag = `${tag}Sentence`;

  let html = `<div class="subitem-list level-${level}">`;
  for (const sub of subs) {
    const title = textOf(sub, titleTag);
    const sentenceNode = findChild(sub, sentenceTag);
    const sentenceText = sentenceNode ? extractSentenceText(sentenceNode) : "";
    html += `<div class="subitem level-${level}">`;
    html += '<div class="item-line">';
    html += `<span class="item-title">${escapeHtml(title)}</span>`;
    html += `<span class="item-text">${escapeHtml(sentenceText)}</span>`;
    html += "</div>";
    html += renderSubitems(sub, level + 1);
    html += "</div>";
  }
  html += "</div>";
  return html;
}

function renderList(listNode) {
  const sentences = findChildren(listNode, "ListSentence");
  if (sentences.length === 0) {
    return `<div class="list-block">${escapeHtml(extractText(listNode).trim())}</div>`;
  }
  return (
    '<div class="list-block">' +
    sentences.map((s) => `<div class="list-line">${escapeHtml(extractSentenceText(s))}</div>`).join("") +
    "</div>"
  );
}

function renderRemarks(remarksNode) {
  const label = textOf(remarksNode, "RemarksLabel") || "備考";
  const paragraphs = findChildren(remarksNode, "Paragraph");
  let html = '<div class="remarks">';
  html += `<div class="remarks-label">${escapeHtml(label)}</div>`;
  if (paragraphs.length > 0) {
    html += paragraphs.map(renderParagraph).join("");
  } else {
    html += `<div class="remarks-text">${escapeHtml(extractText(remarksNode).trim())}</div>`;
  }
  html += "</div>";
  return html;
}

function renderTableStruct(tableStructNode) {
  const table = findChild(tableStructNode, "Table");
  if (!table) {
    return `<div class="table-fallback">${escapeHtml(extractText(tableStructNode).trim())}</div>`;
  }
  const rows = findChildren(table, "TableRow");
  let html = '<table class="law-table"><tbody>';
  for (const row of rows) {
    html += "<tr>";
    const cols = findChildren(row, "TableColumn");
    for (const col of cols) {
      const attr = col.attr || {};
      const attrs = [];
      if (attr.colspan) attrs.push(`colspan="${escapeHtml(attr.colspan)}"`);
      if (attr.rowspan) attrs.push(`rowspan="${escapeHtml(attr.rowspan)}"`);
      html += `<td ${attrs.join(" ")}>${escapeHtml(extractSentenceText(col))}</td>`;
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
  return `<div class="generic-block">${escapeHtml(text)}</div>`;
}
