const crypto = require("crypto");

function generateLicenseKey() {
    const part = () =>
        crypto
            .randomBytes(3)
            .toString("hex")
            .toUpperCase()
            .substring(0, 4);

    return `RG-${part()}-${part()}-${part()}`;
}

module.exports = generateLicenseKey;