import React, { useState } from 'react';
import { AppBar, Toolbar, Typography, IconButton, Menu, MenuItem, Box } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import Logout from '@mui/icons-material/Logout';
import { useAuth } from '../../context/AuthContext';

export default function Navbar({ title, onMenuClick }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const { user, logout } = useAuth();

  const handleMenu = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleLogout = () => {
    handleClose();
    logout();
    window.location.href = '/login';
  };

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 1, sm: 2 } }}>
        <IconButton color="inherit" edge="start" onClick={onMenuClick} sx={{ mr: { xs: 1, sm: 2 } }} aria-label="Open menu">
          <MenuIcon />
        </IconButton>
        <Typography
          variant="h6"
          noWrap
          component="div"
          sx={{
            flexGrow: 1,
            fontSize: { xs: '1rem', sm: '1.25rem' },
            minWidth: 0,
          }}
        >
          {title}
        </Typography>
        <Box display="flex" alignItems="center" gap={{ xs: 0.5, sm: 1 }} sx={{ flexShrink: 0 }}>
          <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {user?.name || user?.username}
          </Typography>
          <IconButton color="inherit" onClick={handleMenu} aria-label="Account menu">
            <Logout />
          </IconButton>
        </Box>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
          <MenuItem disabled sx={{ display: { xs: 'flex', sm: 'none' }, opacity: 1 }}>
            {user?.name || user?.username}
          </MenuItem>
          <MenuItem onClick={handleLogout}>Logout</MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
