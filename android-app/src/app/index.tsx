import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UniverseView } from "../views/UniverseView";
import { SectorView } from "../views/SectorView";
import { IndustryView } from "../views/IndustryView";
import { TrackerView } from "../views/TrackerView";
import { ComparisonView } from "../views/ComparisonView";
import { DomainView } from "../views/DomainView";
import { Navbar } from "../components/Navbar";
import { useMarketData } from "../hooks/useMarketData";
import { BackgroundAmbience } from "../components/BackgroundAmbience";
import { CompanyInsights } from "../components/CompanyInsights";
import { useTheme } from "../contexts/ThemeContext";

export const VIEWS = {
  UNIVERSE: 'UNIVERSE',
  DOMAIN: 'DOMAIN',
  SECTOR: 'SECTOR',
  INDUSTRY: 'INDUSTRY',
  TRACKER: 'TRACKER',
  COMPARE: 'COMPARE'
};

export default function Index() {
  const { isDark, colors } = useTheme();
  const [view, setView] = useState(VIEWS.UNIVERSE);
  const [sector, setSector] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [insightsCompany, setInsightsCompany] = useState<any | null>(null);
  const { hierarchy, loading } = useMarketData();

  const navigate = useCallback((v: string) => {
    setView(v);
    if (v === VIEWS.UNIVERSE || v === VIEWS.DOMAIN) {
      setSector(null);
      setIndustry(null);
    }
  }, []);

  const handleSectorClick = useCallback((s: string) => {
    setSector(s);
    setView(VIEWS.SECTOR);
  }, []);

  const handleIndustryClick = useCallback((sec: string, ind: string) => {
    setSector(sec);
    setIndustry(ind);
    setView(VIEWS.INDUSTRY);
  }, []);

  const handleSectorBack = useCallback(() => {
    setView(VIEWS.UNIVERSE);
    setSector(null);
  }, []);

  const handleIndustryBack = useCallback(() => {
    setView(VIEWS.SECTOR);
    setIndustry(null);
  }, []);

  const handleOpenInsights = useCallback((company: any) => {
    setInsightsCompany(company);
  }, []);

  const handleCloseInsights = useCallback(() => {
    setInsightsCompany(null);
  }, []);

  const currentIndustries = useMemo(() => {
    if (!sector || !hierarchy[sector]) return [];
    return Object.keys(hierarchy[sector]).sort();
  }, [hierarchy, sector]);

  const currentCompanies = useMemo(() => {
    if (!sector || !industry || !hierarchy[sector]) return [];
    return hierarchy[sector][industry] || [];
  }, [hierarchy, sector, industry]);

  const currentStyles = styles(colors);

  return (
    <SafeAreaView style={currentStyles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.bgMain} />
      <BackgroundAmbience />
      <Navbar view={view} navigate={navigate} />
      <View style={currentStyles.container}>
        {view === VIEWS.UNIVERSE && (
          <UniverseView onSectorClick={handleSectorClick} />
        )}
        {view === VIEWS.DOMAIN && (
          <DomainView
            onIndustryClick={handleIndustryClick}
            onOpenInsights={handleOpenInsights}
          />
        )}
        {view === VIEWS.SECTOR && sector && (
          <SectorView
            sector={sector}
            industries={currentIndustries}
            hierarchy={hierarchy}
            onBack={handleSectorBack}
            onIndustryClick={(ind: string) => handleIndustryClick(sector, ind)}
          />
        )}
        {view === VIEWS.INDUSTRY && sector && industry && (
          <IndustryView
            sector={sector}
            industry={industry}
            companies={currentCompanies}
            onBack={handleIndustryBack}
            onOpenInsights={handleOpenInsights}
          />
        )}
        {view === VIEWS.TRACKER && (
          <TrackerView
            onSectorClick={handleSectorClick}
            onIndustryClick={handleIndustryClick}
          />
        )}
        {view === VIEWS.COMPARE && (
          <ComparisonView
            onOpenInsights={handleOpenInsights}
          />
        )}
      </View>

      <CompanyInsights
        isOpen={!!insightsCompany}
        symbol={insightsCompany?.symbol}
        name={insightsCompany?.name}
        onClose={handleCloseInsights}
      />
    </SafeAreaView>
  );
}

const styles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
