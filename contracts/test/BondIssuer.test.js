const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("BondIssuer", function () {
  async function deploy() {
    const [issuerTrg, issuerBonds, aya, beatriz] = await ethers.getSigners();
    const Stablecoin = await ethers.getContractFactory("Stablecoin");
    const trg = await Stablecoin.connect(issuerTrg).deploy("Triangle", "TRG", ethers.parseEther("4000"));

    const BondIssuer = await ethers.getContractFactory("BondIssuer");
    const gov = await BondIssuer.connect(issuerBonds).deploy(await trg.getAddress());
    await gov.connect(issuerBonds).issueBonds(20, ethers.parseEther("200"), 1000); // 10%

    await trg.connect(issuerTrg).transfer(issuerBonds.address, ethers.parseEther("1000"));

    return { trg, gov, issuerBonds, aya, beatriz };
  }

  it("issues bonds with sequential serials owned by the issuer", async function () {
    const { gov, issuerBonds } = await deploy();
    const bond1 = await gov.getBond(1);
    expect(bond1.owner).to.equal(issuerBonds.address);
    expect(bond1.principal).to.equal(ethers.parseEther("200"));
    expect(bond1.interestRateBps).to.equal(1000);
    expect(bond1.repaid).to.equal(false);
    expect(bond1.maturityDate - bond1.issuanceDate).to.equal(365n * 24n * 60n * 60n);
  });

  it("transfers a bond directly (used by the populate script)", async function () {
    const { gov, issuerBonds, aya } = await deploy();
    await gov.connect(issuerBonds).transferBond(1, aya.address);
    expect((await gov.getBond(1)).owner).to.equal(aya.address);
    expect(await gov.bondsOf(aya.address)).to.deep.equal([1n]);
  });

  it("supports approve + transferFrom for a custodian (Vault) to pull a bond", async function () {
    const { gov, issuerBonds, aya, beatriz } = await deploy();
    await gov.connect(issuerBonds).transferBond(1, aya.address);

    await gov.connect(aya).approveBond(1, beatriz.address);
    await gov.connect(beatriz).transferBondFrom(1, aya.address, beatriz.address);
    expect((await gov.getBond(1)).owner).to.equal(beatriz.address);

    await expect(gov.connect(aya).transferBondFrom(1, beatriz.address, aya.address)).to.be.reverted;
  });

  it("rejects repay before maturity, pays principal+interest after", async function () {
    const { trg, gov, issuerBonds, aya } = await deploy();
    await gov.connect(issuerBonds).transferBond(1, aya.address);

    await expect(gov.repay(1)).to.be.revertedWith("BondIssuer: not matured");

    await time.increase(365 * 24 * 60 * 60 + 1);
    await trg.connect(issuerBonds).approve(await gov.getAddress(), ethers.parseEther("220"));

    await expect(gov.repay(1)).to.changeTokenBalance(trg, aya, ethers.parseEther("220")); // 200 + 10%
    expect((await gov.getBond(1)).repaid).to.equal(true);
    await expect(gov.repay(1)).to.be.revertedWith("BondIssuer: already repaid");
  });
});
