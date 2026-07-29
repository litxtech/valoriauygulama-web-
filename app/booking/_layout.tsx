import { Stack } from 'expo-router';

export default function BookingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#f7f6f3' },
      }}
    />
  );
}
