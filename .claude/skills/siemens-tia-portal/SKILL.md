---
name: siemens-tia-portal
description: "Develop TIA Portal SCL and Openness automation, and inspect SIMATIC communications in an authorized test environment."
category: plc-industrial
risk: caution
source: self
source_type: self
date_added: "2026-08-26"
tags: ["siemens-tia-portal", "simatic-s7", "scl-programming", "tia-openness", "snap7", "profinet", "plc-automation", "claude"]
tools: ["claude", "cursor", "gemini", "codex"]
---

# Siemens TIA Portal Industrial Automation AI Skill Guide (Claude)

> **Test environments only.** Everything here — the Snap7 script, the PUT/GET and
> non-optimized-DB settings, the Openness automation — targets PLCSIM (or PLCSIM
> Advanced) or an authorized test bench. Never point these at live production
> equipment: PUT/GET access and non-optimized block access both weaken a CPU's
> access protection, and a setpoint write is a real actuator command on real hardware.

## Overview & Engine Architecture
Siemens Totally Integrated Automation (TIA) Portal is the industry standard engineering framework for programming SIMATIC S7-1200, S7-1500, and ET 200SP programmable logic controllers, configuring SINAMICS variable frequency drives, and designing WinCC Unified HMI/SCADA interfaces. TIA Portal supports **Structured Control Language (SCL)**, **Ladder (LAD)**, **Function Block (FBD)**, and **Graph (SFC)**. The platform exposes the **TIA Portal Openness .NET API (`Siemens.Engineering.dll`)** for headless project engineering, communicates with controllers via the **S7comm / S7comm-plus protocol (TCP port 102)**, and provides software-in-the-loop virtual commissioning via **PLCSIM Advanced**. Claude operates as a Principal Industrial Automation Architect and Siemens Controls Systems Specialist, specializing in **SCL state machine development**, **TIA Openness C#/Python CI/CD pipelines**, **Snap7 direct memory access**, and **PROFINET topology diagnostics**.

### TIA Portal System Architecture & S7 Protocol Stack

```
┌─────────────────────────────────────────────────────────────┐
│                 TIA Portal System Architecture              │
│                                                             │
│  Engineering & Openness API Layer                           │
│  ├── TIA Portal V18/V19 IDE (Project View & Portal View)    │
│  ├── TIA Openness API (.NET Framework `Siemens.Engineering`)│
│  └── WinCC Unified (HTML5 Web Engine & JavaScript Runtime)  │
│                                                             │
│  SIMATIC Execution & Hardware Core                          │
│  ├── S7-1200 / S7-1500 Multi-Tasking Execution Engine       │
│  ├── Cyclic OB1 Organization Blocks, Cyclic Interrupt OB30 │
│  └── Data Blocks (Standard DB vs Optimized Block Access)    │
│                                                             │
│  Industrial Communications & S7 Subsystem                   │
│  ├── S7comm / S7comm-plus Industrial Protocol (TCP Port 102)│
│  ├── PROFINET IO Real-Time (RT / IRT Isochronous Real-Time) │
│  └── Direct Socket & Snap7 Industrial Communication Engine  │
└─────────────────────────────────────────────────────────────┘
```

---

## Operational Capabilities & Agent Directives

1. **S7comm PLC Communication Scripting (`python-snap7`)**: Author Python scripts connecting directly to SIMATIC S7-1200/S7-1500 processors over TCP port 102 to read/write DB blocks, Merker memory (`M`), and digital inputs/outputs (`I`/`Q`).
2. **TIA Portal Openness Automation**: Build automated C# and PowerShell pipelines utilizing `Siemens.Engineering.dll` to import SCL sources, compile hardware/software, and generate `.ap19` project archives.
3. **Structured Control Language (SCL) Development**: Author clean, type-safe SCL function blocks (FB) implementing IEC timers (`TON`), PID controllers (`PID_Compact`), and sequence step controllers.
4. **Optimized DB & PUT/GET Protection Triage**: Resolve communication exceptions caused by CPU Access Protection levels and Optimized Block Access memory layouts.

---

## Production Python Automation: SIMATIC S7 PLC Data Block Reader & Writer (`python-snap7`)

Save this script as `s7_plc_client.py` (requires `pip install python-snap7`). The IP is never
hard-coded — pass it with `--ip` or set `PLC_IP` — and the setpoint write is opt-in via
`--write`; run it with no `--write` to read-only, dry-run against the target:

