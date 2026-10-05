"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { api, BASE_PATH, MEDIA_START_HINT, type Question, type SystemOneResponse } from "@/lib/kev";
import { useLang, useText } from "@/lib/i18n";
import { AnswerBars, DemoGrid, Empty, Field, Latency, Presets, ResultCard, RunBar, Verdict, inputCls } from "@/components/uses/shared";
import { Shimmer } from "@/components/uses/visuals";

// Photo check, Voice triage and Video check: the same typed questions, asked about a photo, a voice clip or a video instead of text, proxied
// under /media: on a Mac the model server itself (the same model, through Gemma 4's vision and audio encoders), on a
// PyTorch machine the separate d1a.media server. The checkpoint
// is trained on text only, so these answers are zero-shot. Questions stay in English (see englishNote); labels are shown
// in the UI language.

const SAMPLES = `${BASE_PATH}/samples`;
const MAX_IMAGE_SIDE = 1024;   // the image processor resizes anyway; this keeps the upload small
const SAMPLE_RATE = 16_000;    // what Gemma 4's audio encoder reads
const MAX_RECORD_S = 20;
const MAX_VIDEO_MB = 24;       // sent as is (base64): the server reads clips up to 32 MB and samples 16 frames

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf); let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** A photo as a JPEG no larger than MAX_IMAGE_SIDE, base64. */
async function imageBase64(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("could not encode the image"))), "image/jpeg", 0.85));
  return toBase64(await jpeg.arrayBuffer());
}

/** Any clip the browser can decode (a recording, an upload) as 16 kHz mono 16-bit WAV, base64. */
async function wavBase64(blob: Blob): Promise<{ data: string; seconds: number }> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)), SAMPLE_RATE);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, SAMPLE_RATE, true);
  out.setUint32(28, SAMPLE_RATE * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return { data: toBase64(out.buffer), seconds: decoded.duration };
}

/** Request state for a media demo; a newer run wins over an older response still in flight. */
function useMediaRequest() {
  const [result, setResult] = useState<SystemOneResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);   // still waiting after a few seconds: the server is loading its model
  const seq = useRef(0);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => { clearTimeout(t); setSlow(false); };
  }, [busy]);
  async function run(media: () => Promise<{ type: "image" | "audio" | "video"; data: string }>, questions: Record<string, Question>) {
    const id = ++seq.current;
    setBusy(true); setError(null);
    try {
      const r = await api.media({ model: "d1a-latest", media: await media(), questions });
      if (id === seq.current) setResult(r);
    } catch (e) {
      if (id === seq.current) { setError(e); setResult(null); }
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }
  function reset() { seq.current++; setResult(null); setError(null); setBusy(false); }
  return { result, error, busy, slow, run, reset };
}

