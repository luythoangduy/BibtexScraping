const form = document.querySelector("#lookup-form");
const submitButton = document.querySelector("#submit-button");
const downloadButton = document.querySelector("#download-button");
const resultsBody = document.querySelector("#results-body");
const statusText = document.querySelector("#status-text");
const totalCount = document.querySelector("#total-count");
const okCount = document.querySelector("#ok-count");
const warningCount = document.querySelector("#warning-count");

let latestWorkbookBase64 = "";
let latestFileName = "bibtex-results.xlsx";

if (window.lucide) {
  window.lucide.createIcons();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const file = formData.get("file");

  if (!file || !file.name) {
    setStatus("Choose an Excel file before running.");
    return;
  }

  setLoading(true);
  setStatus("Processing...");
  renderRows([]);
  resetDownload();

  try {
    const response = await fetch("/api/lookup", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Lookup failed.");
    }

    latestWorkbookBase64 = payload.workbookBase64;
    latestFileName = payload.fileName || latestFileName;
    renderRows(payload.rows || []);
    downloadButton.disabled = !latestWorkbookBase64;
    setStatus("Done.");
  } catch (error) {
    setStatus(error.message || "Something went wrong.");
  } finally {
    setLoading(false);
  }
});

downloadButton.addEventListener("click", () => {
  if (!latestWorkbookBase64) return;
  const bytes = base64ToUint8Array(latestWorkbookBase64);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = latestFileName;
  link.click();
  URL.revokeObjectURL(url);
});

function renderRows(rows) {
  totalCount.textContent = String(rows.length);
  okCount.textContent = String(rows.filter((row) => row.status === "ok").length);
  warningCount.textContent = String(rows.filter((row) => row.status !== "ok").length);

  if (rows.length === 0) {
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="9">No results yet.</td></tr>`;
    return;
  }

  resultsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.index)}</td>
          <td>${escapeHtml(row.inputTitle)}</td>
          <td><span class="${row.status === "ok" ? "status-ok" : "status-warning"}">${escapeHtml(row.status)}</span></td>
          <td>${escapeHtml(row.matchedTitle || "")}</td>
          <td>${escapeHtml(row.matchScore ?? "")}</td>
          <td>${escapeHtml(row.doi || "")}</td>
          <td>${escapeHtml(row.bibtexSource || "")}</td>
          <td>${escapeHtml(row.warning || "")}</td>
          <td class="mono">${escapeHtml(row.bibtex || "")}</td>
        </tr>
      `
    )
    .join("");
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.innerHTML = isLoading
    ? `<i data-lucide="loader-circle"></i> Running`
    : `<i data-lucide="search"></i> Fetch BibTeX`;
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function resetDownload() {
  latestWorkbookBase64 = "";
  downloadButton.disabled = true;
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
