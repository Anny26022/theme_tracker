import React, { useCallback, useMemo, useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    SectionList,
    ActivityIndicator,
    useWindowDimensions,
    Linking,
    Alert,
} from 'react-native';
import { X, Activity, FileText, Newspaper, PieChart, TrendingUp, Landmark, BarChart3, Award, ExternalLink } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useLivePrice } from '../contexts/PriceContext';
import { useFundamentals } from '../hooks/useFundamentals';
import { useFilings } from '../hooks/useFilings';
import { getIsin } from '../services/isinService';

function formatIndianNumber(n: any): string {
    if (n == null || isNaN(n)) return '—';
    const num = Number(n);
    if (num >= 1e12) return `₹${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)}Cr`;
    if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)}L`;
    if (num >= 1e3) return `₹${(num / 1e3).toFixed(1)}K`;
    return `₹${num.toLocaleString('en-IN')}`;
}

function formatPercent(n: any): string {
    if (n == null || isNaN(n)) return '—';
    return `${Number(n).toFixed(2)}%`;
}

interface CompanyInsightsProps {
    symbol: string | null;
    name: string | null;
    isOpen: boolean;
    onClose: () => void;
}

type InsightsTabId = 'SNAPSHOT' | 'FILINGS' | 'NEWS';

type CompanyInsightsModel = {
    colors: any;
    isDark: boolean;
    currentStyles: any;
    activeTab: InsightsTabId;
    setActiveTab: (tab: InsightsTabId) => void;
    tabs: { id: InsightsTabId; label: string; icon: React.ReactNode }[];
    price: number | null | undefined;
    changePct: number | null | undefined;
    changeColor: string;
    funda: any;
    fundaLoading: boolean;
    selectedYear: number;
    setSelectedYear: (year: number) => void;
    isin: string | null;
    filingsLoading: boolean;
    filingSections: FilingSection[];
    handleOpenFiling: (item: any) => Promise<void>;
};

type FilingSection = {
    title: string;
    monthKey: number;
    data: any[];
};

function getFilingDate(item: any): Date | null {
    const dateStr = item?.news_date || item?.date || item?.filingDate || item?.fillingDate;
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function getFilingUrl(item: any): string | null {
    const raw = item?.file_url || item?.fileUrl || item?.attachment || item?.url || item?.link || item?.document_url || item?.documentUrl;
    if (typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return encodeURI(trimmed);
    if (trimmed.startsWith('//')) return encodeURI(`https:${trimmed}`);

    // If API returns host without scheme, assume HTTPS.
    return encodeURI(`https://${trimmed.replace(/^\/+/, '')}`);
}

const Metric = ({ label, value, subValue, icon, colors, currentStyles }: any) => (
    <View style={currentStyles.metricContainer}>
        <View style={currentStyles.metricHeader}>
            {icon}
            <Text style={currentStyles.metricLabel}>{label}</Text>
        </View>
        <View style={currentStyles.metricValueContainer}>
            <Text style={currentStyles.metricValue}>{value}</Text>
            {subValue && <Text style={currentStyles.metricSubValue}>{subValue}</Text>}
        </View>
    </View>
);

const InsightsHeader = ({ symbol, name, isin, isDark, colors, currentStyles, onClose }: any) => (
    <View style={currentStyles.header}>
        <View style={currentStyles.headerInfo}>
            <View style={currentStyles.intelSuiteContainer}>
                <Text style={currentStyles.intelSuiteTitle}>Intel Suite</Text>
                <View style={currentStyles.tag}>
                    <Text style={currentStyles.tagText}>{symbol}</Text>
                </View>
                {isin && (
                    <View style={[currentStyles.tag, { backgroundColor: isDark ? 'rgba(197, 160, 89, 0.05)' : 'rgba(197, 160, 89, 0.03)', borderColor: 'rgba(197,160,89,0.1)' }]}>
                        <Text style={[currentStyles.tagText, { fontSize: 7, opacity: 0.6 }]}>{isin}</Text>
                    </View>
                )}
            </View>
            <Text style={currentStyles.companyName}>{name}</Text>
        </View>
        <Pressable onPress={onClose} style={currentStyles.closeButton}>
            <X size={20} color={colors.textMuted} />
        </Pressable>
    </View>
);

