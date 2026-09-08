/** Garment measurements, not body-size labels. All external values are centimetres.
 * Recommendations are transparent nearest-measurement comparisons, never inferred
 * from photographs, ethnicity, gender, weight or a nominal S/M/L body category. */
export const SIZE_KEYS = Object.freeze(['S', 'M', 'L', 'XL']);
export function sizeKey(variant, optionNames = []) {
  if (!variant) return null;
  const options = variant.options || [];
  const index = optionNames.findIndex(n => /^(size|tamanho|taille|talla|größe)$/i.test(String(n).trim()));
  const candidates = (index >= 0 ? [options[index]] : options).map(v => String(v || '').trim().toUpperCase());
  const matches = candidates.filter(v => SIZE_KEYS.includes(v));
  return matches.length === 1 ? matches[0] : null;
}
const number = (value, min, max) => {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
export function profileValues(raw = {}) {
  return {
    method: raw.method === 'body' ? 'body' : 'shirt',
    width: number(raw.width, 35, 90), length: number(raw.length, 40, 100),
    chest: number(raw.chest, 60, 180), shoulder: number(raw.shoulder, 28, 65),
    preference: ['closer', 'relaxed', 'boxy'].includes(raw.preference) ? raw.preference : 'boxy',
  };
}
export function dimensions(chart, key) {
  const d = chart?.sizes?.[key];
  return d && ['chest', 'length', 'sleeve', 'shoulder', 'opening'].every(k => Number.isFinite(d[k]) && d[k] > 0) ? d : null;
}
export function recommend(chart, raw, variants, optionNames) {
  const p = profileValues(raw);
  const required = p.method === 'shirt' ? p.width && p.length : p.chest;
  if (!required) return {status: 'incomplete'};
  // Ease is an explicit styling preference, NOT a brand-validated fit standard.
  const desiredEase = {closer: 8, relaxed: 16, boxy: 24}[p.preference];
  const targetWidth = p.method === 'shirt' ? p.width : (p.chest + desiredEase) / 2;
  const candidates = SIZE_KEYS.map(key => {
    const d = dimensions(chart, key);
    if (!d) return null;
    const matching = variants.filter(v => sizeKey(v, optionNames) === key);
    if (!matching.length) return null;
    const widthDelta = d.chest - targetWidth;
    const lengthDelta = p.method === 'shirt' ? d.length - p.length : null;
    return {key, dimensions: d, widthDelta, lengthDelta,
      score: (widthDelta / 2) ** 2 + (lengthDelta === null ? 0 : (lengthDelta / 3) ** 2),
      available: matching.some(v => v.available),
      ease: p.chest ? 2 * d.chest - p.chest : null};
  }).filter(Boolean).sort((a, b) => a.score - b.score);
  if (!candidates.length) return {status: 'unsupported'};
  const best = candidates[0];
  const tolerance = number(chart.tolerance, 0, 5) ?? 2;
  // Do not silently recommend an ill-fitting edge size or a different in-stock size.
  const outside = Math.abs(best.widthDelta) > 4 || Math.abs(best.lengthDelta || 0) > 6 ||
    (p.method === 'body' && best.ease <= tolerance * 2);
  const tied = candidates.filter(c => c.score - best.score <= .25).map(c => c.key);
  return {status: outside ? 'outside' : 'match', ...best, tied, method: p.method, targetWidth, desiredEase, tolerance};
}
export function garmentRatios(chart, key) {
  const selected = dimensions(chart, key), reference = dimensions(chart, 'M');
  if (!selected || !reference) return null;
  return Object.fromEntries(Object.keys(reference).map(k => [k, selected[k] / reference[k]]));
}
