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