function MediaError({ error }: { error: unknown }) {
  const lang = useLang();
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  const down = error instanceof TypeError || /^(5\d\d|404): (?!\{)/.test(msg);
  return <p role="alert" className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[13px] leading-5 text-destructive">
    {down ? `${lang === "ja" ? "メディア用のモデルサーバーが応答していません。" : "The media model server is not answering."} ${MEDIA_START_HINT[lang]}` : msg}
  </p>;
}

function WakingNote({ show }: { show: boolean }) {
  const t = useText({
    en: "Waking up the model: it is freed after an idle spell and loads again on demand, which takes a few seconds (up to 30 s on a PyTorch machine). The next requests take a second or two.",
    ja: "モデルを起動しています。しばらく使われないと解放され、必要なときに読み込み直すため、数秒かかります（PyTorch のマシンでは最大 30 秒）。次からは1〜2秒です。",
  });
  return show ? <p role="status" className="text-[12px] leading-5 text-muted-foreground">{t}</p> : null;
}

function ZeroShotNote() {
  const t = useText({
    en: "Zero-shot: the checkpoint was trained on text only. Gemma 4's own vision and audio encoders feed the same decision head, with no captioning or speech-to-text step.",
    ja: "ゼロショット: チェックポイントはテキストだけで学習しています。Gemma 4 自身の画像・音声エンコーダーが同じ判断ヘッドに入力し、キャプション生成や音声認識の段階はありません。",
  });
  return <p className="text-[12px] leading-5 text-muted-foreground">{t}</p>;
}

/* ------------------------------------------------------------------ Photo check */

const PLACES = ["at a front door", "in a mailbox", "in a delivery locker", "on a sidewalk", "inside a delivery van"];
export const PHOTO_Q: Record<string, Question> = {
  damaged: { type: "noul", instructions: "Is the parcel damaged?" },
  place: { type: "choice", instructions: "Where was the parcel left?", criteria: Object.fromEntries(PLACES.map((p) => [p, null])) },
};
export const PHOTOS = ["damaged_door", "intact_door", "intact_locker", "damaged_wet", "intact_mailbox", "damaged_crushed_truck"];
const PHOTO_TEXT = {
  en: {
    names: { damaged_door: "Torn box at a door", intact_door: "Neat drop at a door", intact_locker: "Locker", damaged_wet: "Wet box on a sidewalk", intact_mailbox: "Mailbox", damaged_crushed_truck: "Crushed in the van" } as Record<string, string>,
    upload: "Your photo", uploadHint: "JPEG, PNG or HEIC from a phone", choose: "Choose a photo…", run: "Check the photo", busy: "Looking…", empty: "Pick a photo or upload one: the model checks for damage and where the parcel was left.",
    damaged: "DAMAGED", ok: "LOOKS OK", unsure: "CHECK BY HAND", why: (p: number) => `p(damaged) ${p.toFixed(2)}`,
    qDamaged: "Is the parcel damaged?", qPlace: "Where was the parcel left?",
    places: Object.fromEntries(PLACES.map((p) => [p, p])) as Record<string, string>,
  },
  ja: {
    names: { damaged_door: "玄関前の破れた箱", intact_door: "玄関前（きれい）", intact_locker: "宅配ロッカー", damaged_wet: "歩道で濡れた箱", intact_mailbox: "郵便受け", damaged_crushed_truck: "車内でつぶれた箱" } as Record<string, string>,
    upload: "あなたの写真", uploadHint: "スマホの JPEG・PNG・HEIC", choose: "写真を選ぶ…", run: "写真をチェック", busy: "確認中…", empty: "写真を選ぶかアップロードしてください。荷物の破損と置き場所をモデルが判定します。",
    damaged: "破損あり", ok: "問題なし", unsure: "人が確認", why: (p: number) => `p(破損) ${p.toFixed(2)}`,
    qDamaged: "荷物は破損していますか？", qPlace: "荷物はどこに置かれましたか？",
    places: { "at a front door": "玄関前", "in a mailbox": "郵便受け", "in a delivery locker": "宅配ロッカー", "on a sidewalk": "歩道", "inside a delivery van": "配達車の中" } as Record<string, string>,
  },
};

export function PhotoDemo() {
  const t = useText(PHOTO_TEXT);
  const [pi, setPi] = useState(0);
  const [file, setFile] = useState<{ url: string; blob: Blob; name: string } | null>(null);
  const req = useMediaRequest();
  const src = file?.url ?? `${SAMPLES}/${PHOTOS[pi]}.jpg`;
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);

  const run = () => req.run(async () => ({ type: "image", data: await imageBase64(file?.blob ?? await (await fetch(src)).blob()) }), PHOTO_Q);
  const a = req.result?.answers;
  const p = a?.damaged?.type === "noul" ? a.damaged.noul : null;

  return (
    <DemoGrid
      left={<>
        <Presets presets={PHOTOS.map((id) => ({ name: t.names[id] }))} current={file ? -1 : pi} onPick={(i) => { setPi(i); setFile(null); req.reset(); }} />
        <Field label={t.upload} hint={t.uploadHint} htmlFor="photo-file">
          <label className={`${inputCls} flex cursor-pointer items-center gap-2 text-muted-foreground`}>
            <Upload className="size-4" aria-hidden /><span className="truncate">{file?.name ?? t.choose}</span>
            <input id="photo-file" type="file" accept="image/*" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile({ url: URL.createObjectURL(f), blob: f, name: f.name }); req.reset(); } }} />
          </label>
        </Field>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local sample or a blob: URL, nothing to optimise */}
        <img src={src} alt="" className="aspect-[4/3] w-full rounded-xl border border-border object-cover" />
        <RunBar onRun={run} busy={req.busy} label={t.run} busyLabel={t.busy} />
        <WakingNote show={req.slow} />
        <MediaError error={req.error} />
      </>}
      right={req.result && a && p !== null ? <>
        <Verdict label={p >= 0.7 ? t.damaged : p <= 0.3 ? t.ok : t.unsure} tone={p >= 0.7 ? "stop" : p <= 0.3 ? "go" : "wait"}>{t.why(p)}</Verdict>
        <ResultCard title={<>{t.qDamaged} · <Latency r={req.result} /></>}><AnswerBars answer={a.damaged} /></ResultCard>
        <ResultCard title={t.qPlace}><AnswerBars answer={a.place} labels={t.places} /></ResultCard>
        <ZeroShotNote />
      </> : req.busy ? <Shimmer tall /> : <Empty>{t.empty}</Empty>}
    />
  );
}

