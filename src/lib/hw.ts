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
