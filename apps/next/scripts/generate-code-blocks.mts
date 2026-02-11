/**
 * Pre-build script: generates syntax-highlighted code blocks using Shiki.
 * 
 * How it works:
 * 1. Scans all .tsx/.mdx files for <CodeBlock id="..." lang="..." /> components
 * 2. Reads the code content from between the tags
 * 3. Generates highlighted HTML for both light and dark themes
 * 4. Writes results to src/data/generated/code-blocks.json
 * 
 * Usage: pnpm codegen
 * 
 * The CodeBlock component reads from this generated file at build time.
 * Once generated, Shiki is never needed at runtime or during next build.
 */

import { createHighlighter } from "shiki";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const OUTPUT_DIR = join(SRC, "data", "generated");
const OUTPUT_FILE = join(OUTPUT_DIR, "code-blocks.json");

interface CodeBlockEntry {
  id: string;
  lang: string;
  light: string;
  dark: string;
}

// Regex to match code block definitions in source files
// Supports both inline and multi-line code blocks
const CODE_BLOCK_REGEX = /\/\*\s*@codeblock\s+id="([^"]+)"\s+lang="([^"]+)"\s*\*\/([\s\S]*?)\/\*\s*@end-codeblock\s*\*\//g;

function walkDir(dir: string, ext: string[]): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules" && entry !== "generated") {
      files.push(...walkDir(full, ext));
    } else if (ext.some((e) => full.endsWith(e))) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  console.log("🎨 Generating code blocks with Shiki...");

  const highlighter = await createHighlighter({
    themes: ["github-dark-default", "github-light-default"],
    langs: ["typescript", "bash", "rust", "json", "toml", "yaml", "tsx", "jsx", "css", "html", "sh", "shell", "powershell", "text"],
  });

  // Also scan for standalone code block definition files
  const codeFiles = walkDir(join(SRC, "data", "code-blocks"), [".ts", ".txt", ".sh", ".rs", ".json"]);
  const sourceFiles = walkDir(SRC, [".tsx", ".ts"]);

  const blocks: Record<string, CodeBlockEntry> = {};

  // 1. Process inline code blocks from source files
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf-8");
    let match;
    CODE_BLOCK_REGEX.lastIndex = 0;
    while ((match = CODE_BLOCK_REGEX.exec(content)) !== null) {
      const [, id, lang, code] = match;
      const trimmed = code.trim();
      blocks[id] = {
        id,
        lang,
        light: highlighter.codeToHtml(trimmed, { theme: "github-light-default", lang }),
        dark: highlighter.codeToHtml(trimmed, { theme: "github-dark-default", lang }),
      };
    }
  }

  // 2. Process standalone code block files: src/data/code-blocks/<id>.<lang>
  for (const file of codeFiles) {
    const name = file.split("/").pop()!;
    const dotIdx = name.lastIndexOf(".");
    const id = name.substring(0, dotIdx);
    const ext = name.substring(dotIdx + 1);
    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "tsx",
      js: "javascript",
      jsx: "jsx",
      rs: "rust",
      sh: "bash",
      txt: "text",
      json: "json",
      toml: "toml",
      yaml: "yaml",
      css: "css",
      html: "html",
    };
    const lang = langMap[ext] || "text";
    const code = readFileSync(file, "utf-8").trim();
    blocks[id] = {
      id,
      lang,
      light: highlighter.codeToHtml(code, { theme: "github-light-default", lang }),
      dark: highlighter.codeToHtml(code, { theme: "github-dark-default", lang }),
    };
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(blocks, null, 2));

  console.log(`✅ Generated ${Object.keys(blocks).length} code blocks → ${OUTPUT_FILE}`);
  highlighter.dispose();
}

main().catch((err) => {
  console.error("❌ Code generation failed:", err);
  process.exit(1);
});
