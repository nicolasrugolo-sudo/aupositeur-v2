import fs from "node:fs";
import path from "node:path";

const FIX = process.argv.includes("--fix");
const ROOT = path.resolve("src");

const extensions = new Set([
  ".astro", ".ts", ".tsx", ".js", ".jsx",
  ".json", ".md", ".mdx", ".css",
  ".html", ".yml", ".yaml"
]);

const decoder1252 = new TextDecoder("windows-1252");
const decoderUtf8 = new TextDecoder("utf-8", { fatal: true });

/*
  Caracteres legitimes que le site utilise.
  Pour chacun, on calcule automatiquement sa forme "mojibake"
  (UTF-8 lu par erreur comme Windows-1252).
*/
const goodChars = Array.from(
  "\u2019\u2018\u201C\u201D\u00AB\u00BB\u2013\u2014\u2026" +
  "\u2192\u2190" +
  "\u00E9\u00E8\u00EA\u00EB\u00E0\u00E2\u00E4\u00F9\u00FB\u00FC" +
  "\u00F4\u00F6\u00EE\u00EF\u00E7" +
  "\u00C9\u00C8\u00CA\u00CB\u00C0\u00C2\u00C4\u00D9\u00DB\u00DC" +
  "\u00D4\u00D6\u00CE\u00CF\u00C7" +
  "\u0153\u0152\u20AC\u00A0\u202F"
);

const replacements = [];

for (const good of goodChars) {
  const bytes = Buffer.from(good, "utf8");
  const bad = decoder1252.decode(bytes);

  if (bad !== good) {
    replacements.push([bad, good]);
  }
}

/* Les chaines les plus longues d'abord */
replacements.sort((a, b) => b[0].length - a[0].length);

function walk(dir) {
  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".git"
    ) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      const ext = path.extname(entry.name).toLowerCase();

      if (
        extensions.has(ext) &&
        !entry.name.endsWith(".bak")
      ) {
        out.push(full);
      }
    }
  }

  return out;
}

const files = walk(ROOT);

let badUtf8 = 0;
let affectedFiles = 0;
let replacementsCount = 0;

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const backupRoot = path.resolve(
  "..",
  "_BACKUPS_SITE",
  `ENCODING_${stamp}`
);

for (const file of files) {
  const buffer = fs.readFileSync(file);

  let text;

  try {
    text = decoderUtf8.decode(buffer);
  } catch {
    console.error(
      `UTF-8 INVALIDE : ${path.relative(process.cwd(), file)}`
    );
    badUtf8++;
    continue;
  }

  let repaired = text;
  let localCount = 0;

  for (const [bad, good] of replacements) {
    if (!repaired.includes(bad)) continue;

    const parts = repaired.split(bad);
    localCount += parts.length - 1;
    repaired = parts.join(good);
  }

  if (localCount > 0) {
    affectedFiles++;
    replacementsCount += localCount;

    console.log(
      `${FIX ? "CORRIGE" : "MOJIBAKE"} : ` +
      `${path.relative(process.cwd(), file)} ` +
      `(${localCount})`
    );

    if (FIX) {
      const relative = path.relative(ROOT, file);
      const backup = path.join(backupRoot, relative);

      fs.mkdirSync(path.dirname(backup), {
        recursive: true
      });

      fs.copyFileSync(file, backup);

      fs.writeFileSync(
        file,
        repaired,
        { encoding: "utf8" }
      );
    }
  }
}

console.log("");
console.log(`Fichiers inspectes : ${files.length}`);
console.log(`UTF-8 invalides     : ${badUtf8}`);
console.log(`Fichiers mojibake   : ${affectedFiles}`);
console.log(`Corrections         : ${replacementsCount}`);

if (FIX && affectedFiles > 0) {
  console.log("");
  console.log(
    `Sauvegarde : ${path.relative(process.cwd(), backupRoot)}`
  );
}

if (!FIX && (badUtf8 > 0 || affectedFiles > 0)) {
  console.error("");
  console.error("ECHEC ENCODAGE : build bloque.");
  process.exit(1);
}

if (!FIX) {
  console.log("");
  console.log("ENCODAGE : OK");
}