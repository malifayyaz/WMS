import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, FormControl, Grid,
  InputLabel, List, ListItem, ListItemText, MenuItem, Select, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, Paper, Typography, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import TableChartIcon from '@mui/icons-material/TableChart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import * as XLSX from 'xlsx';
import { format, parseISO, subDays } from 'date-fns';
import { usePermissions } from '../hooks/usePermissions';
import { activityAPI, usersAPI } from '../services/api';
import DateRangePicker from '../components/Common/DateRangePicker';
import { formatDateTime } from '../utils/formatters';

const MODULES = [
  'Order', 'Customer', 'Supplier', 'Transaction', 'Expense', 'RawMaterial',
  'ReadyStock', 'Worker', 'User', 'Auth', 'AnnealingRecord', 'JobWork', 'Consumable',
];

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'RESET_PASSWORD'];

const ACTION_CHIP = {
  CREATE: { color: 'success', label: 'CREATE' },
  UPDATE: { color: 'info', label: 'UPDATE' },
  DELETE: { color: 'error', label: 'DELETE' },
  LOGIN: { color: 'default', label: 'LOGIN' },
  LOGOUT: { color: 'default', label: 'LOGOUT' },
  RESET_PASSWORD: { color: 'warning', label: 'RESET_PASSWORD' },
};

function toYmd(date) {
  return format(date, 'yyyy-MM-dd');
}

function ActionChip({ action }) {
  const cfg = ACTION_CHIP[action] || { color: 'default', label: action };
  return <Chip size="small" label={cfg.label} color={cfg.color} />;
}

function TabPanel({ value, index, children }) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}

