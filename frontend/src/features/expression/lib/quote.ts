const OPENING = /^[“"‘'«「『]/;

/** Words shown as a quotation: in quote marks, unless they already open with one (a line of dialogue) */
export const quoted = (text: string) => {
  const words = text.trim();
  return OPENING.test(words) ? words : `“${words}”`;
};
