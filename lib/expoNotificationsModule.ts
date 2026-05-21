/**
 * Statik expo-notifications importu.
 * Dynamic import Metro lazy bundle'da yalnızca index.js'i (1 module) paketleyip
 * alt modüllerde "Requiring unknown module" hatasına yol açıyordu.
 */
import * as ExpoNotifications from 'expo-notifications';

export default ExpoNotifications;
