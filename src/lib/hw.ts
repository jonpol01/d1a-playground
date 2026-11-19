// What GET /api/hw returns; null means the host could not report it.
export type Hw = {
  platform: string;
  chip: string | null;
  cores: number;
  ramBytes: number;
  load1: number | null;
  memFreePct: number | null;
  swapUsedBytes: number | null;
  gpu: { name: string | null; cores: number | null; utilPct: number | null; memUsedBytes: number | null; memTotalBytes: number | null; tempC: number | null; powerW: number | null };
  server: { local: boolean; pid: number | null; memBytes: number | null };
};

/** The CPU's name: the processor's own when it reports one, else the machine's product name. ARM Linux reports
 * "unknown" (no model name in /proc/cpuinfo); the DMI product name (e.g. "Vendor_Server_Name") names the machine. */
export function chipName(model: string | null | undefined, product: string | null | undefined): string | null {
  const m = model?.trim();
  if (m && m.toLowerCase() !== "unknown") return m;
  const p = product?.trim().replace(/_/g, " ");
  return p || null;
}

/** Memory in use on the machine that runs this app, from its total and free share. */
export function hostMemUsedBytes(hw: Pick<Hw, "ramBytes" | "memFreePct">): number | null {
  return hw.memFreePct == null ? null : Math.round(hw.ramBytes * (1 - hw.memFreePct / 100));
}