const InsightsTabs = ({ tabs, activeTab, onTabChange, currentStyles }: any) => (
    <View style={currentStyles.tabsContainer}>
        {tabs.map((tab: any) => (
            <Pressable
                key={tab.id}
                onPress={() => onTabChange(tab.id)}
                style={[currentStyles.tab, activeTab === tab.id && currentStyles.activeTab]}
            >
                {tab.icon}
                <Text style={[currentStyles.tabText, activeTab === tab.id && currentStyles.activeTabText]}>
                    {tab.label}
                </Text>
            </Pressable>
        ))}
    </View>
);

const FilingsPanel = ({
    isin,
    filingsLoading,
    filingSections,
    selectedYear,
    onYearChange,
    colors,
    currentStyles,
    handleOpenFiling,
}: any) => (
    <View style={currentStyles.filingsBody}>
        {!isin ? (
            <View style={currentStyles.centerSection}>
                <FileText size={32} color={colors.uiMuted} />
                <Text style={currentStyles.offlineTitle}>ISIN Missing</Text>
                <Text style={currentStyles.offlineSub}>Cannot resolve ISIN for this symbol</Text>
            </View>
        ) : filingsLoading ? (
            <View style={currentStyles.loadingContainer}>
                <ActivityIndicator color={colors.accentPrimary} />
                <Text style={currentStyles.loadingText}>Loading filings...</Text>
            </View>
        ) : (
            <View style={currentStyles.filingsContent}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={currentStyles.yearSelectorScroll}>
                    <View style={currentStyles.yearSelector}>
                        {[2026, 2025, 2024, 2023, 2022, 2021].map((year) => (
                            <Pressable
                                key={year}
                                onPress={() => onYearChange(year)}
                                style={[currentStyles.yearButton, selectedYear === year && currentStyles.yearButtonActive]}
                            >
                                <Text style={[currentStyles.yearButtonText, selectedYear === year && currentStyles.yearButtonTextActive]}>
                                    {year}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </ScrollView>

                {filingSections.length > 0 ? (
                    <View style={currentStyles.timelineListContainer}>
                        <View style={currentStyles.timelineLine} />
                        <SectionList
                            sections={filingSections}
                            keyExtractor={(item, idx) => {
                                const title = item.caption || item.title || item.subject || 'Corporate Filing';
                                const datePart = getFilingDate(item)?.toISOString() || String(idx);
                                return `${title}-${datePart}-${idx}`;
                            }}
                            renderSectionHeader={({ section }) => (
                                <View style={currentStyles.timelineSectionHeader}>
                                    <View style={currentStyles.timelineDot} />
                                    <Text style={currentStyles.timelineMonth}>{section.title}</Text>
                                </View>
                            )}
                            renderItem={({ item }) => {
                                const title = item.caption || item.title || item.subject || 'Corporate Filing';
                                const category = item.cat || item.descriptor || item.categoryLabel || item.type || 'Notification';
                                const dateFormatted = getFilingDate(item)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) || '';
                                const attachment = getFilingUrl(item);

                                return (
                                    <Pressable
                                        style={currentStyles.filingCard}
                                        onPress={() => handleOpenFiling(item)}
                                    >
                                        <View style={currentStyles.filingIcon}>
                                            <FileText size={14} color={colors.textMuted} />
                                        </View>
                                        <View style={currentStyles.filingInfo}>
                                            <View style={currentStyles.filingTitleRow}>
                                                <Text style={currentStyles.filingTitle} numberOfLines={2}>{title}</Text>
                                                {attachment && <ExternalLink size={10} color={colors.accentPrimary} style={{ marginTop: 2 }} />}
                                            </View>
                                            <View style={currentStyles.filingMeta}>
                                                <Text style={currentStyles.filingCategory}>{category}</Text>
                                                <Text style={currentStyles.filingDot}>•</Text>
                                                <Text style={currentStyles.filingDate}>{dateFormatted}</Text>
                                            </View>
                                        </View>
                                    </Pressable>
                                );
                            }}
                            stickySectionHeadersEnabled={false}
                            contentContainerStyle={currentStyles.timelineListContent}
                            showsVerticalScrollIndicator={false}
                            initialNumToRender={20}
                            maxToRenderPerBatch={20}
                            windowSize={7}
                            removeClippedSubviews={true}
                        />
                    </View>
                ) : (
                    <View style={currentStyles.centerSection}>
                        <Text style={currentStyles.offlineSub}>No filings detected for {selectedYear}</Text>
                    </View>
                )}
            </View>
        )}
    </View>
);

const SnapshotPanel = ({ price, changePct, changeColor, fundaLoading, funda, name, colors, currentStyles }: any) => (
    <View style={currentStyles.section}>
        <View style={currentStyles.sectionHeader}>
            <Activity size={12} color={colors.accentPrimary} />
            <Text style={currentStyles.sectionTitle}>Live Quote</Text>
        </View>

        <View style={currentStyles.priceCard}>
            <View>
                <Text style={currentStyles.priceLabel}>Current Market Price</Text>
                <Text style={currentStyles.priceValue}>
                    {price ? `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}{' '}
                    <Text style={currentStyles.currency}>INR</Text>
                </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={currentStyles.priceLabel}>Session Change</Text>
                <Text style={[currentStyles.changeValue, { color: changeColor }]}>
                    {changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
                </Text>
            </View>
        </View>

        <View style={currentStyles.sectionHeader}>
            <BarChart3 size={12} color={colors.accentPrimary} />
            <Text style={currentStyles.sectionTitle}>Fundamental Specs</Text>
        </View>

        {fundaLoading ? (
            <View style={currentStyles.loadingContainer}>
                <ActivityIndicator color={colors.accentPrimary} />
                <Text style={currentStyles.loadingText}>Loading fundamentals...</Text>
            </View>
        ) : funda ? (
            <View style={currentStyles.metricsGrid}>
                <Metric label="Market Cap" value={formatIndianNumber(funda.marketCap)} subValue="INR" icon={<PieChart size={12} color={colors.textMuted} />} colors={colors} currentStyles={currentStyles} />
                <Metric label="P/E Ratio" value={funda.peRatio ? funda.peRatio.toFixed(2) : '—'} subValue="Multiple" icon={<TrendingUp size={12} color={colors.textMuted} />} colors={colors} currentStyles={currentStyles} />
                <Metric label="Div. Yield" value={formatPercent(funda.yield)} subValue="Yield" icon={<Landmark size={12} color={colors.textMuted} />} colors={colors} currentStyles={currentStyles} />
                <Metric label="Volume" value={formatIndianNumber(funda.volume)} subValue="Shares" icon={<BarChart3 size={12} color={colors.textMuted} />} colors={colors} currentStyles={currentStyles} />
                <Metric label="EPS (TTM)" value={funda.eps ? funda.eps.toFixed(2) : '—'} subValue="Per Share" icon={<TrendingUp size={12} color={colors.textMuted} />} colors={colors} currentStyles={currentStyles} />
                <Metric label="52W Range" value={`${formatIndianNumber(funda.low52)} - ${formatIndianNumber(funda.high52)}`} subValue="Price" icon={<Activity size={12} color={colors.textMuted} />} colors={colors} currentStyles={currentStyles} />
            </View>
        ) : (
            <View style={currentStyles.restrictedContainer}>
                <Text style={currentStyles.restrictedText}>Alpha data restricted</Text>
            </View>
        )}

        {funda?.description ? (
            <View style={{ marginTop: 16 }}>
                <View style={currentStyles.sectionHeader}>
                    <Award size={12} color={colors.accentPrimary} />
                    <Text style={currentStyles.sectionTitle}>Corporate Profile</Text>
                </View>
                <Text style={currentStyles.description}>{funda.description}</Text>
            </View>
        ) : (
            <View style={{ marginTop: 16 }}>
                <View style={currentStyles.sectionHeader}>
                    <Award size={12} color={colors.accentPrimary} />
                    <Text style={currentStyles.sectionTitle}>Corporate Profile</Text>
                </View>
                <Text style={currentStyles.description}>
                    Loading deep-dive intelligence for {name}...
                </Text>
            </View>
        )}
    </View>
);

const NewsPanel = ({ colors, currentStyles }: any) => (
    <View style={currentStyles.centerSection}>
        <Newspaper size={32} color={colors.uiMuted} />
        <Text style={currentStyles.offlineTitle}>Wire Feed Offline</Text>
        <Text style={currentStyles.offlineSub}>Syncing with Bloomberg/Reuters feeds...</Text>
    </View>
);

const useCompanyInsightsModel = ({ symbol, isOpen }: CompanyInsightsProps): CompanyInsightsModel => {
    const { colors, theme } = useTheme();
    const { height: screenHeight } = useWindowDimensions();
    const [activeTab, setActiveTab] = useState<InsightsTabId>('SNAPSHOT');
    const isDark = theme === 'dark';

    const { price, changePct } = useLivePrice(isOpen ? (symbol ?? undefined) : undefined);
    const { data: funda, loading: fundaLoading } = useFundamentals(isOpen ? symbol : null);
    const [selectedYear, setSelectedYear] = useState(2026);

    const isin = isOpen ? getIsin(symbol) : null;
    const { data: filings, loading: filingsLoading } = useFilings(isin);

    const filingSections = useMemo<FilingSection[]>(() => {
        if (!Array.isArray(filings)) return [];

        const grouped = new Map<string, FilingSection>();

        filings.forEach((filing: any) => {
            const date = getFilingDate(filing);
            if (!date || date.getFullYear() !== selectedYear) return;

            const monthKey = (date.getFullYear() * 100) + date.getMonth();
            const mapKey = String(monthKey);
            const monthLabel = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

            if (!grouped.has(mapKey)) {
                grouped.set(mapKey, {
                    title: monthLabel,
                    monthKey,
                    data: [],
                });
            }

            grouped.get(mapKey)!.data.push(filing);
        });

        return Array.from(grouped.values())
            .sort((a, b) => b.monthKey - a.monthKey)
            .map((section) => ({
                ...section,
                data: [...section.data].sort((a: any, b: any) => {
                    const aDate = getFilingDate(a)?.getTime() ?? 0;
                    const bDate = getFilingDate(b)?.getTime() ?? 0;
                    return bDate - aDate;
                }),
            }));
    }, [filings, selectedYear]);

    const tabs = useMemo(() => ([
        { id: 'SNAPSHOT' as const, label: 'Snapshot', icon: <Activity size={12} color={activeTab === 'SNAPSHOT' ? colors.accentPrimary : colors.textMuted} /> },
        { id: 'FILINGS' as const, label: 'Filings', icon: <FileText size={12} color={activeTab === 'FILINGS' ? colors.accentPrimary : colors.textMuted} /> },
        { id: 'NEWS' as const, label: 'News', icon: <Newspaper size={12} color={activeTab === 'NEWS' ? colors.accentPrimary : colors.textMuted} /> },
    ]), [activeTab, colors]);

    const currentStyles = useMemo(() => styles(colors, isDark, screenHeight), [colors, isDark, screenHeight]);
    const changeColor = (changePct ?? 0) >= 0 ? '#22c55e' : '#ef4444';

    const handleOpenFiling = useCallback(async (item: any) => {
        const url = getFilingUrl(item);
        if (!url) {
            Alert.alert('Document Unavailable', 'This filing has no attachment link.');
            return;
        }

        try {
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
                Alert.alert('Cannot Open Link', 'No app is available to open this filing link.');
                return;
            }
            await Linking.openURL(url);
        } catch (error) {
            console.warn('[CompanyInsights] Failed to open filing URL:', url, error);
            Alert.alert('Open Failed', 'Unable to open this filing right now. Please try again.');
        }
    }, []);

    return {
        colors,
        isDark,
        currentStyles,
        activeTab,
        setActiveTab,
        tabs,
        price,
        changePct,
        changeColor,
        funda,
        fundaLoading,
        selectedYear,
        setSelectedYear,
        isin,
        filingsLoading,
        filingSections,
        handleOpenFiling,
    };
};

type CompanyInsightsModalProps = CompanyInsightsProps & CompanyInsightsModel;

const CompanyInsightsBody = ({
    activeTab,
    isin,
    filingsLoading,
    filingSections,
    selectedYear,
    setSelectedYear,
    colors,
    currentStyles,
    handleOpenFiling,
    price,
    changePct,
    changeColor,
    fundaLoading,
    funda,
    name,
}: any) => {
    if (activeTab === 'FILINGS') {
        return (
            <FilingsPanel
                isin={isin}
                filingsLoading={filingsLoading}
                filingSections={filingSections}
                selectedYear={selectedYear}
                onYearChange={setSelectedYear}
                colors={colors}
                currentStyles={currentStyles}
                handleOpenFiling={handleOpenFiling}
            />
        );
    }

    return (
        <ScrollView style={currentStyles.scrollView} showsVerticalScrollIndicator={false}>
            {activeTab === 'SNAPSHOT' && (
                <SnapshotPanel
                    price={price}
                    changePct={changePct}
                    changeColor={changeColor}
                    fundaLoading={fundaLoading}
                    funda={funda}
                    name={name}
                    colors={colors}
                    currentStyles={currentStyles}
                />
            )}

            {activeTab === 'NEWS' && (
                <NewsPanel colors={colors} currentStyles={currentStyles} />
            )}

            <View style={{ height: 40 }} />
        </ScrollView>
    );
};

const CompanyInsightsModal = ({
    symbol,
    name,
    isOpen,
    onClose,
    colors,
    isDark,
    currentStyles,
    activeTab,
    setActiveTab,
    tabs,
    isin,
    filingsLoading,
    filingSections,
    selectedYear,
    setSelectedYear,
    handleOpenFiling,
    price,
    changePct,
    changeColor,
    fundaLoading,
    funda,
}: CompanyInsightsModalProps) => (
    <Modal
        visible={isOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
    >
        <View style={currentStyles.overlay}>
            <Pressable style={currentStyles.closer} onPress={onClose} />
            <View style={currentStyles.content}>
                <InsightsHeader
                    symbol={symbol}
                    name={name}
                    isin={isin}
                    isDark={isDark}
                    colors={colors}
                    currentStyles={currentStyles}
                    onClose={onClose}
                />
                <InsightsTabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    currentStyles={currentStyles}
                />
                <CompanyInsightsBody
                    activeTab={activeTab}
                    isin={isin}
                    filingsLoading={filingsLoading}
                    filingSections={filingSections}
                    selectedYear={selectedYear}
                    setSelectedYear={setSelectedYear}
                    colors={colors}
                    currentStyles={currentStyles}
                    handleOpenFiling={handleOpenFiling}
                    price={price}
                    changePct={changePct}
                    changeColor={changeColor}
                    fundaLoading={fundaLoading}
                    funda={funda}
                    name={name}
                />
            </View>
        </View>
    </Modal>
);

export const CompanyInsights = (props: CompanyInsightsProps) => {
    const model = useCompanyInsightsModel(props);
    if (!props.isOpen) return null;
    return <CompanyInsightsModal {...props} {...model} />;
};

const styles = (colors: any, isDark: boolean, screenHeight: number) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    closer: {
        flex: 1,
    },
    content: {
        height: screenHeight * 0.9,
        backgroundColor: colors.bgMain,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderWidth: 1,
        borderColor: colors.uiDivider,
        overflow: 'hidden',
    },
    header: {
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerInfo: {
        flex: 1,
        gap: 4,
    },
    intelSuiteContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    intelSuiteTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    tag: {
        backgroundColor: isDark ? 'rgba(197, 160, 89, 0.1)' : 'rgba(197, 160, 89, 0.05)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(197,160,89,0.2)',
    },
    tagText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 1,
    },
    companyName: {
        fontSize: 18,
        fontWeight: '300',
        color: colors.textMain,
        letterSpacing: 1,
        textTransform: 'uppercase',
        flexWrap: 'wrap',
    },
    closeButton: {
        padding: 4,
    },
    tabsContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: colors.accentPrimary,
    },
    tabText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    activeTabText: {
        color: colors.accentPrimary,
    },
    scrollView: {
        flex: 1,
        padding: 20,
    },
    filingsBody: {
        flex: 1,
        padding: 20,
    },
    filingsContent: {
        flex: 1,
    },
    yearSelectorScroll: {
        marginBottom: 20,
    },
    section: {
        gap: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
    },
    sectionTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    priceCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 20,
        backgroundColor: colors.glassBg,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        borderStyle: 'dashed',
        borderRadius: 4,
    },
    priceLabel: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    priceValue: {
        fontSize: 24,
        fontWeight: '300',
        color: colors.textMain,
    },
    currency: {
        fontSize: 10,
        color: colors.textMuted,
    },
    changeValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textMuted,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 24,
    },
    metricContainer: {
        width: '45%',
        gap: 8,
    },
    metricHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: 0.6,
    },
    metricLabel: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    metricValueContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
    },
    metricValue: {
        fontSize: 16,
        fontWeight: '300',
        color: colors.textMain,
    },
    metricSubValue: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.uiMuted,
        textTransform: 'uppercase',
    },
    description: {
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 20,
        fontWeight: '300',
        marginTop: 12,
    },
    centerSection: {
        flex: 1,
        height: 300,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    offlineTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 5,
        textTransform: 'uppercase',
    },
    offlineSub: {
        fontSize: 8,
        color: colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
        opacity: 0.6,
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
        gap: 8,
    },
    loadingText: {
        fontSize: 9,
        color: colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    restrictedContainer: {
        paddingVertical: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.uiDivider,
        borderStyle: 'dashed',
        borderRadius: 4,
    },
    restrictedText: {
        fontSize: 10,
        color: colors.textMuted,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    // ─── Filing Tab Styles ───────────────────────────────────────
    yearSelector: {
        flexDirection: 'row',
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        padding: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.uiDivider,
    },
    yearButton: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
    },
    yearButtonActive: {
        backgroundColor: isDark ? '#ffffff' : '#000000',
    },
    yearButtonText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.textMuted,
    },
    yearButtonTextActive: {
        color: isDark ? '#000000' : '#ffffff',
    },
    timelineListContainer: {
        flex: 1,
        paddingLeft: 24,
        position: 'relative',
    },
    timelineListContent: {
        paddingBottom: 20,
    },
    timelineLine: {
        position: 'absolute',
        left: 7,
        top: 8,
        bottom: 0,
        width: 1,
        backgroundColor: colors.uiDivider,
    },
    timelineSectionHeader: {
        marginBottom: 12,
        position: 'relative',
    },
    timelineDot: {
        position: 'absolute',
        left: -22,
        top: 4,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.bgMain,
        borderWidth: 2,
        borderColor: colors.accentPrimary,
    },
    timelineMonth: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.textMain,
        letterSpacing: 3,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    filingCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 12,
        backgroundColor: colors.glassBg,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        borderRadius: 4,
        marginBottom: 8,
        gap: 12,
    },
    filingIcon: {
        padding: 8,
        borderRadius: 4,
        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    },
    filingInfo: {
        flex: 1,
        gap: 4,
    },
    filingTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
    },
    filingTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textMain,
        letterSpacing: 1,
        textTransform: 'uppercase',
        flex: 1,
    },
    filingMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    filingCategory: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    filingDot: {
        fontSize: 8,
        color: colors.textMuted,
    },
    filingDate: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});
