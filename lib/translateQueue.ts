/** Aynı anda en fazla 2 çeviri — sohbet/mesaj RPC’lerini kilitlemesin. */
const MAX_CONCURRENT = 2;
let active = 0;
const waiters: Array<() => void> = [];

function drain(): void {
  while (active < MAX_CONCURRENT && waiters.length > 0) {
    const next = waiters.shift();
    if (next) next();
  }
}

export function runInTranslateQueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      fn()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    };
    if (active < MAX_CONCURRENT) run();
    else waiters.push(run);
  });
}
