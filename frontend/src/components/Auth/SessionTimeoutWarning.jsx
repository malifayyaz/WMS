import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Snackbar, Alert, Button } from '@mui/material';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const WARNING_AFTER_MS = (1 * 60 + 45) * 60 * 1000; // 1 hour 45 minutes
const LOGOUT_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours
const ACTIVITY_EVENTS = ['mousemove', 'keypress', 'click'];

/**
 * Warns before idle session expiry and logs out after 2 hours of inactivity.
 */
export default function SessionTimeoutWarning() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [warningOpen, setWarningOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const warningShownRef = useRef(false);
  const checkIntervalRef = useRef(null);

  const forceLogout = useCallback(() => {
    logout();
    window.alert('Session expired. Please login again.');
    navigate('/login', { replace: true });
  }, [navigate, logout]);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    setWarningOpen(false);
  }, []);

  const handleStayLoggedIn = useCallback(async () => {
    try {
      await authAPI.getProfile();
      resetActivity();
    } catch {
      forceLogout();
    }
  }, [resetActivity, forceLogout]);

  useEffect(() => {
    const onActivity = () => {
      // Don't reset while the warning is visible — user must click "Stay Logged In"
      if (warningShownRef.current) return;
      lastActivityRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, onActivity, { passive: true });
    });

    checkIntervalRef.current = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;

      if (idleMs >= LOGOUT_AFTER_MS) {
        setWarningOpen(false);
        forceLogout();
        return;
      }

      if (idleMs >= WARNING_AFTER_MS && !warningShownRef.current) {
        warningShownRef.current = true;
        setWarningOpen(true);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, onActivity);
      });
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [forceLogout]);

  return (
    <Snackbar
      open={warningOpen}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        severity="warning"
        variant="filled"
        action={
          <Button color="inherit" size="small" onClick={handleStayLoggedIn}>
            Stay Logged In
          </Button>
        }
        sx={{ width: '100%' }}
      >
        You will be logged out in 15 minutes due to inactivity.
      </Alert>
    </Snackbar>
  );
}
