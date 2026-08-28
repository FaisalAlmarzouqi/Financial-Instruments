const { execSync } = require("child_process");
const path = require("path");

execSync("docker compose down", { stdio: "inherit", cwd: __dirname });
console.log("Network stopped. Chain data preserved under network/data/ (delete it for a clean restart).");
