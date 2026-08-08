import { useAuth } from '../context/AuthContext';

export const usePermissions = () => {
  const { user } = useAuth();
  return {
    isAdmin: user?.role === 'admin',
    isViewer: user?.role === 'viewer',
    canWrite: user?.role !== 'viewer',
    canUseAgent: user?.role === 'admin',
  };
};
