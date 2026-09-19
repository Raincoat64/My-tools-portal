// e-Gov 法令API v2 の law_full_text (tag/attr/children のXML由来ツリー) から
// 法令 → 章 → 節(あれば) → 条 のナビゲーション構造を組み立てるユーティリティ。

// ノード配下の文字列を再帰的に連結して取り出す(タグに関わらず安全に使える)。
export function extractText(node) {
  if (typeof node === "string") return node;
  if (!node || !Array.isArray(node.children)) return "";
  return node.children.map(extractText).join("");
}

// 指定タグの直接の子ノードを1つ取得。
function findChild(node, tag) {
  if (!node || !Array.isArray(node.children)) return null;
  return node.children.find((c) => c && c.tag === tag) || null;
}

function findChildren(node, tag) {
  if (!node || !Array.isArray(node.children)) return [];
  return node.children.filter((c) => c && c.tag === tag);
}

function getChildText(node, tag) {
  const child = findChild(node, tag);
  return child ? extractText(child).trim() : "";
}

// Column を持つ文(定義規定などで「用語」「意義」のように列が分かれる場合)を
// 読みやすく全角スペース区切りで連結する。Column が無ければ通常のテキスト抽出。
export function extractSentenceText(node) {
  if (!node) return "";
  const columns = findChildren(node, "Column");
  if (columns.length > 0) {
    return columns.map((c) => extractText(c).trim()).join("　");
  }
  return extractText(node).trim();
}

function makeArticleSummary(articleNode) {
  const num = articleNode.attr && articleNode.attr.Num;
  const title = getChildText(articleNode, "ArticleTitle") || `第${num}条`;
  const caption = getChildText(articleNode, "ArticleCaption");
  return { num, title, caption, node: articleNode };
}

// Section/Subsection など入れ子構造の中から Article を出現順にすべて収集する。
function collectArticlesDeep(nodes) {
  let result = [];
  for (const n of nodes || []) {
    if (!n || typeof n !== "object") continue;
    if (n.tag === "Article") {
      result.push(makeArticleSummary(n));
    } else if (Array.isArray(n.children)) {
      result = result.concat(collectArticlesDeep(n.children));
    }
  }
  return result;
}

// LawBody.MainProvision から 章(Chapter) → 節(Section) → 条(Article) の
// ナビゲーションツリーを構築する。章が無い法令は単一の仮想章にまとめる。
export function buildChapters(mainProvisionNode) {
  const topChildren = (mainProvisionNode && mainProvisionNode.children) || [];
  const hasChapters = topChildren.some((c) => c && c.tag === "Chapter");

  if (!hasChapters) {
    const articles = collectArticlesDeep(topChildren);
    if (articles.length === 0) return [];
    return [
      {
        key: "c-single",
        num: null,
        title: null,
        sections: [],
        articles,
      },
    ];
  }

  const chapters = [];
  topChildren
    .filter((c) => c && c.tag === "Chapter")
    .forEach((chapterNode, ci) => {
      const num = (chapterNode.attr && chapterNode.attr.Num) || String(ci);
      const title = getChildText(chapterNode, "ChapterTitle") || `第${num}章`;
      const sections = [];
      const directArticles = [];

      for (const child of chapterNode.children || []) {
        if (!child || typeof child !== "object") continue;
        if (child.tag === "Section") {
          const sNum = (child.attr && child.attr.Num) || String(sections.length);
          const sTitle = getChildText(child, "SectionTitle") || `第${sNum}節`;
          const sArticles = collectArticlesDeep(child.children || []);
          if (sArticles.length > 0) {
            sections.push({
              key: `c${num}-s${sNum}`,
              num: sNum,
              title: sTitle,
              articles: sArticles,
            });
          }
        } else if (child.tag === "Article") {
          directArticles.push(makeArticleSummary(child));
        }
      }

      if (sections.length > 0 || directArticles.length > 0) {
        chapters.push({
          key: `c${num}`,
          num,
          title,
          sections,
          articles: directArticles,
        });
      }
    });

  return chapters;
}

export function getLawTitle(lawData) {
  const lawBody = findChild(lawData.law_full_text, "LawBody");
  return getChildText(lawBody, "LawTitle") || lawData.revision_info?.law_title || "";
}

export function getMainProvision(lawData) {
  const lawBody = findChild(lawData.law_full_text, "LawBody");
  return findChild(lawBody, "MainProvision");
}

// 条番号(例: "5", "3_2")を指定して、法令内から該当条文ノードを1件検索する。
// 設問モードの判定根拠(引用条文)を表示するために使う。
export function findArticleByNum(mainProvisionNode, num) {
  const stack = [mainProvisionNode];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.tag === "Article" && node.attr && node.attr.Num === num) {
      return makeArticleSummary(node);
    }
    for (const c of node.children || []) {
      if (c && typeof c === "object") stack.push(c);
    }
  }
  return null;
}
