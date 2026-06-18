import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Parse server/.env manually
const envPath = 'X:\\\\RMSv3\\server\\.env';
const envContent = fs.readFileSync(envPath, 'utf8');
let databaseUrl = '';
for (const line of envContent.split('\n')) {
  if (line.trim().startsWith('DATABASE_URL=')) {
    databaseUrl = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayIso() {
  // Let's use the local system date as 2026-05-28
  return '2026-05-28';
}

function toDateOnly(value) {
  if (!value) return ''
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}

function parseIsoDateParts(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

function createUtcDate(value) {
  const parts = parseIsoDateParts(value)
  if (!parts) return null
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

function formatUtcIso(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const date = createUtcDate(dateStr)
  if (!date) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return formatUtcIso(date)
}

function startOfWeek(dateStr) {
  const date = createUtcDate(dateStr)
  if (!date) return ''
  const dayIndex = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayIndex)
  return formatUtcIso(date)
}

function getDayIndex(dateStr) {
  const date = createUtcDate(dateStr)
  if (!date) return 0
  return (date.getUTCDay() + 6) % 7
}

function normalizeBranchAlias(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildBranchNameAliases(...values) {
  const aliases = new Set()
  for (const value of values.flat()) {
    const normalized = normalizeBranchAlias(value)
    if (!normalized) continue
    aliases.add(normalized)
    const withoutSuffix = normalized.replace(/\s+Şubesi$/i, '').trim()
    if (withoutSuffix && withoutSuffix !== normalized) {
      aliases.add(withoutSuffix)
      const parts = withoutSuffix.split(/\s+/)
      if (parts.length > 1) {
        aliases.add(parts.slice(1).join(' '))
      }
    }
  }
  return [...aliases].filter(Boolean)
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function aggregateDailySalesRows(rows, selectedBranch, selectedBranchName) {
  const byDate = new Map()
  for (const row of rows || []) {
    const saleDate = toDateOnly(row.sale_date || row.sale_datetime)
    if (!saleDate) continue

    const current = byDate.get(saleDate) || {
      id: `${selectedBranch || 'branch'}:${saleDate}`,
      sale_date: saleDate,
      branch_id: selectedBranch || row.branch_id || null,
      branch_name: selectedBranchName || row.branch_name || '',
      total_sales: 0,
      receipt_count: 0,
    }

    current.total_sales += safeNumber(
      row.total_sales,
      row.payment_total ?? row.gross_total_after_discount ?? row.net_total_after_discount ?? 0,
    )
    current.receipt_count += Math.max(0, Math.round(safeNumber(row.receipt_count, row.sale_date ? 0 : 1)))
    byDate.set(saleDate, current)
  }
  return [...byDate.values()].sort((left, right) => left.sale_date.localeCompare(right.sale_date))
}

function mergeDailySalesRows(preAggregatedRows, rawSalesRows, selectedBranch, selectedBranchName) {
  const merged = new Map()
  for (const row of aggregateDailySalesRows(preAggregatedRows, selectedBranch, selectedBranchName)) {
    merged.set(row.sale_date, row)
  }
  for (const row of aggregateDailySalesRows(rawSalesRows, selectedBranch, selectedBranchName)) {
    merged.set(row.sale_date, row)
  }
  return [...merged.values()].sort((left, right) => left.sale_date.localeCompare(right.sale_date))
}

async function run() {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  
  const selectedBranch = '4e488f4b-669d-4279-8f0d-0fd382fe1d87'; // Kadıköy
  const selectedBranchName = 'Kadıköy Şubesi';
  const lookbackWeeks = 4;
  const forecastWeeks = 4;
  
  try {
    const historyStartDate = addDays(todayIso(), -Math.max(lookbackWeeks * 7 + forecastWeeks * 7 + 56, 120));
    const initialNameAliases = buildBranchNameAliases(selectedBranchName);
    
    console.log('historyStartDate:', historyStartDate);
    console.log('initialNameAliases:', initialNameAliases);
    
    // Query daily_sales
    const preAggregatedRes = await client.query(`
      SELECT id, sale_date, branch_id, branch_name, total_sales, receipt_count
      FROM daily_sales
      WHERE branch_name = ANY($1)
        AND sale_date >= $2
      ORDER BY sale_date ASC
    `, [initialNameAliases, historyStartDate]);
    
    console.log(`Pre-aggregated daily_sales count: ${preAggregatedRes.rows.length}`);
    
    // Query raw sales
    const rawSalesRes = await client.query(`
      SELECT sale_datetime, branch_name, payment_total, gross_total_after_discount, net_total_after_discount
      FROM sales
      WHERE status = 'completed'
        AND branch_name = ANY($1)
        AND sale_datetime >= $2::timestamptz
        AND sale_datetime <= $3::timestamptz
      ORDER BY sale_datetime ASC
    `, [initialNameAliases, `${historyStartDate}T00:00:00Z`, `${todayIso()}T23:59:59Z`]);
    
    console.log(`Raw sales count (UTC filter): ${rawSalesRes.rows.length}`);

    const branchDailyRows = mergeDailySalesRows(
      preAggregatedRes.rows,
      rawSalesRes.rows,
      selectedBranch,
      selectedBranchName,
    );

    console.log(`Merged daily rows count: ${branchDailyRows.length}`);
    console.log('Start of week:', startOfWeek(todayIso()));
    
    // Filter to only print the dates of this week
    const thisWeekStart = startOfWeek(todayIso());
    const thisWeekEnd = addDays(thisWeekStart, 6);
    console.log(`This week range: ${thisWeekStart} to ${thisWeekEnd}`);
    
    for (const r of branchDailyRows) {
      const rowDate = toDateOnly(r.sale_date);
      if (rowDate >= thisWeekStart && rowDate <= thisWeekEnd) {
        console.log(`- Date: ${rowDate}, Total: ${r.total_sales}, count: ${r.receipt_count}`);
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();

