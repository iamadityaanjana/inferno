/**
 * Free, keyless public APIs the marketplace agents read from.
 *
 * Every source here needs no API key and no account, which is what makes it
 * safe to hire one for a fraction of a MON. Each fetcher returns short lines of
 * plain English — never raw JSON — because the output is handed straight to the
 * model that writes the chat reply. Keeping the shaping here means a hire can
 * never leak a payload dump into the conversation.
 *
 * Server-only. Do not import from a client component.
 */

export type SourceId =
  | "monad-yields"
  | "monad-tvl"
  | "monad-dex"
  | "token-prices"
  | "trending-tokens"
  | "market-sentiment"
  | "weather"
  | "tech-news"
  | "encyclopedia";

export type DataSource = {
  id: SourceId;
  /** Marketplace agent name. */
  name: string;
  /** Registry `capabilities` string, also the marketplace card copy. */
  blurb: string;
  /** Deliberately small — these are cheap lookups, not deep research. */
  priceMon: string;
  provider: string;
  docs: string;
  fetch: (task: string) => Promise<string[]>;
};

const UA = { "User-Agent": "Inferno/1.0 (Monad agent marketplace)" };

async function getJson<T>(url: string, ms = 12_000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { ...UA, Accept: "application/json" },
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- formatting */

function usd(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "unknown";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

/** Spot prices stay uncompressed — "$2.4K" reads as an error next to "$2,429.00". */
function price(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "unknown";
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}

function pct(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "unknown";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function daysAgo(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/* --------------------------------------------------------- cache for big feeds */

/**
 * The DefiLlama yield feed is ~2.3MB gzipped and covers every chain, so a fresh
 * download per hire would dominate the response time. Cached per server
 * instance; a few minutes of staleness is invisible next to that cost.
 */
const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 5 * 60_000;

async function cachedJson<T>(key: string, url: string, ms = 20_000): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const fresh = await getJson<T>(url, ms);
  if (fresh) cache.set(key, { at: Date.now(), value: fresh });
  return fresh;
}

/* ------------------------------------------------------------------- keywords */

const STOPWORDS = new Set([
  "what","whats","which","who","why","when","where","how","is","are","was","were","the","a","an","of","for","to","in",
  "on","at","by","from","with","and","or","but","do","does","did","can","could","should","would","will","shall","i",
  "me","my","we","our","you","your","it","its","this","that","these","those","there","be","been","being","get","give",
  "tell","show","find","best","good","right","now","today","about","any","some","more","most","much","many","please",
  "like","just","really","currently","also","into","over","than","then","them","they",
  // Question scaffolding. Left in, these become search terms and match nothing.
  "happening","happens","happen","going","work","works","working","mean","means","explain","latest","news","recent",
  "new","update","updates","think","look","looks","using","use","used","make","makes","made","need","needs","want",
  "help","said","says","tell","told","compare","summarise","summarize","score","check","worth","state",
]);

/**
 * Keyword-matching search APIs need the question stripped down. Passing a whole
 * sentence makes them either AND themselves into zero hits or latch onto the
 * filler — "what is impermanent loss" once matched a Wikipedia page on ego death.
 */
function keywords(task: string, limit = 4) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of task.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (word.length < 3 || STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length === limit) break;
  }
  return out;
}

/** Guards against a search API confidently returning an unrelated article. */
function looksRelated(title: string, terms: string[]) {
  const hay = title.toLowerCase();
  return terms.some((t) => (t.length >= 5 ? hay.includes(t.slice(0, 5)) : hay.includes(t)));
}

/**
 * Best guess at a place name in free text: an "in/at/for/near X" phrase first,
 * then any capitalised run that is not the opening word. Deliberately loose —
 * the geocoder is the real validator, and it returns nothing for a non-place.
 */
function placeIn(task: string) {
  const phrase = task.match(/\b(?:in|at|for|near|around)\s+([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*){0,2})/);
  if (phrase) return phrase[1].trim();
  const capitalised = task.match(/\b[A-Z][\w'’-]{2,}(?:\s+[A-Z][\w'’-]{2,})?/g) ?? [];
  const candidate = capitalised.find((c) => !task.trimStart().startsWith(c));
  return candidate?.trim() ?? null;
}

