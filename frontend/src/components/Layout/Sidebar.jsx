import React from 'react';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Box,
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import InventoryIcon from '@mui/icons-material/Inventory';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FactoryIcon from '@mui/icons-material/Factory';
import WarehouseIcon from '@mui/icons-material/Warehouse';

const drawerWidth = 260;

const menuGroups = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> }],
  },
  {
    title: 'Procurement',
    items: [
      { label: 'Suppliers', path: '/suppliers', icon: <PeopleIcon /> },
      { label: 'Coil Stock', path: '/raw-materials', icon: <InventoryIcon /> },
      { label: 'Low Stock Alerts', path: '/low-stock', icon: <WarningAmberIcon /> },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Customers', path: '/customers', icon: <PeopleIcon /> },
      { label: 'Orders', path: '/orders', icon: <ShoppingCartIcon /> },
      { label: 'Ready Stock', path: '/ready-stock', icon: <WarehouseIcon /> },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Daily Book', path: '/daily-book', icon: <ReceiptIcon /> },
      { label: 'Bank Account', path: '/bank', icon: <AccountBalanceIcon /> },
      { label: 'Workers', path: '/workers', icon: <PeopleIcon /> },
      { label: 'Expenses', path: '/expenses', icon: <AccountBalanceWalletIcon /> },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { label: 'Reports', path: '/reports', icon: <AssessmentIcon /> },
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();

  const drawer = (
    <Box sx={{ pt: 2 }}>
      <Box sx={{ px: 2, pb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FactoryIcon sx={{ color: 'primary.light' }} />
        <Typography variant="h6" sx={{ color: '#E8EDF3', fontWeight: 700 }}>WMS</Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
      {menuGroups.map((group) => (
        <Box key={group.title}>
          <Typography variant="caption" sx={{ px: 2, py: 1, display: 'block', color: 'rgba(203,213,225,0.65)', fontWeight: 600, letterSpacing: 0.6 }}>
            {group.title}
          </Typography>
          <List dense>
            {group.items.map((item) => (
              <ListItemButton
                key={item.path + (item.state?.tab ?? '')}
                selected={location.pathname === item.path && (item.state?.tab == null || location.state?.tab === item.state?.tab)}
                onClick={() => { navigate(item.path, { state: item.state || {} }); onClose?.(); }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      ))}
    </Box>
  );

  return (
    <Drawer
      variant="temporary"
      open={open}
      onClose={onClose}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', mt: 7 },
      }}
    >
      {drawer}
    </Drawer>
  );
}
