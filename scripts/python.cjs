const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const backendDirectory = join(root, "backend-services");
const virtualEnvironment = process.platform === "win32"
  ? join(backendDirectory, ".venv", "Scripts", "python.exe")
  : join(backendDirectory, ".venv", "bin", "python");

function findSystemPython() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3"]], ["python", []]]
    : [["python3", []], ["python", []]];

  for (const [command, args] of candidates) {
    const result = spawnSync(command, [...args, "--version"], { stdio: "ignore" });
    if (result.status === 0) {
      return { command, args };
    }
  }

  return undefined;
}

function ensureVirtualEnvironment() {
  if (existsSync(virtualEnvironment)) {
    return virtualEnvironment;
  }

  const systemPython = findSystemPython();
  if (!systemPython) {
    throw new Error(
      "Python 3 was not found. Install Python 3 and ensure it is available as python or py."
    );
  }

  const result = spawnSync(
    systemPython.command,
    [...systemPython.args, "-m", "venv", join(backendDirectory, ".venv")],
    { cwd: root, stdio: "inherit" }
  );
  if (result.status !== 0 || !existsSync(virtualEnvironment)) {
    throw new Error("Could not create backend-services/.venv.");
  }

  return virtualEnvironment;
}

function runPython(args) {
  const python = ensureVirtualEnvironment();
  const child = spawn(python, args, {
    cwd: backendDirectory,
    env: { ...process.env, GLOG_minloglevel: "2", TF_CPP_MIN_LOG_LEVEL: "2", PYTHONUNBUFFERED: "1" },
    stdio: "inherit",
    windowsHide: false
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code ?? 1;
    }
  });
}

const action = process.argv[2];
if (action === "install") {
  const python = ensureVirtualEnvironment();
  runPython(["-m", "pip", "install", "-r", join(backendDirectory, "requirements.txt")]);
} else if (action === "run") {
  runPython(["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--log-level", "warning"]);
} else if (action === "test") {
  const python = ensureVirtualEnvironment();
  // Install the test runner on first use so `npm run test:agent` works on a fresh checkout.
  if (spawnSync(python, ["-c", "import pytest"], { cwd: backendDirectory }).status !== 0) {
    spawnSync(python, ["-m", "pip", "install", "-q", "-r", join(backendDirectory, "requirements-dev.txt")], { cwd: backendDirectory, stdio: "inherit" });
  }
  runPython(["-m", "pytest", "-q", "tests", ...process.argv.slice(3)]);
} else {
  throw new Error("Usage: node scripts/python.cjs <install|run|test>");
}