/** WMO weather codes, grouped — the full table is far more detail than a chat needs. */
function sky(code: number | undefined) {
  if (code == null) return "unclear conditions";
  if (code === 0) return "clear sky";
  if (code <= 2) return "mostly clear";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";
  return "thunderstorms";
}

/* ------------------------------------------------------------------ token ids */

const SYMBOL_IDS: Record<string, string> = {
  mon: "monad",
  monad: "monad",
  eth: "ethereum",
  ethereum: "ethereum",
  btc: "bitcoin",
  bitcoin: "bitcoin",
  sol: "solana",
  solana: "solana",
  usdc: "usd-coin",
  usdt: "tether",
  arb: "arbitrum",
  op: "optimism",
  link: "chainlink",
};

/** Pulls coin ids out of the task text, always keeping MON in the comparison. */
function coinIdsFor(task: string) {
  const words = task.toLowerCase().match(/[a-z]+/g) ?? [];
  const ids = new Set<string>(["monad"]);
  for (const word of words) {
    const id = SYMBOL_IDS[word];
    if (id) ids.add(id);
  }
  if (ids.size === 1) ids.add("ethereum");
  return [...ids].slice(0, 6);
}

/* -------------------------------------------------------------------- sources */

type LlamaPool = {
  chain?: string;
  project?: string;
  symbol?: string;
  tvlUsd?: number;
  apy?: number;
  apyBase?: number;
  stablecoin?: boolean;
  ilRisk?: string;
};

type LlamaChain = { name?: string; tvl?: number; tokenSymbol?: string };

type CgMarket = {
  id: string;
  symbol: string;
  name: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
};

