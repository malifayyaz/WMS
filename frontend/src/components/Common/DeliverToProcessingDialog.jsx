import React, { useState, useEffect } from 'react';
import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Alert,
  Box,
} from '@mui/material';
import ResponsiveDialog from './ResponsiveDialog';
import { annealingAPI, customersAPI } from '../../services/api';
import { useIsMobile } from '../../hooks/useBreakpoint';

export default function DeliverToProcessingDialog({ open, onClose, annealingRecord, onSuccess }) {
  const isMobile = useIsMobile();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  
  const [form, setForm] = useState({
    processingCustomerId: '',
    weightKg: '',
    labourRatePerKg: '',
    coilRatePerKg: '',
    bundles: '',
    wireNumber: annealingRecord?.wireNumber || '',
    notes: '',
    date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    if (open) {
      setForm((prev) => ({
        ...prev,
        weightKg: '',
        labourRatePerKg: '',
        coilRatePerKg: '',
        bundles: '',
        wireNumber: annealingRecord?.wireNumber || '',
        notes: '',
        processingCustomerId: '',
        date: new Date().toISOString().slice(0, 10),
      }));
      setPreviewData(null);
      fetchCustomers();
    }
  }, [open, annealingRecord]);

  const fetchCustomers = async () => {
    try {
      const res = await customersAPI.getAll({ type: 'Processing' });
      setCustomers(res.data.data || []);
    } catch (err) {}
  };

  useEffect(() => {
    const fetchPreview = async () => {
      if (!form.processingCustomerId || !form.weightKg || Number(form.weightKg) <= 0) {
        setPreviewData(null);
        return;
      }
      try {
        const res = await annealingAPI.deliverPreview(annealingRecord._id, {
          processingCustomerId: form.processingCustomerId,
          weightKg: form.weightKg,
        });
        setPreviewData(res.data.data);
      } catch (err) {
        setPreviewData(null);
      }
    };
    
    const timeout = setTimeout(fetchPreview, 500);
    return () => clearTimeout(timeout);
  }, [form.processingCustomerId, form.weightKg, annealingRecord]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.processingCustomerId || !form.weightKg) return;
    
    setLoading(true);
    try {
      await annealingAPI.deliverToProcessing(annealingRecord._id, {
        ...form,
        weightKg: Number(form.weightKg),
        labourRatePerKg: Number(form.labourRatePerKg),
        coilRatePerKg: Number(form.coilRatePerKg),
        bundles: Number(form.bundles),
      });
      onSuccess?.();
    } catch (err) {
      alert(err.response?.data?.message || 'Delivery failed');
    } finally {
      setLoading(false);
    }
  };

  const availableWeight = annealingRecord?.remainingWeightKg ?? annealingRecord?.finalWeightKg ?? annealingRecord?.weightKg ?? 0;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Deliver Annealed Coil to Processing</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Deliver annealed {annealingRecord?.coilCategory || 'coil'} to a job work customer.
          Currently available in this annealing record: <strong>{availableWeight} kg</strong>.
        </Typography>

        <Box component="form" id="deliver-form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <TextField
            label="Delivery Date"
            type="date"
            InputLabelProps={{ shrink: true }}
            fullWidth
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />

          <FormControl fullWidth required>
            <InputLabel>Processing Customer</InputLabel>
            <Select
              label="Processing Customer"
              value={form.processingCustomerId}
              onChange={(e) => setForm({ ...form, processingCustomerId: e.target.value })}
            >
              {customers.map((c) => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Weight to Deliver (kg)"
            type="number"
            inputProps={{ step: '0.01' }}
            fullWidth
            required
            value={form.weightKg}
            onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
            error={Number(form.weightKg) > availableWeight}
            helperText={Number(form.weightKg) > availableWeight ? `Exceeds available weight (${availableWeight} kg)` : ''}
          />

          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
            <TextField
              label="Labour Rate / kg"
              type="number"
              inputProps={{ step: '0.01' }}
              fullWidth
              value={form.labourRatePerKg}
              onChange={(e) => setForm({ ...form, labourRatePerKg: e.target.value })}
            />
            <TextField
              label="Coil Rate / kg (Optional)"
              type="number"
              inputProps={{ step: '0.01' }}
              fullWidth
              value={form.coilRatePerKg}
              onChange={(e) => setForm({ ...form, coilRatePerKg: e.target.value })}
              helperText="Overrides latest coil arrival rate"
            />
          </Box>

          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
            <TextField
              label="Bundles"
              type="number"
              fullWidth
              value={form.bundles}
              onChange={(e) => setForm({ ...form, bundles: e.target.value })}
            />
            <TextField
              label="Wire #"
              type="number"
              fullWidth
              value={form.wireNumber}
              onChange={(e) => setForm({ ...form, wireNumber: e.target.value })}
            />
          </Box>

          <TextField
            label="Notes"
            fullWidth
            multiline
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          {previewData && (
            <Box sx={{ mt: 1 }}>
              {previewData.hasExcess ? (
                <Alert severity="warning">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Excess Delivery Warning</Typography>
                  <Typography variant="body2">
                    Customer's pending pool: {previewData.customerAvailableKg} kg.
                    <br />
                    Delivering <strong>{previewData.totalRequested} kg</strong> means <strong>{previewData.fromOurStock} kg</strong> will be treated as an excess delivery (sold from our stock).
                  </Typography>
                </Alert>
              ) : (
                <Alert severity="info" icon={false}>
                  <Typography variant="body2">
                    Delivery fits within customer's pending pool ({previewData.customerAvailableKg} kg).
                  </Typography>
                </Alert>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading} color="inherit">Cancel</Button>
        <Button
          type="submit"
          form="deliver-form"
          variant="contained"
          disabled={loading || !form.processingCustomerId || !form.weightKg || Number(form.weightKg) > availableWeight}
        >
          {loading ? 'Delivering...' : 'Deliver'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
