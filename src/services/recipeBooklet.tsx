import { Document, Page, View, Text, Image, Link, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import type { Language, NutritionEstimate } from '../types';
import { BOOKLET_THEMES, type BookletTheme, type BookletThemeId } from './bookletThemes';

// Magazine-style recipe booklet: a cover with a masthead and hero photo, a
// contents page, an optional editor's note, one recipe feature per page
// (hero photo, pull-quote, ingredients sidebar, numbered method) and a back
// cover with a dedication. Imported lazily (see BookletModal.tsx) — this
// module and @react-pdf/renderer are only fetched when someone actually
// generates a booklet, so they never bloat the main app bundle.

export interface BookletItem {
  id: string;
  dishName: string;
  photoSrc?: string; // remote https URL (published posts) or a data: URI (drafts, read from IndexedDB)
  reflection: string;
  ingredients?: string;
  recipe?: string;
  spiritTags: string[];
  spiritTagLabels: Record<string, string>;
  categoryLabel?: string;
  nutrition?: NutritionEstimate | null;
}

export interface BookletCopy {
  ingredientsHeading: string;
  recipeHeading: string;
  contentsHeading: string;
  editorNoteHeading: string;
  questionsHeading: string;
  recipeCount: (n: number) => string;
  nutritionHeading: string;
  // Labels for the nutrition strip; calories is the unit ("kcal" / "大卡").
  nutritionLabels: { calories: string; protein: string; carbs: string; fat: string; fiber: string };
  madeWith: string;
  tagline: string;
}

export interface BookletOptions {
  title: string;
  dedication?: string;
  theme: BookletThemeId;
  editorNote?: { title: string; body: string; questions: string[] };
  language: Language;
  copy: BookletCopy;
  logoSrc?: string; // the Nouriva mark, shown on the cover and back cover
  appUrl?: string;  // link to the app, printed (and clickable) on the back cover
}

// CJK glyphs aren't in react-pdf's built-in fonts, so a booklet in Chinese
// would render as blank boxes without a registered font that actually has
// them. Only load these matching the booklet generator's own UI language —
// English stays on the zero-download built-in fonts. A booklet mixing
// languages the UI language doesn't cover is a known, accepted gap.
//
// Fontsource splits CJK fonts into many unicode-range files, and the main
// "chinese-*" file lacks the full-width punctuation (，！？；：（）), so the
// few small files that hold those are registered as fallback families.
const FONTSOURCE = 'https://cdn.jsdelivr.net/npm/@fontsource';
// `punctPkg` names the package the punctuation fallbacks come from when it isn't
// the face's own (noto-sans-tc's punctuation file is one fontkit can't parse).
interface CjkFace { pkg: string; main: string; punct: number[]; punctPkg?: string }
const CJK_FONTS: Partial<Record<Language, { serif: CjkFace; sans: CjkFace }>> = {
  'zh-Hans': {
    serif: { pkg: 'noto-serif-sc', main: 'chinese-simplified', punct: [119, 118, 117, 115] },
    sans: { pkg: 'noto-sans-sc', main: 'chinese-simplified', punct: [119, 118, 117, 115] },
  },
  'zh-Hant': {
    serif: { pkg: 'noto-serif-tc', main: 'chinese-traditional', punct: [122, 123, 119] },
    sans: { pkg: 'noto-sans-tc', main: 'chinese-traditional', punct: [122, 123, 119], punctPkg: 'noto-serif-tc' },
  },
};

interface Fonts {
  serif: string | string[];
  serifBold: string | string[];
  serifItalic: string | string[];
  sans: string | string[];
  isCjk: boolean;
}

// react-pdf hyphenates English words mid-word by default; a magazine layout
// shouldn't. (It can't wrap CJK text without also printing a "-" at each
// break — see wrapCjk below, which does that wrapping itself.)
Font.registerHyphenationCallback(word => [word]);

const registeredFamilies = new Set<string>();

function registerFamily(family: string, pkg: string, subset: string) {
  if (registeredFamilies.has(family)) return;
  Font.register({
    family,
    fonts: [
      { src: `${FONTSOURCE}/${pkg}@5/files/${pkg}-${subset}-400-normal.woff`, fontWeight: 'normal' },
      { src: `${FONTSOURCE}/${pkg}@5/files/${pkg}-${subset}-700-normal.woff`, fontWeight: 'bold' },
    ],
  });
  registeredFamilies.add(family);
}

function registerFace(face: CjkFace): string[] {
  const families = [face.pkg];
  registerFamily(face.pkg, face.pkg, face.main);
  const punctPkg = face.punctPkg || face.pkg;
  face.punct.forEach(n => {
    const family = `${punctPkg}-p${n}`;
    registerFamily(family, punctPkg, String(n));
    families.push(family);
  });
  return families;
}

function resolveFonts(language: Language): Fonts {
  const cjk = CJK_FONTS[language];
  if (!cjk) return { serif: 'Times-Roman', serifBold: 'Times-Bold', serifItalic: 'Times-Italic', sans: 'Helvetica', isCjk: false };
  const serif = registerFace(cjk.serif);
  const sans = registerFace(cjk.sans);
  // Chinese typography doesn't use italics, and only normal + bold faces are
  // registered — so "italic" roles fall back to the regular serif face.
  return { serif, serifBold: serif, serifItalic: serif, sans, isCjk: true };
}

// react-pdf breaks long CJK runs at a "hyphenation point", which prints a
// stray "-" at the end of the line. So for Chinese we wrap the text ourselves
// with explicit newlines, from an estimated advance width per character
// (full-width glyphs = 1em, Latin/digits about half). `NO_LINE_START` keeps
// closing punctuation from starting a line (it hangs at the end instead).
const CJK_CHAR = /[⺀-鿿＀-￯　-〿]/;
const NO_LINE_START = /[，。、；：！？）」』》〉】〕…—,.;:!?)\]]/;

