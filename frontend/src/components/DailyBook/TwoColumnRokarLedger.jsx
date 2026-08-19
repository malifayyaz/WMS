import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Chip,
  IconButton,
  Button,
  Stack,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import InboxIcon from '@mui/icons-material/Inbox';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { formatCurrency, formatTime, formatDate } from '../../utils/formatters';
import { useIsMobile } from '../../hooks/useBreakpoint';

function PaymentBadge({ method }) {
  if (!method) return null;
  if (method === 'Cash') {
    return (
      <Chip
        size="small"
        label="Cash"
        sx={{
          fontWeight: 600,
          fontSize: '0.7rem',
          height: 20,
          bgcolor: '#FEF3C7',
          color: '#92400E',
          border: '1px solid #FDE68A',
        }}
      />
    );
  }
  if (method === 'Bank Transfer') {
    return (
      <Chip
        size="small"
        label="Bank"
        sx={{
          fontWeight: 600,
          fontSize: '0.7rem',
          height: 20,
          bgcolor: '#DBEAFE',
          color: '#1E40AF',
          border: '1px solid #BFDBFE',
        }}
      />
    );
  }
  if (method === 'Cheque') {
    return (
      <Chip
        size="small"
        label="Cheque"
        sx={{
          fontWeight: 600,
          fontSize: '0.7rem',
          height: 20,
          bgcolor: '#F3E8FF',
          color: '#6B21A8',
          border: '1px solid #E9D5FF',
        }}
      />
    );
  }
  return <Chip size="small" label={method} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />;
}

function isRowEdited(row) {
  if (!row?.createdAt || !row?.updatedAt) return false;
  const created = new Date(row.createdAt).getTime();
  const updated = new Date(row.updatedAt).getTime();
  return updated - created > 60000; // modified more than 1 min after creation
}

function getCreatedByLabel(row) {
  return row?.createdByName || row?.handledBy || row?.soldBy || row?.user?.name || '';
}