const SOURCES: DataSource[] = [
  {
    id: "monad-yields",
    name: "Monad Yield Scout",
    blurb: "Live Monad lending and LP pools with real APY and TVL, from the DefiLlama yields feed",
    priceMon: "0.02",
    provider: "DefiLlama",
    docs: "https://defillama.com/docs/api",
    async fetch() {
      const data = await cachedJson<{ data?: LlamaPool[] }>("llama-yields", "https://yields.llama.fi/pools", 25_000);
      const pools = (data?.data ?? []).filter((p) => (p.chain ?? "").toLowerCase() === "monad");
      if (pools.length === 0) return [];

      const byTvl = [...pools].sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)).slice(0, 6);
      const earning = pools
        .filter((p) => (p.apy ?? 0) > 0.5 && (p.tvlUsd ?? 0) > 250_000)
        .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
        .slice(0, 6);

      const lines = [`Monad has ${pools.length} tracked pools on DefiLlama right now.`];
      lines.push("Largest by deposits:");
      for (const p of byTvl) {
        lines.push(`- ${p.project} ${p.symbol}: ${usd(p.tvlUsd)} deposited, APY ${(p.apy ?? 0).toFixed(2)}%`);
      }
      if (earning.length) {
        lines.push("Highest APY among pools holding over $250K:");
        for (const p of earning) {
          const risk = p.stablecoin ? "stablecoin" : p.ilRisk === "yes" ? "impermanent-loss risk" : "volatile pair";
          lines.push(`- ${p.project} ${p.symbol}: ${(p.apy ?? 0).toFixed(2)}% APY, ${usd(p.tvlUsd)} TVL, ${risk}`);
        }
      }
      return lines;
    },
  },
  {
    id: "monad-tvl",
    name: "Chain TVL Reader",
    blurb: "Total value locked on Monad and how it ranks against other chains, from DefiLlama",
    priceMon: "0.01",
    provider: "DefiLlama",
    docs: "https://defillama.com/docs/api",
    async fetch() {
      const chains = await cachedJson<LlamaChain[]>("llama-chains", "https://api.llama.fi/v2/chains");
      if (!chains?.length) return [];
      const ranked = [...chains].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));
      const i = ranked.findIndex((c) => (c.name ?? "").toLowerCase() === "monad");
      if (i < 0) return ["DefiLlama does not track a TVL figure for Monad yet."];
      const monad = ranked[i];
      const lines = [
        `Monad TVL is ${usd(monad.tvl)}, ranking ${i + 1} of ${ranked.length} chains DefiLlama tracks.`,
      ];
      const above = ranked[i - 1];
      const below = ranked[i + 1];
      if (above) lines.push(`Just above it: ${above.name} at ${usd(above.tvl)}.`);
      if (below) lines.push(`Just below it: ${below.name} at ${usd(below.tvl)}.`);
      return lines;
    },
  },
  {
    id: "monad-dex",
    name: "DEX Volume Reader",
    blurb: "Monad DEX trading volume over 24h, 7d and 30d plus the busiest venues, from DefiLlama",
    priceMon: "0.01",
    provider: "DefiLlama",
    docs: "https://defillama.com/docs/api",
    async fetch() {
      const d = await cachedJson<{
        total24h?: number;
        total7d?: number;
        total30d?: number;
        protocols?: { name?: string; total24h?: number }[];
      }>(
        "llama-dex-monad",
        "https://api.llama.fi/overview/dexs/monad?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
      );
      if (!d) return [];
      const lines = [
        `Monad DEX volume: ${usd(d.total24h)} in the last 24h, ${usd(d.total7d)} over 7 days, ${usd(d.total30d)} over 30 days.`,
      ];
      const top = (d.protocols ?? [])
        .filter((p) => (p.total24h ?? 0) > 0)
        .sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))
        .slice(0, 5);
      if (top.length) {
        lines.push("Busiest venues in the last 24h:");
        for (const p of top) lines.push(`- ${p.name}: ${usd(p.total24h)}`);
      }
      return lines;
    },
  },
  {
    id: "token-prices",
    name: "Token Price Feed",
    blurb: "Spot price, 24h move, market cap and volume for MON and major tokens, from CoinGecko",
    priceMon: "0.01",
    provider: "CoinGecko",
    docs: "https://www.coingecko.com/en/api",
    async fetch(task) {
      const ids = coinIdsFor(task).join(",");
      const markets = await getJson<CgMarket[]>(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`,
      );
      if (!markets?.length) return [];
      return markets.map(
        (c) =>
          `${c.name} (${c.symbol.toUpperCase()}): ${price(c.current_price)}, ${pct(c.price_change_percentage_24h)} over 24h, market cap ${usd(c.market_cap)} at rank ${c.market_cap_rank ?? "unranked"}, 24h volume ${usd(c.total_volume)}.`,
      );
    },
  },
  {
    id: "trending-tokens",
    name: "Trending Token Watch",
    blurb: "What the market is searching for right now — trending coins with price, 24h move and market cap, from CoinGecko",
    priceMon: "0.01",
    provider: "CoinGecko",
    docs: "https://www.coingecko.com/en/api",
    async fetch() {
      const d = await getJson<{
        coins?: {
          item?: {
            name?: string;
            symbol?: string;
            market_cap_rank?: number;
            data?: { price?: number | string; market_cap?: string; price_change_percentage_24h?: { usd?: number } };
          };
        }[];
      }>("https://api.coingecko.com/api/v3/search/trending");
      const coins = (d?.coins ?? []).map((c) => c.item).filter(Boolean).slice(0, 7);
      if (!coins.length) return [];
      return [
        "Tokens trending on CoinGecko by search volume right now:",
        ...coins.map((c) => {
          const change = c!.data?.price_change_percentage_24h?.usd;
          const spot = typeof c!.data?.price === "number" ? price(c!.data.price as number) : String(c!.data?.price ?? "unknown");
          return `- ${c!.name} (${(c!.symbol ?? "").toUpperCase()}): ${spot}, ${pct(change)} over 24h, market cap ${c!.data?.market_cap ?? "unknown"}, rank ${c!.market_cap_rank ?? "unranked"}`;
        }),
        "Trending means heavily searched, which is not the same as a good investment.",
      ];
    },
  },
  {
    id: "weather",
    name: "Weather Reader",
    blurb: "Current conditions and a three-day outlook for any named town or city, from Open-Meteo",
    priceMon: "0.01",
    provider: "Open-Meteo",
    docs: "https://open-meteo.com/en/docs",
    async fetch(task) {
      // Open-Meteo's geocoder fuzzy-matches, so "Monad yields" resolves to a
      // town called Monada in Chad. Requiring weather intent in the question is
      // a far better guard than trying to score the place name.
      if (!/weather|forecast|rain|snow|temperature|temp\b|humid|wind|sunny|cloud|storm|hot|cold|climate|umbrella/i.test(task)) {
        return [];
      }
      const place = placeIn(task);
      if (!place) return [];

      const geo = await getJson<{
        results?: { name?: string; latitude?: number; longitude?: number; country?: string; admin1?: string }[];
      }>(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(place)}`);
      const spot = geo?.results?.[0];
      // No geocode means the guessed phrase was not a place. Drop out rather
      // than reporting the weather somewhere the user never asked about.
      if (!spot?.latitude || !spot?.longitude) return [];

      const w = await getJson<{
        current?: { temperature_2m?: number; relative_humidity_2m?: number; wind_speed_10m?: number; weather_code?: number };
        daily?: {
          time?: string[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          precipitation_probability_max?: number[];
          weather_code?: number[];
        };
      }>(
        `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}` +
          `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
          `&forecast_days=3&timezone=auto`,
      );
      if (!w?.current) return [];

      const where = [spot.name, spot.admin1, spot.country].filter(Boolean).join(", ");
      const lines = [
        `${where} right now: ${w.current.temperature_2m}°C, ${sky(w.current.weather_code)}, humidity ${w.current.relative_humidity_2m}%, wind ${w.current.wind_speed_10m} km/h.`,
      ];
      const daily = w.daily;
      if (daily?.time?.length) {
        lines.push("Next three days:");
        daily.time.forEach((day, i) => {
          lines.push(
            `- ${day}: ${daily.temperature_2m_min?.[i]}°C to ${daily.temperature_2m_max?.[i]}°C, ${sky(daily.weather_code?.[i])}, ${daily.precipitation_probability_max?.[i]}% chance of rain`,
          );
        });
      }
      return lines;
    },
  },
  {
    id: "market-sentiment",
    name: "Sentiment Gauge",
    blurb: "The crypto Fear and Greed index today and how it has moved this week, from Alternative.me",
    priceMon: "0.01",
    provider: "Alternative.me",
    docs: "https://alternative.me/crypto/fear-and-greed-index/",
    async fetch() {
      const d = await getJson<{ data?: { value?: string; value_classification?: string }[] }>(
        "https://api.alternative.me/fng/?limit=7",
      );
      const rows = d?.data ?? [];
      if (!rows.length) return [];
      const today = rows[0];
      const lines = [
        `Crypto Fear and Greed index is ${today.value} today, which reads as ${today.value_classification}.`,
      ];
      const week = rows
        .slice(1)
        .map((r) => r.value)
        .filter(Boolean);
      if (week.length) lines.push(`Previous days, most recent first: ${week.join(", ")}.`);
      lines.push("The index covers crypto market-wide sentiment, not Monad specifically.");
      return lines;
    },
  },
  {
    id: "tech-news",
    name: "Tech Story Scanner",
    blurb:
      "Hacker News discussion from the last two years on a tech or crypto topic, with scores and dates. Broad coverage, thin on Monad itself",
    priceMon: "0.01",
    provider: "Hacker News",
    docs: "https://hn.algolia.com/api",
    async fetch(task) {
      const terms = keywords(task, 3);
      if (!terms.length) return [];

      // Algolia ANDs the query, so three terms often match nothing. Widen a step
      // at a time, but never down to one term: a bare "monad" returns Haskell
      // tutorials and Mona Lisa stories, and a wrong answer is worse than none.
      // Also bounded to two years, or the feed surfaces decade-old threads.
      const since = Math.floor(Date.now() / 1000) - 730 * 86_400;
      type Hit = { title?: string; points?: number; num_comments?: number; created_at?: string };
      let hits: Hit[] = [];
      for (let take = terms.length; take >= 2 && hits.length === 0; take--) {
        const d = await getJson<{ hits?: Hit[] }>(
          `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=12&typoTolerance=false&restrictSearchableAttributes=title` +
            `&numericFilters=created_at_i>${since}&query=${encodeURIComponent(terms.slice(0, take).join(" "))}`,
          8_000,
        );
        // Even with typo tolerance off, Algolia ranks loosely enough to return
        // "Dell ... starting Monday" for "monad". Demand a real title match.
        hits = (d?.hits ?? []).filter((h) => h.title && looksRelated(h.title, terms)).slice(0, 6);
      }
      if (!hits.length) return [];
      return [
        "Hacker News stories from the last two years matching the question:",
        ...hits.map(
          (h) =>
            `- "${h.title}" — ${h.points ?? 0} points, ${h.num_comments ?? 0} comments, ${h.created_at ? daysAgo(h.created_at) : "undated"}`,
        ),
        "These are keyword matches. Ignore any story that is off-topic and say so if none are relevant.",
      ];
    },
  },
  {
    id: "encyclopedia",
    name: "Reference Lookup",
    blurb: "Plain-language background on a concept or protocol, from the Wikipedia REST API",
    priceMon: "0.01",
    provider: "Wikipedia",
    docs: "https://en.wikipedia.org/api/rest_v1/",
    async fetch(task) {
      const terms = keywords(task, 3);
      if (!terms.length) return [];
      const found = await getJson<{ pages?: { key?: string; title?: string }[] }>(
        `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(terms.join(" "))}&limit=4`,
      );
      // Wikipedia will happily return something adjacent, and a wrong article is
      // worse than none when the answer is being paid for. Title must match.
      const pages = (found?.pages ?? []).filter((p) => p.key && looksRelated(p.title ?? p.key!, terms)).slice(0, 2);
      if (!pages.length) return [];
      const lines: string[] = [];
      for (const page of pages) {
        const summary = await getJson<{ title?: string; extract?: string }>(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key!)}`,
        );
        if (summary?.extract) lines.push(`${summary.title}: ${summary.extract.slice(0, 420)}`);
      }
      return lines;
    },
  },
];

export function allSources() {
  return SOURCES;
}

export function getSource(id: string) {
  return SOURCES.find((s) => s.id === id) ?? null;
}

/**
 * Binds a hire to its feed using the registry name. The on-chain name is the
 * durable record, so this keeps data agents working on hosts with no writable
 * disk, where the local listings file does not survive.
 */
export function getSourceByName(name: string) {
  const wanted = name.trim().toLowerCase();
  return SOURCES.find((s) => s.name.toLowerCase() === wanted) ?? null;
}

/**
 * Runs a source and returns readable lines, or an empty list if the upstream API
 * is slow or down. A paid hire still answers in that case — the model just falls
 * back to what it knows and says the live feed was unavailable.
 */
export async function readSource(id: string, task: string) {
  const source = getSource(id);
  if (!source) return [];
  try {
    return await source.fetch(task);
  } catch {
    return [];
  }
}
