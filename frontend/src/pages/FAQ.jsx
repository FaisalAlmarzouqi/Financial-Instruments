export default function FAQ() {
  return (
    <div className="page faq">
      <h1>FAQ</h1>

      <h3>How do I get started?</h3>
      <p>
        Click <strong>Connect Wallet</strong> on the homepage and approve the connection
        in MetaMask. The first time you connect a new address, you'll be asked for your
        legal name and a passport picture — this is stored for reference but not
        verified automatically.
      </p>

      <h3>How do I sell an asset?</h3>
      <p>
        Open the asset's page, choose <strong>Sell</strong> and either <strong>Limit
        order</strong> (pick your own price) or <strong>Market price</strong>. Placing a
        sell order asks MetaMask to approve and deposit the units into the platform's
        vault contract, then lists the order on the order book.
      </p>

      <h3>How do I buy an asset?</h3>
      <p>
        Same asset page, choose <strong>Buy</strong>. A limit order rests in the book at
        your chosen price; a market order fills immediately against the best resting
        sell order. Buying also deposits the TRG needed to cover the trade into the
        vault first.
      </p>

      <h3>What's the difference between "on platform" and "total available" on my Portfolio?</h3>
      <p>
        "On platform" is what you've deposited into the vault contract and is available
        to trade with (not already reserved behind an open order). "Total available" is
        that plus whatever is still sitting in your own wallet on-chain.
      </p>

      <h3>How do I get my funds back into my wallet?</h3>
      <p>
        On the Portfolio page, click <strong>Withdraw</strong> next to any asset you have
        on the platform. This triggers an on-chain transaction moving it from the vault
        back to your wallet.
      </p>

      <h3>What are TRG, CLV, ROO and GOV?</h3>
      <p>
        TRG (Triangle) is the platform's stablecoin — the currency every trade is priced
        in. CLV (Clove Company) and ROO (Rooibos Limited) are company shares. GOV is a
        government bond: a 1-year, fixed-interest instrument that repays principal plus
        interest to whoever holds it at maturity.
      </p>
    </div>
  );
}
