export type Phase1Custody = {
  allocateAddress(userId: string): { userId: string; network: string; address: string };
  applyFixtureDeposit(userId: string, amount?: number): {
    deposit: { status: string; amount: number };
  };
  applyConfirmedCredit?(userId: string, amount?: number): Promise<{
    deposit: { status: string; amount: number };
    available: number;
  }>;
  scanIncoming(userId: string): Promise<{
    address: string;
    scanned: number;
    credited: number;
    available: number;
    locked: number;
  }>;
  available(userId: string): number;
  asyncAvailable(userId: string): Promise<number>;
  locked(userId: string): number;
};

const modulePath = process.env.HIDOTPAY_CUSTODY_MODULE ?? '/Volumes/SING_02/hidotpay/app/src/custody/core.ts';
const blnkPath = process.env.HIDOTPAY_BLNK_MODULE ?? '/Volumes/SING_02/hidotpay/app/src/custody/blnk.ts';
const loaded = await import(modulePath) as {
  createCustody: (options?: { blnk?: unknown }) => Phase1Custody;
};
const blnkMod = await import(blnkPath) as {
  BlnkLedger: new (http: unknown) => unknown;
  createFetchBlnk: (url: string, key?: string) => unknown;
};
const blnkUrl = process.env.BLNK_URL;
const blnk = blnkUrl
  ? new blnkMod.BlnkLedger(blnkMod.createFetchBlnk(blnkUrl, process.env.BLNK_KEY))
  : undefined;
export const phase1Custody = loaded.createCustody(blnk ? { blnk } : undefined);