export default function SecuritySettings() {
  const { isAdmin, isViewer } = usePermissions();
  const [tab, setTab] = useState(0);

  // Activity Log filters
  const defaultEnd = toYmd(new Date());
  const defaultStart = toYmd(subDays(new Date(), 6));
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [page, setPage] = useState(0);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);

  // Login history
  const [loginDays, setLoginDays] = useState(7);
  const [logins, setLogins] = useState([]);
  const [loginsLoading, setLoginsLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [users, setUsers] = useState([]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await usersAPI.getAll();
      setUsers(res.data.data || []);
    } catch {
      setUsers([]);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = {
        startDate,
        endDate,
        page: page + 1,
        limit: 50,
      };
      if (moduleFilter) params.module = moduleFilter;
      if (actionFilter) params.action = actionFilter;
      if (userFilter) params.userId = userFilter;
      const res = await activityAPI.getLogs(params);
      setLogs(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLogsLoading(false);
    }
  }, [startDate, endDate, moduleFilter, actionFilter, userFilter, page]);

  const fetchLogins = useCallback(async () => {
    setLoginsLoading(true);
    try {
      const end = toYmd(new Date());
      const start = toYmd(subDays(new Date(), loginDays - 1));
      const res = await activityAPI.getLogs({
        startDate: start,
        endDate: end,
        action: 'LOGIN',
        page: 1,
        limit: 100,
      });
      setLogins(res.data.data || []);
    } catch {
      setLogins([]);
    } finally {
      setLoginsLoading(false);
    }
  }, [loginDays]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await activityAPI.getStats();
      setStats(res.data.data || null);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
  }, [fetchUsers, isAdmin]);

  useEffect(() => {
    if (!isAdmin || tab !== 0) return;
    fetchLogs();
  }, [tab, fetchLogs, isAdmin]);

  useEffect(() => {
    if (!isAdmin || tab !== 1) return;
    fetchLogins();
  }, [tab, fetchLogins, isAdmin]);

  useEffect(() => {
    if (!isAdmin || tab !== 2) return;
    fetchStats();
  }, [tab, fetchStats, isAdmin]);

  const moduleChartData = useMemo(() => {
    if (!stats?.byModule) return [];
    return Object.entries(stats.byModule).map(([name, count]) => ({ name, count }));
  }, [stats]);

  if (isViewer || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const applyFilters = () => {
    if (page === 0) {
      fetchLogs();
    } else {
      setPage(0);
    }
  };

  const exportExcel = () => {
    const rows = logs.map((row) => ({
      'Date/Time': formatDateTime(row.createdAt),
      User: row.userName,
      Role: row.userRole,
      Action: row.action,
      Module: row.module,
      Description: row.description,
      IP: row.ipAddress || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Activity Log');
    XLSX.writeFile(wb, `activity-log-${startDate}-to-${endDate}.xlsx`);
  };

  const mostActiveUser = stats?.byUser?.[0];

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <SecurityIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Security & Logs</Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Activity Log" />
        <Tab label="Login History" />
        <Tab label="Stats" />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <Box display="flex" flexWrap="wrap" gap={2} alignItems="center" mb={2}>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Module</InputLabel>
            <Select
              label="Module"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {MODULES.map((m) => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Action</InputLabel>
            <Select
              label="Action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {ACTIONS.map((a) => (
                <MenuItem key={a} value={a}>{a}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>User</InputLabel>
            <Select
              label="User"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {users.map((u) => (
                <MenuItem key={u._id} value={u._id}>{u.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" onClick={applyFilters}>Apply Filters</Button>
          <Box flexGrow={1} />
          <Button
            variant="outlined"
            size="small"
            startIcon={<TableChartIcon />}
            onClick={exportExcel}
            disabled={!logs.length}
          >
            Export to Excel
          </Button>
        </Box>

        {logsLoading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date/Time</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Module</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">No activity found for the selected filters.</TableCell>
                  </TableRow>
                ) : (
                  logs.map((row) => (
                    <TableRow key={row._id} hover>
                      <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                      <TableCell>{row.userName}</TableCell>
                      <TableCell>{row.userRole}</TableCell>
                      <TableCell><ActionChip action={row.action} /></TableCell>
                      <TableCell>{row.module}</TableCell>
                      <TableCell>{row.description}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={50}
              rowsPerPageOptions={[50]}
              onRowsPerPageChange={() => {}}
            />
          </TableContainer>
        )}
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <Box mb={2}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={loginDays}
            onChange={(_, v) => { if (v != null) setLoginDays(v); }}
          >
            <ToggleButton value={7}>Last 7 days</ToggleButton>
            <ToggleButton value={30}>Last 30 days</ToggleButton>
            <ToggleButton value={90}>Last 90 days</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {loginsLoading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">No login events in this period.</TableCell>
                  </TableRow>
                ) : (
                  logins.map((row) => {
                    const d = typeof row.createdAt === 'string' ? parseISO(row.createdAt) : new Date(row.createdAt);
                    return (
                      <TableRow key={row._id} hover>
                        <TableCell>{format(d, 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{format(d, 'HH:mm:ss')}</TableCell>
                        <TableCell>{row.userName}</TableCell>
                        <TableCell><Chip size="small" label="Success" color="success" /></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      <TabPanel value={tab} index={2}>
        {statsLoading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>Today</Typography>
                  <Typography variant="h4" fontWeight={700} color="primary.main">
                    {stats?.totalToday ?? 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">activity events</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>This Week</Typography>
                  <Typography variant="h4" fontWeight={700} color="secondary.main">
                    {stats?.totalThisWeek ?? 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">activity events</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2" gutterBottom>Most Active User</Typography>
                  <Typography variant="h5" fontWeight={700}>
                    {mostActiveUser?.name || '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {mostActiveUser ? `${mostActiveUser.count} actions this week` : 'No data'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    Activity by Module (This Week)
                  </Typography>
                  {moduleChartData.length === 0 ? (
                    <Typography color="text.secondary">No activity this week.</Typography>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={moduleChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#5A8AAF" name="Events" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    Recent Logins
                  </Typography>
                  <List dense>
                    {(stats?.recentLogins || []).length === 0 ? (
                      <ListItem><ListItemText primary="No recent logins" /></ListItem>
                    ) : (
                      (stats.recentLogins || []).map((row) => (
                        <ListItem key={row._id} disableGutters>
                          <ListItemText
                            primary={row.userName}
                            secondary={formatDateTime(row.createdAt)}
                          />
                        </ListItem>
                      ))
                    )}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </TabPanel>
    </Box>
  );
}
