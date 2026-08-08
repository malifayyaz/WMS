import { createTheme } from '@mui/material/styles';

const primary = {
  main: '#5A8AAF',
  light: '#7BA8C8',
  dark: '#3D5F78',
  contrastText: '#FFFFFF',
};

const sidebarBg = '#354656';
const navbarBg = '#3A4A58';

export default createTheme({
  palette: {
    mode: 'light',
    primary,
    secondary: { main: '#6B7D8F', light: '#8A9AAD', dark: '#4F5E6D', contrastText: '#FFFFFF' },
    success: { main: '#3D9A6A' },
    warning: { main: '#D97706' },
    error: { main: '#DC4C4C' },
    background: { default: '#EBF1F7', paper: '#F5F8FC' },
    text: { primary: '#1E2A36', secondary: '#4A5C6D' },
    divider: 'rgba(30, 42, 54, 0.12)',
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Roboto", "Arial", sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { WebkitTextSizeAdjust: '100%' },
        body: { overflowX: 'hidden' },
        '#root': { minWidth: 0, maxWidth: '100%' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: navbarBg,
          color: '#E8EDF3',
          backgroundImage: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          '& .MuiIconButton-root': { color: '#E8EDF3' },
        },
      },
    },
    MuiTabs: {
      defaultProps: {
        variant: 'scrollable',
        allowScrollButtonsMobile: true,
      },
      styleOverrides: {
        root: { minHeight: 42 },
        scrollButtons: {
          '&.Mui-disabled': { opacity: 0.3 },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          minHeight: 42,
          '@media (max-width:600px)': {
            minWidth: 'auto',
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: '0.8125rem',
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          maxWidth: '100%',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          '@media (max-width:600px)': {
            padding: '10px 8px',
          },
        },
        head: {
          backgroundColor: '#E2E9F1',
          fontWeight: 600,
          color: '#1E2A36',
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          '@media (max-width:600px)': {
            margin: 0,
            width: '100%',
            maxWidth: '100%',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '@media (max-width:600px)': {
            padding: 10,
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: sidebarBg,
          color: '#CBD5E1',
          borderRight: 'none',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          mx: 1,
          color: '#CBD5E1',
          '& .MuiListItemIcon-root': { color: '#94A3B8' },
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
          '&.Mui-selected': {
            backgroundColor: 'rgba(90, 138, 175, 0.28)',
            color: '#FFFFFF',
            '& .MuiListItemIcon-root': { color: primary.light },
            '&:hover': { backgroundColor: 'rgba(90, 138, 175, 0.36)' },
          },
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontWeight: 500 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#F5F8FC',
          boxShadow: '0 2px 10px rgba(30, 42, 54, 0.08)',
          border: '1px solid rgba(30, 42, 54, 0.06)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          '@media (max-width:600px)': {
            minHeight: 40,
          },
        },
      },
    },
  },
});
