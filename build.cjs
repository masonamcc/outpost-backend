const { execSync } = require("child_process");
const { version } = require("./package.json");

execSync(
    `docker buildx build --platform linux/amd64,linux/arm64 -t masonamcc/rackie-backend-npe:${version} --push .`,
    { stdio: "inherit" }
);