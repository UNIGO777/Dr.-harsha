const CLINICAL_TABLES_RXTERMS_SEARCH_URL = "https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search";

function normalizeQuery(query) {
  return typeof query === "string" ? query.trim() : "";
}

function buildFallbackResults(query) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];
  return [normalizedQuery];
}

function parseClinicalTablesFirstColumn(data) {
  const rows = Array.isArray(data) ? data[3] : null;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => (Array.isArray(row) ? row[0] : null))
    .filter((value) => typeof value === "string" && value.trim().length > 0);
}

export async function searchMedicineNamesController(req, res) {
  const query = normalizeQuery(req?.query?.query);

  if (!query) {
    return res.status(200).json({ results: [] });
  }

  try {
    const url = new URL(CLINICAL_TABLES_RXTERMS_SEARCH_URL);
    url.searchParams.set("terms", query);
    url.searchParams.set("maxList", "8");

    const response = await fetch(url.toString());
    if (!response.ok) {
      return res.status(200).json({ results: buildFallbackResults(query) });
    }

    const data = await response.json();
    const results = parseClinicalTablesFirstColumn(data);

    return res.status(200).json({
      results: results.length ? results : buildFallbackResults(query)
    });
  } catch {
    return res.status(200).json({ results: buildFallbackResults(query) });
  }
}
