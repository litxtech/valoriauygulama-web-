import { Stack } from 'expo-router';
import { customerStackGestureForNavigation } from '@/lib/customerStackNavigation';

export default function CustomerGuestExtrasLayout() {
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        ...customerStackGestureForNavigation(navigation),
        headerShown: false,
      })}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
