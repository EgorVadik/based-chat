import { Drawer } from 'expo-router/drawer'
import React from 'react'
import { useWindowDimensions } from 'react-native'

import { ChatHeader } from '@/components/chat/chat-header'
import { DrawerContent } from '@/components/drawer-content'
import { ScreenHeader } from '@/components/screen-header'
import { useColors } from '@/lib/use-colors'

function DrawerLayout() {
  const colors = useColors()
  const { width: windowWidth } = useWindowDimensions()

  return (
    <Drawer
      drawerContent={() => <DrawerContent />}
      screenOptions={{
        headerShown: false,
        drawerType: 'slide',
        keyboardDismissMode: 'on-drag',
        drawerStyle: { backgroundColor: colors.background },
        // Default is a narrow left-edge strip; use full width so a rightward
        // swipe can open the drawer from anywhere on the screen.
        swipeEdgeWidth: windowWidth,
      }}
    >
      <Drawer.Screen
        name='index'
        options={{
          headerShown: true,
          header: () => <ChatHeader composerScope='new-chat' />,
        }}
      />
      <Drawer.Screen
        name='chat/[threadId]'
        options={{
          headerShown: true,
          header: () => <ChatHeader composerScope='thread' />,
        }}
      />
      <Drawer.Screen
        name='temporary-chat'
        options={{
          headerShown: true,
          header: () => <ChatHeader composerScope='temporary-chat' />,
        }}
      />
      <Drawer.Screen
        name='settings'
        options={{
          // Settings has swipeable tabs, so a full-width drawer swipe would
          // swallow them. Restore the library's default left-edge strip.
          swipeEdgeWidth: 32,
          headerShown: true,
          header: () => (
            <ScreenHeader title='Settings' icon='cog-outline' borderless />
          ),
        }}
      />
    </Drawer>
  )
}

export default DrawerLayout
