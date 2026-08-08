import React, { useEffect, useState } from 'react';
import {
  Box, Button, Card, CardContent, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, CircularProgress, FormControl, InputLabel, Select, MenuItem, TextField,
  Chip, Grid, FormControlLabel, Switch, Stack,
} from '@mui/material';
import PersonAdd from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { usersAPI, authAPI } from '../services/api';
import { formatDateTime } from '../utils/formatters';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import AccessDeniedSnackbar from '../components/Common/AccessDeniedSnackbar';
import ResponsiveDialog from '../components/Common/ResponsiveDialog';
import PageToolbar from '../components/Common/PageToolbar';
import { useIsMobile } from '../hooks/useBreakpoint';

const defaultAddForm = { name: '', username: '', password: '', confirmPassword: '', role: 'viewer' };
const defaultEditForm = { name: '', username: '', role: 'viewer', isActive: true };
const defaultResetForm = { currentPassword: '', newPassword: '', confirmNewPassword: '' };

const statCards = [
  { key: 'totalUsers', label: 'Total Users', color: 'primary.main' },
  { key: 'totalAdmins', label: 'Total Admins', color: 'secondary.main' },
  { key: 'totalViewers', label: 'Total Viewers', color: 'info.main' },
  { key: 'activeUsers', label: 'Active Users', color: 'success.main' },
];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { isViewer } = usePermissions();
  const isMobile = useIsMobile();
  const [accessDenied, setAccessDenied] = useState(false);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalAdmins: 0, totalViewers: 0, activeUsers: 0 });
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(defaultAddForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [editingUser, setEditingUser] = useState(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetForm, setResetForm] = useState(defaultResetForm);
  const [resettingUser, setResettingUser] = useState(null);

  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([usersAPI.getAll(), usersAPI.getStats()]);
      setUsers(usersRes.data.data || []);
      setStats(statsRes.data.data || {});
    } catch (err) {
      // Viewers can open this page in read-only mode; backend is still admin-only.
      if (!isViewer) {
        setSnack({ open: true, message: err.response?.data?.message || 'Failed to load users', severity: 'error' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [isViewer]);

  const openAdd = () => {
    if (isViewer) { setAccessDenied(true); return; }
    setAddForm(defaultAddForm);
    setAddOpen(true);
  };

  const openEdit = (row) => {
    if (isViewer) { setAccessDenied(true); return; }
    setEditingUser(row);
    setEditForm({ name: row.name, username: row.username, role: row.role, isActive: row.isActive });
    setEditOpen(true);
  };

  const openReset = (row) => {
    const isSelf = String(row._id) === String(currentUser?._id);
    // Viewers may only change their own password
    if (isViewer && !isSelf) { setAccessDenied(true); return; }
    setResettingUser(row);
    setResetForm(defaultResetForm);
    setResetOpen(true);
  };

  const openDeactivate = (row) => {
    if (isViewer) { setAccessDenied(true); return; }
    setDeactivateTarget(row);
  };

  const handleAddSave = async () => {
    if (!addForm.name.trim() || !addForm.username.trim() || !addForm.password || !addForm.confirmPassword || !addForm.role) {
      setSnack({ open: true, message: 'All fields are required', severity: 'error' });
      return;
    }
    if (/\s/.test(addForm.username)) {
      setSnack({ open: true, message: 'Username cannot contain spaces', severity: 'error' });
      return;
    }
    if (addForm.password.length < 6) {
      setSnack({ open: true, message: 'Password must be at least 6 characters', severity: 'error' });
      return;
    }
    if (addForm.password !== addForm.confirmPassword) {
      setSnack({ open: true, message: 'Passwords do not match', severity: 'error' });
      return;
    }
    try {
      await usersAPI.create({
        name: addForm.name.trim(),
        username: addForm.username.trim(),
        password: addForm.password,
        role: addForm.role,
      });
      setSnack({ open: true, message: 'User created successfully', severity: 'success' });
      setAddOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error creating user', severity: 'error' });
    }
  };

  const handleEditSave = async () => {
    if (!editForm.name.trim() || !editForm.username.trim()) {
      setSnack({ open: true, message: 'Name and username are required', severity: 'error' });
      return;
    }
    if (/\s/.test(editForm.username)) {
      setSnack({ open: true, message: 'Username cannot contain spaces', severity: 'error' });
      return;
    }
    try {
      await usersAPI.update(editingUser._id, {
        name: editForm.name.trim(),
        username: editForm.username.trim(),
        role: editForm.role,
        isActive: editForm.isActive,
      });
      setSnack({ open: true, message: 'User updated successfully', severity: 'success' });
      setEditOpen(false);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error updating user', severity: 'error' });
    }
  };

  const handleResetSave = async () => {
    if (!resetForm.newPassword || resetForm.newPassword.length < 6) {
      setSnack({ open: true, message: 'New password must be at least 6 characters', severity: 'error' });
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmNewPassword) {
      setSnack({ open: true, message: 'Passwords do not match', severity: 'error' });
      return;
    }
    const isSelf = String(resettingUser?._id) === String(currentUser?._id);
    try {
      if (isSelf) {
        if (!resetForm.currentPassword) {
          setSnack({ open: true, message: 'Current password is required', severity: 'error' });
          return;
        }
        await authAPI.changePassword({
          currentPassword: resetForm.currentPassword,
          newPassword: resetForm.newPassword,
        });
        setSnack({ open: true, message: 'Password changed successfully', severity: 'success' });
      } else {
        await usersAPI.resetPassword(resettingUser._id, { newPassword: resetForm.newPassword });
        setSnack({ open: true, message: 'Password reset', severity: 'success' });
      }
      setResetOpen(false);
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error resetting password', severity: 'error' });
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await usersAPI.deactivate(deactivateTarget._id);
      setSnack({ open: true, message: 'User deactivated', severity: 'success' });
      setDeactivateTarget(null);
      fetchData();
    } catch (err) {
      setSnack({ open: true, message: err.response?.data?.message || 'Error deactivating user', severity: 'error' });
    }
  };

  const renderUserActions = (row) => {
    const isSelf = row._id === currentUser?._id;
    if (isSelf) {
      return (
        <IconButton size="small" onClick={() => openReset(row)} title="Change Password">
          <KeyIcon />
        </IconButton>
      );
    }
    return (
      <>
        <IconButton size="small" onClick={() => openEdit(row)} title="Edit"><EditIcon /></IconButton>
        <IconButton size="small" onClick={() => openReset(row)} title="Reset Password"><KeyIcon /></IconButton>
        <IconButton size="small" color="error" onClick={() => openDeactivate(row)} title="Deactivate"><DeleteIcon /></IconButton>
      </>
    );
  };

  return (
    <Box>
      {isViewer && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You are viewing in read-only mode. Contact admin to make any changes.
        </Alert>
      )}

      <PageToolbar>
        <Typography variant="h5">User Management</Typography>
        <Button variant="contained" fullWidth={isMobile} startIcon={<PersonAdd />} onClick={openAdd}>
          Add New User
        </Button>
      </PageToolbar>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid item xs={6} sm={3} key={card.key}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">{card.label}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ color: card.color }}>
                  {stats[card.key] ?? 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : isMobile ? (
        <Stack spacing={1.5}>
          {!users.length && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No users found.</Typography>
          )}
          {users.map((row) => (
            <Paper key={row._id} variant="outlined" sx={{ p: 1.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                <Box>
                  <Typography fontWeight={700}>{row.name}</Typography>
                  <Typography variant="body2" color="text.secondary">@{row.username}</Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <Chip
                    size="small"
                    label={row.role === 'admin' ? 'Admin' : 'Viewer'}
                    color={row.role === 'admin' ? 'primary' : 'default'}
                  />
                  <Chip
                    size="small"
                    label={row.isActive ? 'Active' : 'Inactive'}
                    color={row.isActive ? 'success' : 'error'}
                  />
                </Stack>
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Last login: {row.lastLogin ? formatDateTime(row.lastLogin) : '—'}
              </Typography>
              <Stack direction="row" spacing={0.5} justifyContent="flex-end" mt={1}>
                {renderUserActions(row)}
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Login</TableCell>
                <TableCell>Created By</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.username}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.role === 'admin' ? 'Admin' : 'Viewer'}
                      color={row.role === 'admin' ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.isActive ? 'Active' : 'Inactive'}
                      color={row.isActive ? 'success' : 'error'}
                    />
                  </TableCell>
                  <TableCell>{row.lastLogin ? formatDateTime(row.lastLogin) : '—'}</TableCell>
                  <TableCell>{row.createdBy || '—'}</TableCell>
                  <TableCell align="right">{renderUserActions(row)}</TableCell>
                </TableRow>
              ))}
              {!users.length && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No users found.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ResponsiveDialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Full Name" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} margin="dense" required />
          <TextField fullWidth label="Username" value={addForm.username} onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))} margin="dense" required helperText="No spaces allowed" />
          <TextField fullWidth type="password" label="Password" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} margin="dense" required helperText="Minimum 6 characters" />
          <TextField fullWidth type="password" label="Confirm Password" value={addForm.confirmPassword} onChange={(e) => setAddForm((f) => ({ ...f, confirmPassword: e.target.value }))} margin="dense" required />
          <FormControl fullWidth margin="dense">
            <InputLabel>Role</InputLabel>
            <Select value={addForm.role} label="Role" onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="viewer">Viewer</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddSave}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Full Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} margin="dense" required />
          <TextField fullWidth label="Username" value={editForm.username} onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} margin="dense" required helperText="No spaces allowed" />
          <FormControl fullWidth margin="dense">
            <InputLabel>Role</InputLabel>
            <Select value={editForm.role} label="Role" onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="viewer">Viewer</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Switch checked={editForm.isActive} onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))} />}
            label={editForm.isActive ? 'Active' : 'Inactive'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave}>Save</Button>
        </DialogActions>
      </ResponsiveDialog>

      <ResponsiveDialog open={resetOpen} onClose={() => setResetOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {String(resettingUser?._id) === String(currentUser?._id)
            ? 'Change Your Password'
            : `Reset Password for ${resettingUser?.username}`}
        </DialogTitle>
        <DialogContent>
          {String(resettingUser?._id) === String(currentUser?._id) ? (
            <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
              Enter your current password, then choose a new one.
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mt: 1, mb: 1 }}>
              This will immediately change the user's password.
            </Alert>
          )}
          {String(resettingUser?._id) === String(currentUser?._id) && (
            <TextField
              fullWidth
              type="password"
              label="Current Password"
              value={resetForm.currentPassword}
              onChange={(e) => setResetForm((f) => ({ ...f, currentPassword: e.target.value }))}
              margin="dense"
              required
            />
          )}
          <TextField fullWidth type="password" label="New Password" value={resetForm.newPassword} onChange={(e) => setResetForm((f) => ({ ...f, newPassword: e.target.value }))} margin="dense" required helperText="Minimum 6 characters" />
          <TextField fullWidth type="password" label="Confirm New Password" value={resetForm.confirmNewPassword} onChange={(e) => setResetForm((f) => ({ ...f, confirmNewPassword: e.target.value }))} margin="dense" required />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleResetSave}>
            {String(resettingUser?._id) === String(currentUser?._id) ? 'Change Password' : 'Reset Password'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      <ConfirmDialog
        open={!!deactivateTarget}
        title="Deactivate User"
        message={`Deactivating ${deactivateTarget?.name || 'this user'} will prevent them from logging in. Their data will NOT be deleted. You can reactivate later.`}
        confirmText="Deactivate"
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />

      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack((p) => ({ ...p, open: false }))}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
      <AccessDeniedSnackbar
        open={accessDenied}
        onClose={() => setAccessDenied(false)}
        message="Access Denied: Viewers cannot perform this action. Please contact the admin."
      />
    </Box>
  );
}