```python
"""
Siemens SIMATIC S7-1200 / S7-1500 PLC Communication Client (Snap7)
TEST/SIMULATION USE ONLY (PLCSIM or an authorized test bench) — never live production.

Connects to an S7 PLC over TCP port 102, reads Data Block (DB1) variables, and
optionally writes a setpoint (opt-in via --write; read-only by default).
"""

import argparse
import os

import snap7
from snap7.util import get_bool, get_int, get_real, set_real


def monitor_s7_plc(ip, rack, slot, write_value):
    print(f"--- [CONNECTING TO SIEMENS S7 PLC: {ip} (Rack: {rack}, Slot: {slot})] ---")
    client = snap7.client.Client()

    try:
        client.connect(ip, rack, slot)
        if not client.get_connected():
            print("🚨 Failed to connect to S7 PLC.")
            return

        print("✅ Successfully connected to SIMATIC S7 CPU via S7comm (Port 102)!")

        # 1. Read Data Block 1 (DB1) - Read 16 bytes starting at Offset 0
        # DB Layout:
        # Offset 0.0: bMotorRunning (Bool)
        # Offset 2.0: rSpeedActual (Real / Float32)
        # Offset 6.0: iPieceCount (Int16)
        db_number = 1
        data = client.db_read(db_number, 0, 16)

        is_running = get_bool(data, 0, 0)
        actual_speed = get_real(data, 2)
        piece_count = get_int(data, 6)

        print(f"\n--- [DB{db_number} LIVE MONITORING] ---")
        print(f"• Motor Running:   {is_running}")
        print(f"• Actual Speed:    {actual_speed:.2f} RPM")
        print(f"• Piece Count:     {piece_count} units")

        # 2. Setpoint write: DB1.DBD8 (rTargetSpeed) — opt-in only, off by default
        if write_value is None:
            print("\n(Read-only run — pass --write <rpm> to write DB1.DBD8.)")
        else:
            print(f"\nWriting Target Speed Setpoint ({write_value:.1f} RPM) to DB1.DBD8...")
            write_buffer = bytearray(4)
            set_real(write_buffer, 0, write_value)
            client.db_write(db_number, 8, write_buffer)
            print("✅ Setpoint successfully written to PLC memory.")

        client.disconnect()

    except Exception as e:
        print(f"🚨 S7 Communication Error: {e}")
        print(
            "If this is a PUT/GET or access error on an S7-1200/1500: that CPU needs "
            "'Permit access with PUT/GET communication' enabled and the target DB set to "
            "Non-Optimized (Standard) block access. Verify this ONLY on a test CPU (PLCSIM or "
            "an authorized bench) — both settings weaken the CPU's access protection, so flag "
            "the trade-off to the user rather than applying it to production hardware."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SIMATIC S7 PLC Data Block reader (Snap7)")
    parser.add_argument(
        "--ip",
        default=os.environ.get("PLC_IP"),
        required=os.environ.get("PLC_IP") is None,
        help="PLC IP address (or set PLC_IP). Point this at PLCSIM or an authorized test bench only.",
    )
    parser.add_argument("--rack", type=int, default=0)
    parser.add_argument("--slot", type=int, default=1, help="1 for S7-1200/1500; 2 for S7-300/400")
    parser.add_argument(
        "--write",
        type=float,
        default=None,
        metavar="RPM",
        help="Opt-in: write this setpoint to DB1.DBD8. Omit to run read-only.",
    )
    args = parser.parse_args()

    monitor_s7_plc(args.ip, args.rack, args.slot, args.write)
```

---

## Technical Troubleshooting Matrix

| Issue & Failure Signature | Root Cause Analysis | Diagnostic & Resolution Pathway |
| :--- | :--- | :--- |
| **Snap7 Error: `CLI: function refused by CPU`** | S7-1500 CPU security settings block external PUT/GET communication, or target DB has "Optimized block access" enabled. | 1. In TIA Portal $\rightarrow$ CPU Properties $\rightarrow$ **Protection & Security**, check **Permit access with PUT/GET communication from remote partner**.<br>2. In DB Properties $\rightarrow$ **Attributes**, uncheck **Optimized block access** $\rightarrow$ Re-compile and download DB. |
| **"Cannot establish online connection: PG/PC Interface"** | Engineering station IP address is not in the same subnet as the S7 CPU or incorrect network interface selected. | In *Online $\rightarrow$ Accessible devices*, select your active Ethernet adapter $\rightarrow$ Click **Start search** to identify CPU IP and assign matching static IP to the PC. |
| **SCL Compilation Error: `Ambiguous reference`** | Duplicate Function Block (FB) or Data Type (UDT) definitions exist across Project Library and Global Library. | In Project Tree $\rightarrow$ Libraries tab, resolve duplicate versions using the **Update project components** wizard. |
| **TIA Openness Throws `SecurityException`** | Windows user account is not a member of the local `Siemens TIA Openness` user group. | Open Windows *Computer Management $\rightarrow$ Local Users and Groups $\rightarrow$ Groups*, add current user to **Siemens TIA Openness**, then log out and log back in. |

---

## Command Line Syntax & TIA Openness Recipes

```bash
# 1. Launch TIA Portal V19 via Command Line
"C:\Program Files\Siemens\Automation\Portal V19\Bin\Siemens.Automation.Portal.exe"

# 2. Query S7comm Port 102 Connectivity
python3 -c "import socket; s = socket.socket(); s.connect(('192.168.0.1', 102)); print('S7 Port 102 Open!'); s.close()"
```

### Essential File Locations
- **TIA Openness Core Assembly**: `C:\Program Files\Siemens\Automation\Portal V19\PublicAPI\V19\Siemens.Engineering.dll`
- **TIA Portal Projects**: `*.ap18`, `*.ap19`

---

## Agent Operational Directive
> For direct S7comm communication with S7-1200 and S7-1500 PLCs: verify "Permit access with
> PUT/GET" and Standard (Non-Optimized) block access only on a test CPU (PLCSIM or an
> authorized bench), and flag the security trade-off to the user — both settings weaken the
> CPU's access protection and should never be applied to production hardware without the
> user explicitly deciding to accept that risk.
