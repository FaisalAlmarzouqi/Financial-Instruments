import { useState } from "react";
import { useWallet } from "../lib/wallet";
import { api } from "../lib/api";

function RegisterModal({ address, onDone }) {
  const [legalName, setLegalName] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!legalName.trim() || !file) {
      setError("Legal name and a passport picture are both required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("walletAddress", address);
      formData.append("legalName", legalName.trim());
      formData.append("passportImage", file);
      await api.register(formData);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>Complete your registration</h2>
        <p className="muted">
          First time connecting <code>{address}</code>. We need your legal name and a
          passport picture on file before you can trade.
        </p>
        <label>
          Legal name
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Jane Doe" />
        </label>
        <label>
          Passport picture
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Registering..." : "Register"}
        </button>
      </form>
    </div>
  );
}

export default function WalletConnect() {
  const { address, user, connect, refreshRegistration } = useWallet();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    setConnecting(true);
    setError("");
    try {
      await connect();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  if (!address) {
    return (
      <div className="wallet-connect">
        <button onClick={handleConnect} disabled={connecting}>
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      <span className="connected-pill">
        Connected: {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      {!user && (
        <RegisterModal address={address} onDone={() => refreshRegistration(address)} />
      )}
    </div>
  );
}
