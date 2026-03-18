import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import { useMMKVString } from 'react-native-mmkv'
import { Uniwind, useUniwind } from 'uniwind'

import { appStorage } from '@/lib/mmkv'

type ThemeName = 'light' | 'dark'

const THEME_STORAGE_KEY = 'based-chat-theme'

type AppThemeContextType = {
  currentTheme: string
  isLight: boolean
  isDark: boolean
  setTheme: (theme: ThemeName) => void
  toggleTheme: () => void
}

const AppThemeContext = createContext<AppThemeContextType | undefined>(
  undefined,
)

export const AppThemeProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { theme } = useUniwind()
  const [storedTheme, setStoredTheme] = useMMKVString(
    THEME_STORAGE_KEY,
    appStorage,
  )

  useEffect(() => {
    if (storedTheme === 'light' || storedTheme === 'dark') {
      Uniwind.setTheme(storedTheme)
    }
  }, [storedTheme])

  const isLight = useMemo(() => {
    return theme === 'light'
  }, [theme])

  const isDark = useMemo(() => {
    return theme === 'dark'
  }, [theme])

  const persistTheme = useCallback(
    (newTheme: ThemeName) => {
      Uniwind.setTheme(newTheme)
      setStoredTheme(newTheme)
    },
    [setStoredTheme],
  )

  const setTheme = useCallback(
    (newTheme: ThemeName) => {
      persistTheme(newTheme)
    },
    [persistTheme],
  )

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    persistTheme(nextTheme)
  }, [persistTheme, theme])

  const value = useMemo(
    () => ({
      currentTheme: theme,
      isLight,
      isDark,
      setTheme,
      toggleTheme,
    }),
    [theme, isLight, isDark, setTheme, toggleTheme],
  )

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  )
}

export function useAppTheme() {
  const context = useContext(AppThemeContext)
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider')
  }
  return context
}
