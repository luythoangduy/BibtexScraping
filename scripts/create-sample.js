const fs = require("node:fs");
const path = require("node:path");
const writeXlsxFile = require("write-excel-file/node");

async function main() {
  const outputDir = path.join(__dirname, "..", "samples");
  fs.mkdirSync(outputDir, { recursive: true });

  const rows = [
    [{ value: "title", fontWeight: "bold", backgroundColor: "#E2E8F0" }],
    ["Attention Is All You Need"],
    ["BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding"],
    ["Deep Residual Learning for Image Recognition"],
  ];

  await writeXlsxFile(rows, {
    columns: [{ width: 84 }],
    sheet: "Papers",
    stickyRowsCount: 1,
  }).toFile(path.join(outputDir, "sample-papers.xlsx"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
