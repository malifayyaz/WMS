import React, { useState, useEffect } from 'react';
import {
  Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, TextField, Typography, Card, CardContent, Grid, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { readyStockAPI, configAPI } from '../services/api';
import { formatDate } from '../utils/formatters';
import ConfirmDialog from '../components/Common/ConfirmDialog';

const defaultCoilCategoryForWire = (wireNumber) => (Number(wireNumber) === 20 ? 'Patri Coil' : 'Shiplet Coil');

export default function ReadyStock() {
  const [summary, setSummary] = useState([]);
  const [list, setList] = useState([]);
  const [wires, setWires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ wireNumber: '', coilCategory: '', weightKg: '', notes: '', productionDate: new Date().toISOString().slice(0, 10) });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sumRes, listRes, wireRes] = await Promise.all([
        readyStockAPI.getSummary(), readyStockAPI.getAll(), configAPI.getWires(),
      ]);
      setSummary(sumRes.data.data || []);
      setList(listRes.data.data || []);
      setWires(wireRes.data.data?.wires || []);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!form.wireNumber || !form.weightKg) {
      setSnack({ open: true, message: 'Wire and weight required', severity: 'error' });
      return;
    }
    try {
      await readyStockAPI.create({
        wireNumber: Number(form.wireNumber),
        coilCategory: form.coilCategory,
        weightKg: Number(form.weightKg),
        notes: form.notes,
        productionDate: form.productionDate,
        source: 'Direct Production',
      });
      setSnack({ open: true, message: 'Production added to ready stock', severity: 'success' });
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const handleDelete = async () => {
    try {
      await readyStockAPI.delete(deleteConfirm.id);
      setSnack({ open: true, message: 'Deleted', severity: 'success' });
      setDeleteConfirm({ open: false, id: null });
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error', severity: 'error' });
    }
  };

  const totalKg = summary.reduce((s, r) => s + (r.totalKg || 0), 0);

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Record wire manufactured without a customer order. Ready stock is tracked by wire size for inventory and consumption analysis.
      </Alert>

      <Typography variant="h6" gutterBottom>Ready Stock Summary — {totalKg} kg total</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {summary.map((s) => (
          <Grid item xs={6} sm={4} md={3} key={s._id}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2">{s.wireLabel || `Wire #${s._id}`}</Typography>
                <Typography variant="h5" fontWeight={700}>{s.totalKg} kg</Typography>
                <Typography variant="caption">{s.coilCategory}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box display="flex" justifyContent="flex-end" mb={2}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>Add Production</Button>
      </Box>

      {loading ? <CircularProgress /> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Wire</TableCell>
                <TableCell>Coil</TableCell>
                <TableCell align="right">Weight (kg)</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDate(row.productionDate)}</TableCell>
                  <TableCell>{row.wireLabel}</TableCell>
                  <TableCell>{row.coilCategory}</TableCell>
                  <TableCell align="right">{row.weightKg}</TableCell>
                  <TableCell>{row.source}</TableCell>
                  <TableCell>{row.notes}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="error" onClick={() => setDeleteConfirm({ open: true, id: row._id })}><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Record Direct Production</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel>Wire</InputLabel>
            <Select
              value={form.wireNumber}
              onChange={(e) => setForm((f) => ({
                ...f,
                wireNumber: e.target.value,
                coilCategory: defaultCoilCategoryForWire(e.target.value),
              }))}
              label="Wire"
            >
              {wires.map((w) => <MenuItem key={w.number} value={w.number}>{w.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense">
            <InputLabel>Coil Category</InputLabel>
            <Select
              value={form.coilCategory}
              onChange={(e) => setForm((f) => ({ ...f, coilCategory: e.target.value }))}
              label="Coil Category"
            >
              <MenuItem value="Shiplet Coil">Shiplet Coil</MenuItem>
              <MenuItem value="Patri Coil">Patri Coil</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth type="number" label="Weight Produced (kg)" value={form.weightKg} onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))} margin="dense" />
          <TextField fullWidth type="date" label="Production Date" value={form.productionDate} onChange={(e) => setForm((f) => ({ ...f, productionDate: e.target.value }))} margin="dense" InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={deleteConfirm.open} title="Delete" message="Remove this production record?" onConfirm={handleDelete} onCancel={() => setDeleteConfirm({ open: false, id: null })} />
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
