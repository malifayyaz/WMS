import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import PageToolbar from '../components/Common/PageToolbar';
import { settingsAPI } from '../services/api';
import { formatDate } from '../utils/formatters';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [wastePercentage, setWastePercentage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' });

  // Get user role from local storage to check for Admin
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isAdmin = user?.role === 'Admin';

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await settingsAPI.getSettings();
      const data = res.data.data;
      setSettings(data);
      if (data && data.wastePercentage !== undefined) {
        setWastePercentage(data.wastePercentage.toString());
      }
    } catch (err) {
      setSnack({ open: true, message: 'Failed to load settings', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveWastePercentage = async () => {
    try {
      setSaving(true);
      const numValue = parseFloat(wastePercentage);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        setSnack({ open: true, message: 'Please enter a valid percentage (0-100)', severity: 'warning' });
        return;
      }
      
      await settingsAPI.updateSetting('wastePercentage', { value: numValue });
      
      setSnack({ open: true, message: 'Waste percentage updated successfully', severity: 'success' });
      await fetchSettings(); // refresh to get updatedBy info if possible, but our get API just returns KV
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Failed to update setting', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <PageToolbar title="System Settings" />

      {loading ? (
        <CircularProgress />
      ) : (
        <Card variant="outlined" sx={{ maxWidth: 600, mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom fontWeight={700}>
              Manufacturing Waste Percentage
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Percentage of cost of wire sold deducted as manufacturing waste in the P&L report. 
              Common range: 3% to 7%.
            </Typography>

            <Box display="flex" alignItems="center" gap={2} mt={2}>
              <TextField
                label="Waste Percentage (%)"
                type="number"
                value={wastePercentage}
                onChange={(e) => setWastePercentage(e.target.value)}
                disabled={!isAdmin || saving}
                size="small"
                inputProps={{ step: '0.1', min: '0', max: '100' }}
              />
              {isAdmin && (
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveWastePercentage}
                  disabled={saving || wastePercentage === ''}
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </Box>
            
            {!isAdmin && (
              <Alert severity="info" sx={{ mt: 2 }}>
                You do not have permission to edit settings.
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={6000}
        onClose={() => setSnack((p) => ({ ...p, open: false }))}
      >
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
