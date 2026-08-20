#!/usr/bin/env python3
"""MegaDrive local launcher. Uses only the Python standard library."""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
MIN_NODE = (22, 13, 0)


def app_data_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "MegaDrive"


def private_value(path: Path, factory) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    value = factory()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return value


def command(name: str) -> str:
    candidate = f"{name}.cmd" if sys.platform == "win32" else name
    located = shutil.which(candidate)
    if not located:
        raise RuntimeError(f"{name} is required. Install Node.js 22.13+ from https://nodejs.org/")
    return located


def check_node() -> tuple[str, str]:
    node, npm = command("node"), command("npm")
    version_text = subprocess.check_output([node, "--version"], text=True).strip().lstrip("v")
    try:
        version = tuple(int(part) for part in version_text.split(".")[:3])
    except ValueError as exc:
        raise RuntimeError(f"Unable to read Node.js version: {version_text}") from exc
    if version < MIN_NODE:
        raise RuntimeError(f"Node.js 22.13+ is required; found {version_text}. Update from https://nodejs.org/")
    return node, npm


def dependencies_stale() -> bool:
    marker = ROOT / "node_modules" / ".package-lock.json"
    lockfile = ROOT / "package-lock.json"
    return not marker.exists() or marker.stat().st_mtime < lockfile.stat().st_mtime


def build_stale() -> bool:
    marker = ROOT / ".next" / "BUILD_ID"
    if not marker.exists():
        return True
    built_at = marker.stat().st_mtime
    candidates = [ROOT / "package.json", ROOT / "package-lock.json", ROOT / "next.config.ts"]
    for directory in ("app", "lib", "public"):
        candidates.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())
    return any(path.exists() and path.stat().st_mtime > built_at for path in candidates)


def available_port(preferred: int | None) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", preferred or 0))
        return int(server.getsockname()[1])


def wait_until_ready(url: str, process: subprocess.Popen, timeout: int = 90) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"MegaDrive server stopped unexpectedly (exit code {process.returncode})")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return
        except Exception:
            time.sleep(0.4)
    raise RuntimeError("MegaDrive did not become ready within 90 seconds")


def process_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def acquire_lock(directory: Path) -> Path:
    lock = directory / "megadrive.lock"
    directory.mkdir(parents=True, exist_ok=True)
    if lock.exists():
        try:
            existing_pid = int(lock.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            existing_pid = 0
        if existing_pid and process_running(existing_pid):
            raise RuntimeError(f"MegaDrive is already running (process {existing_pid})")
        lock.unlink(missing_ok=True)
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(str(os.getpid()))
    return lock


def main() -> int:
    parser = argparse.ArgumentParser(description="Start MegaDrive as a private local web application")
    parser.add_argument("--dev", action="store_true", help="Run the Next.js development server")
    parser.add_argument("--rebuild", action="store_true", help="Force a fresh production build")
    parser.add_argument("--no-browser", action="store_true", help="Do not open the browser automatically")
    parser.add_argument("--port", type=int, help="Preferred local port")
    args = parser.parse_args()

    data_root = app_data_dir()
    lock = acquire_lock(data_root)
    server: subprocess.Popen | None = None
    try:
        _, npm = check_node()
        if dependencies_stale():
            print("Installing verified Node.js dependencies...")
            subprocess.run([npm, "ci"], cwd=ROOT, check=True)

        if not args.dev and (args.rebuild or build_stale()):
            print("Building MegaDrive for local production use...")
            subprocess.run([npm, "run", "build"], cwd=ROOT, check=True)

        key = private_value(data_root / "master.key", lambda: base64.b64encode(secrets.token_bytes(32)).decode("ascii"))
        workspace = private_value(data_root / "workspace.id", lambda: secrets.token_urlsafe(32))
        local_data = data_root / "data"
        local_data.mkdir(parents=True, exist_ok=True)
        port = available_port(args.port)
        url = f"http://127.0.0.1:{port}"
        environment = os.environ.copy()
        environment.update({
            "HOSTNAME": "127.0.0.1",
            "PORT": str(port),
            "MEGADRIVE_DATA_DIR": str(local_data),
            "MEGADRIVE_ENCRYPTION_KEY": key,
            "MEGADRIVE_WORKSPACE_ID": workspace,
            "MEGADRIVE_LOCAL_MODE": "1",
        })
        script = "dev" if args.dev else "start"
        command_line = [npm, "run", script, "--", "--hostname", "127.0.0.1", "--port", str(port)]
        print(f"Starting MegaDrive at {url}")
        server = subprocess.Popen(command_line, cwd=ROOT, env=environment)
        wait_until_ready(url, server)
        (data_root / "session.json").write_text(json.dumps({"port": port, "pid": server.pid}), encoding="utf-8")
        if not args.no_browser:
            webbrowser.open(url)
        print("MegaDrive is running locally. Press Ctrl+C to stop.")
        return server.wait()
    except KeyboardInterrupt:
        print("\nStopping MegaDrive...")
        return 0
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(f"MegaDrive could not start: {error}", file=sys.stderr)
        return 1
    finally:
        if server and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=8)
            except subprocess.TimeoutExpired:
                server.kill()
        (data_root / "session.json").unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
