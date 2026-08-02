/**
 * Export WMS project docs to HTML + DOCX with Mermaid diagrams rendered as PNG.
 *
 * Usage (from this folder):
 *   npm install
 *   npm run export
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { marked } = require('marked');
const HTMLtoDOCX = require('html-to-docx');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const IMG = path.join(OUT, 'images');
const TMP = path.join(__dirname, '.tmp');

const DOCS = [
  {
    src: path.join(ROOT, 'PROJECT_DOCUMENTATION.md'),
    base: 'PROJECT_DOCUMENTATION',
    renderMermaid: true,
  },
  {
    src: path.join(ROOT, 'PROJECT_VISUAL.md'),
    base: 'PROJECT_VISUAL',
    renderMermaid: true,
  },
];

function ensureDirs() {
  for (const dir of [OUT, IMG, TMP]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function findMmdcScript() {
  // Prefer the JS entry so paths with spaces work (no .cmd + shell splitting).
  const candidates = [
    path.join(__dirname, 'node_modules', '@mermaid-js', 'mermaid-cli', 'src', 'cli.js'),
    path.join(__dirname, 'node_modules', '@mermaid-js', 'mermaid-cli', 'dist', 'cli.js'),
  ];
  for (const script of candidates) {
    if (fs.existsSync(script)) return script;
  }
  throw new Error('mermaid-cli (mmdc) not found. Run npm install in docs-export/');
}

function renderMermaidToPng(mmdPath, pngPath) {
  const script = findMmdcScript();
  const args = [
    script,
    '-i', mmdPath,
    '-o', pngPath,
    '-b', 'white',
    '-s', '2',
    '-w', '1400',
  ];
  execFileSync(process.execPath, args, { stdio: 'inherit', cwd: __dirname });
}

/**
 * Replace ```mermaid blocks with PNG images. Returns rewritten markdown.
 */
function processMarkdown(md, docBase) {
  const re = /```mermaid\r?\n([\s\S]*?)```/g;
  let index = 0;
  const rewritten = md.replace(re, (_, code) => {
    index += 1;
    const id = `${docBase}-diagram-${String(index).padStart(2, '0')}`;
    const mmdPath = path.join(TMP, `${id}.mmd`);
    const pngName = `${id}.png`;
    const pngPath = path.join(IMG, pngName);
    fs.writeFileSync(mmdPath, code.trim() + '\n', 'utf8');
    console.log(`  Rendering ${pngName} ...`);
    try {
      renderMermaidToPng(mmdPath, pngPath);
    } catch (err) {
      console.error(`  FAILED ${pngName}:`, err.message);
      return `\n\n> **Diagram ${index} failed to render.** See source Mermaid in PROJECT_VISUAL.md.\n\n`;
    }
    return `\n\n![Diagram ${index}](images/${pngName})\n\n`;
  });
  return { markdown: rewritten, diagramCount: index };
}

function markdownToHtmlDocument(title, markdown, { embedImages }) {
  let body = marked.parse(markdown, { async: false });

  if (embedImages) {
    body = body.replace(/src="images\/([^"]+)"/g, (_, file) => {
      const full = path.join(IMG, file);
      if (!fs.existsSync(full)) return `src="images/${file}"`;
      const b64 = fs.readFileSync(full).toString('base64');
      return `src="data:image/png;base64,${b64}"`;
    });
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body {
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      max-width: 960px;
      margin: 2rem auto;
      padding: 0 1.5rem 3rem;
      line-height: 1.45;
      color: #1a1a1a;
    }
    h1, h2, h3 { color: #0f2744; }
    h1 { border-bottom: 2px solid #0f2744; padding-bottom: 0.35rem; }
    h2 { margin-top: 2rem; border-bottom: 1px solid #ccd6e0; padding-bottom: 0.25rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; }
    th, td { border: 1px solid #c5d0dc; padding: 0.4rem 0.55rem; vertical-align: top; }
    th { background: #e8eef5; text-align: left; }
    code { background: #f3f5f8; padding: 0.1rem 0.35rem; border-radius: 3px; font-size: 0.88em; }
    pre { background: #f3f5f8; padding: 0.85rem; overflow-x: auto; border-radius: 6px; }
    img { max-width: 100%; height: auto; border: 1px solid #d0d7de; border-radius: 6px; margin: 0.75rem 0; }
    blockquote { border-left: 4px solid #94a3b8; margin-left: 0; padding-left: 1rem; color: #475569; }
    hr { border: none; border-top: 1px solid #cbd5e1; margin: 2rem 0; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

async function writeDocx(html, outPath) {
  const buffer = await HTMLtoDOCX(html, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
  });
  fs.writeFileSync(outPath, buffer);
}

async function exportOne(doc) {
  if (!fs.existsSync(doc.src)) {
    console.warn(`Skip missing file: ${doc.src}`);
    return;
  }
  console.log(`\n=== ${doc.base} ===`);
  const raw = fs.readFileSync(doc.src, 'utf8');
  const { markdown, diagramCount } = doc.renderMermaid
    ? processMarkdown(raw, doc.base)
    : { markdown: raw, diagramCount: 0 };

  const mdOut = path.join(OUT, `${doc.base}.rendered.md`);
  fs.writeFileSync(mdOut, markdown, 'utf8');
  console.log(`  Wrote ${path.relative(ROOT, mdOut)} (${diagramCount} diagram(s))`);

  // HTML with relative images (for local browsing next to images/)
  const htmlRel = markdownToHtmlDocument(doc.base, markdown, { embedImages: false });
  const htmlRelPath = path.join(OUT, `${doc.base}.html`);
  fs.writeFileSync(htmlRelPath, htmlRel, 'utf8');
  console.log(`  Wrote ${path.relative(ROOT, htmlRelPath)}`);

  // HTML with embedded images (portable + Word/PDF print)
  const htmlEmbed = markdownToHtmlDocument(doc.base, markdown, { embedImages: true });
  const htmlEmbedPath = path.join(OUT, `${doc.base}.embedded.html`);
  fs.writeFileSync(htmlEmbedPath, htmlEmbed, 'utf8');
  console.log(`  Wrote ${path.relative(ROOT, htmlEmbedPath)}`);

  const docxPath = path.join(OUT, `${doc.base}.docx`);
  await writeDocx(htmlEmbed, docxPath);
  console.log(`  Wrote ${path.relative(ROOT, docxPath)}`);
}

async function main() {
  ensureDirs();
  console.log('WMS docs export');
  console.log(`Output: ${OUT}`);
  for (const doc of DOCS) {
    await exportOne(doc);
  }
  console.log('\nDone.');
  console.log('Open the .docx files in Microsoft Word.');
  console.log('Or open *.embedded.html in a browser for the best diagram view (Print → PDF if needed).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
