import '@/global.css'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import { ConvexReactClient, useConvexAuth } from 'convex/react'
import { Stack } from 'expo-router'
import { HeroUINativeProvider } from 'heroui-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'

import { AppThemeProvider } from '@/contexts/app-theme-context'
import { authClient } from '@/lib/auth-client'
import { ActivityIndicator, View } from 'react-native'
import { useColors } from '@/lib/use-colors'
import ModelCatalogBootstrap from '@/components/model-catalog-bootstrap'

export const unstable_settings = {
  initialRouteName: '(auth)',
}

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
})

function StackLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const colors = useColors()

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size='large' color={colors.primary} />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name='(auth)' />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name='(drawer)' />
      </Stack.Protected>
      <Stack.Screen
        name='modal'
        options={{ title: 'Modal', presentation: 'modal' }}
      />
    </Stack>
  )
}

export default function Layout() {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <ModelCatalogBootstrap>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AppThemeProvider>
              <BottomSheetModalProvider>
                <HeroUINativeProvider>
                  <StackLayout />
                </HeroUINativeProvider>
              </BottomSheetModalProvider>
            </AppThemeProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ModelCatalogBootstrap>
    </ConvexBetterAuthProvider>
  )
}
