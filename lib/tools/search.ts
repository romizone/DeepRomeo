export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decode(html: string) {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function webSearch(query: string, limit = 6): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
  } catch {
    return [];
  }
  if (!res.ok) {
    return [];
  }
  const html = await res.text();
  const results: SearchResult[] = [];
  const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const titles: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    let href = m[1];
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    titles.push({ url: href, title: decode(m[2]) });
  }
  const snippets: string[] = [];
  while ((m = snippetRe.exec(html))) {
    snippets.push(decode(m[1]));
  }
  for (let i = 0; i < titles.length && results.length < limit; i++) {
    if (!titles[i].url.startsWith("http")) continue;
    results.push({
      title: titles[i].title || titles[i].url,
      url: titles[i].url,
      snippet: snippets[i] || "",
    });
  }
  return results;
}

export async function deepResearch(topic: string, questions: string[] = []) {
  const queries = [topic, ...questions].filter(Boolean).slice(0, 4);
  const packs = [];
  for (const q of queries) {
    const results = await webSearch(q, 5);
    packs.push({ query: q, results });
  }
  return { topic, packs };
}