/* ------------------------------------------------------------------ Voice triage */

const INTENTS = ["directions to the address", "report a damaged parcel", "the customer is not home", "a vehicle problem"];
export const VOICE_Q: Record<string, Question> = {
  urgent: { type: "noul", instructions: "Is this urgent?" },
  intent: { type: "choice", instructions: "What does the speaker need?", criteria: Object.fromEntries(INTENTS.map((p) => [p, null])) },
};
export const CLIPS = ["en_directions", "en_damaged", "ja_nothome", "ja_vehicle"];
const VOICE_TEXT = {
  en: {
    names: { en_directions: "Lost driver (EN)", en_damaged: "Damaged box (EN)", ja_nothome: "Nobody home (JA)", ja_vehicle: "Flat tyre (JA)" } as Record<string, string>,
    record: "Record", stop: "Stop", recording: (s: number) => `recording… ${s} s`, upload: "Or upload a clip", uploadHint: `up to ${MAX_RECORD_S} s`,
    micBlocked: "Recording needs microphone access on https or localhost; uploading a clip works everywhere.",
    run: "Triage the voice note", busy: "Listening…", empty: "Pick a voice note, record one, or upload a clip: the model hears what the driver needs and whether it is urgent.",
    urgent: "URGENT", routine: "ROUTINE", why: (p: number) => `p(urgent) ${p.toFixed(2)}`, qUrgent: "Is this urgent?", qIntent: "What does the speaker need?",
    intents: Object.fromEntries(INTENTS.map((p) => [p, p])) as Record<string, string>, yours: "your clip",
  },
  ja: {
    names: { en_directions: "道に迷った（英語）", en_damaged: "箱の破損（英語）", ja_nothome: "不在（日本語）", ja_vehicle: "パンク（日本語）" } as Record<string, string>,
    record: "録音", stop: "停止", recording: (s: number) => `録音中… ${s} 秒`, upload: "またはファイルをアップロード", uploadHint: `${MAX_RECORD_S} 秒まで`,
    micBlocked: "録音には https か localhost でのマイク許可が必要です。ファイルのアップロードはどこでも使えます。",
    run: "音声メモを振り分け", busy: "聞いています…", empty: "音声メモを選ぶか、録音するか、アップロードしてください。ドライバーの用件と緊急かどうかをモデルが聞き取ります。",
    urgent: "緊急", routine: "通常", why: (p: number) => `p(緊急) ${p.toFixed(2)}`, qUrgent: "緊急ですか？", qIntent: "話し手の用件は？",
    intents: { "directions to the address": "住所への道案内", "report a damaged parcel": "荷物の破損の報告", "the customer is not home": "お客様が不在", "a vehicle problem": "車両のトラブル" } as Record<string, string>, yours: "あなたの音声",
  },
};

