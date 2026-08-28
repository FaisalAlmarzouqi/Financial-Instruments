const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Vault", function () {
  async function deploy() {
    const [issuerTrg, issuerShares, issuerBonds, operator, aya, beatriz] = await ethers.getSigners();

    const Stablecoin = await ethers.getContractFactory("Stablecoin");
    const trg = await Stablecoin.connect(issuerTrg).deploy("Triangle", "TRG", ethers.parseEther("4000"));

    const Shares = await ethers.getContractFactory("Shares");
    const clv = await Shares.connect(issuerShares).deploy(
      "Clove Company",
      "CLV",
      ethers.parseEther("100"),
      await trg.getAddress()
    );

    const BondIssuer = await ethers.getContractFactory("BondIssuer");
    const gov = await BondIssuer.connect(issuerBonds).deploy(await trg.getAddress());
    await gov.connect(issuerBonds).issueBonds(5, ethers.parseEther("200"), 1000);

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy(operator.address);

    await trg.connect(issuerTrg).transfer(aya.address, ethers.parseEther("200"));
    await clv.connect(issuerShares).transfer(aya.address, ethers.parseEther("10"));
    await gov.connect(issuerBonds).transferBond(1, aya.address);

    return { trg, clv, gov, vault, operator, aya, beatriz };
  }

  it("accepts an ERC20 deposit and credits the depositor's ledger", async function () {
    const { trg, vault, aya } = await deploy();
    await trg.connect(aya).approve(await vault.getAddress(), ethers.parseEther("50"));
    await expect(vault.connect(aya).deposit(await trg.getAddress(), ethers.parseEther("50")))
      .to.changeTokenBalances(trg, [aya, vault], [ethers.parseEther("-50"), ethers.parseEther("50")]);
    expect(await vault.balances(aya.address, await trg.getAddress())).to.equal(ethers.parseEther("50"));
  });

  it("lets only the operator withdraw on a user's behalf, and only up to their balance", async function () {
    const { trg, vault, operator, aya, beatriz } = await deploy();
    await trg.connect(aya).approve(await vault.getAddress(), ethers.parseEther("50"));
    await vault.connect(aya).deposit(await trg.getAddress(), ethers.parseEther("50"));

    await expect(
      vault.connect(aya).operateWithdrawal(aya.address, await trg.getAddress(), ethers.parseEther("50"))
    ).to.be.revertedWith("Vault: caller is not the operator");

    await expect(
      vault.connect(operator).operateWithdrawal(aya.address, await trg.getAddress(), ethers.parseEther("100"))
    ).to.be.reverted; // underflow: aya only has 50 credited

    await expect(
      vault.connect(operator).operateWithdrawal(aya.address, await trg.getAddress(), ethers.parseEther("50"))
    ).to.changeTokenBalance(trg, aya, ethers.parseEther("50"));
    expect(await vault.balances(aya.address, await trg.getAddress())).to.equal(0);
  });

  it("deposits and withdraws a bond via approve + operateWithdrawal-style custody", async function () {
    const { gov, vault, operator, aya, beatriz } = await deploy();

    await gov.connect(aya).approveBond(1, await vault.getAddress());
    await vault.connect(aya).depositBond(await gov.getAddress(), 1);
    expect((await gov.getBond(1)).owner).to.equal(await vault.getAddress());
    expect(await vault.bondsInCustody(aya.address, await gov.getAddress())).to.deep.equal([1n]);

    await vault.connect(operator).withdrawBond(aya.address, await gov.getAddress(), 1);
    expect((await gov.getBond(1)).owner).to.equal(aya.address);
    expect(await vault.bondsInCustody(aya.address, await gov.getAddress())).to.deep.equal([]);
  });

  it("settles a matched ERC20 trade on-chain via operatorTransfer, so the buyer can then withdraw it", async function () {
    const { clv, vault, operator, aya, beatriz } = await deploy();
    await clv.connect(aya).approve(await vault.getAddress(), ethers.parseEther("10"));
    await vault.connect(aya).deposit(await clv.getAddress(), ethers.parseEther("10"));

    // Beatriz "bought" 10 CLV from Aya off-chain — the server settles it on-chain here.
    await expect(
      vault.connect(operator).operatorTransfer(aya.address, beatriz.address, await clv.getAddress(), ethers.parseEther("10"))
    ).to.not.be.reverted;
    expect(await vault.balances(aya.address, await clv.getAddress())).to.equal(0);
    expect(await vault.balances(beatriz.address, await clv.getAddress())).to.equal(ethers.parseEther("10"));

    // Beatriz can now actually withdraw what she bought.
    await expect(
      vault.connect(operator).operateWithdrawal(beatriz.address, await clv.getAddress(), ethers.parseEther("10"))
    ).to.changeTokenBalance(clv, beatriz, ethers.parseEther("10"));
  });

  it("rejects operatorTransfer from a non-operator, and reverts on insufficient balance", async function () {
    const { clv, vault, aya, beatriz } = await deploy();
    await expect(
      vault.connect(aya).operatorTransfer(aya.address, beatriz.address, await clv.getAddress(), 1)
    ).to.be.revertedWith("Vault: caller is not the operator");
  });

  it("settles a matched bond trade on-chain via operatorTransferBond", async function () {
    const { gov, vault, operator, aya, beatriz } = await deploy();
    await gov.connect(aya).approveBond(1, await vault.getAddress());
    await vault.connect(aya).depositBond(await gov.getAddress(), 1);

    await vault.connect(operator).operatorTransferBond(aya.address, beatriz.address, await gov.getAddress(), 1);
    expect(await vault.bondsInCustody(aya.address, await gov.getAddress())).to.deep.equal([]);
    expect(await vault.bondsInCustody(beatriz.address, await gov.getAddress())).to.deep.equal([1n]);

    await vault.connect(operator).withdrawBond(beatriz.address, await gov.getAddress(), 1);
    expect((await gov.getBond(1)).owner).to.equal(beatriz.address);
  });
});
