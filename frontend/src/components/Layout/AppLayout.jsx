import React, { useState } from 'react';
import { Box } from '@mui/material';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import AIAssistant from '../AI/AIAssistant';
import SessionTimeoutWarning from '../Auth/SessionTimeoutWarning';

/**
 * Wrapper for authenticated pages: persistent navbar + collapsible sidebar + main content.
 */
export default function AppLayout({ title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Navbar title={title} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 7,
          ml: sidebarOpen ? 0 : 0,
          width: '100%',
        }}
      >
        {children}
      </Box>
      <AIAssistant />
      <SessionTimeoutWarning />
    </Box>
  );
}
