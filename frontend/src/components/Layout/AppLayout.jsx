import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import AIAssistant from '../AI/AIAssistant';
import SessionTimeoutWarning from '../Auth/SessionTimeoutWarning';
import { useIsCompact } from '../../hooks/useBreakpoint';

/**
 * Wrapper for authenticated pages: persistent navbar + collapsible sidebar + main content.
 */
export default function AppLayout({ title, children }) {
  const isCompact = useIsCompact();
  const [sidebarOpen, setSidebarOpen] = useState(!isCompact);

  // Close drawer when entering compact view; open by default on desktop.
  useEffect(() => {
    setSidebarOpen(!isCompact);
  }, [isCompact]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default', overflowX: 'hidden' }}>
      <Navbar title={title} onMenuClick={() => setSidebarOpen((v) => !v)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          mt: 7,
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </Box>
      <AIAssistant />
      <SessionTimeoutWarning />
    </Box>
  );
}
