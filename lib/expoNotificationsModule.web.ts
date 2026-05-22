/** Web: push bildirimleri yok — native modül yüklenmesin (TDZ / init hataları önlenir). */
const noopPermissions = async () => ({ status: 'denied' as const, granted: false, canAskAgain: false });

export default {
  getPermissionsAsync: noopPermissions,
  requestPermissionsAsync: noopPermissions,
};