export function VoiceDemo() {
  const t = useText(VOICE_TEXT);
  const [ci, setCi] = useState(0);
  const [clip, setClip] = useState<{ url: string; blob: Blob } | null>(null);
  const [rec, setRec] = useState<{ stop: () => void; seconds: number } | null>(null);
  const [micError, setMicError] = useState(false);
  const req = useMediaRequest();
  const src = clip?.url ?? `${SAMPLES}/voice_${CLIPS[ci]}.wav`;
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  async function record() {
    if (!navigator.mediaDevices?.getUserMedia) { setMicError(true); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setMicError(true); return; }
    const mr = new MediaRecorder(stream); const parts: Blob[] = [];
    let seconds = 0;
    const tick = setInterval(() => { seconds += 1; setRec((r) => (r ? { ...r, seconds } : r)); if (seconds >= MAX_RECORD_S) mr.stop(); }, 1000);
    mr.ondataavailable = (e) => parts.push(e.data);
    mr.onstop = () => {
      clearInterval(tick); stream.getTracks().forEach((tr) => tr.stop()); setRec(null);
      const blob = new Blob(parts, { type: mr.mimeType }); setClip({ url: URL.createObjectURL(blob), blob }); req.reset();
    };
    mr.start(); setMicError(false); setRec({ stop: () => mr.stop(), seconds: 0 });
  }

  const run = () => req.run(async () => ({ type: "audio", data: (await wavBase64(clip?.blob ?? await (await fetch(src)).blob())).data }), VOICE_Q);
  const a = req.result?.answers;
  const p = a?.urgent?.type === "noul" ? a.urgent.noul : null;

  return (
    <DemoGrid
      left={<>
        <Presets presets={CLIPS.map((id) => ({ name: t.names[id] }))} current={clip ? -1 : ci} onPick={(i) => { setCi(i); setClip(null); req.reset(); }} />
        <div className="flex flex-wrap items-center gap-3">
          {rec ? (
            <button type="button" onClick={rec.stop} className="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 text-[13px] text-destructive">
              <Square className="size-4" aria-hidden />{t.stop} · {t.recording(rec.seconds)}
            </button>
          ) : (
            <button type="button" onClick={record} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[13px] hover:border-(--demo-line)">
              <Mic className="size-4" aria-hidden />{t.record}
            </button>
          )}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-[13px] text-muted-foreground hover:border-(--demo-line)">
            <Upload className="size-4" aria-hidden />{t.upload} <span className="text-[11px]">({t.uploadHint})</span>
            <input type="file" accept="audio/*" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setClip({ url: URL.createObjectURL(f), blob: f }); req.reset(); } }} />
          </label>
        </div>
        {micError && <p className="text-[12px] text-muted-foreground">{t.micBlocked}</p>}
        <Field label={clip ? t.yours : t.names[CLIPS[ci]]}><audio src={src} controls className="w-full" /></Field>
        <RunBar onRun={run} busy={req.busy} disabled={!!rec} label={t.run} busyLabel={t.busy} />
        <WakingNote show={req.slow} />
        <MediaError error={req.error} />
      </>}
      right={req.result && a && p !== null ? <>
        <Verdict label={`${p >= 0.5 ? t.urgent : t.routine} · ${a.intent.type === "choice" ? t.intents[a.intent.choice] : ""}`} tone={p >= 0.5 ? "stop" : "plain"}>{t.why(p)}</Verdict>
        <ResultCard title={<>{t.qIntent} · <Latency r={req.result} /></>}><AnswerBars answer={a.intent} labels={t.intents} /></ResultCard>
        <ResultCard title={t.qUrgent}><AnswerBars answer={a.urgent} /></ResultCard>
        <ZeroShotNote />
      </> : req.busy ? <Shimmer tall /> : <Empty>{t.empty}</Empty>}
    />
  );
}

/* ------------------------------------------------------------------ Video check */

