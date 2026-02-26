import { Stack } from "expo-router";
import { ThemeProvider } from "../contexts/ThemeContext";
import { PriceProvider } from "../contexts/PriceContext";
import { UpdateManager } from "../components/UpdateManager";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <PriceProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <UpdateManager />
      </PriceProvider>
    </ThemeProvider>
  );
}
