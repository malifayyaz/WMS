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
import InventoryIcon from '@mui/icons-material/Inventory';
import FactoryIcon from '@mui/icons-material/Factory';
import SettingsIcon from '@mui/icons-material/Settings';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import UndoIcon from '@mui/icons-material/Undo';
import ScaleIcon from '@mui/icons-material/Scale';
import { formatCurrency, formatTime, formatDate } from '../../utils/formatters';
import { useIsMobile } from '../../hooks/useBreakpoint';

function WeightBadge({ weightKg, direction = 'in' }) {
  const isPositive = direction === 'in';
  return (
    <Typography
      variant="subtitle2"
      fontWeight={800}
      sx={{
        color: isPositive ? '#059669' : '#DC2626',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.01em',
      }}
    >
      {isPositive ? '+' : '−'}
      {Number(weightKg || 0).toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      })}{' '}
      <Typography component="span" variant="caption" sx={{ fontWeight: 700, opacity: 0.85 }}>
        kg
      </Typography>
    </Typography>
  );
}

function KindChip({ kind, coilCategory, wireNumber, isAnnealed }) {
  if (kind === 'RawMaterial') {
    return (
      <Chip
        size="small"
        icon={<FactoryIcon sx={{ fontSize: '13px !important' }} />}
        label={coilCategory || 'Raw Coil'}
        sx={{
          fontWeight: 700,
          fontSize: '0.68rem',
          height: 20,
          bgcolor: '#ECFDF5',
          color: '#047857',
          border: '1px solid #A7F3D0',
        }}
      />
    );
  }
  if (kind === 'ProcessingArrival') {
    return (
      <Chip
        size="small"
        icon={<SettingsIcon sx={{ fontSize: '13px !important' }} />}
        label="Processing Inward"
        sx={{
          fontWeight: 700,
          fontSize: '0.68rem',
          height: 20,
          bgcolor: '#EFF6FF',
          color: '#1D4ED8',
          border: '1px solid #BFDBFE',
        }}
      />
    );
  }
  if (kind === 'ProcessingDelivery') {
    return (
      <Chip
        size="small"
        icon={<SettingsIcon sx={{ fontSize: '13px !important' }} />}
        label={`Job Work #${wireNumber || 'Wire'}`}
        sx={{
          fontWeight: 700,
          fontSize: '0.68rem',
          height: 20,
          bgcolor: '#F3E8FF',
          color: '#6D28D9',
          border: '1px solid #DDD6FE',
        }}
      />
    );
  }
  if (kind === 'Order') {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Chip
          size="small"
          icon={<ShoppingBagIcon sx={{ fontSize: '13px !important' }} />}
          label={wireNumber ? `Wire #${wireNumber}` : 'Wire Sale'}
          sx={{
            fontWeight: 700,
            fontSize: '0.68rem',
            height: 20,
            bgcolor: '#FFF1F2',
            color: '#BE123C',
            border: '1px solid #FECDD3',
          }}
        />
        {isAnnealed && (
          <Chip
            size="small"
            icon={<LocalFireDepartmentIcon sx={{ fontSize: '12px !important' }} />}
            label="Annealed"
            sx={{
              fontWeight: 700,
              fontSize: '0.65rem',
              height: 18,
              bgcolor: '#FEF3C7',
              color: '#92400E',
            }}
          />
        )}
      </Stack>
    );
  }
  if (kind === 'SalesReturn') {
    return (
      <Chip
        size="small"
        icon={<UndoIcon sx={{ fontSize: '12px !important' }} />}
        label="Sale Return"
        sx={{
          fontWeight: 700,
          fontSize: '0.68rem',
          height: 20,
          bgcolor: '#FEF3C7',
          color: '#B45309',
          border: '1px solid #FDE68A',
        }}
      />
    );
  }
  if (kind === 'CoilReturn') {
    return (
      <Chip
        size="small"
        icon={<UndoIcon sx={{ fontSize: '12px !important' }} />}
        label="Supplier Return"
        sx={{
          fontWeight: 700,
          fontSize: '0.68rem',
          height: 20,
          bgcolor: '#FEF3C7',
          color: '#B45309',
          border: '1px solid #FDE68A',
        }}
      />
    );
  }
  return null;
}

