import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  InputAdornment,
  IconButton,
  Alert,
  CircularProgress,
  Grid,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FactoryIcon from '@mui/icons-material/Factory';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { useAuth } from '../context/AuthContext';

const LOGIN_BG = `${process.env.PUBLIC_URL}/images/login/wire-bundle-bg.png`;

const features = [
  { icon: <Inventory2OutlinedIcon />, title: 'Inventory', desc: 'Raw material stock & low-stock alerts' },
  { icon: <ReceiptLongOutlinedIcon />, title: 'Orders & Finance', desc: 'Customer orders, daily book & expenses' },
  { icon: <TrendingUpOutlinedIcon />, title: 'Reports', desc: 'Profit/loss and business analytics' },
];

function extractLockMinutes(message) {
  if (!message) return null;
  const match = message.match(/(\d+)\s*minute/i);
  return match ? match[1] : null;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockMessage, setLockMessage] = useState('');
  const [attemptWarning, setAttemptWarning] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = useRef(null);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (!authLoading && user) {
      navigate(from, { replace: true });
    }
  }, [authLoading, user, navigate, from]);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setCooldown(3);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLockMessage('');
    setAttemptWarning('');
    setLoading(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || 'Invalid username or password';

      if (status === 423) {
        const minutes = extractLockMinutes(message) || '5';
        setLockMessage(`Account temporarily locked. Try again in ${minutes} minutes.`);
      } else if (message.includes('attempt(s) remaining')) {
        setAttemptWarning(message);
      } else {
        setError(message);
      }
      startCooldown();
    } finally {
      setLoading(false);
    }
  };

  const buttonDisabled = loading || cooldown > 0;
  const buttonLabel = loading
    ? null
    : cooldown > 0
      ? `Try again in ${cooldown}...`
      : 'Sign in to dashboard';

  return (
    <Box sx={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${LOGIN_BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          transform: 'scale(1.02)',
          filter: 'saturate(0.9) contrast(1.05)',
        }}
      />

      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(105deg, rgba(30, 42, 54, 0.82) 0%, rgba(45, 58, 70, 0.72) 42%, rgba(30, 42, 54, 0.88) 100%)',
        }}
      />

      <Grid
        container
        sx={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          alignItems: 'stretch',
        }}
      >
        <Grid
          item
          xs={12}
          md={7}
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            justifyContent: 'space-between',
            p: { md: 5, lg: 6 },
            color: '#E8EDF3',
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FactoryIcon />
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={700} lineHeight={1.2}>
                Wire Manufacturing System
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                Complete warehouse & production management
              </Typography>
            </Box>
          </Box>

          <Box sx={{ maxWidth: 520 }}>
            <Typography variant="h3" fontWeight={700} sx={{ mb: 2, lineHeight: 1.15 }}>
              Manage your wire business with confidence
            </Typography>
            <Typography variant="h6" sx={{ opacity: 0.9, fontWeight: 400, lineHeight: 1.5 }}>
              Track suppliers, customers, orders, inventory, and finances from one secure dashboard.
            </Typography>
          </Box>

          <Grid container spacing={2} sx={{ maxWidth: 640 }}>
            {features.map((f) => (
              <Grid item xs={12} sm={4} key={f.title}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    height: '100%',
                  }}
                >
                  <Box sx={{ color: 'primary.light', mb: 1 }}>{f.icon}</Box>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {f.title}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>
                    {f.desc}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Grid>

        <Grid
          item
          xs={12}
          md={5}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Paper
            elevation={8}
            component="form"
            onSubmit={handleSubmit}
            sx={{
              width: '100%',
              maxWidth: 440,
              p: { xs: 3, sm: 4 },
              borderRadius: 3,
              bgcolor: '#2A3642',
              color: '#E8EDF3',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Box display={{ xs: 'flex', md: 'none' }} alignItems="center" gap={1.5} mb={2}>
              <FactoryIcon sx={{ color: 'primary.light' }} />
              <Typography variant="h6" fontWeight={700}>
                Wire Manufacturing System
              </Typography>
            </Box>

            <Typography variant="h5" fontWeight={700} gutterBottom>
              Sign in
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.8, mb: 3 }}>
              Enter your credentials to access the dashboard
            </Typography>

            <Box sx={{ mt: 1 }}>
              <Typography component="label" variant="body2" sx={{ mb: 0.75, display: 'block', color: '#E8EDF3', fontWeight: 500 }}>
                Username
              </Typography>
              <TextField
                fullWidth
                hiddenLabel
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'rgba(255,255,255,0.08)',
                    color: '#E8EDF3',
                  },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
                  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.4)',
                  },
                }}
              />
            </Box>
            <Box sx={{ mt: 2 }}>
              <Typography component="label" variant="body2" sx={{ mb: 0.75, display: 'block', color: '#E8EDF3', fontWeight: 500 }}>
                Password
              </Typography>
              <TextField
                fullWidth
                hiddenLabel
                placeholder="Enter password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'rgba(255,255,255,0.08)',
                    color: '#E8EDF3',
                  },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.25)' },
                  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.4)',
                  },
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        aria-label="toggle password"
                        sx={{ color: 'rgba(232,237,243,0.7)' }}
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {lockMessage && (
              <Alert severity="error" icon={<LockOutlinedIcon fontSize="inherit" />} sx={{ mt: 2 }}>
                {lockMessage}
              </Alert>
            )}

            {attemptWarning && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {attemptWarning}
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={buttonDisabled}
              sx={{ mt: 3, py: 1.4 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : buttonLabel}
            </Button>

            <Typography variant="caption" display="block" textAlign="center" sx={{ mt: 3, opacity: 0.55 }}>
              © {new Date().getFullYear()} Wire Manufacturing System
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
