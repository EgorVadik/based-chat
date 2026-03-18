export const colors = {
  light: {
    background: "#f8f8fa",
    foreground: "#1c1c22",
    primary: "#0a7a8a",
    primaryForeground: "#f5fafa",
    secondary: "#f0f0f4",
    secondaryForeground: "#2c2c34",
    muted: "#f0f0f4",
    mutedForeground: "#636370",
    accent: "#e8e8ee",
    accentForeground: "#1c1c22",
    destructive: "#d4422a",
    border: "#e2e2e8",
    input: "#e2e2e8",
    card: "#ffffff",
    cardForeground: "#1c1c22",
    ring: "#0a7a8a",
  },
  dark: {
    background: "#161620",
    foreground: "#eaeaee",
    primary: "#2dbbd4",
    primaryForeground: "#0a1518",
    secondary: "#2c2c34",
    secondaryForeground: "#eaeaee",
    muted: "#2c2c34",
    mutedForeground: "#82828e",
    accent: "#363640",
    accentForeground: "#eaeaee",
    destructive: "#f05545",
    border: "rgba(255,255,255,0.07)",
    input: "rgba(255,255,255,0.10)",
    card: "#212128",
    cardForeground: "#eaeaee",
    ring: "#2dbbd4",
  },
} as const;

export type ThemeColors = {
  [K in keyof typeof colors.light]: string;
};
