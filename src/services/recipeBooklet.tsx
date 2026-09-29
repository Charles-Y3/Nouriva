import { Document, Page, View, Text, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import type { Language, NutritionEstimate } from '../types';

// One page per item, imported lazily (see BookletModal.tsx — this whole
// module, and @react-pdf/renderer itself, are only fetched when someone
// actually generates a booklet, so they never bloat the main app bundle).

export interface BookletItem {
  id: string;
  dishName: string;
  photoSrc?: string; // remote https URL (published posts) or a data: URI (drafts, read from IndexedDB)
  reflection: string;
  ingredients?: string;
  recipe?: string;
  spiritTags: string[];
  spiritTagLabels: Record<string, string>;
  nutrition?: NutritionEstimate | null;
}

interface Copy {
  ingredientsHeading: string;
  recipeHeading: string;
  footer: string;
}

// CJK glyphs aren't in react-pdf's built-in Helvetica, so a post written in
// Chinese would render as blank boxes without a registered font that
// actually contains those glyphs. Only load one, matching the booklet
// generator's own UI language (a reasonable proxy for what language the
// selected content is mostly in) — English stays on the zero-download
// built-in font. A booklet mixing languages the UI language doesn't cover
// is a known, accepted gap for v1 (see BookletModal.tsx).
const CJK_FONTS: Partial<Record<Language, { family: string; normal: string; bold: string }>> = {
  'zh-Hans': {
    family: 'NotoSansSC',
    normal: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5/files/noto-sans-sc-chinese-simplified-400-normal.woff',
    bold: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5/files/noto-sans-sc-chinese-simplified-700-normal.woff',
  },
  'zh-Hant': {
    family: 'NotoSansTC',
    normal: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5/files/noto-sans-tc-chinese-traditional-400-normal.woff',
    bold: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5/files/noto-sans-tc-chinese-traditional-700-normal.woff',
  },
};

const registeredFamilies = new Set<string>();

async function resolveFontFamily(language: Language): Promise<string> {
  const cjk = CJK_FONTS[language];
  if (!cjk) return 'Helvetica'; // built into react-pdf, no fetch needed
  if (!registeredFamilies.has(cjk.family)) {
    Font.register({
      family: cjk.family,
      fonts: [
        { src: cjk.normal, fontWeight: 'normal' },
        { src: cjk.bold, fontWeight: 'bold' },
      ],
    });
    registeredFamilies.add(cjk.family);
  }
  return cjk.family;
}

function buildStyles(fontFamily: string, isCjk: boolean) {
  return StyleSheet.create({
    page: { fontFamily, padding: 40, fontSize: 11, color: '#2b2620' },
    dishName: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
    photo: { width: '100%', height: 220, objectFit: 'cover', borderRadius: 8, marginBottom: 12 },
    // Only registered 'normal' and 'bold' faces for the CJK fonts (see
    // resolveFontFamily) — Chinese typography doesn't conventionally use
    // italics anyway, so skipping it there (rather than also registering
    // an italic face) is the right call, not just the easy one. Without
    // this guard, react-pdf throws trying to resolve a (family, weight,
    // style) combination that was never registered.
    reflection: { fontSize: 13, fontStyle: isCjk ? 'normal' : 'italic', color: '#47403b', marginBottom: 14, lineHeight: 1.5 },
    tags: { fontSize: 10, color: '#647a5c', marginBottom: 14 },
    sectionHeading: { fontSize: 12, fontWeight: 'bold', marginBottom: 4, marginTop: 10 },
    sectionBody: { fontSize: 11, color: '#47403b', lineHeight: 1.5 },
    nutrition: { fontSize: 9, color: '#6b6254', marginTop: 10 },
    footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 8, color: '#a89f8f', textAlign: 'center' },
  });
}

function BookletDocument({ items, fontFamily, copy }: { items: BookletItem[]; fontFamily: string; copy: Copy }) {
  const styles = buildStyles(fontFamily, fontFamily !== 'Helvetica');
  return (
    <Document>
      {items.map(item => (
        <Page key={item.id} size="A4" style={styles.page}>
          <Text style={styles.dishName}>{item.dishName || ' '}</Text>
          {item.photoSrc && <Image src={item.photoSrc} style={styles.photo} />}
          {item.reflection && <Text style={styles.reflection}>"{item.reflection}"</Text>}
          {item.spiritTags.length > 0 && (
            <Text style={styles.tags}>
              {item.spiritTags.map(tag => item.spiritTagLabels[tag] || tag).join(' · ')}
            </Text>
          )}
          {item.ingredients && (
            <View>
              <Text style={styles.sectionHeading}>{copy.ingredientsHeading}</Text>
              <Text style={styles.sectionBody}>{item.ingredients}</Text>
            </View>
          )}
          {item.recipe && (
            <View>
              <Text style={styles.sectionHeading}>{copy.recipeHeading}</Text>
              <Text style={styles.sectionBody}>{item.recipe}</Text>
            </View>
          )}
          {item.nutrition?.calories !== undefined && (
            <Text style={styles.nutrition}>≈{item.nutrition.calories} kcal</Text>
          )}
          <Text style={styles.footer}>{copy.footer}</Text>
        </Page>
      ))}
    </Document>
  );
}

export async function generateBookletPdf(items: BookletItem[], language: Language, copy: Copy): Promise<Blob> {
  const fontFamily = await resolveFontFamily(language);
  const doc = <BookletDocument items={items} fontFamily={fontFamily} copy={copy} />;
  return pdf(doc).toBlob();
}
