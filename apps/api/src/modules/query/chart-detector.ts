/**
 * Auto-detect the best chart type for visualization based on the fields and data rows:
 * - 1 row with 1 col   → "kpi" (Single value display)
 * - 2 cols (str+num)   → "bar" or "pie" (≤10 rows → pie, >10 → bar)
 * - 2 cols (date+num)  → "line"
 * - 3+ cols            → "line" or "bar" based on row count (for multiple series)
 */
export function detectChartType(fields: string[], rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'table';
  if (rows.length === 1 && fields.length === 1) return 'kpi';
  if (fields.length === 1) return 'bar';

  if (fields.length >= 2) {
    const firstVal = rows[0][fields[0]];
    const secondVal = rows[0][fields[1]];

    // Check if second column is numeric
    const secondIsNumeric = typeof secondVal === 'number' ||
      (typeof secondVal === 'string' && !isNaN(Number(secondVal)));

    if (secondIsNumeric) {
      // Check if first column looks like a date
      const firstStr = String(firstVal);
      const looksLikeDate = /^\d{4}[-/]/.test(firstStr) ||
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(firstStr);

      if (looksLikeDate) return 'line';

      // If we have 3+ columns, default to line chart to show multiple series (or bar chart if short).
      if (fields.length > 2) return rows.length <= 10 ? 'bar' : 'line';

      // Pie for small categorical data, bar for larger
      return rows.length <= 10 ? 'pie' : 'bar';
    }
  }

  return 'table';
}
