/**
 * Expo Push API mesaj gövdesi — iOS/Android için tutarlı alert + badge.
 * Arka plan / kapalı uygulama: title+body+badge+priority zorunlu; yalnızca data push göstermez.
 */
export type ExpoPushMessageInput = {
  to: string;
  title: string;
  body: string;
  badge: number;
  data?: Record<string, unknown>;
  channelId?: string;
  sound?: string | null;
  interruptionLevel?: "active" | "time-sensitive" | "passive";
};

export function buildExpoPushMessage(input: ExpoPushMessageInput): Record<string, unknown> {
  const data = { ...(input.data ?? {}), app_badge: input.badge };
  return {
    to: input.to,
    title: input.title.trim(),
    body: input.body,
    badge: input.badge,
    priority: "high",
    interruptionLevel: input.interruptionLevel ?? "active",
    channelId: input.channelId ?? "valoria_urgent",
    sound: input.sound === undefined ? "default" : input.sound,
    data,
  };
}
