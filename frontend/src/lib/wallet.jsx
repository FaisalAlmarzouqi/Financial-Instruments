import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getBrowserProvider } from "./chain";
import { api } from "./api";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [user, setUser] = useState(null);

  const refreshRegistration = useCallback(async (addr) => {
    const u = await api.getUser(addr);
    setUser(u);
    return u;
  }, []);

  const connect = useCallback(async () => {
    const provider = getBrowserProvider();
    const accounts = await provider.send("eth_requestAccounts", []);
    const addr = accounts[0];
    setAddress(addr);
    await refreshRegistration(addr);
    return addr;
  }, [refreshRegistration]);

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const handler = (accounts) => {
      if (accounts.length === 0) {
        setAddress(null);
        setUser(null);
      } else {
        setAddress(accounts[0]);
        refreshRegistration(accounts[0]);
      }
    };
    window.ethereum.on("accountsChanged", handler);
    return () => window.ethereum.removeListener?.("accountsChanged", handler);
  }, [refreshRegistration]);

  return (
    <WalletContext.Provider value={{ address, user, connect, refreshRegistration }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
