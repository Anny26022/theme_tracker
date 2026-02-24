/**
 * Utility for generating realistic mock performance data
 * based on sector, industry and selected timeframe.
 */
export const getMockPerformance = (name, timeframe = '1W', index = 0) => {
    // Deterministic but "random-looking" seed based on name
    const seed = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    // Timeframe multipliers
    const multipliers = {
        '1W': 1,
        '1M': 3.5,
        '3M': 8,
        '6M': 15
    };

    const multiplier = multipliers[timeframe] || 1;

    // Generate a base performance linked to index for ranking logic
    // but vary it slightly with the name seed
    const base = 5 - (index * 0.5);
    const variance = (seed % 100) / 25; // 0 to 4% variance

    return (base + variance) * multiplier;
};
