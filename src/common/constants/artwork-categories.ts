// Canonical artwork categories. Mirrors the frontend's INTERESTS list
// (features/onboarding/data/interests.ts) — keep the two in sync.
//
// Why this exists: the upload form stores the category *label* on the artwork
// ("Abstract", "Water color"), but every browse/filter UI sends the *id*
// ("abstract", "watercolor"). Postgres array overlap is exact and
// case-sensitive, so the two never matched and every category filter came back
// empty. expandCategoryFilter() bridges both forms so the filter works no
// matter which one the client sends or which one an older row stored.

export const ARTWORK_CATEGORIES = [
  { id: 'abstract', label: 'Abstract' },
  { id: 'animation', label: 'Animation' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'assemblage', label: 'Assemblage' },
  { id: 'branding', label: 'Branding' },
  { id: 'calligraphy', label: 'Calligraphy' },
  { id: 'caricature', label: 'Caricature' },
  { id: 'ceramics', label: 'Ceramics' },
  { id: 'collage', label: 'Collage' },
  { id: 'conceptual', label: 'Conceptual art' },
  { id: 'comics', label: 'Comics' },
  { id: 'digital', label: 'Digital art' },
  { id: 'fashion', label: 'Fashion design' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'game', label: 'Game art' },
  { id: 'glass', label: 'Glass art' },
  { id: 'graffiti', label: 'Graffiti' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'industrial', label: 'Industrial design' },
  { id: 'interior', label: 'Interior design' },
  { id: 'metal', label: 'Metal art' },
  { id: 'mosaic', label: 'Mosaic' },
  { id: 'murals', label: 'Murals' },
  { id: 'painting', label: 'Painting' },
  { id: 'pen-ink', label: 'Pen & Ink' },
  { id: 'photography', label: 'Photography' },
  { id: 'pop-art', label: 'Pop art' },
  { id: 'photorealism', label: 'Photorealism' },
  { id: 'sculpting', label: 'Sculpting' },
  { id: 'sound', label: 'Sound art' },
  { id: 'street', label: 'Street art' },
  { id: 'surrealism', label: 'Surrealism' },
  { id: 'textile', label: 'Textile art' },
  { id: 'visual-fx', label: 'Visual effect' },
  { id: 'watercolor', label: 'Water color' },
  { id: 'woodworking', label: 'Woodworking' },
] as const

const BY_KEY = new Map<string, { id: string; label: string }>()
for (const c of ARTWORK_CATEGORIES) {
  BY_KEY.set(c.id.toLowerCase(), c)
  BY_KEY.set(c.label.toLowerCase(), c)
}

// Characters that would break out of a Postgres array literal element.
const UNSAFE_ARRAY_CHARS = /[{}",\\]/

// Turns what the client sent into every stored form it could match: for a
// known category that's its label and its id; for anything else, the raw value.
export function expandCategoryFilter(values: string[]): string[] {
  const out = new Set<string>()
  for (const raw of values) {
    const value = String(raw).trim()
    if (!value) continue
    const known = BY_KEY.get(value.toLowerCase())
    if (known) {
      out.add(known.label)
      out.add(known.id)
    } else if (!UNSAFE_ARRAY_CHARS.test(value)) {
      out.add(value)
    }
  }
  return [...out]
}