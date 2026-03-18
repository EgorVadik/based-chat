import { env } from '@based-chat/env/native'
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin'
import Constants from 'expo-constants'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'

import { authClient } from './auth-client'

GoogleSignin.configure({
  webClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
})

export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS !== 'web') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  }

  await GoogleSignin.signOut()
  const response = await GoogleSignin.signIn()

  if (response.type === 'cancelled') {
    throw new Error('cancelled')
  }

  if (!response.data.idToken) {
    throw new Error('No ID token received from Google')
  }

  await authClient.signIn.social({
    provider: 'google',
    idToken: {
      token: response.data.idToken,
    },
  })
}

export async function signInWithGitHub(): Promise<void> {
  const scheme = Constants.expoConfig?.scheme as string

  const response = await authClient.signIn.social({
    provider: 'github',
    callbackURL: `${scheme}://`,
  })

  const url = response.data?.url
  if (!url) {
    throw new Error('Failed to get GitHub authorization URL')
  }

  const result = await WebBrowser.openAuthSessionAsync(url, `${scheme}://`)

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('cancelled')
  }
}
