
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './src/router';
import { Toaster } from 'sonner';
import { AuthProvider } from './src/contexts/AuthContext';
import { OnboardingProvider } from './src/contexts/OnboardingContext';
import { ErrorBoundary } from './src/components/App/Auth/ErrorBoundary';
import './src/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <OnboardingProvider>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </OnboardingProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