export default function TwoColumnRokarLedger({
  openingBalance = 0,
  closingBalance = 0,
  inRows = [],
  outRows = [],
  onEditRow,
  onDeleteRow,
  onAddEntry,
  requireAdmin,
}) {
  const isMobile = useIsMobile();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [mobileTab, setMobileTab] = useState('all');

  const totalInAmount = inRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalOutAmount = outRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const hasAnyEntries = inRows.length > 0 || outRows.length > 0 || openingBalance > 0;

  if (!hasAnyEntries) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 6,
          my: 2,
          textAlign: 'center',
          borderRadius: 2.5,
          border: '1px dashed',
          borderColor: 'divider',
          bgcolor: isDark ? 'background.paper' : 'grey.50',
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
            color: 'text.secondary',
          }}
        >
          <InboxIcon sx={{ fontSize: 32 }} />
        </Box>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          No entries for today
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, maxWidth: 360, mx: 'auto' }}>
          No cash transactions have been recorded for this date yet. Start by adding an opening balance or recording cash received / spent.
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onAddEntry}
          sx={{ textTransform: 'none', fontWeight: 600, px: 3, borderRadius: 2 }}
        >
          Add First Entry
        </Button>
      </Paper>
    );
  }

  const showInColumn = !isMobile || mobileTab === 'all' || mobileTab === 'in';
  const showOutColumn = !isMobile || mobileTab === 'all' || mobileTab === 'out';

  return (
    <Box sx={{ mb: 3 }}>
      {/* Mobile Segmented Toggle */}
      {isMobile && (
        <Box display="flex" justifyContent="center" mb={1.5}>
          <ToggleButtonGroup
            value={mobileTab}
            exclusive
            onChange={(_, val) => val && setMobileTab(val)}
            size="small"
            fullWidth
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.8rem',
                py: 0.75,
              },
            }}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="in" sx={{ color: '#059669' }}>
              Cash In ({inRows.length})
            </ToggleButton>
            <ToggleButton value="out" sx={{ color: '#DC2626' }}>
              Cash Out ({outRows.length})
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <Grid container spacing={2}>
        {/* LEFT COLUMN: Cash Received (Aamad) */}
        {showInColumn && (
          <Grid item xs={12} md={6}>
            <Paper
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: isDark ? '#065F46' : '#A7F3D0',
                bgcolor: 'background.paper',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              }}
            >
              {/* Header */}
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: isDark ? 'rgba(6, 78, 59, 0.35)' : '#ECFDF5',
                  borderBottom: '1px solid',
                  borderColor: isDark ? '#065F46' : '#A7F3D0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box
                    sx={{
                      p: 0.5,
                      borderRadius: '50%',
                      bgcolor: isDark ? '#059669' : '#10B981',
                      color: '#ffffff',
                      display: 'flex',
                    }}
                  >
                    <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700} color={isDark ? '#34D399' : '#047857'}>
                      Cash Received
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Money In
                    </Typography>
                  </Box>
                </Stack>
                <Typography variant="subtitle1" fontWeight={800} color={isDark ? '#A7F3D0' : '#064E3B'}>
                  {formatCurrency(totalInAmount)}
                </Typography>
              </Box>

              {/* Rows List */}
              <Stack divider={<Divider />} sx={{ flex: 1, minHeight: 180 }}>
                {/* Opening Balance Row */}
                <Box
                  sx={{
                    p: 1.5,
                    bgcolor: isDark ? 'rgba(217, 119, 6, 0.1)' : '#FFFBEB',
                    borderLeft: '4px solid #F59E0B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <WbSunnyIcon sx={{ color: '#D97706', fontSize: 18 }} />
                    <Box>
                      <Typography variant="body2" fontWeight={700} color={isDark ? '#FDE68A' : '#78350F'}>
                        Opening Balance
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Starting cash carried forward
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography variant="subtitle2" fontWeight={800} color={isDark ? '#FDE68A' : '#78350F'}>
                    {formatCurrency(openingBalance)}
                  </Typography>
                </Box>

                {/* Individual Money In Transactions */}
                {inRows.map((row) => {
                  const partyName = row.relatedName || row.customerName || row.relatedTo || 'Cash In';
                  const timeStr = formatTime(row.createdAt || row.transactionDate);
                  const dateStr = formatDate(row.transactionDate);
                  const createdBy = getCreatedByLabel(row);
                  const isEdited = isRowEdited(row);

                  return (
                    <Box
                      key={row._id}
                      sx={{
                        p: 1.5,
                        borderLeft: '4px solid #10B981',
                        transition: 'background-color 0.15s',
                        '&:hover': {
                          bgcolor: 'action.hover',
                        },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                      }}
                    >
                      {/* Left: Party info & details */}
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                          <Typography variant="body2" fontWeight={700} color="text.primary">
                            {partyName}
                          </Typography>
                          {isEdited && (
                            <Chip
                              size="small"
                              label="edited"
                              sx={{ height: 16, fontSize: '0.65rem', color: 'text.secondary' }}
                            />
                          )}
                        </Stack>

                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {row.description || (row.sourceType ? `Source: ${row.sourceType}` : 'Payment received')}
                        </Typography>

                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                          <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                            {timeStr || dateStr}
                          </Typography>
                          {createdBy && (
                            <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>
                              • By {createdBy}
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      {/* Right: Amount, Badge, Actions */}
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography variant="subtitle2" fontWeight={800} color="#059669">
                          +{formatCurrency(row.amount)}
                        </Typography>
                        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5} mt={0.5}>
                          <PaymentBadge method={row.paymentMethod || 'Cash'} />
                          {onEditRow && (
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                onClick={requireAdmin ? requireAdmin(() => onEditRow(row)) : () => onEditRow(row)}
                                sx={{ p: 0.25 }}
                              >
                                <EditIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {onDeleteRow && (
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={requireAdmin ? requireAdmin(() => onDeleteRow(row)) : () => onDeleteRow(row)}
                                sx={{ p: 0.25 }}
                              >
                                <DeleteIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  );
                })}

                {inRows.length === 0 && (
                  <Box p={3} textAlign="center">
                    <Typography variant="caption" color="text.secondary">
                      No money received entries yet for this date.
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid>
        )}

        {/* RIGHT COLUMN: Cash Spent (Kharch) */}
        {showOutColumn && (
          <Grid item xs={12} md={6}>
            <Paper
              elevation={0}
              sx={{
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: isDark ? '#991B1B' : '#FECACA',
                bgcolor: 'background.paper',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              }}
            >
              {/* Header */}
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: isDark ? 'rgba(153, 27, 27, 0.35)' : '#FEF2F2',
                  borderBottom: '1px solid',
                  borderColor: isDark ? '#991B1B' : '#FECACA',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box
                    sx={{
                      p: 0.5,
                      borderRadius: '50%',
                      bgcolor: isDark ? '#DC2626' : '#EF4444',
                      color: '#ffffff',
                      display: 'flex',
                    }}
                  >
                    <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700} color={isDark ? '#F87171' : '#B91C1C'}>
                      Cash Spent
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Money Out
                    </Typography>
                  </Box>
                </Stack>
                <Typography variant="subtitle1" fontWeight={800} color={isDark ? '#FECACA' : '#7F1D1D'}>
                  {formatCurrency(totalOutAmount)}
                </Typography>
              </Box>

              {/* Rows List */}
              <Stack divider={<Divider />} sx={{ flex: 1, minHeight: 180 }}>
                {outRows.map((row) => {
                  const desc = row.description || row.expenseCategory || row.relatedName || 'Expense';
                  const timeStr = formatTime(row.createdAt || row.transactionDate);
                  const dateStr = formatDate(row.transactionDate);
                  const createdBy = getCreatedByLabel(row);
                  const isEdited = isRowEdited(row);

                  return (
                    <Box
                      key={row._id}
                      sx={{
                        p: 1.5,
                        borderLeft: '4px solid #EF4444',
                        transition: 'background-color 0.15s',
                        '&:hover': {
                          bgcolor: 'action.hover',
                        },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                      }}
                    >
                      {/* Left: Description & category info */}
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                          <Typography variant="body2" fontWeight={700} color="text.primary">
                            {desc}
                          </Typography>
                          {row.expenseGroup && (
                            <Chip
                              size="small"
                              label={row.expenseGroup}
                              sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                bgcolor: 'action.hover',
                                color: 'text.secondary',
                              }}
                            />
                          )}
                          {isEdited && (
                            <Chip
                              size="small"
                              label="edited"
                              sx={{ height: 16, fontSize: '0.65rem', color: 'text.secondary' }}
                            />
                          )}
                        </Stack>

                        {row.relatedName && row.relatedName !== desc && (
                          <Typography variant="caption" color="text.secondary" display="block" noWrap>
                            Paid to: {row.relatedName}
                          </Typography>
                        )}

                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                          <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                            {timeStr || dateStr}
                          </Typography>
                          {createdBy && (
                            <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>
                              • By {createdBy}
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      {/* Right: Amount, Badge, Actions */}
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography variant="subtitle2" fontWeight={800} color="#DC2626">
                          −{formatCurrency(row.amount)}
                        </Typography>
                        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5} mt={0.5}>
                          <PaymentBadge method={row.paymentMethod || 'Cash'} />
                          {onEditRow && (
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                onClick={requireAdmin ? requireAdmin(() => onEditRow(row)) : () => onEditRow(row)}
                                sx={{ p: 0.25 }}
                              >
                                <EditIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {onDeleteRow && (
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={requireAdmin ? requireAdmin(() => onDeleteRow(row)) : () => onDeleteRow(row)}
                                sx={{ p: 0.25 }}
                              >
                                <DeleteIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  );
                })}

                {outRows.length === 0 && (
                  <Box p={3} textAlign="center">
                    <Typography variant="caption" color="text.secondary">
                      No cash spent entries recorded for this date.
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Bottom: Full-Width Prominent Closing Balance Bar */}
      <Paper
        elevation={0}
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 2.5,
          border: '2px solid',
          borderColor: isDark ? '#3B82F6' : '#93C5FD',
          bgcolor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              p: 1,
              borderRadius: '50%',
              bgcolor: isDark ? '#2563EB' : '#3B82F6',
              color: '#ffffff',
              display: 'flex',
            }}
          >
            <AccountBalanceWalletIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={800} color={isDark ? '#93C5FD' : '#1E40AF'}>
              Closing Balance
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Total physical cash remaining in hand at end of day
            </Typography>
          </Box>
        </Stack>

        <Typography variant="h5" fontWeight={800} color={isDark ? '#BFDBFE' : '#1E3A8A'}>
          {formatCurrency(closingBalance)}
        </Typography>
      </Paper>
    </Box>
  );
}
