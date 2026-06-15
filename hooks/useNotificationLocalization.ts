import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ensureNotificationsLocalized,
  resolveNotificationDisplaySync,
  type LocalizedNotificationText,
  type NotificationLike,
} from '@/lib/notificationLocalization';
import { appLangCode } from '@/lib/translateText';

type Options = {
  guestAppToken?: string | null;
  staffPersist?: boolean;
  enabled?: boolean;
};

export function useNotificationLocalization(
  rows: NotificationLike[],
  options: Options = {}
): {
  displayFor: (row: NotificationLike) => LocalizedNotificationText;
  ready: boolean;
} {
  const { i18n } = useTranslation();
  const enabled = options.enabled !== false;
  const [localized, setLocalized] = useState<Record<string, LocalizedNotificationText>>({});
  const runId = useRef(0);

  const rowKey = useMemo(
    () => rows.map((r) => `${r.id}:${r.title}:${r.body ?? ''}`).join('|'),
    [rows]
  );

  useEffect(() => {
    if (!enabled || rows.length === 0) {
      setLocalized({});
      return;
    }

    const lang = appLangCode();
    const syncMap: Record<string, LocalizedNotificationText> = {};
    for (const row of rows) {
      syncMap[row.id] = resolveNotificationDisplaySync(row, lang);
    }
    setLocalized(syncMap);

    const id = ++runId.current;
    void ensureNotificationsLocalized(rows, {
      guestAppToken: options.guestAppToken,
      staffPersist: options.staffPersist,
    }).then((map) => {
      if (runId.current !== id) return;
      setLocalized((prev) => ({ ...prev, ...map }));
    });

    return () => {
      runId.current += 1;
    };
  }, [rowKey, enabled, options.guestAppToken, options.staffPersist, i18n.language]);

  const displayFor = (row: NotificationLike): LocalizedNotificationText =>
    localized[row.id] ?? resolveNotificationDisplaySync(row);

  return { displayFor, ready: true };
}
