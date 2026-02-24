/**
 * Internationalization and formatting utilities for the Intel Suite.
 * Enforces standardized Indian Market notation (Crores/Lakhs) and corporate dates.
 */

/**
 * Format large numbers in Indian units (Cr/L).
 */
export const formatIndianNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '—';

    if (Math.abs(num) >= 10000000) {
        return (num / 10000000).toFixed(2) + ' Cr';
    }
    if (Math.abs(num) >= 100000) {
        return (num / 100000).toFixed(2) + ' L';
    }
    return new Intl.NumberFormat('en-IN').format(num);
};

/**
 * Standardize filing dates into a chronological format (DD MMM YYYY).
 */
export const formatFilingDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

/**
 * Format simple percentage strings.
 */
export const formatPercent = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0.00%';
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
};