export const VIDEOS = ["damaged_wet", "intact_locker", "damaged_crushed_truck", "intact_door"];
const VIDEO_TEXT = {
  en: {
    names: { damaged_wet: "Wet box on a sidewalk", intact_locker: "Locker", damaged_crushed_truck: "Crushed in the van", intact_door: "Neat drop at a door" } as Record<string, string>,
    upload: "Your clip", uploadHint: `MP4, MOV or WebM, up to ${MAX_VIDEO_MB} MB`, choose: "Choose a video…", tooBig: `That clip is over ${MAX_VIDEO_MB} MB; trim it or pick a shorter one.`,
    run: "Check the video", busy: "Watching…", slow: "Reading 16 frames takes 10–20 s on a Mac, longer if the model first has to load.", empty: "Pick a clip or upload one: the model watches it and checks for damage and where the parcel was left.",
    note: "The sample clips are short pans over the sample photos. The model reads 16 frames spread over the clip, each with its timestamp; the sound is not used. It answers about the scene as a whole. Questions about the order of events (\"where is it at the end?\") are not reliable yet.",
  },
  ja: {
    names: { damaged_wet: "歩道で濡れた箱", intact_locker: "宅配ロッカー", damaged_crushed_truck: "車内でつぶれた箱", intact_door: "玄関前（きれい）" } as Record<string, string>,
    upload: "あなたの動画", uploadHint: `MP4・MOV・WebM、${MAX_VIDEO_MB} MB まで`, choose: "動画を選ぶ…", tooBig: `この動画は ${MAX_VIDEO_MB} MB を超えています。短くするか、別の動画を選んでください。`,
    run: "動画をチェック", busy: "見ています…", slow: "16 フレームを読むので、Mac では 10〜20 秒かかります。モデルの読み込みが必要なときはさらにかかります。", empty: "動画を選ぶかアップロードしてください。モデルが動画を見て、荷物の破損と置き場所を判定します。",
    note: "サンプル動画は、サンプル写真の上をゆっくり動かした短いクリップです。モデルは動画全体から均等に選んだ 16 フレームを、それぞれのタイムスタンプ付きで読みます。音声は使いません。答えるのは場面全体についてで、出来事の順番に関する質問（「最後はどこにあるか」など）にはまだ安定して答えられません。",
  },
};

export function VideoDemo() {
  const t = useText(VIDEO_TEXT);
  const p0 = useText(PHOTO_TEXT);
  const [vi, setVi] = useState(0);
  const [file, setFile] = useState<{ url: string; blob: Blob; name: string } | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const req = useMediaRequest();
  const src = file?.url ?? `${SAMPLES}/video_${VIDEOS[vi]}.mp4`;
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);

  const run = () => req.run(async () => ({ type: "video", data: toBase64(await (file?.blob ?? await (await fetch(src)).blob()).arrayBuffer()) }), PHOTO_Q);
  const a = req.result?.answers;
  const p = a?.damaged?.type === "noul" ? a.damaged.noul : null;

  return (
    <DemoGrid
      left={<>
        <Presets presets={VIDEOS.map((id) => ({ name: t.names[id] }))} current={file ? -1 : vi} onPick={(i) => { setVi(i); setFile(null); setTooBig(false); req.reset(); }} />
        <Field label={t.upload} hint={t.uploadHint} htmlFor="video-file">
          <label className={`${inputCls} flex cursor-pointer items-center gap-2 text-muted-foreground`}>
            <Upload className="size-4" aria-hidden /><span className="truncate">{file?.name ?? t.choose}</span>
            <input id="video-file" type="file" accept="video/*" className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return;
                if (f.size > MAX_VIDEO_MB * 2 ** 20) { setTooBig(true); return; }
                setTooBig(false); setFile({ url: URL.createObjectURL(f), blob: f, name: f.name }); req.reset();
              }} />
          </label>
        </Field>
        {tooBig && <p role="alert" className="text-[12px] text-destructive">{t.tooBig}</p>}
        <video key={src} src={src} controls muted loop playsInline autoPlay className="aspect-[4/3] w-full rounded-xl border border-border bg-black object-cover" />
        <RunBar onRun={run} busy={req.busy} label={t.run} busyLabel={t.busy} />
        {req.slow && <p role="status" className="text-[12px] leading-5 text-muted-foreground">{t.slow}</p>}
        <MediaError error={req.error} />
      </>}
      right={req.result && a && p !== null ? <>
        <Verdict label={p >= 0.7 ? p0.damaged : p <= 0.3 ? p0.ok : p0.unsure} tone={p >= 0.7 ? "stop" : p <= 0.3 ? "go" : "wait"}>{p0.why(p)}</Verdict>
        <ResultCard title={<>{p0.qDamaged} · <Latency r={req.result} /></>}><AnswerBars answer={a.damaged} /></ResultCard>
        <ResultCard title={p0.qPlace}><AnswerBars answer={a.place} labels={p0.places} /></ResultCard>
        <p className="text-[12px] leading-5 text-muted-foreground">{t.note}</p>
      </> : req.busy ? <Shimmer tall /> : <Empty>{t.empty}</Empty>}
    />
  );
}
