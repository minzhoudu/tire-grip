/**
 * Serbian Cyrillic → Latin. OpenStreetMap stores most place and street names in Serbia in
 * Cyrillic ("Краљево"), but the app is in Latin script ("Kraljevo").
 */
const MAP: Record<string, string> = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Ђ: "Đ", Е: "E", Ж: "Ž", З: "Z", И: "I", Ј: "J", К: "K", Л: "L", Љ: "Lj", М: "M",
  Н: "N", Њ: "Nj", О: "O", П: "P", Р: "R", С: "S", Т: "T", Ћ: "Ć", У: "U", Ф: "F", Х: "H", Ц: "C", Ч: "Č", Џ: "Dž", Ш: "Š",
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m",
  н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", џ: "dž", ш: "š",
};

const DIGRAPHS: Record<string, string> = { Љ: "LJ", Њ: "NJ", Џ: "DŽ" };

export function toLatin(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const digraph = DIGRAPHS[ch];
    // In an all-caps word ("ЉУБА") the digraph is all caps too ("LJUBA"); otherwise "Lj".
    if (digraph && /[А-ЯЂЈЉЊЋЏ]/.test(s[i + 1] ?? "")) out += digraph;
    else out += MAP[ch] ?? ch;
  }
  return out;
}
