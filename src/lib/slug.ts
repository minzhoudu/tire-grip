/** Serbian Latin → URL slug, e.g. "Brzi Točak" → "brzi-tocak". Matches the shops_slug_format DB check. */
const TRANSLITERATE: Record<string, string> = {
  č: "c",
  ć: "c",
  š: "s",
  ž: "z",
  đ: "dj",
  Č: "c",
  Ć: "c",
  Š: "s",
  Ž: "z",
  Đ: "dj",
};

export function slugify(input: string): string {
  const transliterated = input.replace(/[čćšžđČĆŠŽĐ]/g, (ch) => TRANSLITERATE[ch] ?? ch);
  return transliterated
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