export default function TwoColumnStockLedger({
  inRows = [],
  outRows = [],
  onEditInRow,
  onDeleteInRow,
  onEditOutRow,
  onDeleteOutRow,
  onAddStockIn,
  onAddWireOut,
  requireAdmin,
  inTitle = 'Stock In / Purchases',
  inSubtitle = 'Maal Aamad (Raw Material + Processing Coils)',
  outTitle = 'Wire Out / Sales',
  outSubtitle = 'Maal Rawana (Wire Sales + Processing Deliveries)',
}) {
  const isMobile = useIsMobile();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [mobileTab, setMobileTab] = useState('all');

  // Calculate Aggregates for Inward
  const totalInWeightKg = inRows.reduce((sum, r) => sum + (Number(r.weightKg ?? r.weightInKg ?? r.arrivedWeightKg ?? r.initialWeightKg) || 0), 0);
  const totalInBundles = inRows.reduce((sum, r) => sum + (Number(r.bundles) || 0), 0);
  const totalInValue = inRows.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  const rawPurchaseKg = inRows.filter((r) => r.sourceKind === 'RawMaterial').reduce((s, r) => s + (Number(r.weightKg ?? r.weightInKg) || 0), 0);
  const processingArrivalKg = inRows.filter((r) => r.sourceKind === 'ProcessingArrival').reduce((s, r) => s + (Number(r.weightKg ?? r.arrivedWeightKg) || 0), 0);

  // Calculate Aggregates for Outward
  const totalOutWeightKg = outRows.reduce((sum, r) => sum + (Number(r.weightKg ?? r.finalWeightKg ?? r.initialWeightKg) || 0), 0);
  const totalOutBundles = outRows.reduce((sum, r) => sum + (Number(r.bundles) || 0), 0);
  const totalOutValue = outRows.reduce((sum, r) => sum + (Number(r.totalAmount ?? r.labourAmount) || 0), 0);
  const wireSaleKg = outRows.filter((r) => r.sourceKind === 'Order').reduce((s, r) => s + (Number(r.weightKg ?? r.finalWeightKg ?? r.initialWeightKg) || 0), 0);
  const processingDeliveryKg = outRows.filter((r) => r.sourceKind === 'ProcessingDelivery').reduce((s, r) => s + (Number(r.weightKg) || 0), 0);

  // Net Stock Movement of the Day
  const netWeightKg = totalInWeightKg - totalOutWeightKg;
  const netBundles = totalInBundles - totalOutBundles;

  const hasAnyEntries = inRows.length > 0 || outRows.length > 0;

  if (!hasAnyEntries) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 5,
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
          <InventoryIcon sx={{ fontSize: 32 }} />
        </Box>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          No material movement recorded today
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, maxWidth: 420, mx: 'auto' }}>
          No raw material purchases, customer coil arrivals, wire sales, or processing deliveries have occurred on this date yet.
        </Typography>
        <Stack direction="row" spacing={1.5} justifyContent="center">
          {onAddStockIn && (
            <Button
              variant="outlined"
              color="success"
              startIcon={<AddIcon />}
              onClick={requireAdmin ? requireAdmin(onAddStockIn) : onAddStockIn}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              Add Stock Arrival
            </Button>
          )}
          {onAddWireOut && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={requireAdmin ? requireAdmin(onAddWireOut) : onAddWireOut}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              Add Wire Sale
            </Button>
          )}
        </Stack>
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
            <ToggleButton value="all">All Movements</ToggleButton>
            <ToggleButton value="in" sx={{ color: '#059669' }}>
              Stock In ({inRows.length})
            </ToggleButton>
            <ToggleButton value="out" sx={{ color: '#DC2626' }}>
              Wire Out ({outRows.length})
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <Grid container spacing={2}>
        {/* LEFT COLUMN: Stock In / Purchases (Maal Aamad) */}
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
              {/* Column Header Banner */}
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: isDark ? 'rgba(6, 78, 59, 0.35)' : '#ECFDF5',
                  borderBottom: '1px solid',
                  borderColor: isDark ? '#065F46' : '#A7F3D0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  flexWrap: 'wrap',
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
                      {inTitle}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {inSubtitle}
                    </Typography>
                  </Box>
                </Stack>

                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="subtitle1" fontWeight={800} color={isDark ? '#A7F3D0' : '#064E3B'}>
                    +{totalInWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {totalInBundles} bundles • {inRows.length} inward record{inRows.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              </Box>

              {/* Sub-breakdown pill chips */}
              <Box
                sx={{
                  px: 1.5,
                  py: 0.75,
                  bgcolor: isDark ? 'rgba(6, 78, 59, 0.15)' : '#F0FDF4',
                  borderBottom: '1px solid',
                  borderColor: isDark ? 'rgba(6, 95, 70, 0.4)' : '#D1FAE5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 0.5,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                    Factory: <strong>+{rawPurchaseKg.toFixed(1)} kg</strong>
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>•</Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                    Processing: <strong>+{processingArrivalKg.toFixed(1)} kg</strong>
                  </Typography>
                </Stack>

                {totalInValue > 0 && (
                  <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#6EE7B7' : '#059669' }}>
                    Purchases Value: {formatCurrency(totalInValue)}
                  </Typography>
                )}
              </Box>

              {/* Rows List */}
              <Stack divider={<Divider />} sx={{ flex: 1, minHeight: 180 }}>
                {inRows.map((row) => {
                  const partyName = row.supplierName || row.customerName || row.supplierId?.name || row.customerId?.name || 'Stock Inward';
                  const weightKg = Number(row.weightKg ?? row.weightInKg ?? row.arrivedWeightKg ?? row.initialWeightKg) || 0;
                  const bundles = Number(row.bundles) || 0;
                  const rate = Number(row.ratePerKg ?? row.coilRatePerKg) || 0;
                  const amount = Number(row.totalAmount) || 0;
                  const timeStr = formatTime(row.purchaseDate || row.arrivalDate || row.orderDate || row.createdAt);
                  const dateStr = formatDate(row.purchaseDate || row.arrivalDate || row.orderDate || row.createdAt);
                  const createdBy = row.paidBy || row.soldBy || row.handledBy || row.createdByName || '';

                  return (
                    <Box
                      key={`${row.sourceKind || 'in'}-${row._id}`}
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
                      {/* Left: Party info, kind chip, specs */}
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                          <Typography variant="body2" fontWeight={700} color="text.primary">
                            {partyName}
                          </Typography>
                          <KindChip
                            kind={row.sourceKind}
                            coilCategory={row.coilCategory}
                            wireNumber={row.wireNumber}
                            isAnnealed={row.isAnnealed}
                          />
                        </Stack>

                        <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ mt: 0.25 }}>
                          {row.coilCategory || row.materialType || 'Coil'}
                          {bundles > 0 ? ` • ${bundles} bundle${bundles > 1 ? 's' : ''}` : ''}
                          {rate > 0 ? ` • Rate: Rs. ${rate}/kg` : ''}
                          {amount > 0 ? ` • Total: ${formatCurrency(amount)}` : ''}
                        </Typography>

                        {row.notes && (
                          <Typography variant="caption" color="text.disabled" display="block" noWrap sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}>
                            {row.notes}
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
                          {row.paymentMethod && (
                            <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                              • {row.paymentMethod}
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      {/* Right: Weight, Value, Actions */}
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <WeightBadge weightKg={weightKg} direction="in" />
                        {bundles > 0 && (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600 }}>
                            {bundles} bdl{bundles > 1 ? 's' : ''}
                          </Typography>
                        )}

                        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5} mt={0.5}>
                          {onEditInRow && (
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                onClick={requireAdmin ? requireAdmin(() => onEditInRow(row)) : () => onEditInRow(row)}
                                sx={{ p: 0.25 }}
                              >
                                <EditIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {onDeleteInRow && (
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={requireAdmin ? requireAdmin(() => onDeleteInRow(row)) : () => onDeleteInRow(row)}
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
                      No stock inward or purchases for this date.
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid>
        )}

        {/* RIGHT COLUMN: Wire Out / Sales (Maal Rawana) */}
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
              {/* Column Header Banner */}
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: isDark ? 'rgba(153, 27, 27, 0.35)' : '#FEF2F2',
                  borderBottom: '1px solid',
                  borderColor: isDark ? '#991B1B' : '#FECACA',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  flexWrap: 'wrap',
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
                      {outTitle}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {outSubtitle}
                    </Typography>
                  </Box>
                </Stack>

                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="subtitle1" fontWeight={800} color={isDark ? '#FECACA' : '#7F1D1D'}>
                    −{totalOutWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {totalOutBundles} bundles • {outRows.length} dispatch record{outRows.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              </Box>

              {/* Sub-breakdown pill chips */}
              <Box
                sx={{
                  px: 1.5,
                  py: 0.75,
                  bgcolor: isDark ? 'rgba(153, 27, 27, 0.15)' : '#FFF1F2',
                  borderBottom: '1px solid',
                  borderColor: isDark ? 'rgba(153, 27, 27, 0.4)' : '#FFE4E6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 0.5,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                    Sales Wire: <strong>−{wireSaleKg.toFixed(1)} kg</strong>
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>•</Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                    Processing Delivered: <strong>−{processingDeliveryKg.toFixed(1)} kg</strong>
                  </Typography>
                </Stack>

                {totalOutValue > 0 && (
                  <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#FCA5A5' : '#DC2626' }}>
                    Sales & Labour: {formatCurrency(totalOutValue)}
                  </Typography>
                )}
              </Box>

              {/* Rows List */}
              <Stack divider={<Divider />} sx={{ flex: 1, minHeight: 180 }}>
                {outRows.map((row) => {
                  const partyName = row.customerName || row.supplierName || row.customerId?.name || row.supplierId?.name || 'Wire Dispatched';
                  const weightKg = Number(row.weightKg ?? row.finalWeightKg ?? row.initialWeightKg ?? row.weightInKg) || 0;
                  const bundles = Number(row.bundles) || 0;
                  const rate = Number(row.ratePerKg ?? row.labourRatePerKg) || 0;
                  const isProcessingDelivery = row.sourceKind === 'ProcessingDelivery';
                  const amount = isProcessingDelivery ? Number(row.labourAmount) || 0 : Number(row.totalAmount) || 0;
                  const timeStr = formatTime(row.orderDate || row.deliveredDate || row.purchaseDate || row.createdAt);
                  const dateStr = formatDate(row.orderDate || row.deliveredDate || row.purchaseDate || row.createdAt);
                  const createdBy = row.soldBy || row.handledBy || row.paidBy || row.createdByName || '';

                  return (
                    <Box
                      key={`${row.sourceKind || 'out'}-${row._id || row.deliveryId}`}
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
                      {/* Left: Party info, wire type, rate */}
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                          <Typography variant="body2" fontWeight={700} color="text.primary">
                            {partyName}
                          </Typography>
                          <KindChip
                            kind={row.sourceKind}
                            coilCategory={row.coilCategory}
                            wireNumber={row.wireNumber}
                            isAnnealed={row.isAnnealed}
                          />
                          {row.orderStatus && (
                            <Chip
                              size="small"
                              label={row.orderStatus}
                              color={row.orderStatus === 'Done' ? 'success' : row.orderStatus === 'In Process' ? 'warning' : 'default'}
                              variant="outlined"
                              sx={{ height: 16, fontSize: '0.62rem' }}
                            />
                          )}
                        </Stack>

                        <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ mt: 0.25 }}>
                          {row.wireNumber != null ? `Wire #${row.wireNumber}` : (row.wireType || row.coilCategory || 'Wire')}
                          {bundles > 0 ? ` • ${bundles} bundle${bundles > 1 ? 's' : ''}` : ''}
                          {isProcessingDelivery
                            ? rate > 0 ? ` • Labour @ Rs. ${rate}/kg` : ''
                            : rate > 0 ? ` • Sale @ Rs. ${rate}/kg` : ''}
                          {amount > 0 ? ` • Amount: ${formatCurrency(amount)}` : ''}
                        </Typography>

                        {row.notes && (
                          <Typography variant="caption" color="text.disabled" display="block" noWrap sx={{ fontStyle: 'italic', fontSize: '0.7rem' }}>
                            {row.notes}
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
                          {row.customerType && (
                            <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                              • {row.customerType} Customer
                            </Typography>
                          )}
                        </Stack>
                      </Box>

                      {/* Right: Weight, Bundles, Actions */}
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <WeightBadge weightKg={weightKg} direction="out" />
                        {bundles > 0 && (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600 }}>
                            {bundles} bdl{bundles > 1 ? 's' : ''}
                          </Typography>
                        )}

                        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5} mt={0.5}>
                          {onEditOutRow && (
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                onClick={requireAdmin ? requireAdmin(() => onEditOutRow(row)) : () => onEditOutRow(row)}
                                sx={{ p: 0.25 }}
                              >
                                <EditIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {onDeleteOutRow && (
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={requireAdmin ? requireAdmin(() => onDeleteOutRow(row)) : () => onDeleteOutRow(row)}
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
                      No wire sales or processing deliveries recorded on this date.
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Bottom Summary Bar: Net Daily Material Balance */}
      <Paper
        elevation={0}
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 2.5,
          border: '2px solid',
          borderColor: netWeightKg >= 0
            ? (isDark ? '#059669' : '#86EFAC')
            : (isDark ? '#DC2626' : '#FCA5A5'),
          bgcolor: netWeightKg >= 0
            ? (isDark ? 'rgba(6, 95, 70, 0.15)' : '#F0FDF4')
            : (isDark ? 'rgba(153, 27, 27, 0.15)' : '#FFF1F2'),
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
              bgcolor: netWeightKg >= 0 ? '#10B981' : '#EF4444',
              color: '#ffffff',
              display: 'flex',
            }}
          >
            <ScaleIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography
              variant="subtitle1"
              fontWeight={800}
              color={netWeightKg >= 0 ? (isDark ? '#6EE7B7' : '#065F46') : (isDark ? '#FCA5A5' : '#991B1B')}
            >
              Net Material Movement of the Day
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Total Inward Stock ({totalInWeightKg.toFixed(1)} kg) − Total Outward Wire ({totalOutWeightKg.toFixed(1)} kg)
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography
            variant="h5"
            fontWeight={800}
            color={netWeightKg >= 0 ? (isDark ? '#A7F3D0' : '#047857') : (isDark ? '#FECACA' : '#991B1B')}
            sx={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {netWeightKg >= 0 ? `+${netWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg` : `${netWeightKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg`}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            {netWeightKg >= 0 ? '🟢 Net Inventory Addition' : '🔴 Net Inventory Reduction'}
            {netBundles !== 0 ? ` (${netBundles > 0 ? `+${netBundles}` : netBundles} bundles)` : ''}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
