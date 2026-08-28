const express = require("express");
const multer = require("multer");
const path = require("path");
const { ethers } = require("ethers");
const { getUserByWallet, createUser } = require("../db/helpers");
const { UPLOADS_DIR } = require("../config");

const router = express.Router();

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

router.get("/:wallet", (req, res) => {
  if (!ethers.isAddress(req.params.wallet)) return res.status(400).json({ error: "Invalid address" });
  const user = getUserByWallet(req.params.wallet);
  if (!user) return res.status(404).json({ error: "Not registered" });
  res.json({
    walletAddress: user.wallet_address,
    legalName: user.legal_name,
    registeredAt: user.registered_at,
  });
});

router.post("/register", upload.single("passportImage"), (req, res) => {
  const { walletAddress, legalName } = req.body;
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: "Valid walletAddress is required" });
  }
  if (!legalName || !legalName.trim()) {
    return res.status(400).json({ error: "legalName is required" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "passportImage is required" });
  }
  if (getUserByWallet(walletAddress)) {
    return res.status(409).json({ error: "Wallet already registered" });
  }

  createUser(walletAddress, legalName.trim(), req.file.filename);
  res.status(201).json({ walletAddress: walletAddress.toLowerCase(), legalName: legalName.trim() });
});

module.exports = router;
