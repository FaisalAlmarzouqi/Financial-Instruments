const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Shares", function () {
  async function deploy() {
    const [issuerTrg, issuerShares, alice, bob] = await ethers.getSigners();
    const Stablecoin = await ethers.getContractFactory("Stablecoin");
    const trg = await Stablecoin.connect(issuerTrg).deploy("Triangle", "TRG", ethers.parseEther("4000"));

    const Shares = await ethers.getContractFactory("Shares");
    const clv = await Shares.connect(issuerShares).deploy(
      "Clove Company",
      "CLV",
      ethers.parseEther("100"),
      await trg.getAddress()
    );

    // Fund the shares issuer with TRG so it can pay a dividend, and split shares 50/50.
    await trg.connect(issuerTrg).transfer(issuerShares.address, ethers.parseEther("1000"));
    await clv.connect(issuerShares).transfer(alice.address, ethers.parseEther("50"));
    await clv.connect(issuerShares).transfer(bob.address, ethers.parseEther("50"));

    return { trg, clv, issuerShares, alice, bob };
  }

  it("splits a dividend proportionally to holders at payout time", async function () {
    const { trg, clv, issuerShares, alice, bob } = await deploy();

    await trg.connect(issuerShares).approve(await clv.getAddress(), ethers.parseEther("100"));
    await clv.connect(issuerShares).payDividend(ethers.parseEther("100"));

    expect(await clv.withdrawableDividend(alice.address)).to.equal(ethers.parseEther("50"));
    expect(await clv.withdrawableDividend(bob.address)).to.equal(ethers.parseEther("50"));

    await expect(clv.connect(alice).withdrawDividend()).to.changeTokenBalance(
      trg,
      alice,
      ethers.parseEther("50")
    );
    expect(await clv.withdrawableDividend(alice.address)).to.equal(0);
  });

  it("keeps dividend entitlement correct across a transfer that happens between payouts", async function () {
    const { trg, clv, issuerShares, alice, bob } = await deploy();

    // First payout while alice/bob hold 50/50.
    await trg.connect(issuerShares).approve(await clv.getAddress(), ethers.parseEther("200"));
    await clv.connect(issuerShares).payDividend(ethers.parseEther("100"));

    // Alice transfers all her shares to bob before withdrawing — her already-accrued
    // dividend must not move with the shares.
    await clv.connect(alice).transfer(bob.address, ethers.parseEther("50"));

    expect(await clv.withdrawableDividend(alice.address)).to.equal(ethers.parseEther("50"));
    expect(await clv.withdrawableDividend(bob.address)).to.equal(ethers.parseEther("50"));

    // Second payout: bob now holds 100% of supply.
    await clv.connect(issuerShares).payDividend(ethers.parseEther("100"));
    expect(await clv.withdrawableDividend(alice.address)).to.equal(ethers.parseEther("50")); // unchanged
    expect(await clv.withdrawableDividend(bob.address)).to.equal(ethers.parseEther("150")); // 50 + 100
  });
});
