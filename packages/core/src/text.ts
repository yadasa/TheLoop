/** UTF-8 limits work in Hermes without browser-only encoding globals. */
export function exceedsUTF8Bytes(value: string, maximum: number): boolean {
  if (value.length > maximum) return true;
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > maximum) return true;
  }
  return false;
}
