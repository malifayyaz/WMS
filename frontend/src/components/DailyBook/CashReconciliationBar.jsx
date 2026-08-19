import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EditIcon from '@mui/icons-material/Edit';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PersonIcon from '@mui/icons-material/Person';
import { formatCurrency } from '../../utils/formatters';

const STORAGE_KEY_PREFIX = 'wms_cash_holders_';

export default function CashReconciliationBar({
  closingBalance = 0,
  entryDate = '',
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const dateKey = `${STORAGE_KEY_PREFIX}${entryDate || 'today'}`;

  // Default holders
  const [holders, setHolders] = useState(() => {
    try {
      const saved = localStorage.getItem(dateKey);
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return {
      safe: 0,
      faisal: 0,
      fayyaz: 0,
    };
  });

  // Sync when entryDate changes
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

  // Dialog state for editing a holder
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
  const difference = totalHolders - (Number(closingBalance) || 0);
  const isReconciled = Math.abs(difference) < 0.01;

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: isReconciled
            ? (isDark ? '#065F46' : '#A7F3D0')
            : (isDark ? '#9A3412' : '#FED7AA'),
          bgcolor: isReconciled
            ? (isDark ? 'rgba(6, 78, 59, 0.2)' : '#F0FDF4')
            : (isDark ? 'rgba(154, 52, 18, 0.18)' : '#FFF7ED'),
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        {/* Left Side: Reconciliation Status Badge */}
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          {isReconciled ? (
            <Chip
              icon={<CheckCircleIcon />}
              label="Cash Reconciled — Balanced"
              color="success"
              variant="filled"
              sx={{
                fontWeight: 700,
                fontSize: '0.82rem',
                bgcolor: isDark ? '#059669' : '#10B981',
                color: '#ffffff',
                '& .MuiChip-icon': { color: '#ffffff' },
              }}
            />
          ) : (
            <Chip
              icon={<WarningAmberIcon />}
              label={`Difference: ${difference > 0 ? `+${formatCurrency(difference)} excess` : `${formatCurrency(Math.abs(difference))} short`}`}
              color="warning"
              variant="filled"
              sx={{
                fontWeight: 700,
                fontSize: '0.82rem',
                bgcolor: isDark ? '#D97706' : '#F59E0B',
                color: '#ffffff',
                '& .MuiChip-icon': { color: '#ffffff' },
              }}
            />
          )}

          <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            Holder Total: <strong>{formatCurrency(totalHolders)}</strong> (vs Closing {formatCurrency(closingBalance)})
          </Typography>
        </Stack>

        {/* Right Side: Clickable Cash Holder Pills */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Cash With:
          </Typography>

          <Tooltip title="Click to update Safe/Till cash">
            <Chip
              icon={<AccountBalanceWalletIcon sx={{ fontSize: 16 }} />}
              label={`Safe / Till: ${formatCurrency(holders.safe || 0)}`}
              onClick={() => handleOpenEdit('safe', 'Safe / Till')}
              variant="outlined"
              size="small"
              sx={{
                fontWeight: 600,
                cursor: 'pointer',
                borderColor: 'divider',
                bgcolor: isDark ? 'background.paper' : '#ffffff',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
            />
          </Tooltip>

          <Tooltip title="Click to update Faisal cash">
            <Chip
              icon={<PersonIcon sx={{ fontSize: 16 }} />}
              label={`Faisal: ${formatCurrency(holders.faisal || 0)}`}
              onClick={() => handleOpenEdit('faisal', 'Faisal')}
              variant="outlined"
              size="small"
              sx={{
                fontWeight: 600,
                cursor: 'pointer',
                borderColor: 'divider',
                bgcolor: isDark ? 'background.paper' : '#ffffff',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
            />
          </Tooltip>

          <Tooltip title="Click to update Fayyaz cash">
            <Chip
              icon={<PersonIcon sx={{ fontSize: 16 }} />}
              label={`Fayyaz: ${formatCurrency(holders.fayyaz || 0)}`}
              onClick={() => handleOpenEdit('fayyaz', 'Fayyaz')}
              variant="outlined"
              size="small"
              sx={{
                fontWeight: 600,
                cursor: 'pointer',
                borderColor: 'divider',
                bgcolor: isDark ? 'background.paper' : '#ffffff',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
            />
          </Tooltip>
        </Stack>
      </Paper>

      {/* Mini Inline Edit Modal */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, key: '', label: '', amount: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Update Cash: {editDialog.label}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the physical cash amount currently held by {editDialog.label}:
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="number"
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
              startAdornment: <Typography sx={{ mr: 1, color: 'text.secondary', fontWeight: 600 }}>Rs.</Typography>,
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setEditDialog({ open: false, key: '', label: '', amount: '' })}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            sx={{ textTransform: 'none', fontWeight: 600, px: 2.5 }}
          >
            Save Amount
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
