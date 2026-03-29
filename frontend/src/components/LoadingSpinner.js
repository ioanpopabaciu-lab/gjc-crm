import React from 'react';
import { RefreshCw } from 'lucide-react';

const LoadingSpinner = () => (
  <div className="loading-spinner" data-testid="loading-spinner">
    <RefreshCw className="spin" size={32} />
    <span>Se încarcă...</span>
  </div>
);

export default LoadingSpinner;
