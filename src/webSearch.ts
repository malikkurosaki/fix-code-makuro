import * as https from "https";
import * as http from "http";
import { URL } from "url";

/* ============================================================
 * Web Search System - For Up-to-Date Information
 * ============================================================
 * Allows AI agent to search the web for:
 * - Latest documentation
 * - Error solutions
 * - Up-to-date best practices
 * - Package information
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: "google" | "duckduckgo" | "stackoverflow" | "github" | "direct";
}

export interface SearchRequest {
  query: string;
  type: "general" | "error" | "documentation" | "package" | "github";
  maxResults?: number;
}

export interface WebSearchResult {
  success: boolean;
  results: SearchResult[];
  summary: string;
  error?: string;
}

// Cache for search results
const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Rate limiting
let lastSearchTime = 0;
const MIN_SEARCH_INTERVAL = 2000; // 2 seconds between searches

/* ============================================================
 * Web Search Functions
 * ============================================================
 */

/**
 * Main search function - routes to appropriate provider
 */
export async function searchWeb(request: SearchRequest): Promise<WebSearchResult> {
  // Check rate limiting
  const now = Date.now();
  if (now - lastSearchTime < MIN_SEARCH_INTERVAL) {
    await sleep(MIN_SEARCH_INTERVAL - (now - lastSearchTime));
  }
  lastSearchTime = Date.now();

  // Check cache
  const cacheKey = `${request.type}:${request.query}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log("Using cached search results");
    return {
      success: true,
      results: cached.results,
      summary: generateSummary(cached.results),
    };
  }

  try {
    let results: SearchResult[] = [];

    switch (request.type) {
      case "error":
        results = await searchStackOverflow(request.query, request.maxResults);
        break;
      case "github":
        results = await searchGitHub(request.query, request.maxResults);
        break;
      case "documentation":
      case "package":
      case "general":
        results = await searchDuckDuckGo(request.query, request.maxResults);
        break;
    }

    // Cache results
    searchCache.set(cacheKey, {
      results,
      timestamp: Date.now(),
    });

    return {
      success: true,
      results,
      summary: generateSummary(results),
    };
  } catch (error) {
    console.error("Web search error:", error);
    return {
      success: false,
      results: [],
      summary: "",
      error: String(error),
    };
  }
}

/**
 * Search DuckDuckGo (doesn't require API key)
 */
async function searchDuckDuckGo(
  query: string,
  maxResults: number = 5
): Promise<SearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const html = await fetchUrl(url);

    // Parse results from HTML (simplified)
    const results: SearchResult[] = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/g;

    let match;
    let snippetMatch;
    let count = 0;

    while ((match = resultRegex.exec(html)) !== null && count < maxResults) {
      snippetMatch = snippetRegex.exec(html);

      results.push({
        title: decodeHtml(match[2]),
        url: decodeURIComponent(match[1]),
        snippet: snippetMatch ? decodeHtml(snippetMatch[1]) : "",
        source: "duckduckgo",
      });

      count++;
    }

    return results;
  } catch (error) {
    console.error("DuckDuckGo search error:", error);
    return [];
  }
}

/**
 * Search Stack Overflow for error solutions
 */
async function searchStackOverflow(
  query: string,
  maxResults: number = 3
): Promise<SearchResult[]> {
  try {
    // Use Stack Exchange API (doesn't require key for basic search)
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodedQuery}&accepted=True&site=stackoverflow`;

    const response = await fetchUrl(url);
    const data = JSON.parse(response);

    const results: SearchResult[] = [];

    if (data.items) {
      for (let i = 0; i < Math.min(data.items.length, maxResults); i++) {
        const item = data.items[i];
        results.push({
          title: decodeHtml(item.title),
          url: item.link,
          snippet: item.body_markdown
            ? item.body_markdown.substring(0, 200) + "..."
            : "Stack Overflow answer",
          source: "stackoverflow",
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Stack Overflow search error:", error);
    return [];
  }
}

/**
 * Search GitHub for code examples
 */
async function searchGitHub(
  query: string,
  maxResults: number = 3
): Promise<SearchResult[]> {
  try {
    // Use GitHub search API (limited without auth, but works for basic search)
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.github.com/search/code?q=${encodedQuery}&per_page=${maxResults}`;

    const response = await fetchUrl(url, {
      "User-Agent": "VSCode-Extension",
    });

    const data = JSON.parse(response);

    const results: SearchResult[] = [];

    if (data.items) {
      for (const item of data.items) {
        results.push({
          title: `${item.repository.full_name}: ${item.name}`,
          url: item.html_url,
          snippet: `Code example from ${item.repository.full_name}`,
          source: "github",
        });
      }
    }

    return results;
  } catch (error) {
    console.error("GitHub search error:", error);
    return [];
  }
}

/**
 * Fetch content from URL
 */
export async function fetchDocumentation(url: string): Promise<string> {
  try {
    const content = await fetchUrl(url);

    // Extract readable text from HTML (simplified)
    let text = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Limit to reasonable size
    if (text.length > 5000) {
      text = text.substring(0, 5000) + "...";
    }

    return text;
  } catch (error) {
    throw new Error(`Failed to fetch documentation: ${error}`);
  }
}

/**
 * Fetch URL content
 */
function fetchUrl(url: string, headers: any = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers,
      },
    };

    const req = protocol.request(options, (res) => {
      let data = "";

      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        if (res.headers.location) {
          return fetchUrl(res.headers.location, headers)
            .then(resolve)
            .catch(reject);
        }
      }

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.end();
  });
}

/**
 * Generate summary from search results
 */
function generateSummary(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No results found";
  }

  let summary = `Found ${results.length} relevant result(s):\n\n`;

  results.forEach((result, i) => {
    summary += `${i + 1}. ${result.title}\n`;
    summary += `   Source: ${result.source}\n`;
    summary += `   URL: ${result.url}\n`;
    if (result.snippet) {
      summary += `   ${result.snippet.substring(0, 150)}...\n`;
    }
    summary += "\n";
  });

  return summary;
}

/**
 * Decode HTML entities
 */
function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ============================================================
 * Smart Search Triggers
 * ============================================================
 */

/**
 * Detect if search is needed based on context
 */
export function shouldTriggerSearch(context: {
  userPrompt: string;
  errorMessage?: string;
  packageName?: string;
}): SearchRequest | null {
  const prompt = context.userPrompt.toLowerCase();

  // Explicit search requests
  if (
    prompt.includes("search") ||
    prompt.includes("find") ||
    prompt.includes("look up") ||
    prompt.includes("latest") ||
    prompt.includes("current") ||
    prompt.includes("up-to-date") ||
    prompt.includes("documentation") ||
    prompt.includes("docs")
  ) {
    // Determine search type
    if (prompt.includes("error") || context.errorMessage) {
      return {
        query: context.errorMessage || extractQuery(context.userPrompt),
        type: "error",
        maxResults: 3,
      };
    } else if (prompt.includes("github") || prompt.includes("example")) {
      return {
        query: extractQuery(context.userPrompt),
        type: "github",
        maxResults: 3,
      };
    } else if (prompt.includes("docs") || prompt.includes("documentation")) {
      return {
        query: context.packageName || extractQuery(context.userPrompt),
        type: "documentation",
        maxResults: 5,
      };
    } else {
      return {
        query: extractQuery(context.userPrompt),
        type: "general",
        maxResults: 5,
      };
    }
  }

  // Version/update related
  if (
    prompt.includes("latest version") ||
    prompt.includes("upgrade") ||
    prompt.includes("update to") ||
    prompt.includes("migrate")
  ) {
    return {
      query: extractQuery(context.userPrompt) + " latest version",
      type: "package",
      maxResults: 3,
    };
  }

  // Error resolution
  if (context.errorMessage && context.errorMessage.length > 10) {
    // Search for error solution
    return {
      query: context.errorMessage,
      type: "error",
      maxResults: 3,
    };
  }

  return null;
}

/**
 * Extract query from user prompt
 */
function extractQuery(prompt: string): string {
  // Remove common command words
  let query = prompt
    .replace(/please|can you|could you|search for|find|look up/gi, "")
    .trim();

  // Extract quoted text if present
  const quoted = query.match(/"([^"]+)"/);
  if (quoted) {
    return quoted[1];
  }

  // Limit length
  if (query.length > 100) {
    query = query.substring(0, 100);
  }

  return query;
}

/* ============================================================
 * Search Result Formatting
 * ============================================================
 */

/**
 * Format search results for AI consumption
 */
export function formatSearchResultsForAI(
  searchResult: WebSearchResult,
  request: SearchRequest
): string {
  if (!searchResult.success || searchResult.results.length === 0) {
    return `No web search results found for: "${request.query}"`;
  }

  let formatted = `\n=== Web Search Results ===\n\n`;
  formatted += `Query: "${request.query}"\n`;
  formatted += `Type: ${request.type}\n`;
  formatted += `Found: ${searchResult.results.length} result(s)\n\n`;

  searchResult.results.forEach((result, i) => {
    formatted += `Result ${i + 1}:\n`;
    formatted += `Title: ${result.title}\n`;
    formatted += `Source: ${result.source}\n`;
    formatted += `URL: ${result.url}\n`;

    if (result.snippet) {
      formatted += `Summary: ${result.snippet}\n`;
    }

    formatted += "\n";
  });

  formatted += `\nUse this information to provide an accurate, up-to-date response.\n`;

  return formatted;
}

/**
 * Format documentation content for AI
 */
export function formatDocumentationForAI(
  content: string,
  url: string
): string {
  return `\n=== Documentation from ${url} ===\n\n${content}\n\n`;
}

/* ============================================================
 * Cache Management
 * ============================================================
 */

/**
 * Clear search cache
 */
export function clearSearchCache(): void {
  searchCache.clear();
  console.log("Search cache cleared");
}

/**
 * Get cache statistics
 */
export function getSearchCacheStats(): {
  totalEntries: number;
  cacheKeys: string[];
} {
  return {
    totalEntries: searchCache.size,
    cacheKeys: Array.from(searchCache.keys()),
  };
}
