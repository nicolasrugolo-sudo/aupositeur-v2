import fs from 'node:fs'
import path from 'node:path'

const studioRoot = process.cwd()
const siteRoot = path.resolve(studioRoot, '..')

const citationsDir = path.join(siteRoot, 'src', 'content', 'citations')
const writingsDir = path.join(siteRoot, 'src', 'content', 'poemes')
const outputFile = path.join(studioRoot, 'migration-aupositeur.ndjson')

function splitFrontmatter(source) {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  if (!normalized.startsWith('---\n')) {
    throw new Error('Frontmatter YAML manquant')
  }

  const end = normalized.indexOf('\n---', 4)

  if (end === -1) {
    throw new Error('Fin du frontmatter YAML introuvable')
  }

  return {
    frontmatter: normalized.slice(4, end),
    body: normalized.slice(end + 4).replace(/^\n+/, '').replace(/\n+$/, ''),
  }
}

function parseScalar(raw) {
  const value = raw.trim()

  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)

  if (value === '[]') return []

  if (value.startsWith('[') && value.endsWith(']')) {
    const inside = value.slice(1, -1).trim()

    if (!inside) return []

    return inside
      .split(',')
      .map((item) => parseScalar(item))
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    if (value.startsWith('"')) {
      try {
        return JSON.parse(value)
      } catch {
        return value.slice(1, -1)
      }
    }

    return value
      .slice(1, -1)
      .replace(/''/g, "'")
  }

  return value
}

function parseFrontmatter(frontmatter) {
  const result = {}

  for (const line of frontmatter.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)

    if (!match) {
      throw new Error(`Ligne YAML non prise en charge : ${line}`)
    }

    const [, key, rawValue] = match
    result[key] = parseScalar(rawValue)
  }

  return result
}

function slugFromFilename(filename) {
  return filename.replace(/\.(md|mdx)$/i, '')
}

function deterministicId(type, slug) {
  return `aupositeur-${type}-${slug}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
}

function textToPortableText(body, slug) {
  if (!body.trim()) return []

  /*
   * Les fichiers actuels utilisent des lignes séparées par des lignes vides.
   * Pour la poésie, chaque ligne devient donc un bloc Sanity indépendant.
   * Cela préserve l'ordre et le découpage visuel du texte sans réécriture.
   */
  return body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text, index) => ({
      _type: 'block',
      _key: `${slug}-${String(index + 1).padStart(4, '0')}`,
      style: 'normal',
      markDefs: [],
      children: [
        {
          _type: 'span',
          _key: `${slug}-span-${String(index + 1).padStart(4, '0')}`,
          text,
          marks: [],
        },
      ],
    }))
}

function readMarkdownDirectory(directory) {
  return fs
    .readdirSync(directory)
    .filter((filename) => /\.(md|mdx)$/i.test(filename))
    .sort((a, b) => a.localeCompare(b, 'fr'))
}

const documents = []

const citationFiles = readMarkdownDirectory(citationsDir)

for (let index = 0; index < citationFiles.length; index += 1) {
  const filename = citationFiles[index]
  const slug = slugFromFilename(filename)
  const source = fs.readFileSync(path.join(citationsDir, filename), 'utf8')
  const {frontmatter, body} = splitFrontmatter(source)
  const data = parseFrontmatter(frontmatter)

  if (!data.text) {
    throw new Error(`Citation sans texte : ${filename}`)
  }

  documents.push({
    _id: deterministicId('citation', slug),
    _type: 'citation',

    text: data.text,

    slug: {
      _type: 'slug',
      current: slug,
    },

    author: data.author || 'Aupositeur',

    ...(data.source ? {source: data.source} : {}),
    ...(data.context ? {context: data.context} : {}),
    ...(data.video ? {video: data.video} : {}),

    featured: Boolean(data.featured),
    order: index + 1,
  })
}

const writingFiles = readMarkdownDirectory(writingsDir)

for (const filename of writingFiles) {
  const slug = slugFromFilename(filename)
  const source = fs.readFileSync(path.join(writingsDir, filename), 'utf8')
  const {frontmatter, body} = splitFrontmatter(source)
  const data = parseFrontmatter(frontmatter)

  if (!data.title) {
    throw new Error(`Écrit sans titre : ${filename}`)
  }

  documents.push({
    _id: deterministicId('writing', slug),
    _type: 'writing',

    title: data.title,

    slug: {
      _type: 'slug',
      current: slug,
    },

    kind: 'poem',

    ...(typeof data.year === 'number' ? {year: data.year} : {}),
    ...(data.description ? {description: data.description} : {}),

    themes: Array.isArray(data.themes) ? data.themes : [],

    body: textToPortableText(body, slug),

    featured: Boolean(data.featured),
  })
}

const ndjson =
  documents
    .map((document) => JSON.stringify(document))
    .join('\n') + '\n'

fs.writeFileSync(outputFile, ndjson, 'utf8')

const citations = documents.filter((doc) => doc._type === 'citation')
const writings = documents.filter((doc) => doc._type === 'writing')

console.log('')
console.log('=== MIGRATION AUPOSITEUR ===')
console.log(`Citations : ${citations.length}`)
console.log(`Écrits    : ${writings.length}`)
console.log(`Total     : ${documents.length}`)
console.log('')
console.log(`Fichier   : ${outputFile}`)

if (citations.length !== 51) {
  throw new Error(`51 citations attendues, ${citations.length} trouvées.`)
}

if (writings.length !== 14) {
  throw new Error(`14 écrits attendus, ${writings.length} trouvés.`)
}

console.log('')
console.log('Contrôle des quantités : OK')
console.log('Aucune donnée envoyée à Sanity.')