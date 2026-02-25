
import { fetchBatchIntervalPerformance, cleanSymbol } from './src/services/priceService.js';

// Mocking some browser environment stuff if needed or just checking the data extraction logic
// Actually, I can just read the priceService.js and see that it extracts `points`.

async function testBreadth() {
    // In actual app we would do:
    // const results = await fetchComparisonCharts(['RELIANCE'], '1Y');
    // ... calculate EMA ...
}
