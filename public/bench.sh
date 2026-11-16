#!/usr/bin/env bash
# Benchdesk benchmark — https://benchdesk.net/methodology
#
#   curl -sL https://benchdesk.net/bench.sh | bash                    (~20 min)
#   curl -sL https://benchdesk.net/bench.sh | bash -s -- --hours 48   (+ 48-hour stability run)
#
# Run it inside tmux for long runs, and keep the output:  ... | tee bench.txt
#
# Runs on a fresh, otherwise idle Linux server (Debian/Ubuntu or RHEL family):
#   1. CPU: sysbench (single- and multi-thread) and the 7-Zip built-in benchmark
#   2. Disk and network: yabs.sh, pinned to a fixed version, without Geekbench (-g)
#   3. Optional stability run (--hours N): every 30 minutes, a ~1 minute sample of
#      sysbench (1 thread and all threads), CPU steal during the load, and fio 4K
#      random IOPS. Light load: the server is idle about 97% of the time.
# Nothing is uploaded anywhere; paste the full output into Benchdesk yourself.
# Installs sysbench and 7-Zip with the system package manager (needs root or sudo).

set -uo pipefail

BENCH_VERSION="2"
YABS_COMMIT="77af031702958e401040332b42da9068836e998e" # yabs v2026-10-31
YABS_URL="https://raw.githubusercontent.com/masonr/yet-another-bench-script/${YABS_COMMIT}/yabs.sh"
CPU_SECONDS=30
STABILITY_HOURS=0
STABILITY_INTERVAL_MIN=30
SAMPLE_SECONDS=20

while [ $# -gt 0 ]; do
	case "$1" in
	--hours)
		STABILITY_HOURS="${2:-}"
		shift 2
		;;
	--interval)
		STABILITY_INTERVAL_MIN="${2:-}"
		shift 2
		;;
	*)
		echo "Unknown option: $1 (use --hours N)" >&2
		exit 1
		;;
	esac
done
case "$STABILITY_HOURS" in '' | *[!0-9]*) echo "--hours needs a whole number." >&2; exit 1 ;; esac
case "$STABILITY_INTERVAL_MIN" in '' | *[!0-9]*) echo "--interval needs a whole number of minutes." >&2; exit 1 ;; esac
if [ "$STABILITY_HOURS" -gt 72 ] || [ "$STABILITY_INTERVAL_MIN" -lt 1 ]; then
	echo "--hours can be at most 72, --interval at least 1." >&2
	exit 1
fi

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
		DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq sysbench 7zip fio >/dev/null 2>&1 ||
			DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq sysbench p7zip-full fio >/dev/null
	elif command -v dnf >/dev/null 2>&1; then
		$SUDO dnf install -y -q epel-release >/dev/null 2>&1 || true
		$SUDO dnf install -y -q sysbench 7zip fio >/dev/null 2>&1 || $SUDO dnf install -y -q sysbench p7zip p7zip-plugins fio >/dev/null
	else
		echo "Unsupported system: needs apt-get or dnf." >&2
		exit 1
	fi
}

if ! command -v sysbench >/dev/null 2>&1 || ! command -v fio >/dev/null 2>&1 ||
	! { command -v 7zz >/dev/null 2>&1 || command -v 7z >/dev/null 2>&1; }; then
	echo "Installing sysbench, 7-Zip and fio..."
	install_tools
fi
SEVENZIP="$(command -v 7zz || command -v 7z)"
if ! command -v sysbench >/dev/null 2>&1 || [ -z "$SEVENZIP" ]; then
	echo "Could not install sysbench or 7-Zip." >&2
	exit 1
fi
if [ "$STABILITY_HOURS" -gt 0 ] && ! command -v fio >/dev/null 2>&1; then
	echo "Could not install fio (needed for the stability run)." >&2
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

[ "$STABILITY_HOURS" -gt 0 ] || exit 0

# ---------------------------------------------------------------------------
# Stability run. One line per sample, so a cut-off run still parses:
#   S <time UTC> <sysbench 1 thread eps> <sysbench all threads eps> <steal %> <fio 4K IOPS>
# "-" marks a value that couldn't be measured.
# ---------------------------------------------------------------------------

FIO_FILE="${HOME:-/tmp}/benchdesk-stability.fio"
trap 'rm -f "$FIO_FILE"' EXIT

eps() { sysbench cpu --cpu-max-prime=10000 --threads="$1" --time="${SAMPLE_SECONDS}" run 2>/dev/null | awk '/events per second/{print $4; exit}'; }
cpu_ticks() { awk '/^cpu /{t=0; for (i=2; i<=9; i++) t+=$i; print t, $9; exit}' /proc/stat; }
fio_iops() {
	local out
	out="$(fio --name=benchdesk --filename="$FIO_FILE" --size=256M --rw=randrw --rwmixread=50 --bs=4k \
		--ioengine=libaio --iodepth=64 --direct=1 --runtime="${SAMPLE_SECONDS}" --time_based \
		--group_reporting --minimal 2>/dev/null)" ||
		out="$(fio --name=benchdesk --filename="$FIO_FILE" --size=256M --rw=randrw --rwmixread=50 --bs=4k \
			--ioengine=psync --direct=1 --runtime="${SAMPLE_SECONDS}" --time_based --group_reporting --minimal 2>/dev/null)"
	# Terse format v3: field 8 = read IOPS, field 49 = write IOPS.
	printf '%s\n' "$out" | awk -F';' 'NF>49 {printf "%.0f", $8 + $49; exit}'
}

INTERVAL_S=$((STABILITY_INTERVAL_MIN * 60))
SAMPLES=$((STABILITY_HOURS * 60 / STABILITY_INTERVAL_MIN + 1))

echo
echo "=== Benchdesk stability run v${BENCH_VERSION} ==="
echo "Started (UTC) : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Duration      : ${STABILITY_HOURS} h"
echo "Interval      : ${STABILITY_INTERVAL_MIN} min"
echo "Samples       : ${SAMPLES}"
echo "Threads       : ${THREADS}"
echo "Sample        : sysbench ${SAMPLE_SECONDS} s on 1 and ${THREADS} threads (steal measured during the latter), fio 4K randrw ${SAMPLE_SECONDS} s"
echo "#   time_utc             cpu1_eps    cpuN_eps    steal_pct  disk_iops"

START_S="$(date +%s)"
i=0
while [ "$i" -lt "$SAMPLES" ]; do
	target=$((START_S + i * INTERVAL_S))
	now="$(date +%s)"
	[ "$now" -lt "$target" ] && sleep $((target - now))

	ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	single="$(eps 1)"
	read -r t0 s0 <<<"$(cpu_ticks)"
	multi="$(eps "$THREADS")"
	read -r t1 s1 <<<"$(cpu_ticks)"
	steal="$(awk -v dt=$((t1 - t0)) -v ds=$((s1 - s0)) 'BEGIN { if (dt > 0) printf "%.2f", 100 * ds / dt; else print "-" }')"
	iops="$(fio_iops)"
	printf 'S %s %11s %11s %10s %10s\n' "$ts" "${single:--}" "${multi:--}" "${steal:--}" "${iops:--}"
	i=$((i + 1))
done

echo "=== Benchdesk stability run end ==="
