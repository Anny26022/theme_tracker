import { Stack } from "expo-router";
import { ThemeProvider } from "../contexts/ThemeContext";
import { PriceProvider } from "../contexts/PriceContext";
import { MarketDataProvider } from "../contexts/MarketDataContext";
import { UpdateManager } from "../components/UpdateManager";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <PriceProvider>
        <MarketDataProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <UpdateManager />
        </MarketDataProvider>
      </PriceProvider>
    </ThemeProvider>
  );
}
