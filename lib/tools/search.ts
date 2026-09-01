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

  // Titles and snippets used to be collected into two separate arrays and
  // paired by index. A result without a snippet shifted every later snippet
  // onto the wrong result. Walk each title and take the snippet that follows
  // it before the next title instead.
  const titleRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i;

  const matches: { url: string; title: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(html))) {
    let href = m[1];
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) {
      try {
        href = decodeURIComponent(uddg[1]);
      } catch {
        /* leave the raw href */
      }
    }
    matches.push({ url: href, title: decode(m[2]), start: m.index, end: titleRe.lastIndex });
  }

  for (let i = 0; i < matches.length && results.length < limit; i++) {
    const item = matches[i];
    if (!item.url.startsWith("http")) continue;
    const region = html.slice(item.end, matches[i + 1]?.start ?? html.length);
    const snippet = snippetRe.exec(region);
    results.push({
      title: item.title || item.url,
      url: item.url,
      snippet: snippet ? decode(snippet[1]) : "",
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
