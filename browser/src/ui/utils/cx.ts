type ClassValue = string | number | false | null | undefined | Record<string, boolean | undefined>;

/** Join class names, skipping falsy values. Objects map class → condition. */
export function cx(...values: ClassValue[]): string {
  let out = '';
  for (const v of values) {
    if (!v) continue;
    if (typeof v === 'object') {
      for (const k in v) if (v[k]) out += (out ? ' ' : '') + k;
    } else {
      out += (out ? ' ' : '') + v;
    }
  }
  return out;
}
