import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Tooltip,
  useTheme,
  Divider,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { formatCurrency } from '../../utils/formatters';

const STORAGE_KEY_PREFIX = 'wms_cash_holders_';

export default function KpiEquationBanner({
  openingBalance = 0,
  totalIn = 0,
  totalOut = 0,
  closingBalance = 0,
  inCount = 0,
  factoryExpense = 0,
  selfExpense = 0,
  bankOut = 0,
  bankIn = 0,
  entryDate = '',
  mode = 'cash',
  cashClosingBalance = 0,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const dateKey = `${STORAGE_KEY_PREFIX}${entryDate || 'today'}`;

  // Holders state
  const [holders, setHolders] = useState(() => {
    try {
      const saved = localStorage.getItem(dateKey);
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return { safe: 0, faisal: 0, fayyaz: 0 };
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(dateKey);
      if (saved) {
        setHolders(JSON.parse(saved));
      } else {
        setHolders({ safe: 0, faisal: 0, fayyaz: 0 });
      }
    } catch {
      setHolders({ safe: 0, faisal: 0, fayyaz: 0 });
    }
  }, [dateKey]);

  // Dialog state for editing holder
  const [editDialog, setEditDialog] = useState({
    open: false,
    key: '',
    label: '',
    amount: '',
  });

  const handleOpenEdit = (key, label) => {
    setEditDialog({
      open: true,
      key,
      label,
      amount: holders[key] ? String(holders[key]) : '',
    });
  };

  const handleSaveEdit = () => {
    const num = Math.max(0, Number(editDialog.amount) || 0);
    const updated = {
      ...holders,
      [editDialog.key]: num,
    };
    setHolders(updated);
    try {
      localStorage.setItem(dateKey, JSON.stringify(updated));
    } catch {
      /* ignore */
    }
    setEditDialog({ open: false, key: '', label: '', amount: '' });
  };

  const totalHolders = (Number(holders.safe) || 0) + (Number(holders.faisal) || 0) + (Number(holders.fayyaz) || 0);
  const hasEnteredHolders = totalHolders > 0;
  const targetPhysicalClosing = mode === 'combined' ? (cashClosingBalance || 0) : (Number(closingBalance) || 0);
  const difference = totalHolders - targetPhysicalClosing;
  const isReconciled = hasEnteredHolders && Math.abs(difference) < 0.01;

  const isCombined = mode === 'combined';
  const isBank = mode === 'bank';

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          mb: 2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
          bgcolor: 'background.paper',
          overflow: 'hidden',
          boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {/* Top 4 KPI Metrics Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: '1fr 1fr',
              md: 'repeat(4, 1fr)',
            },
          }}
        >
          {/* Col 1: Opening Balance */}
          <Box
            sx={{
              p: { xs: 2, sm: 2.5 },
              borderRight: { md: '1px solid' },
              borderBottom: { xs: '1px solid', md: 'none' },
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                }}
              >
                {isCombined ? 'Combined Opening' : isBank ? 'Bank Opening' : 'Opening Balance'}
              </Typography>
            </Stack>

            <Typography
              sx={{
                fontSize: { xs: '1.25rem', md: '1.4rem' },
                fontWeight: 700,
                color: isDark ? '#F1F5F9' : '#0F172A',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.2,
                my: 0.5,
              }}
            >
              {formatCurrency(openingBalance)}
            </Typography>

            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', mt: 0.5 }}>
              {isCombined ? 'Cash + Bank carryover' : 'Previous day carryover'}
            </Typography>
          </Box>

          {/* Col 2: Cash Received (+ Inflow) */}
          <Box
            sx={{
              p: { xs: 2, sm: 2.5 },
              borderRight: { sm: '1px solid' },
              borderBottom: { xs: '1px solid', md: 'none' },
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                }}
              >
                {isCombined ? 'Total Received' : isBank ? 'Bank Received' : 'Cash Received'}
              </Typography>
              <Chip
                size="small"
                label="+ Received"
                sx={{
                  height: 18,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7',
                  color: isDark ? '#34D399' : '#15803D',
                  borderRadius: 1,
                  px: 0.25,
                }}
              />
            </Stack>

            <Typography
              sx={{
                fontSize: { xs: '1.25rem', md: '1.4rem' },
                fontWeight: 700,
                color: isDark ? '#34D399' : '#16A34A',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.2,
                my: 0.5,
              }}
            >
              +{formatCurrency(totalIn)}
            </Typography>

            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', mt: 0.5 }}>
              {inCount > 0
                ? isCombined
                  ? `${inCount} receipts (Cash, Bank & Cheque)`
                  : `${inCount} cash receipt${inCount > 1 ? 's' : ''} today`
                : 'No receipts today'}
            </Typography>
          </Box>

          {/* Col 3: Cash Spent (− Outflow) */}
          <Box
            sx={{
              p: { xs: 2, sm: 2.5 },
              borderRight: { md: '1px solid' },
              borderBottom: { xs: '1px solid', sm: 'none' },
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                }}
              >
                {isCombined ? 'Total Spent' : isBank ? 'Bank Spent' : 'Cash Spent'}
              </Typography>
              <Chip
                size="small"
                label="− Spent"
                sx={{
                  height: 18,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                  color: isDark ? '#F87171' : '#DC2626',
                  borderRadius: 1,
                  px: 0.25,
                }}
              />
            </Stack>

            <Typography
              sx={{
                fontSize: { xs: '1.25rem', md: '1.4rem' },
                fontWeight: 700,
                color: isDark ? '#F87171' : '#DC2626',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.2,
                my: 0.5,
              }}
            >
              −{formatCurrency(totalOut)}
            </Typography>

            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', mt: 0.5 }}>
              Factory: {formatCurrency(factoryExpense)} • Self: {formatCurrency(selfExpense)}
              {isCombined && bankOut > 0 ? ` • Bank: ${formatCurrency(bankOut)}` : ''}
            </Typography>
          </Box>

          {/* Col 4: Cash in Hand (Physical Net Balance) */}
          <Box
            sx={{
              p: { xs: 2, sm: 2.5 },
              bgcolor: isDark ? 'rgba(37, 99, 235, 0.08)' : '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isDark ? '#60A5FA' : '#1E40AF',
                }}
              >
                {isBank ? 'Bank Balance' : 'Cash in Hand'}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: isDark ? '#93C5FD' : '#2563EB', fontWeight: 600 }}>
                Closing Balance
              </Typography>
            </Stack>

            <Typography
              sx={{
                fontSize: { xs: '1.35rem', md: '1.5rem' },
                fontWeight: 800,
                color: isDark ? '#93C5FD' : '#1E3A8A',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.2,
                my: 0.5,
              }}
            >
              {formatCurrency(closingBalance)}
            </Typography>

            <Typography
              variant="caption"
              sx={{
                color: isDark ? '#93C5FD' : '#2563EB',
                fontSize: '0.72rem',
                fontWeight: 600,
                mt: 0.5,
              }}
            >
              {isBank ? 'Bank account balance' : 'Physical cash closing balance'}
            </Typography>
          </Box>
        </Box>

        {/* Integrated Bottom Reconciliation Footer */}
        <Box
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 1.25,
            borderTop: '1px solid',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
            bgcolor: isDark ? 'rgba(0, 0, 0, 0.2)' : '#F8FAFC',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            justifyContent: 'space-between',
            gap: 1.25,
          }}
        >
          {/* Status Label */}
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            {!hasEnteredHolders ? (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  Physical Cash Custody: Not tallied yet (enter holder cash on right)
                </Typography>
              </Stack>
            ) : isReconciled ? (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
                  Cash Reconciled • Balanced ({formatCurrency(totalHolders)})
                </Typography>
              </Stack>
            ) : (
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <WarningAmberOutlinedIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main' }}>
                  Discrepancy: {difference > 0 ? `+${formatCurrency(difference)} excess` : `${formatCurrency(Math.abs(difference))} short`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (Holders: {formatCurrency(totalHolders)} vs Closing: {formatCurrency(closingBalance)})
                </Typography>
              </Stack>
            )}
          </Stack>

          {/* Cash Holder Tags & Bank Net Chip */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary', mr: 0.25 }}>
              Cash With:
            </Typography>

            <Tooltip title="Click to update Safe / Till cash">
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleOpenEdit('safe', 'Safe / Till')}
                startIcon={<LockOutlinedIcon sx={{ fontSize: 14 }} />}
                endIcon={<EditOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  py: 0.25,
                  px: 1,
                  minHeight: 28,
                  borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#CBD5E1',
                  color: isDark ? 'text.primary' : '#334155',
                  bgcolor: isDark ? 'background.paper' : '#FFFFFF',
                  borderRadius: 1.5,
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
                  },
                }}
              >
                Safe / Till: {formatCurrency(holders.safe || 0)}
              </Button>
            </Tooltip>

            <Tooltip title="Click to update Faisal cash">
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleOpenEdit('faisal', 'Faisal')}
                startIcon={<PersonOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
                endIcon={<EditOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  py: 0.25,
                  px: 1,
                  minHeight: 28,
                  borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#CBD5E1',
                  color: isDark ? 'text.primary' : '#334155',
                  bgcolor: isDark ? 'background.paper' : '#FFFFFF',
                  borderRadius: 1.5,
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
                  },
                }}
              >
                Faisal: {formatCurrency(holders.faisal || 0)}
              </Button>
            </Tooltip>

            <Tooltip title="Click to update Fayyaz cash">
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleOpenEdit('fayyaz', 'Fayyaz')}
                startIcon={<PersonOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
                endIcon={<EditOutlinedIcon sx={{ fontSize: 12, opacity: 0.6 }} />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  py: 0.25,
                  px: 1,
                  minHeight: 28,
                  borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#CBD5E1',
                  color: isDark ? 'text.primary' : '#334155',
                  bgcolor: isDark ? 'background.paper' : '#FFFFFF',
                  borderRadius: 1.5,
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
                  },
                }}
              >
                Fayyaz: {formatCurrency(holders.fayyaz || 0)}
              </Button>
            </Tooltip>
          </Stack>
        </Box>
      </Paper>

      {/* Mini Edit Modal */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, key: '', label: '', amount: '' })}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1, fontSize: '1rem' }}>
          Update Physical Cash: {editDialog.label}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.85rem' }}>
            Enter the exact physical cash amount currently held by <strong>{editDialog.label}</strong>:
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="number"
            size="small"
            label="Amount (Rs.)"
            value={editDialog.amount}
            onChange={(e) => setEditDialog({ ...editDialog, amount: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveEdit();
              }
            }}
            InputProps={{
              startAdornment: <Typography sx={{ mr: 1, color: 'text.secondary', fontWeight: 600, fontSize: '0.85rem' }}>Rs.</Typography>,
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setEditDialog({ open: false, key: '', label: '', amount: '' })}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            sx={{ textTransform: 'none', fontWeight: 600, px: 2 }}
          >
            Save Amount
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