function wrapCjk(text: string, width: number, size: number): string {
  const limit = width * 0.95;
  return text
    .split('\n')
    .map(para => {
      const lines: string[] = [];
      let cur = '';
      let w = 0;
      for (const ch of Array.from(para)) {
        const cw = (CJK_CHAR.test(ch) ? 1 : /\s/.test(ch) ? 0.3 : 0.56) * size;
        if (w + cw > limit && cur && !NO_LINE_START.test(ch)) {
          lines.push(cur);
          cur = '';
          w = 0;
        }
        cur += ch;
        w += cw;
      }
      lines.push(cur);
      return lines.join('\n');
    })
    .join('\n');
}

// Method text: one step per line if the author wrote lines, otherwise split
// into sentences, so a paragraph of prose still reads as numbered steps.
function toSteps(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*(?:\d+[.)、]|[-•*])\s*/, '').trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  const sentences = (lines[0] || '').match(/[^.!?。！？]+[.!?。！？]?/g)?.map(s => s.trim()).filter(Boolean) || [];
  return sentences.length > 1 ? sentences : lines;
}

function toIngredients(text: string): string[] {
  return text.split(/\r?\n|;|；/).map(l => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
}

function issueLine(language: Language): string {
  const locale = language === 'zh-Hant' ? 'zh-TW' : language === 'zh-Hans' ? 'zh-CN' : 'en-GB';
  return new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

function buildStyles(th: BookletTheme, f: Fonts, k = 1) {
  const track = f.isCjk ? 1.5 : 2.4;
  return StyleSheet.create({
    // --- shared
    page: { backgroundColor: th.paper, color: th.ink, fontFamily: f.sans, fontSize: 10.5 },
    label: { fontFamily: f.sans, fontSize: 8, letterSpacing: track, textTransform: 'uppercase', color: th.strong },
    pageFooter: { position: 'absolute', bottom: 22, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: th.muted, letterSpacing: 1 },

    // --- cover
    coverPage: { backgroundColor: th.deep, color: th.paper, padding: 0 },
    coverTop: { paddingTop: 32, paddingHorizontal: 44, alignItems: 'center' },
    coverLogo: { width: 46, height: 46, marginBottom: 12 },
    coverIssue: { fontFamily: f.sans, fontSize: 8.5, letterSpacing: track + 0.6, textTransform: 'uppercase', color: th.accent },
    coverTitle: { fontFamily: f.serifBold, color: th.paper, textAlign: 'center', marginTop: 10 },
    coverTagline: { fontFamily: f.sans, fontSize: 8, letterSpacing: track, textTransform: 'uppercase', color: th.accent, marginTop: 8, textAlign: 'center' },
    coverFrame: { marginTop: 24, marginHorizontal: 44, height: 470, borderWidth: 1.5, borderColor: th.accent, padding: 6 },
    coverPhoto: { width: '100%', height: '100%', objectFit: 'cover' },
    coverBlock: { width: '100%', height: '100%', backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center' },
    coverBlockLetter: { fontFamily: f.serifBold, fontSize: 150, color: th.deep },
    coverBottom: { marginTop: 26, paddingHorizontal: 44 },
    coverLine: { fontFamily: f.serifItalic, fontSize: 24, lineHeight: 1.25, color: th.paper },
    coverCount: { fontFamily: f.sans, fontSize: 8.5, letterSpacing: track, textTransform: 'uppercase', color: th.accent, marginTop: 10 },

    // --- contents & editor's note
    inner: { paddingTop: 54, paddingHorizontal: 54, paddingBottom: 54 },
    heading: { fontFamily: f.serifBold, fontSize: 32, lineHeight: 1.15, color: th.ink, marginTop: 6, marginBottom: 20 },
    rule: { height: 1, backgroundColor: th.strong, opacity: 0.5, marginBottom: 6 },
    tocRow: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 9, borderBottomWidth: 0.6, borderBottomColor: '#D9CDB0' },
    tocNum: { fontFamily: f.serifBold, fontSize: 17, color: th.strong, width: 38 },
    tocTitle: { fontFamily: f.serif, fontSize: 15, flex: 1, color: th.ink },
    tocMeta: { fontFamily: f.sans, fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase', color: th.muted, marginLeft: 8, textAlign: 'right', maxWidth: 150 },
    noteBody: { fontFamily: f.serif, fontSize: 12.5, lineHeight: 1.65, color: th.ink, marginBottom: 12 },
    noteQuestions: { backgroundColor: th.tint, padding: 16, marginTop: 14 },
    noteQuestion: { fontFamily: f.serifItalic, fontSize: 12, lineHeight: 1.55, color: th.ink, marginBottom: 6 },

    // --- recipe feature
    heroImage: { width: '100%', height: 360, objectFit: 'cover' },
    heroBlock: { width: '100%', height: 260, backgroundColor: th.deep, alignItems: 'center', justifyContent: 'center' },
    heroLetter: { fontFamily: f.serifBold, fontSize: 110, color: th.accent },
    kicker: { flexDirection: 'row', marginBottom: 6 },
    recipeTitle: { fontFamily: f.serifBold, fontSize: 34 * k, lineHeight: 1.2, color: th.ink },
    meta: { fontFamily: f.sans, fontSize: 8.5, letterSpacing: 1.4, textTransform: 'uppercase', color: th.strong, marginTop: 10 },
    pullQuote: { fontFamily: f.serifItalic, fontSize: 15 * k, lineHeight: 1.5, color: th.ink, marginTop: 16, marginBottom: 4, paddingLeft: 14, borderLeftWidth: 2.5, borderLeftColor: th.strong },
    columns: { flexDirection: 'row', marginTop: 20 },
    sidebar: { width: '36%', backgroundColor: th.tint, padding: 14, marginRight: 20 },
    sideHeading: { fontFamily: f.sans, fontSize: 8, letterSpacing: track, textTransform: 'uppercase', color: th.strong, marginBottom: 8 },
    ingredient: { fontFamily: f.sans, fontSize: 10.5 * k, lineHeight: 1.5, marginBottom: 4, color: th.ink },
    main: { flex: 1 },
    stepRow: { flexDirection: 'row', marginBottom: 8 },
    stepNum: { fontFamily: f.serifBold, fontSize: 15 * k, color: th.strong, width: 24 },
    stepText: { fontFamily: f.sans, fontSize: 11 * k, lineHeight: 1.55, flex: 1, color: th.ink },
    nutrition: { marginTop: 14, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: th.strong },
    nutritionLine: { fontFamily: f.sans, fontSize: 9 * k, color: th.ink, lineHeight: 1.4 },
    nutritionLabel: { fontFamily: f.sans, fontSize: 7.5, letterSpacing: 1.6, textTransform: 'uppercase', color: th.strong, marginBottom: 3 },

    // --- back cover
    backPage: { backgroundColor: th.deep, color: th.paper, justifyContent: 'center', alignItems: 'center', padding: 70 },
    dedication: { fontFamily: f.serifItalic, fontSize: 20, lineHeight: 1.5, textAlign: 'center', color: th.paper },
    backRule: { width: 60, height: 1.5, backgroundColor: th.accent, marginVertical: 26 },
    backLogo: { width: 64, height: 64, marginBottom: 18 },
    backLink: { fontFamily: f.sans, fontSize: 10, letterSpacing: 1.2, color: th.paper, textDecoration: 'none', marginTop: 10, textAlign: 'center' },
    backMark: { fontFamily: f.sans, fontSize: 8.5, letterSpacing: track, textTransform: 'uppercase', color: th.accent, textAlign: 'center' },
  });
}

// One recipe = one page. Rather than let a long recipe spill onto a second
// page, estimate how tall its text will be, shrink the type a step at a time
// (down to ~72%) until a photo of at least ~170pt still fits, and give the
// photo whatever height is left. Estimates use average glyph advances, so
// they err a little on the tall side.
const PAGE_H = 842;

function estLines(text: string, width: number, size: number, cjk: boolean): number {
  const perLine = Math.max(1, Math.floor(width / (size * (cjk ? 1 : 0.5))));
  return text.split('\n').reduce((n, para) => n + Math.max(1, Math.ceil(para.length / perLine)), 0);
}

function fitRecipe(item: BookletItem, alt: boolean, cjk: boolean, nutritionLines: number): { k: number; heroH: number } {
  const steps = item.recipe ? toSteps(item.recipe) : [];
  const ingredients = item.ingredients ? toIngredients(item.ingredients) : [];
  const tags = item.spiritTags.length > 0;
  let result = { k: 0.72, heroH: 90 };
  for (const k of [1, 0.92, 0.85, 0.78, 0.72]) {
    const title = estLines(item.dishName || ' ', 487, 34 * k, cjk) * 34 * k * 1.2;
    const quote = item.reflection ? estLines(item.reflection, 468, 15 * k, cjk) * 15 * k * 1.5 + 20 : 0;
    const side = ingredients.length
      ? 40 + ingredients.reduce((h, l) => h + estLines(l, 147, 10.5 * k, cjk) * 10.5 * k * 1.5 + 4, 0)
      : 0;
    const main = steps.length
      ? 26 + steps.reduce((h, l) => h + estLines(l, 268, 11 * k, cjk) * 11 * k * 1.55 + 8, 0)
      : 0;
    const columns = side || main ? 20 + Math.max(side, main) : 0;
    const nutrition = nutritionLines ? 22 + nutritionLines * 9 * k * 1.4 : 0;
    const text = 0.9 * (14 + title + (tags ? 22 : 0) + quote + columns + nutrition);
    const top = alt ? 46 + 18 : 22;
    const heroH = Math.min(360, PAGE_H - 48 - top - text);
    result = { k, heroH };
    if (heroH >= 170) return result;
  }
  return { k: result.k, heroH: Math.max(90, result.heroH) };
}

function nutritionParts(n: NutritionEstimate | null | undefined, labels: BookletCopy['nutritionLabels']): string[] {
  if (!n) return [];
  const parts: string[] = [];
  if (n.calories !== undefined) parts.push(`${Math.round(n.calories)} ${labels.calories}`);
  if (n.proteinGrams !== undefined) parts.push(`${labels.protein} ${Math.round(n.proteinGrams)} g`);
  if (n.carbsGrams !== undefined) parts.push(`${labels.carbs} ${Math.round(n.carbsGrams)} g`);
  if (n.fatGrams !== undefined) parts.push(`${labels.fat} ${Math.round(n.fatGrams)} g`);
  if (n.fiberGrams !== undefined) parts.push(`${labels.fiber} ${Math.round(n.fiberGrams)} g`);
  return parts;
}

function BookletDocument({ items, options }: { items: BookletItem[]; options: BookletOptions }) {
  const th = BOOKLET_THEMES[options.theme];
  const f = resolveFonts(options.language);
  const s = buildStyles(th, f);
  const { copy } = options;
  const heroItem = items.find(i => i.photoSrc);
  const titleSize = options.title.length > 26 ? 34 : options.title.length > 16 ? 44 : 56;
  const pad = (n: number) => String(n).padStart(2, '0');
  const wrap = (text: string, width: number, size: number) => (f.isCjk ? wrapCjk(text, width, size) : text);

  return (
    <Document title={options.title} author="Nouriva">
      {/* Cover */}
      <Page size="A4" style={s.coverPage}>
        <View style={s.coverTop}>
          {options.logoSrc ? <Image src={options.logoSrc} style={s.coverLogo} /> : null}
          <Text style={s.coverIssue}>{issueLine(options.language)}</Text>
          <Text style={[s.coverTitle, { fontSize: titleSize, lineHeight: 1.05 }]}>{wrap(options.title, 500, titleSize)}</Text>
          <Text style={s.coverTagline}>{copy.tagline}</Text>
        </View>
        <View style={s.coverFrame}>
          {heroItem?.photoSrc ? (
            <Image src={heroItem.photoSrc} style={s.coverPhoto} />
          ) : (
            <View style={s.coverBlock}>
              <Text style={s.coverBlockLetter}>{(items[0]?.dishName || options.title).trim().charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={s.coverBottom}>
          <Text style={s.coverLine}>{(heroItem || items[0])?.dishName}</Text>
          <Text style={s.coverCount}>{copy.recipeCount(items.length)}</Text>
        </View>
      </Page>

      {/* Contents */}
      <Page size="A4" style={s.page}>
        <View style={s.inner}>
          <Text style={s.label}>{options.title}</Text>
          <Text style={s.heading}>{copy.contentsHeading}</Text>
          <View style={s.rule} />
          {options.editorNote && (
            <View style={s.tocRow}>
              <Text style={s.tocNum}>—</Text>
              <Text style={s.tocTitle}>{options.editorNote.title}</Text>
              <Text style={s.tocMeta}>{copy.editorNoteHeading}</Text>
            </View>
          )}
          {items.map((item, i) => (
            <View key={item.id} style={s.tocRow} wrap={false}>
              <Text style={s.tocNum}>{pad(i + 1)}</Text>
              <Text style={s.tocTitle}>{item.dishName || ' '}</Text>
              <Text style={s.tocMeta}>
                {[item.categoryLabel, item.spiritTags[0] && (item.spiritTagLabels[item.spiritTags[0]] || item.spiritTags[0])].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))}
        </View>
        <View style={s.pageFooter} fixed>
          <Text>{options.title}</Text>
          <Text render={({ pageNumber }) => String(pageNumber)} />
        </View>
      </Page>

      {/* Editor's note */}
      {options.editorNote && (
        <Page size="A4" style={s.page}>
          <View style={s.inner}>
            <Text style={s.label}>{copy.editorNoteHeading}</Text>
            <Text style={s.heading}>{options.editorNote.title}</Text>
            {options.editorNote.body.split('\n\n').map((para, i) => (
              <Text key={i} style={s.noteBody}>{wrap(para, 487, 12.5)}</Text>
            ))}
            {options.editorNote.questions.length > 0 && (
              <View style={s.noteQuestions}>
                <Text style={s.sideHeading}>{copy.questionsHeading}</Text>
                {options.editorNote.questions.map((q, i) => (
                  <Text key={i} style={s.noteQuestion}>{wrap(q, 455, 12)}</Text>
                ))}
              </View>
            )}
          </View>
          <View style={s.pageFooter} fixed>
            <Text>{options.title}</Text>
            <Text render={({ pageNumber }) => String(pageNumber)} />
          </View>
        </Page>
      )}

      {/* One feature per recipe — one page each, layout alternates for rhythm */}
      {items.map((item, idx) => {
        const alt = idx % 2 === 1;
        const steps = item.recipe ? toSteps(item.recipe) : [];
        const ingredients = item.ingredients ? toIngredients(item.ingredients) : [];
        const tags = item.spiritTags.map(tag => item.spiritTagLabels[tag] || tag).join(' · ');
        const nutrition = nutritionParts(item.nutrition, copy.nutritionLabels).join('   ·   ');
        const { k, heroH } = fitRecipe(item, alt, f.isCjk, nutrition ? 1 : 0);
        const rs = buildStyles(th, f, k);
        const hero = item.photoSrc
          ? <Image src={item.photoSrc} style={[rs.heroImage, { height: heroH }]} />
          : (
            <View style={[rs.heroBlock, { height: Math.min(heroH, 200) }]}>
              <Text style={[rs.heroLetter, { fontSize: Math.min(110, Math.max(40, heroH * 0.5)) }]}>
                {(item.dishName || '·').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
          );
        const titleBlock = (
          <View>
            <View style={rs.kicker}>
              <Text style={rs.label}>{[pad(idx + 1), item.categoryLabel].filter(Boolean).join('  ·  ')}</Text>
            </View>
            <Text style={rs.recipeTitle}>{wrap(item.dishName || ' ', 487, 34 * k)}</Text>
            {tags ? <Text style={rs.meta}>{tags}</Text> : null}
          </View>
        );
        const body = (
          <View>
            {item.reflection ? <Text style={rs.pullQuote}>{wrap(item.reflection, 468, 15 * k)}</Text> : null}
            {(ingredients.length > 0 || steps.length > 0) && (
              <View style={rs.columns}>
                {ingredients.length > 0 && (
                  <View style={rs.sidebar}>
                    <Text style={rs.sideHeading}>{copy.ingredientsHeading}</Text>
                    {ingredients.map((line, i) => (
                      <Text key={i} style={rs.ingredient}>{wrap(line, 147, 10.5 * k)}</Text>
                    ))}
                  </View>
                )}
                {steps.length > 0 && (
                  <View style={rs.main}>
                    <Text style={rs.sideHeading}>{copy.recipeHeading}</Text>
                    {steps.map((line, i) => (
                      <View key={i} style={rs.stepRow} wrap={false}>
                        <Text style={rs.stepNum}>{i + 1}</Text>
                        <Text style={rs.stepText}>{wrap(line, 268, 11 * k)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            {nutrition ? (
              <View style={rs.nutrition}>
                <Text style={rs.nutritionLabel}>{copy.nutritionHeading}</Text>
                <Text style={rs.nutritionLine}>{nutrition}</Text>
              </View>
            ) : null}
          </View>
        );

        return (
          <Page key={item.id} size="A4" style={s.page}>
            {!alt ? (
              <View>
                {hero}
                <View style={{ paddingHorizontal: 54, paddingTop: 22 }}>
                  {titleBlock}
                  {body}
                </View>
              </View>
            ) : (
              <View>
                <View style={{ paddingHorizontal: 54, paddingTop: 46 }}>{titleBlock}</View>
                <View style={{ marginTop: 18, marginHorizontal: 54 }}>{hero}</View>
                <View style={{ paddingHorizontal: 54 }}>{body}</View>
              </View>
            )}
            <View style={s.pageFooter} fixed>
              <Text>{options.title}</Text>
              <Text render={({ pageNumber }) => String(pageNumber)} />
            </View>
          </Page>
        );
      })}

      {/* Back cover */}
      <Page size="A4" style={s.backPage}>
        {options.logoSrc ? <Image src={options.logoSrc} style={s.backLogo} /> : null}
        {options.dedication ? <Text style={s.dedication}>{wrap(options.dedication, 455, 20)}</Text> : null}
        {options.dedication ? <View style={s.backRule} /> : null}
        <Text style={s.backMark}>{copy.madeWith}</Text>
        {options.appUrl ? (
          <Link src={options.appUrl} style={s.backLink}>{options.appUrl.replace(/^https?:\/\//, '')}</Link>
        ) : null}
      </Page>
    </Document>
  );
}

export async function generateBookletPdf(items: BookletItem[], options: BookletOptions): Promise<Blob> {
  return pdf(<BookletDocument items={items} options={options} />).toBlob();
}

// Exposed for the Node-side render check (scripts / tests), which needs a
// Buffer instead of a browser Blob.
export { BookletDocument };
