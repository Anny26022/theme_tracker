# Web-First Shared Architecture (Web + Android)

## Why you see duplicate files now

You currently have two app roots:

- Web app root: `/Users/aniketmahato/Desktop/theme tracker`
- Android/Expo app root: `/Users/aniketmahato/Desktop/theme tracker/android-app`

Both apps contain similar feature files under `src/`, but they target different renderers:

- Web: DOM (`div`, `input`), CSS classes, `framer-motion`, `react-virtuoso`, `navigator.clipboard`
- Mobile: React Native primitives (`View`, `TextInput`, `FlatList`), `StyleSheet`, `lucide-react-native`

Because of this, **a single UI file is usually not realistic**.  
What should be single/shared is business logic, types, data transforms, and service contracts.

## Deep-dive findings from current code

### 1) Same logic copied in two places (high-value to centralize)

- `useMarketData` hierarchy transform is duplicated:
  - Web: `/Users/aniketmahato/Desktop/theme tracker/src/hooks/useMarketData.js`
  - Mobile: `/Users/aniketmahato/Desktop/theme tracker/android-app/src/hooks/useMarketData.ts`

- `useUnifiedTracker` aggregation logic is duplicated with mobile reduced behavior:
  - Web: `/Users/aniketmahato/Desktop/theme tracker/src/hooks/useUnifiedTracker.js`
  - Mobile: `/Users/aniketmahato/Desktop/theme tracker/android-app/src/hooks/useUnifiedTracker.ts`

- `useAsync` is duplicated with slightly different behavior and error typing:
  - Web: `/Users/aniketmahato/Desktop/theme tracker/src/hooks/useAsync.js`
  - Mobile: `/Users/aniketmahato/Desktop/theme tracker/android-app/src/hooks/useAsync.ts`

### 2) Services are divergent (web real API, mobile mock)

- Web price service is production-like and batched:
  - `/Users/aniketmahato/Desktop/theme tracker/src/services/priceService.js`
- Mobile price service is mostly mock/random:
  - `/Users/aniketmahato/Desktop/theme tracker/android-app/src/services/priceService.ts`

This divergence is the main reason logic drifts over time.

### 3) View files are similar in intent but renderer-specific

- Example pair:
  - Web: `/Users/aniketmahato/Desktop/theme tracker/src/views/UniverseView.jsx`
  - Mobile: `/Users/aniketmahato/Desktop/theme tracker/android-app/src/views/UniverseView.tsx`

Intent is the same, but implementation must differ because virtualization/layout/input systems are different.

## What should be shared vs customized

## Share (single source of truth)

- Domain types (`Company`, `Hierarchy`, `TrackerMetrics`, `Interval`)
- Pure transforms:
  - normalize symbols
  - build hierarchy from raw data
  - sector/industry/company filters
  - tracker aggregation math
  - watchlist formatting
- API contracts/interfaces:
  - `MarketDataRepository`
  - `PriceRepository`
- Shared hooks that depend only on React + shared contracts (no DOM/RN imports)

## Keep platform-specific

- Render components (`.web.tsx` vs `.native.tsx`)
- Animation bindings (`framer-motion` vs RN Animated/Reanimated)
- Virtualized lists (`react-virtuoso` vs `FlatList`)
- Device/browser APIs (`navigator.clipboard` vs Expo Clipboard, `sessionStorage` vs AsyncStorage)

## Target structure (web remains base)

```text
apps/
  web/                     # existing web app logic (base behavior)
  mobile/                  # Expo Android app
packages/
  core/
    src/
      domain/
      use-cases/
      transforms/
      repositories/
      hooks/
```

If you keep current folders for now, still create:

```text
/Users/aniketmahato/Desktop/theme tracker/packages/core
```

and import shared logic into both apps.

## Web-first migration plan (safe sequence)

1) Extract pure transforms first (no UI changes)
- Move hierarchy builder, symbol normalization, and tracker aggregation to `packages/core`.
- Replace both app implementations to call shared functions.

2) Unify service contracts
- Define repository interfaces in `packages/core`.
- Keep web adapter as canonical implementation.
- Mobile adapter can temporarily wrap mock behavior behind same interface.

3) Convert duplicated hooks to shared hooks
- `useMarketData`, `useUnifiedTracker`, `useComparisonData`, `useAsync` -> shared hook layer.
- Hooks should receive platform adapters as dependencies.

4) Keep only thin platform screens
- Web and mobile views become renderer wrappers around shared hook outputs.
- Use `FeaturePresenter` pattern:
  - `feature.presenter.ts` (shared logic)
  - `FeatureView.web.tsx`
  - `FeatureView.native.tsx`

5) Close capability gaps
- Replace mobile mock price service with real adapter when dependency/API constraints are resolved.

## Immediate low-risk modules to centralize first

- `buildHierarchyFromMarketData(rawData)`
- `cleanSymbol(symbol)`
- `computeTrackerMetrics(itemToSymbols, rawResults)`
- `formatTVWatchlist(groups)`
- shared `types.ts`

These are stable and do not depend on DOM or native APIs.

## Practical rule to avoid future duplication

When adding a feature:

1. Write/modify shared domain logic in `packages/core` first.
2. Expose outputs as plain objects.
3. Implement only renderer-specific UI in each app.

This keeps web as canonical behavior while mobile customizes only where platform differences require it.

