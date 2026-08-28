const express = require("express");
const cors = require("cors");
const path = require("path");
const { PORT, UPLOADS_DIR } = require("./config");
const { seedAssetsFromDeployments } = require("./db/seed");

seedAssetsFromDeployments();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/api/config", require("./routes/config"));
app.use("/api/assets", require("./routes/assets"));
app.use("/api/users", require("./routes/users"));
app.use("/api/portfolio", require("./routes/portfolio"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/deposits", require("./routes/deposits"));
app.use("/api/withdrawals", require("./routes/withdrawals"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
