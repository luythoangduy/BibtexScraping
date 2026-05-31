const path = require("node:path");
const express = require("express");
const multer = require("multer");
const readXlsxFile = require("read-excel-file/node");
const writeXlsxFile = require("write-excel-file/node");
require("dotenv").config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PORT = Number(process.env.PORT || 3000);
const MATCH_THRESHOLD = 0.92;
const BIBTEX_DOWNLOAD_DELAY_MS = Number(process.env.BIBTEX_DOWNLOAD_DELAY_MS || 2500);
const BIBTEX_RETRY_ATTEMPTS = Number(process.env.BIBTEX_RETRY_ATTEMPTS || 4);
const BIBTEX_RETRY_BASE_DELAY_MS = Number(
  process.env.BIBTEX_RETRY_BASE_DELAY_MS || 5000
);

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/samples", express.static(path.join(__dirname, "samples")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasEnvApiKey: Boolean(process.env.SERPAPI_API_KEY) });
});

app.post("/api/lookup", upload.single("file"), async (req, res) => {
  try {
    const apiKey = String(req.body.apiKey || process.env.SERPAPI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(400).json({ error: "Missing SerpApi API key." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Missing Excel file." });
    }

    const titles = await extractTitles(req.file.buffer);
    if (titles.length === 0) {
      return res.status(400).json({
        error: "No paper titles found. Use a column named title or ten_bai_bao.",
      });
    }

    const rows = [];
    for (const [index, title] of titles.entries()) {
      rows.push(await lookupOneTitle({ title, apiKey, index: index + 1 }));
    }

    const workbookBase64 = await buildResultsWorkbook(rows);
    res.json({
      rows,
      fileName: "bibtex-results.xlsx",
      workbookBase64,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Unexpected server error." });
  }
});

async function extractTitles(buffer) {
  const parsedRows = await readXlsxFile(buffer);
  const rows =
    Array.isArray(parsedRows) &&
    parsedRows[0] &&
    Array.isArray(parsedRows[0].data)
      ? parsedRows[0].data
      : parsedRows;
  if (rows.length === 0) return [];

  const header = asRow(rows[0]).map((cell) => String(cell ?? "").trim());
  const normalizedHeader = header.map(normalizeHeader);
  const titleColumnIndex = findTitleColumnIndex(normalizedHeader);

  if (titleColumnIndex >= 0) {
    return rows
      .slice(1)
      .map((row) => String(asRow(row)[titleColumnIndex] || "").trim())
      .filter(Boolean);
  }

  return rows
    .flatMap((row) => asRow(row).slice(0, 1))
    .map((cell) => String(cell || "").trim())
    .filter((value, index) => value && index > 0);
}

function asRow(row) {
  return Array.isArray(row) ? row : [];
}

function findTitleColumnIndex(normalizedHeader) {
  const accepted = new Set([
    "title",
    "paper_title",
    "article_title",
    "ten_bai_bao",
    "tenbaibao",
    "publication_title",
  ]);

  return normalizedHeader.findIndex((name) => accepted.has(name));
}

function normalizeHeader(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function lookupOneTitle({ title, apiKey, index }) {
  const baseRow = {
    index,
    inputTitle: title,
    status: "warning",
    warning: "",
    matchedTitle: "",
    matchScore: 0,
    resultId: "",
    resultLink: "",
    bibtex: "",
  };

  try {
    const scholarData = await serpApiSearch({
      engine: "google_scholar",
      apiKey,
      q: title,
      num: "10",
      hl: "en",
    });
    const results = scholarData.organic_results || [];
    const match = pickBestTitleMatch(title, results);

    if (!match || match.score < MATCH_THRESHOLD) {
      return {
        ...baseRow,
        matchedTitle: match?.result?.title || "",
        matchScore: roundScore(match?.score || 0),
        resultId: match?.result?.result_id || "",
        resultLink: match?.result?.link || "",
        warning: match
          ? "Title does not match the Scholar result closely enough; BibTeX was not fetched."
          : "No Google Scholar result found for this title.",
      };
    }

    const resultId = match.result.result_id;
    if (!resultId) {
      return {
        ...baseRow,
        matchedTitle: match.result.title || "",
        matchScore: roundScore(match.score),
        resultLink: match.result.link || "",
        warning: "Matched title, but Scholar result has no result_id for Cite API.",
      };
    }

    const citeData = await serpApiSearch({
      engine: "google_scholar_cite",
      apiKey,
      q: resultId,
      hl: "en",
    });
    const bibtexLink = (citeData.links || []).find(
      (link) => normalizeHeader(link.name) === "bibtex"
    )?.link;

    if (!bibtexLink) {
      return {
        ...baseRow,
        matchedTitle: match.result.title || "",
        matchScore: roundScore(match.score),
        resultId,
        resultLink: match.result.link || "",
        warning: "Matched title, but SerpApi Cite API did not return a BibTeX link.",
      };
    }

    const matchedRow = {
      ...baseRow,
      matchedTitle: match.result.title || "",
      matchScore: roundScore(match.score),
      resultId,
      resultLink: match.result.link || "",
    };

    let bibtex = "";
    try {
      bibtex = await fetchTextWithRetry(bibtexLink);
    } catch (error) {
      return {
        ...matchedRow,
        warning: error.message || "BibTeX download failed.",
      };
    }

    return {
      ...matchedRow,
      status: "ok",
      warning: "",
      bibtex,
    };
  } catch (error) {
    return {
      ...baseRow,
      warning: error.message || "Lookup failed.",
    };
  }
}

async function serpApiSearch(params) {
  const url = new URL("https://serpapi.com/search.json");
  Object.entries(params).forEach(([key, value]) => {
    const paramName = key === "apiKey" ? "api_key" : key;
    url.searchParams.set(paramName, value);
  });

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error || `SerpApi request failed with HTTP ${response.status}.`);
  }
  return data;
}

async function fetchTextWithRetry(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= BIBTEX_RETRY_ATTEMPTS; attempt += 1) {
    if (BIBTEX_DOWNLOAD_DELAY_MS > 0) {
      await sleep(BIBTEX_DOWNLOAD_DELAY_MS);
    }

    try {
      return await fetchText(url);
    } catch (error) {
      lastError = error;
      const shouldRetry = error.status === 429 || error.status >= 500;
      if (!shouldRetry || attempt === BIBTEX_RETRY_ATTEMPTS) {
        break;
      }

      const retryAfterMs = Number(error.retryAfterSeconds || 0) * 1000;
      const backoffMs =
        retryAfterMs ||
        BIBTEX_RETRY_BASE_DELAY_MS * attempt + Math.floor(Math.random() * 1000);
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error("BibTeX download failed.");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 Scholar BibTeX Fetcher",
      Referer: "https://scholar.google.com/",
      Accept: "text/plain,*/*",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const error = new Error(
      response.status === 429
        ? "BibTeX download was rate-limited by Google Scholar (HTTP 429). Try again later or increase BIBTEX_DOWNLOAD_DELAY_MS."
        : `BibTeX download failed with HTTP ${response.status}.`
    );
    error.status = response.status;
    error.retryAfterSeconds = retryAfter ? Number(retryAfter) : 0;
    throw error;
  }
  return text.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickBestTitleMatch(inputTitle, results) {
  let best = null;
  for (const result of results) {
    if (!result.title) continue;
    const score = titleSimilarity(inputTitle, result.title);
    if (!best || score > best.score) {
      best = { result, score };
    }
  }
  return best;
}

function titleSimilarity(left, right) {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const leftTokens = new Set(a.split(" "));
  const rightTokens = new Set(b.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  const jaccard = intersection / union;
  const distanceScore = 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
  return Math.max(jaccard, distanceScore);
}

function normalizeTitle(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function roundScore(score) {
  return Math.round(score * 1000) / 1000;
}

async function buildResultsWorkbook(rows) {
  const worksheetRows = [
    [
      "index",
      "input_title",
      "status",
      "warning",
      "matched_title",
      "match_score",
      "result_id",
      "result_link",
      "bibtex",
    ],
    ...rows.map((row) => [
      row.index,
      row.inputTitle,
      row.status,
      row.warning,
      row.matchedTitle,
      row.matchScore,
      row.resultId,
      row.resultLink,
      row.bibtex,
    ]),
  ];

  const headerStyle = {
    fontWeight: "bold",
    backgroundColor: "#E2E8F0",
    align: "center",
  };
  const sheetData = worksheetRows.map((row, rowIndex) =>
    row.map((value) =>
      rowIndex === 0
        ? { value, ...headerStyle }
        : { value: value ?? "", wrap: true, alignVertical: "top" }
    )
  );
  const columns = [
    { wch: 8 },
    { wch: 60 },
    { wch: 12 },
    { wch: 52 },
    { wch: 60 },
    { wch: 12 },
    { wch: 18 },
    { wch: 44 },
    { wch: 90 },
  ].map((column) => ({ width: column.wch }));

  const buffer = await writeXlsxFile(sheetData, {
    columns,
    sheet: "BibTeX Results",
    stickyRowsCount: 1,
  }).toBuffer();
  return buffer.toString("base64");
}

app.listen(PORT, () => {
  console.log(`Scholar BibTeX app running at http://localhost:${PORT}`);
});
