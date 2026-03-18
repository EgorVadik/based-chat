import { Stack, usePathname } from 'expo-router'

export default function AuthLayout() {
  const pathname = usePathname()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation:
          pathname === '/sign-up' ? 'slide_from_right' : 'slide_from_left',
      }}
    >
      <Stack.Screen name='sign-in' />
      <Stack.Screen name='sign-up' />
    </Stack>
  )
}
