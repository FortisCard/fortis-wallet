import React, { createContext, useContext, useState } from 'react';
import NfcPrompt from './NfcPrompt';

type NfcContextType = {
  showNfcPrompt: () => void;
  hideNfcPrompt: () => void;
};

const NfcContext = createContext<NfcContextType | null>(null);

export const useNfc = () => {
  const context = useContext(NfcContext);
  if (!context) {
    throw new Error('useNfc must be used within an NfcProvider');
  }
  return context;
};

export const NfcProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);

  const showNfcPrompt = () => {
    setVisible(true);
  };

  const hideNfcPrompt = () => {
    setVisible(false);
  };

  return (
    <NfcContext.Provider value={{ showNfcPrompt, hideNfcPrompt }}>
      {children}
      <NfcPrompt visible={visible} onClose={hideNfcPrompt} />
    </NfcContext.Provider>
  );
};
