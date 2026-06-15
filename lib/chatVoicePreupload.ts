type Entry = {
  localUri: string;
  promise: Promise<string>;
  url?: string;
  error?: unknown;
};

const sessions = new Map<string, Entry>();

export function startVoicePreupload(
  sessionKey: string,
  localUri: string,
  upload: (uri: string) => Promise<string>
): void {
  const prev = sessions.get(sessionKey);
  if (prev?.localUri === localUri && !prev.error) return;

  const entry: Entry = {
    localUri,
    promise: upload(localUri)
      .then((url) => {
        entry.url = url;
        return url;
      })
      .catch((error) => {
        entry.error = error;
        throw error;
      }),
  };
  sessions.set(sessionKey, entry);
}

export async function consumeVoicePreupload(
  sessionKey: string,
  localUri: string
): Promise<string | null> {
  const entry = sessions.get(sessionKey);
  if (!entry || entry.localUri !== localUri) return null;
  if (entry.url) return entry.url;
  try {
    return await entry.promise;
  } catch {
    return null;
  }
}

export function clearVoicePreupload(sessionKey: string): void {
  sessions.delete(sessionKey);
}
