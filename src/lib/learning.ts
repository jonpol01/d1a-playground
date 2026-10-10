// The Learning page's view of d1a's self-learning (d1a#233): what `config show` prints and what the tick's status file
// holds, reduced to what the page shows.

/** `config show`'s output: "# from: …", maybe "# ERROR …", the settings JSON, then "# <time> <source>: <key> <old> -> <new>" lines. */
export function parseShow(text: string) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("{")), end = lines.findIndex((l, i) => i > start && l.startsWith("}"));
  const comments = lines.filter((l) => l.startsWith("# "));
  return {
    source: comments.find((l) => l.startsWith("# from: "))?.slice(8) ?? "",
    error: comments.find((l) => l.startsWith("# ERROR"))?.replace(/^# ERROR in the file: /, "") ?? null,
    settings: start >= 0 && end > start ? (JSON.parse(lines.slice(start, end + 1).join("\n")) as Record<string, Record<string, unknown>>) : null,
  };
}

type Raw = Record<string, unknown> & { replay?: Record<string, unknown>; gate?: Record<string, unknown> };

/** One report line of learning-status.json, without the per-question detail. */
export function summarize(r: Raw) {
  const replay = r.replay, gate = r.gate;
  return {
    ts: r.ts as number, model_change: r.model_change, settings_error: r.settings_error, server: r.server, reached_min: r.reached_min,
    replay: replay && { replayed: replay.replayed, left: replay.left, excluded: replay.excluded, refused: replay.refused,
                        paused: replay.paused_for_live_traffic, error: replay.error },
    gate: gate && { reason: gate.reason, skipped: gate.skipped, outcomes: gate.outcomes, replayed: gate.replayed,
                    promoted: gate.promoted, written: gate.calibrator_written, auto: gate.auto, power: gate.power },
  };
}
