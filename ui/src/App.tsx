import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './store/context';
import { AuthProvider } from './store/auth';
import Landing from './components/Landing';
import './App.css';

// Auth is not yet available — all protected routes redirect to the landing page.
function ProtectedRoute() {
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Landing />} />
            <Route path="*" element={<ProtectedRoute />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
