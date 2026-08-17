import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildNotificationActorProfile,
  resolveNotificationActorRef,
  type NotificationActorProfile,
  type NotificationActorRow,
} from '@/lib/notificationActor';

type StaffRow = {
  id: string;
  full_name: string | null;
  profile_image: string | null;
  department?: string | null;
};

type GuestRow = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
};

export function useNotificationActorProfiles(rows: NotificationActorRow[]): {
  actorFor: (row: NotificationActorRow) => NotificationActorProfile;
  ready: boolean;
} {
  const [staffById, setStaffById] = useState(() => new Map<string, StaffRow>());
  const [guestById, setGuestById] = useState(() => new Map<string, GuestRow>());
  const [ready, setReady] = useState(false);
  const runId = useRef(0);

  const idKey = useMemo(() => {
    const staffIds = new Set<string>();
    const guestIds = new Set<string>();
    for (const row of rows) {
      const ref = resolveNotificationActorRef(row);
      if (ref.staffId) staffIds.add(ref.staffId);
      if (ref.guestId) guestIds.add(ref.guestId);
    }
    return `${[...staffIds].sort().join(',')}|${[...guestIds].sort().join(',')}`;
  }, [rows]);

  useEffect(() => {
    const staffIds = new Set<string>();
    const guestIds = new Set<string>();
    for (const row of rows) {
      const ref = resolveNotificationActorRef(row);
      if (ref.staffId) staffIds.add(ref.staffId);
      if (ref.guestId) guestIds.add(ref.guestId);
    }

    if (staffIds.size === 0 && guestIds.size === 0) {
      setStaffById(new Map());
      setGuestById(new Map());
      setReady(true);
      return;
    }

    const id = ++runId.current;
    setReady(false);

    void (async () => {
      const nextStaff = new Map<string, StaffRow>();
      const nextGuest = new Map<string, GuestRow>();

      if (staffIds.size > 0) {
        const { data } = await supabase
          .from('staff')
          .select('id, full_name, profile_image, department')
          .in('id', [...staffIds]);
        for (const row of (data ?? []) as StaffRow[]) {
          nextStaff.set(row.id, row);
        }
      }

      if (guestIds.size > 0) {
        const { data } = await supabase
          .from('guests')
          .select('id, full_name, photo_url')
          .in('id', [...guestIds]);
        for (const row of (data ?? []) as GuestRow[]) {
          nextGuest.set(row.id, row);
        }
      }

      if (runId.current !== id) return;
      setStaffById(nextStaff);
      setGuestById(nextGuest);
      setReady(true);
    })();
  }, [idKey, rows]);

  const actorFor = (row: NotificationActorRow): NotificationActorProfile =>
    buildNotificationActorProfile(row, staffById, guestById);

  return { actorFor, ready };
}
