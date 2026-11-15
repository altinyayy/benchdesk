#!/usr/bin/env bash
# Benchdesk benchmark — https://benchdesk.net/methodology
#
#   curl -sL https://benchdesk.net/bench.sh | bash
#
# Runs on a fresh, otherwise idle Linux server (Debian/Ubuntu or RHEL family):
#   1. CPU: sysbench (single- and multi-thread) and the 7-Zip built-in benchmark
#   2. Disk and network: yabs.sh, pinned to a fixed version, without Geekbench (-g)
# Nothing is uploaded anywhere; paste the full output into Benchdesk yourself.
# Installs sysbench and 7-Zip with the system package manager (needs root or sudo).

set -uo pipefail

BENCH_VERSION="1"
YABS_COMMIT="77af031702958e401040332b42da9068836e998e" # yabs v2026-10-31
YABS_URL="https://raw.githubusercontent.com/masonr/yet-another-bench-script/${YABS_COMMIT}/yabs.sh"
CPU_SECONDS=30

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
	if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else
		echo "Please run as root or install sudo." >&2
		exit 1
	fi
fi

install_tools() {
	if command -v apt-get >/dev/null 2>&1; then
		$SUDO apt-get update -qq >/dev/null
		# Newer releases ship 7-Zip as "7zip"; older ones only have "p7zip-full".
		DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq sysbench 7zip >/dev/null 2>&1 ||
			DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq sysbench p7zip-full >/dev/null
	elif command -v dnf >/dev/null 2>&1; then
		$SUDO dnf install -y -q epel-release >/dev/null 2>&1 || true
		$SUDO dnf install -y -q sysbench 7zip >/dev/null 2>&1 || $SUDO dnf install -y -q sysbench p7zip p7zip-plugins >/dev/null
	else
		echo "Unsupported system: needs apt-get or dnf." >&2
		exit 1
	fi
}

if ! command -v sysbench >/dev/null 2>&1 || ! { command -v 7zz >/dev/null 2>&1 || command -v 7z >/dev/null 2>&1; }; then
	echo "Installing sysbench and 7-Zip..."
	install_tools
fi
SEVENZIP="$(command -v 7zz || command -v 7z)"
if ! command -v sysbench >/dev/null 2>&1 || [ -z "$SEVENZIP" ]; then
	echo "Could not install sysbench or 7-Zip." >&2
	exit 1
fi

THREADS="$(nproc)"

echo "=== Benchdesk CPU test v${BENCH_VERSION} ==="
echo "Date (UTC) : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Processor  : $(awk -F': ' '/model name/{print $2; exit}' /proc/cpuinfo)"
echo "Threads    : ${THREADS}"
echo "sysbench   : $(sysbench --version)"
echo "7-Zip      : $("$SEVENZIP" 2>/dev/null | awk 'NF{print; exit}')"
echo
echo "--- sysbench cpu, 1 thread ---"
sysbench cpu --cpu-max-prime=10000 --threads=1 --time="${CPU_SECONDS}" run
echo "--- sysbench cpu, ${THREADS} threads ---"
sysbench cpu --cpu-max-prime=10000 --threads="${THREADS}" --time="${CPU_SECONDS}" run
echo "--- 7-Zip benchmark, 1 thread ---"
"$SEVENZIP" b -mmt1
echo "--- 7-Zip benchmark, ${THREADS} threads ---"
"$SEVENZIP" b -mmt"${THREADS}"
echo "=== Benchdesk CPU test end ==="
echo

# Disk (fio) and network (iperf3). -g skips Geekbench.
curl -sL "$YABS_URL" | bash -s -- -g
