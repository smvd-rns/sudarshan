import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseIdktAdmin } from "../../../../lib/supabaseIdkt";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * ATTENDANCE REPORT API
 * Generates matrix-style reports for all machines.
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get("endDate") || new Date().toISOString().split('T')[0];

    // 1. Fetch all machines to know the sessions
    const { data: machines, error: machinesError } = await supabase
      .from("attendance_machines")
      .select("*");
    if (machinesError) throw machinesError;
    const machinesList = machines || [];

    // 2. Fetch all mappings (plain — no join to avoid schema cache issues)
    const { data: mappings, error: mappingsError } = await supabase
      .from("attendance_user_mapping")
      .select("*");
    if (mappingsError) throw mappingsError;
    const mappingsList = mappings || [];

    // Precompute lookup maps to avoid repeated O(n) scans per log.
    const machinesBySerial = new Map<string, any[]>();
    (machinesList || []).forEach((machine: any) => {
      const serial = machine?.serial_number;
      if (!serial) return;
      if (!machinesBySerial.has(serial)) machinesBySerial.set(serial, []);
      machinesBySerial.get(serial)!.push(machine);
    });

    const mappingByMachineAndZk = new Map<string, any>();
    (mappingsList || []).forEach((m: any) => {
      const key = `${m.machine_id}__${String(m.zk_user_id)}`;
      // Keep first match to preserve previous find() behavior.
      if (!mappingByMachineAndZk.has(key)) {
        mappingByMachineAndZk.set(key, m);
      }
    });

    // 3. Fetch BCDB users (Only temple Brahmacharis should have access to Harinam)
    const { data: bcdbUsers, error: bcdbError } = await supabase
      .from("bcdb")
      .select("email_id, initiated_name, legal_name")
      .eq("is_deleted", false);
    if (bcdbError) throw bcdbError;

    // 4. Fetch logs for the date range with pagination to bypass Supabase 1000-row max default
    let logsList: any[] = [];
    let hasMoreLogs = true;
    let logPage = 0;
    const limit = 1000;

    while (hasMoreLogs) {
      const { data: chunk, error: chunkError } = await (supabaseIdktAdmin || supabase)
        .from("physical_attendance")
        .select("*")
        .gte("check_time", `${startDate}T00:00:00Z`)
        .lte("check_time", `${endDate}T23:59:59Z`)
        .range(logPage * limit, (logPage + 1) * limit - 1);

      if (chunkError) throw chunkError;

      if (chunk && chunk.length > 0) {
        logsList = [...logsList, ...chunk];
      }

      if (!chunk || chunk.length < limit) {
        hasMoreLogs = false;
      } else {
        logPage++;
      }
    }

    // 5. Build matrix: user → date → session → [logs]
    const matrix: any = {};

    // Pre-populate matrix with BCDB users and grant them Harinam access
    (bcdbUsers || []).forEach(u => {
      if (!u.email_id) return;
      const email = u.email_id.toLowerCase().trim();
      matrix[email] = {
        email: email,
        full_name: u.initiated_name || u.legal_name || email.split("@")[0],
        assigned_machines: ["harinam_virtual"],
        dates: {}
      };
    });

    const emails = [...new Set(mappingsList.map(m => (m.user_email || "").toLowerCase().trim()))].filter(Boolean);
    const { data: profiles } = await supabase.from("profiles").select("email, full_name").in("email", emails);
    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { 
      const email = (p.email || "").toLowerCase().trim();
      if (email) profileMap[email] = p.full_name; 
    });

    mappingsList.forEach(m => {
      const email = (m.user_email || "").toLowerCase().trim();
      if (!email) return;
      if (!matrix[email]) {
        matrix[email] = {
          email: email,
          full_name: profileMap[email] || email.split("@")[0],
          assigned_machines: [],
          dates: {}
        };
      }
      if (!matrix[email].assigned_machines.includes(m.machine_id)) {
        matrix[email].assigned_machines.push(m.machine_id);
      }
    });

    // Populate logs into matrix
    logsList.forEach(log => {
      const matchingMachines = machinesBySerial.get(log.device_sn) || [];
      matchingMachines.forEach(machine => {
        const mappingKey = `${machine.id}__${String(log.zk_user_id)}`;
        const mapping = mappingByMachineAndZk.get(mappingKey);
        if (!mapping) return;
        const email = mapping.user_email.toLowerCase();
        if (!matrix[email]) return;
        const date = new Date(log.check_time).toISOString().split('T')[0];
        const sessionName = machine.description || log.device_sn;
        if (!matrix[email].dates[date]) matrix[email].dates[date] = {};
        if (!matrix[email].dates[date][sessionName]) matrix[email].dates[date][sessionName] = [];
        matrix[email].dates[date][sessionName].push(log);
      });
    });

    // --- HARINAM INTEGRATION ---
    let harinamDataList: any[] = [];
    let hasMoreHarinam = true;
    let hPage = 0;

    while (hasMoreHarinam) {
      const { data: chunk, error: hError } = await supabase
        .from("harinam_attendance")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .range(hPage * limit, (hPage + 1) * limit - 1);

      if (hError) throw hError;

      if (chunk && chunk.length > 0) {
        harinamDataList = [...harinamDataList, ...chunk];
      }

      if (!chunk || chunk.length < limit) {
        hasMoreHarinam = false;
      } else {
        hPage++;
      }
    }

    const harinamVirtualMachine = {
      id: "harinam_virtual",
      serial_number: "VIRTUAL_HARINAM",
      description: "Harinam",
      is_manual: true,
      p_start: "07:00:00",
      p_end: "09:00:00"
    };
    
    machinesList.push(harinamVirtualMachine);

    (harinamDataList || []).forEach((record: any) => {
      const email = (record.user_email || "").toLowerCase().trim();
      if (!email || !matrix[email]) return;
      const date = record.date;
      if (!matrix[email].dates[date]) matrix[email].dates[date] = {};
      matrix[email].dates[date]["Harinam"] = [{
        is_manual: true,
        ...record
      }];
    });
    // Add "Hari Nam" to assigned machines for ALL users so they show up in Harinam view
    Object.values(matrix).forEach((user: any) => {
       if (!user.assigned_machines.includes("harinam_virtual")) {
          user.assigned_machines.push("harinam_virtual");
       }
    });

    // --- VIRTUAL MACHINE ATTENDANCE (P/A) INTEGRATION ---
    const virtualMachineIds = machinesList
      .filter((m: any) => !!m.is_virtual)
      .map((m: any) => m.id);

    if (virtualMachineIds.length > 0) {
      let vmAttendanceList: any[] = [];
      let hasMoreVmAttendance = true;
      let vmPage = 0;

      while (hasMoreVmAttendance) {
        const { data: chunk, error: vmError } = await supabase
          .from("virtual_machine_attendance")
          .select("*")
          .in("machine_id", virtualMachineIds)
          .gte("date", startDate)
          .lte("date", endDate)
          .range(vmPage * limit, (vmPage + 1) * limit - 1);

        if (vmError) throw vmError;

        if (chunk && chunk.length > 0) {
          vmAttendanceList = [...vmAttendanceList, ...chunk];
        }

        if (!chunk || chunk.length < limit) {
          hasMoreVmAttendance = false;
        } else {
          vmPage++;
        }
      }

      const machineById = new Map((machinesList || []).map((m: any) => [m.id, m]));

      (vmAttendanceList || []).forEach((record: any) => {
        const email = (record.user_email || "").toLowerCase().trim();
        if (!email || !matrix[email]) return;
        const machine = machineById.get(record.machine_id);
        if (!machine) return;
        const date = record.date;
        const sessionName = machine.description || machine.serial_number;
        if (!matrix[email].dates[date]) matrix[email].dates[date] = {};
        matrix[email].dates[date][sessionName] = [
          {
            is_manual: true,
            vm_status: record.status,
            ...record,
          },
        ];
      });
    }
    // --- ATTENDANCE EXCEPTIONS INTEGRATION ---
    const { data: exceptionsList, error: exceptionsError } = await supabase
      .from("attendance_exceptions")
      .select("*")
      .gte("date", startDate)
      .lte("date", endDate);

    if (exceptionsError) throw exceptionsError;

    (exceptionsList || []).forEach((ex: any) => {
      const email = (ex.user_email || "").toLowerCase().trim();
      if (!email || !matrix[email] || !ex.date) return;
      const date = ex.date;
      if (!matrix[email].dates[date]) matrix[email].dates[date] = {};

      const sessionsToApplyRaw =
        !ex.applied_sessions ||
        ex.applied_sessions.length === 0 ||
        ex.applied_sessions.includes("All")
          ? machinesList.map((m: any) => m.description || m.serial_number)
          : ex.applied_sessions;

      sessionsToApplyRaw.forEach((sName: string) => {
        if (!sName) return;

        // Matrix keys must match what the UI looks up:
        // UI reads `user.dates[date][activeMachine.description + "_exception"]`.
        // Frontend submits session labels like "BC Class", "SB Class", etc.
        // The only special normalization needed is "Hari Nam" -> "Harinam"
        // (virtual machine description is "Harinam").
        const mappedName =
          sName === "Hari Nam" ? "Harinam" : (sName === "Harinam" ? "Harinam" : sName);

        if (!matrix[email].dates[date][mappedName]) {
          matrix[email].dates[date][mappedName] = [];
        }
        // Store exception as a separate key to survive JSON stringification
        matrix[email].dates[date][mappedName + "_exception"] = {
          reason: ex.reason_type,
          comment: ex.comment,
        };
      });
    });
    // --- END EXCEPTIONS ---

    // 6. Compute status per session per day using the EARLIEST punch only
    Object.values(matrix).forEach((user: any) => {
      Object.values(user.dates).forEach((dateSessions: any) => {
        Object.entries(dateSessions).forEach(([sessionName, sessionLogs]: [string, any]) => {
          // `dateSessions` can contain both:
          // 1) real session logs arrays (for status calculation)
          // 2) *_exception objects (for display only)
          // Ensure we only compute status for non-empty arrays.
          if (!Array.isArray(sessionLogs) || sessionLogs.length === 0) return;

          // Skip status calculation for manual sessions
          const firstLog = sessionLogs[0];
          if (!firstLog) return;
          if (firstLog?.is_manual) return;

          const machine = machinesList.find(m => (m.description || m.serial_number) === sessionName);
          if (!machine) return;

          const earliest = sessionLogs.reduce((min: any, log: any) =>
            new Date(log.check_time) < new Date(min.check_time) ? log : min
          , sessionLogs[0]);

          const checkTimeStr = new Date(earliest.check_time).toISOString().slice(11, 19);

          let status = "absent";
          if (machine.p_start && machine.p_end && checkTimeStr >= machine.p_start && checkTimeStr <= machine.p_end) {
            status = "present";
          } else if (machine.l_start && machine.l_end && checkTimeStr >= machine.l_start && checkTimeStr <= machine.l_end) {
            status = "late";
          }

          const processedLogs: any = sessionLogs.map((log: any) => ({
            ...log,
            computed_status: status,
            is_earliest: log === earliest
          }));
          
          dateSessions[sessionName] = processedLogs;
        });
      });
    });

    return NextResponse.json({ 
      report: Object.values(matrix),
      machines: machinesList 
    });

  } catch (error: any) {
    console.error("Report API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
