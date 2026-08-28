import { Routes, Route, Link } from "react-router-dom";
import { WalletProvider } from "./lib/wallet";
import WalletConnect from "./components/WalletConnect";
import Home from "./pages/Home";
import AssetPage from "./pages/AssetPage";
import Portfolio from "./pages/Portfolio";
import FAQ from "./pages/FAQ";

export default function App() {
  return (
    <WalletProvider>
      <div className="app">
        <nav className="navbar">
          <Link to="/" className="brand">
            Triangle
          </Link>
          <div className="nav-links">
            <Link to="/portfolio">Portfolio</Link>
            <Link to="/faq">FAQ</Link>
          </div>
          <WalletConnect />
        </nav>

        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/asset/:symbol" element={<AssetPage />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/faq" element={<FAQ />} />
          </Routes>
        </main>
      </div>
    </WalletProvider>
  );
}
