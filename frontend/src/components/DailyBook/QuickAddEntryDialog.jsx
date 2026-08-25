import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Paper,
  Stack,
  IconButton,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import PersonIcon from '@mui/icons-material/Person';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

const ENTRY_OPTIONS = [
  {
    id: 'cashReceived',
    title: 'Cash Received',
    description: 'Customer payment or any general cash inflow',
    icon: ArrowDownwardIcon,
    color: '#059669',
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    darkBgColor: 'rgba(16, 185, 129, 0.15)',
    darkBorderColor: '#059669',
  },
  {
    id: 'factoryExpense',
    title: 'Factory Expense',
    description: 'Labour, rent, electricity, hardware, maintenance',
    icon: ArrowUpwardIcon,
    color: '#DC2626',
    bgColor: '#FEF2F2',
    borderColor: '#FECACA',
    darkBgColor: 'rgba(239, 68, 68, 0.15)',
    darkBorderColor: '#DC2626',
  },
  {
    id: 'personalDrawing',
    title: 'Personal Drawing',
    description: 'Personal withdrawal or partner expense',
    icon: PersonIcon,
    color: '#7C3AED',
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    darkBgColor: 'rgba(124, 58, 237, 0.15)',
    darkBorderColor: '#7C3AED',
  },
  {
    id: 'personalPayment',
    title: 'Personal Payment',
    description: 'Committee, savings, or personal loan installment',
    icon: SavingsIcon,
    color: '#4F46E5',
    bgColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    darkBgColor: 'rgba(79, 70, 229, 0.15)',
    darkBorderColor: '#4F46E5',
  },
  {
    id: 'dailySale',
    title: 'Daily Cash Sale',
    description: 'Walk-in customer wire sale',
    icon: ShoppingCartIcon,
    color: '#2563EB',
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    darkBgColor: 'rgba(37, 99, 235, 0.15)',
    darkBorderColor: '#2563EB',
  },
  {
    id: 'bankAtm',
    title: 'Bank Transfer / ATM',
    description: 'Online bank transfer or ATM cash withdrawal',
    icon: AccountBalanceIcon,
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    darkBgColor: 'rgba(217, 119, 6, 0.15)',
    darkBorderColor: '#D97706',
  },
  {
    id: 'selfCheque',
    title: 'Draw Bank Cheque to Hand',
    description: 'Issue own bank cheque into in-hand custody to use later',
    icon: ReceiptLongIcon,
    color: '#0D9488',
    bgColor: '#F0FDFA',
    borderColor: '#99F6E4',
    darkBgColor: 'rgba(13, 148, 136, 0.15)',
    darkBorderColor: '#0D9488',
  },
];

export default function QuickAddEntryDialog({ open, onClose, onSelectOption }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const handleSelect = (id) => {
    onClose();
    onSelectOption(id);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
          fontWeight: 700,
        }}
      >
        <Box>
          <Typography variant="h6" fontWeight={700}>
            + Add New Entry
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Select the type of transaction you want to record:
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1, pb: 3 }}>
        <Stack spacing={1.5}>
          {ENTRY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Paper
                key={opt.id}
                elevation={0}
                onClick={() => handleSelect(opt.id)}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1.5px solid',
                  borderColor: isDark ? opt.darkBorderColor : opt.borderColor,
                  bgcolor: isDark ? opt.darkBgColor : opt.bgColor,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease-in-out',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: isDark
                      ? '0 4px 12px rgba(0,0,0,0.4)'
                      : `0 4px 14px ${opt.color}22`,
                  },
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: opt.color,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                    flexShrink: 0,
                  }}
                >
                  <Icon sx={{ fontSize: 24 }} />
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                    {opt.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', mt: 0.25 }}>
                    {opt.description}
                  </Typography>
                </Box>
              </Paper>
            );
          })}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
