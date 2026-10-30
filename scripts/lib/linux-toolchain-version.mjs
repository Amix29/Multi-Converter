export function toolchainVersionFailure(command, output, rustMinimum) {
  if (!["node", "npm", "rustc", "cargo"].includes(command)) return null;
  const version = String(output).match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)/u);
  if (!version) return `Cannot read the ${command} version.`;
  const actual = version.slice(1).map(Number);
  if (command === "node" && actual[0] !== 24) return "Linux Node.js must use the supported 24.x line.";
  if (command === "npm" && actual[0] !== 11) return "Linux npm must use the supported 11.x line.";
  if (command === "rustc" || command === "cargo") {
    const required = rustMinimum.split(".").map(Number);
    while (required.length < 3) required.push(0);
    const difference = actual.findIndex((value, index) => value !== required[index]);
    if (difference >= 0 && actual[difference] < required[difference]) {
      return `Linux ${command} ${actual.join(".")} is older than the application's Rust requirement ${rustMinimum}. Use the same native Rust toolchain for Cargo and rustc.`;
    }
  }
  return null;
}
