import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  TextField,
  Stack,
  Skeleton,
  Alert,
  Divider,
  Chip,
  Grid,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Refresh from '@mui/icons-material/Refresh';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  addWeeks,
  addMonths,
  format,
  parseISO,
  startOfWeek,
  startOfMonth,
} from 'date-fns';
import { dashboardAPI } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import PageToolbar from '../Common/PageToolbar';

const COLORS = {
  sales: '#5A8AAF',
  purchases: '#3D9A6A',
  moneyIn: '#3D9A6A',
  moneyOut: '#DC4C4C',
  mix: ['#5A8AAF', '#3D9A6A', '#D97706', '#DC4C4C'],
};

function localDateKey(d = new Date()) {
  return format(d, 'yyyy-MM-dd');
}

function shiftAnchor(period, anchorKey, direction) {
  const base = parseISO(anchorKey);
  const next = period === 'month' ? addMonths(base, direction) : addWeeks(base, direction);
  return localDateKey(next);
}

function monthInputValue(anchorKey) {
  try {
    return format(parseISO(anchorKey), 'yyyy-MM');
  } catch {
    return format(new Date(), 'yyyy-MM');
  }
}

function KpiChip({ label, value }) {
  return (
    <Box
      sx={{
        px: 1.5,
        py: 1,
        borderRadius: 1.5,
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        minWidth: { xs: '46%', sm: 140 },
        flex: { xs: '1 1 46%', sm: '0 0 auto' },
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="subtitle2" fontWeight={700} noWrap>
        {value}
      </Typography>
    </Box>
  );
}

function ChartCard({ title, children, height = 280 }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ pb: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography
          variant="overline"
          color="primary.dark"
          fontWeight={700}
          letterSpacing={0.8}
          display="block"
          mb={1}
        >
          {title}
        </Typography>
        <Box sx={{ width: '100%', height, minWidth: 0 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function DonutCenter({ totals }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '32%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
        {formatCurrency(totals?.salesAmount || 0)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        SALES REVENUE
      </Typography>
    </Box>
  );
}

export default function ActivityAnalytics() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const chartHeight = isMobile ? 230 : 280;

  const [period, setPeriod] = useState('week');
  const [anchor, setAnchor] = useState(localDateKey());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await dashboardAPI.getActivity({ period, date: anchor });
      setData(res.data.data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.message || 'Failed to load activity analytics');
    } finally {
      setLoading(false);
    }
  }, [period, anchor]);

  useEffect(() => {
    load();
  }, [load]);

  const series = data?.series || [];
  const totals = data?.totals || {};
  const mix = data?.activityMix || [];
  const latest = data?.latestActivity || [];

  const hasSeriesSignal = useMemo(
    () =>
      series.some(
        (d) =>
          d.salesKg ||
          d.purchaseKg ||
          d.moneyIn ||
          d.moneyOut ||
          d.salesAmount
      ),
    [series]
  );

  const xTickProps = isMobile
    ? { angle: -35, textAnchor: 'end', fontSize: 10, height: 50, interval: period === 'month' ? 2 : 0 }
    : { fontSize: 12, interval: period === 'month' ? 1 : 0 };

  const goToday = () => {
    const today = new Date();
    setAnchor(
      period === 'month'
        ? localDateKey(startOfMonth(today))
        : localDateKey(startOfWeek(today, { weekStartsOn: 1 }))
    );
  };

  return (
    <Box sx={{ mb: 3 }}>
      <PageToolbar sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Activity Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {data?.label || 'Sales, purchases, and cash activity'}
          </Typography>
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          <ToggleButtonGroup
            exclusive
            size="small"
            value={period}
            onChange={(_, v) => {
              if (!v) return;
              setPeriod(v);
            }}
            sx={{ width: { xs: '100%', sm: 'auto' }, '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' } } }}
          >
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
          </ToggleButtonGroup>

          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
            <IconButton
              size="small"
              aria-label="Previous period"
              onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
              sx={{ color: 'text.primary' }}
            >
              <ChevronLeft />
            </IconButton>
            {period === 'month' ? (
              <TextField
                type="month"
                size="small"
                value={monthInputValue(anchor)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setAnchor(`${v}-01`);
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: { xs: 150, sm: 160 } }}
              />
            ) : (
              <Chip
                size="small"
                label={data?.label || '…'}
                onClick={goToday}
                sx={{ maxWidth: 220 }}
              />
            )}
            <IconButton
              size="small"
              aria-label="Next period"
              onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))}
              sx={{ color: 'text.primary' }}
            >
              <ChevronRight />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Refresh"
              onClick={load}
              disabled={loading}
              sx={{ color: 'text.primary' }}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
      </PageToolbar>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} md={i <= 2 ? 6 : 6} key={i}>
              <Skeleton variant="rounded" height={chartHeight + 60} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5} sx={{ mb: 2 }}>
            <KpiChip
              label="Sales"
              value={`${Number(totals.salesKg || 0).toFixed(1)} kg / ${totals.salesBundles || 0} bdl`}
            />
            <KpiChip label="Sales revenue" value={formatCurrency(totals.salesAmount || 0)} />
            <KpiChip
              label="Purchases"
              value={`${Number(totals.purchaseKg || 0).toFixed(1)} kg`}
            />
            <KpiChip label="Net cash" value={formatCurrency(totals.netCash || 0)} />
          </Stack>

          {!hasSeriesSignal && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No sales, purchases, or cash activity in this period.
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} lg={8}>
              <ChartCard title="Sales & Purchases (kg)" height={chartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: isMobile ? 8 : 0 }}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.sales} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={COLORS.sales} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.purchases} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={COLORS.purchases} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,42,54,0.08)" />
                    <XAxis dataKey={period === 'week' ? 'weekday' : 'label'} tick={xTickProps} interval={xTickProps.interval} />
                    <YAxis tickFormatter={(v) => `${v}`} width={isMobile ? 36 : 48} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value, name) => [`${Number(value).toFixed(1)} kg`, name]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="salesKg"
                      name="Sales kg"
                      stroke={COLORS.sales}
                      fill="url(#salesFill)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="purchaseKg"
                      name="Purchases kg"
                      stroke={COLORS.purchases}
                      fill="url(#purchaseFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>

            <Grid item xs={12} lg={4}>
              <ChartCard title="Activity Mix" height={chartHeight}>
                {mix.length === 0 ? (
                  <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                    <Typography color="text.secondary" variant="body2">
                      No activity to chart
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mix}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="45%"
                          innerRadius={isMobile ? 48 : 58}
                          outerRadius={isMobile ? 72 : 88}
                          paddingAngle={2}
                        >
                          {mix.map((_, i) => (
                            <Cell key={i} fill={COLORS.mix[i % COLORS.mix.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [formatCurrency(value), name]} />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                    <DonutCenter totals={totals} />
                  </Box>
                )}
              </ChartCard>
            </Grid>

            <Grid item xs={12} md={7}>
              <ChartCard title="Cash Flow" height={chartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: isMobile ? 8 : 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,42,54,0.08)" />
                    <XAxis dataKey={period === 'week' ? 'weekday' : 'label'} tick={xTickProps} interval={xTickProps.interval} />
                    <YAxis tickFormatter={(v) => `Rs.${v / 1000}k`} width={isMobile ? 40 : 52} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatCurrency(v)} labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''} />
                    <Legend />
                    <Bar dataKey="moneyIn" name="Money In" fill={COLORS.moneyIn} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="moneyOut" name="Money Out" fill={COLORS.moneyOut} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>

            <Grid item xs={12} md={5}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ pb: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography
                    variant="overline"
                    color="primary.dark"
                    fontWeight={700}
                    letterSpacing={0.8}
                    display="block"
                    mb={1}
                  >
                    Latest Activity
                  </Typography>
                  {latest.length === 0 ? (
                    <Typography color="text.secondary" variant="body2" sx={{ py: 4, textAlign: 'center' }}>
                      No activity in this period
                    </Typography>
                  ) : (
                    <Stack divider={<Divider flexItem />} spacing={0}>
                      {latest.map((item) => (
                        <Box
                          key={`${item.kind}-${item.id}`}
                          sx={{
                            py: 1.25,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 1.5,
                            alignItems: 'flex-start',
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {item.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {item.kind}
                              {item.detail ? ` · ${item.detail}` : ''}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(item.date)}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            color={
                              item.kind === 'Money Out'
                                ? 'error.main'
                                : item.kind === 'Money In' || item.kind === 'Sale'
                                  ? 'success.main'
                                  : 'text.primary'
                            }
                            sx={{ flexShrink: 0 }}
                          >
                            {item.amount ? formatCurrency(item.amount) : '—'}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <ChartCard title="Sales Revenue by Day" height={chartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: isMobile ? 8 : 0 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.sales} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={COLORS.sales} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,42,54,0.08)" />
                    <XAxis dataKey={period === 'week' ? 'weekday' : 'label'} tick={xTickProps} interval={xTickProps.interval} />
                    <YAxis tickFormatter={(v) => `Rs.${v / 1000}k`} width={isMobile ? 40 : 52} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => formatCurrency(v)} labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''} />
                    <Area
                      type="monotone"
                      dataKey="salesAmount"
                      name="Sales revenue"
                      stroke={COLORS.sales}
                      fill="url(#revenueFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
