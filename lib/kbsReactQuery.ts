/** KBS / ops-proxy ekranları: odaklanınca sürekli yenileme ve uzun spinner önlenir. */
export const kbsQueryOptions = {
  retry: 1,
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
} as const;
