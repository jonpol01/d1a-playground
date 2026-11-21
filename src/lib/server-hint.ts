// What to tell a visitor when a model server does not answer. On the machine that runs the playground (localhost) the fix
// is to start it, so the page points at ./demo.sh. Anywhere else the visitor cannot start it, and a hosted machine may stop
// its model on purpose (one that shares its GPU with scheduled jobs), so the page says to try again later instead.
type Hint = { en: string; ja: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const AWAY_HINT: Hint = {
  en: "It runs on the machine that serves this page, which can pause it while it runs other work. Try again later.",
  ja: "このページを公開しているマシンで動いており、そのマシンが別の処理をしている間は止まることがあります。しばらくしてからもう一度お試しください。",
};

export function serverHint(local: Hint, lang: "en" | "ja", host: string = typeof window === "undefined" ? "localhost" : window.location.hostname): string {
  return (LOCAL_HOSTS.has(host) ? local : AWAY_HINT)[lang];
}

// A hosting machine can pause its photo, voice and video server while a large job needs that memory; the text model stays
// on. Its media route then answers 503 with a JSON body holding "paused": true, which the page shows as a pause, not a fault.
export const MEDIA_PAUSED: Hint = {
  en: "Photo, voice and video are paused while the machine that serves this page runs a large job, such as a training run. The text demos still work. Try again later.",
  ja: "このページを公開しているマシンが学習などの大きな処理をしている間、写真・音声・動画のデモは一時停止しています。テキストのデモはそのまま使えます。しばらくしてからもう一度お試しください。",
};

/** True for a request error ("<status>: <body>") that is a hosting machine's media pause. */
export function isMediaPaused(message: string): boolean {
  const m = /^503: (\{[\s\S]*\})$/.exec(message.trim());
  if (!m) return false;
  try { return JSON.parse(m[1])?.paused === true; } catch { return false; }
}
