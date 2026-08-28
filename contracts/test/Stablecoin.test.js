const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Stablecoin", function () {
  async function deploy() {
    const [issuer, alice] = await ethers.getSigners();
    const Stablecoin = await ethers.getContractFactory("Stablecoin");
    const trg = await Stablecoin.deploy("Triangle", "TRG", ethers.parseEther("4000"));
    return { trg, issuer, alice };
  }

  it("mints the initial supply to the issuer", async function () {
    const { trg, issuer } = await deploy();
    expect(await trg.balanceOf(issuer.address)).to.equal(ethers.parseEther("4000"));
    expect(await trg.totalSupply()).to.equal(ethers.parseEther("4000"));
  });

  it("lets the issuer mint additional units", async function () {
    const { trg, issuer, alice } = await deploy();
    await trg.mint(alice.address, ethers.parseEther("100"));
    expect(await trg.balanceOf(alice.address)).to.equal(ethers.parseEther("100"));
  });

  it("rejects mint from a non-issuer", async function () {
    const { trg, alice } = await deploy();
    await expect(trg.connect(alice).mint(alice.address, 1)).to.be.reverted;
  });

  it("lets a holder burn their own units", async function () {
    const { trg, issuer } = await deploy();
    await trg.burn(ethers.parseEther("1000"));
    expect(await trg.balanceOf(issuer.address)).to.equal(ethers.parseEther("3000"));
    expect(await trg.totalSupply()).to.equal(ethers.parseEther("3000"));
  });
});
