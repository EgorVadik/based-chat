import { Drawer } from 'expo-router/drawer'
import React from 'react'

import { ChatHeader } from '@/components/chat/chat-header'
import { DrawerContent } from '@/components/drawer-content'
import { ScreenHeader } from '@/components/screen-header'
import { useColors } from '@/lib/use-colors'

function DrawerLayout() {
  const colors = useColors()

  return (
    <Drawer
      drawerContent={() => <DrawerContent />}
      screenOptions={{
        headerShown: false,
        drawerType: 'slide',
        keyboardDismissMode: 'on-drag',
        drawerStyle: { backgroundColor: colors.background },
      }}
    >
      <Drawer.Screen
        name='index'
        options={{
          headerShown: true,
          header: () => <ChatHeader />,
        }}
      />
      <Drawer.Screen
        name='chat/[threadId]'
        options={{
          headerShown: true,
          header: () => <ChatHeader />,
        }}
      />
      <Drawer.Screen
        name='temporary-chat'
        options={{
          headerShown: true,
          header: () => <ChatHeader />,
        }}
      />
      <Drawer.Screen
        name='settings'
        options={{
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
