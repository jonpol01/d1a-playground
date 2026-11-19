// Which demos a build shows. MEDIA_DEMOS=0 at build time (NEXT_PUBLIC_MEDIA_DEMOS) hides the three that need a model server
// with media (photo, voice, video): a PyTorch D1A server answers them only with a second process, d1a.serving.media, so a
// page served next to a server without one would show three demos that can only fail.
export const MEDIA_DEMO_IDS = ["photo", "voice", "video"];

export function visibleDemos<T extends { id: string }>(demos: T[], mediaDemos: string | undefined = process.env.NEXT_PUBLIC_MEDIA_DEMOS): T[] {
  return mediaDemos === "0" ? demos.filter((d) => !MEDIA_DEMO_IDS.includes(d.id)) : demos;
}

/** The hero's count, in words up to sixteen, as a number beyond. */
export function countWord(n: number): string {
  return ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen"][n] ?? String(n);
}
