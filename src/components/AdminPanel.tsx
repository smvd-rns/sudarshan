"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Loader2, LogOut, CheckCircle, AlertCircle, Mail, Globe,
  UserPlus, LogIn, LayoutGrid, Upload, Users, List, FileVideo,
  Save, Trash2, ArrowRight, FileSpreadsheet, Download, CloudUpload,
  Search, Filter, ChevronLeft, ChevronRight, MoreVertical, Shield, UserCheck,
  Settings, Play, Clock, HardDrive, Plus, X, Activity, Grid, Calendar, Monitor, ArrowRightLeft, RotateCcw,
  BookOpen, Check
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import * as XLSX from "xlsx";
import { normalizeDate } from "@/lib/dateHelper";
import AuthUI from "./AuthUI";
import { useProfile } from "@/hooks/useProfile";
import AttendanceTracing from "./AttendanceTracing";
import BCDBManager from "./BCDBManager";
import AdminPolicyManager from "./AdminPolicyManager";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import NotificationsHistoryList from "./NotificationsHistoryList";

type ActiveView = "home" | "bc-class" | "users" | "youtube-channels" | "usage-analytics" | "attendance-machines" | "attendance-tracing" | "bcdb" | "policies" | "notifications";

export default function AdminPanel() {
  const searchParams = useSearchParams();

  const [session, setSession] = useState<any>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [activeView, setActiveView] = useState<ActiveView>(
    (searchParams.get("view") as ActiveView) || "home"
  );

  // -- Attendance Sub-View --
  const [attendanceSubView, setAttendanceSubView] = useState<"devices" | "mappings" | "vm-incharge">("devices");
  const [attendanceMappings, setAttendanceMappings] = useState<any[]>([]);
  const [vmInchargeAssignments, setVmInchargeAssignments] = useState<any[]>([]);
  const [vmMachineId, setVmMachineId] = useState("");
  const [vmInchargeUserId, setVmInchargeUserId] = useState("");
  const [vmInchargeSearch, setVmInchargeSearch] = useState("");
  const [vmUserDropdownOpen, setVmUserDropdownOpen] = useState(false);
  const [mappingMachineId, setMappingMachineId] = useState("");
  const [mappingZKId, setMappingZKId] = useState("");
  const [mappingEmail, setMappingEmail] = useState("");
  const [mappingSearch, setMappingSearch] = useState("");
  const [isUploadingMapping, setIsUploadingMapping] = useState(false);

  // Synchronize state with URL changes (Back/Forward buttons)
  useEffect(() => {
    const view = searchParams.get("view") as ActiveView || "home";
    if (view !== activeView) {
      setActiveView(view);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateToView = (view: ActiveView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "home") {
      params.delete("view");
    } else {
      params.set("view", view);
    }
    router.push(`${pathname}${params.toString() ? '?' + params.toString() : ''}`);
  };

  const [uploadMode, setUploadMode] = useState<"single" | "bulk">("single");
  const [bcViewMode, setBcViewMode] = useState<"list" | "grid">("list");
  const [userViewMode, setUserViewMode] = useState<"list" | "grid">("list");

  // Auth State
  const [authError, setAuthError] = useState("");

  // Single Form State
  const [link, setLink] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");

  // Bulk Form State
  const [bulkData, setBulkData] = useState("");

  // Lectures Management State
  const [lectures, setLectures] = useState<any[]>([]);
  const [loadingLectures, setLoadingLectures] = useState(false);
  const [lectureSearch, setLectureSearch] = useState("");
  const [lecturePage, setLecturePage] = useState(1);
  const [lecturesPerPage, setLecturesPerPage] = useState(10);

  // User Mgmt State
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | "all">("all");
  const [openRoleDropdownUserId, setOpenRoleDropdownUserId] = useState<string | number | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);


  // YouTube Channel Mgmt State
  const [ytChannels, setYtChannels] = useState<any[]>([]);
  const [loadingYt, setLoadingYt] = useState(false);
  const [ytModalOpen, setYtModalOpen] = useState(false);
  const [activeYtChannel, setActiveYtChannel] = useState<any>(null);
  const [isFetchingYt, setIsFetchingYt] = useState(false);
  const [isUploadingYt, setIsUploadingYt] = useState(false);
  const [syncingChannels, setSyncingChannels] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState<Record<string, { pages: number, total: number }>>({});


  // YouTube Channel Assignments
  const [ytAssignments, setYtAssignments] = useState<any[]>([]);
  const [ytUserSearch, setYtUserSearch] = useState("");
  const [ytUserDropdownOpen, setYtUserDropdownOpen] = useState(false);
  const [ytSelectedUserIds, setYtSelectedUserIds] = useState<Set<string>>(new Set());



  // Analytics State
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<any[]>([]);
  const [loadingExpanded, setLoadingExpanded] = useState(false);
  const [analyticsPage, setAnalyticsPage] = useState(1);
  const [expandedPage, setExpandedPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [expandedRowsPerPage, setExpandedRowsPerPage] = useState(10);

  // Attendance Management State
  const [attendanceMachines, setAttendanceMachines] = useState<any[]>([]);
  const [attendanceSettings, setAttendanceSettings] = useState<any>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [newMachineSN, setNewMachineSN] = useState("");
  const [newMachineDesc, setNewMachineDesc] = useState("");
  const [newMachineStart, setNewMachineStart] = useState("02:00:00");
  const [newMachineEnd, setNewMachineEnd] = useState("07:30:00");
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // Broadcast State
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcTarget, setBcTarget] = useState<"all" | "bcdb" | "manual">("all");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isRunningGlobalSync, setIsRunningGlobalSync] = useState(false);

  // Push Notifications Hook
  const { pushEnabled, subscribe: subscribePush, permission: pushPermission } = usePushNotifications(session);

  const totalAnalyticsPages = Math.ceil((history || []).length / rowsPerPage);
  const totalExpandedPages = Math.ceil((expandedUsers || []).length / expandedRowsPerPage);

  async function fetchAnalytics() {
    if (!session || profile?.role !== 1) return;
    setLoadingAnalytics(true);
    try {
      const res = await fetch("/api/admin/analytics", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (data.history) setHistory(data.history);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalytics(false);
    }
  }

  async function fetchDetailedUsers(date: string) {
    setExpandedDate(date);
    setLoadingExpanded(true);
    try {
      const res = await fetch(`/api/admin/analytics?date=${date}`, {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.users) setExpandedUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingExpanded(false);
    }
  }

  // Profile & Auth Hooks
  const { profile, loading: loadingProfile, error: profileError, refreshProfile } = useProfile(session);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);


  const fetchAttendanceConfig = async () => {
    if (!session || profile?.role !== 1) return;
    setLoadingAttendance(true);
    try {
      const res = await fetch("/api/admin/attendance-config", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.machines) setAttendanceMachines(data.machines);
      if (data.settings) {
        setAttendanceSettings({
          ...data.settings,
          prasadam_machine_ids: data.settings.prasadam_machine_ids || []
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachineSN) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/attendance-config", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "add_machine",
          data: {
            serial_number: newMachineSN,
            description: newMachineDesc,
            ingestion_start: newMachineStart,
            ingestion_end: newMachineEnd
          }
        })
      });
      if (res.ok) {
        setNewMachineSN("");
        setNewMachineDesc("");
        setNewMachineStart("02:00:00");
        setNewMachineEnd("11:00:00");
        fetchAttendanceConfig();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingSettings(true);
    try {
      const res = await fetch("/api/admin/attendance-config", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "update_settings",
          data: attendanceSettings
        })
      });
      if (res.ok) {
        alert("Settings saved successfully!");
      } else {
        const errData = await res.json();
        alert("Failed to save settings: " + (errData.error || res.statusText));
      }
    } catch (err: any) {
      console.error(err);
      alert("Network error: " + err.message);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const updateMachineSettings = async (id: string, updates: any) => {
    try {
      const res = await fetch("/api/admin/attendance-config", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "update_machine",
          data: { id, ...updates }
        })
      });
      if (res.ok) fetchAttendanceConfig();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAttendanceMappings = async () => {
    if (!session || profile?.role !== 1) return;
    try {
      const res = await fetch("/api/admin/attendance-mapping", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.mappings) setAttendanceMappings(data.mappings);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchVirtualMachineInchargeData = async () => {
    if (!session || profile?.role !== 1) return;
    try {
      const res = await fetch("/api/admin/virtual-machine-incharge", {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok && data.assignments) setVmInchargeAssignments(data.assignments);
    } catch (err) {
      console.error(err);
    }
  };

  const assignVirtualMachineIncharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vmMachineId || !vmInchargeUserId) {
      setSubmitMessage({ type: "error", text: "Please select both virtual machine and incharge user." });
      setTimeout(() => setSubmitMessage(null), 4000);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/virtual-machine-incharge", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "assign_incharge",
          data: { machine_id: vmMachineId, incharge_user_id: vmInchargeUserId },
        }),
      });
      const payload = await res.json();
      if (res.ok) {
        setSubmitMessage({ type: "success", text: "Virtual machine incharge assigned successfully." });
        setVmMachineId("");
        setVmInchargeUserId("");
        fetchVirtualMachineInchargeData();
        fetchUsers();
      } else {
        setSubmitMessage({ type: "error", text: payload?.error || "Failed to assign incharge." });
      }
    } catch (err: any) {
      setSubmitMessage({ type: "error", text: err?.message || "Network error while assigning incharge." });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitMessage(null), 5000);
    }
  };

  const deleteVirtualMachineInchargeAssignment = async (id: string) => {
    if (!confirm("Remove this virtual machine incharge assignment?")) return;
    try {
      const res = await fetch(`/api/admin/virtual-machine-incharge?id=${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (res.ok) fetchVirtualMachineInchargeData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mappingMachineId || !mappingZKId || !mappingEmail) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/attendance-mapping", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "add_mapping",
          data: { machine_id: mappingMachineId, zk_user_id: mappingZKId, user_email: mappingEmail }
        })
      });
      const responseData = await res.json();
      if (res.ok) {
        setMappingZKId("");
        setMappingEmail("");
        setSubmitMessage({ type: "success", text: "User mapping created successfully!" });
        fetchAttendanceMappings();
      } else {
        setSubmitMessage({ type: "error", text: responseData.error || "Failed to create mapping." });
      }
      setTimeout(() => setSubmitMessage(null), 5000);
    } catch (err) {
      console.error(err);
      setSubmitMessage({ type: "error", text: "A network error occurred. Please try again." });
      setTimeout(() => setSubmitMessage(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteMapping = async (id: string) => {
    if (!confirm("Remove this mapping?")) return;
    try {
      const res = await fetch(`/api/admin/attendance-mapping?id=${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      if (res.ok) fetchAttendanceMappings();
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkMappingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingMapping(true);
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const mappedData = data.map((row: any) => {
          const rawMachine = row["Machine ID"] || row["machine_id"] || row["Machine SN"] || row["Machine Serial Number"];
          const rawZKId = String(row["ZK User ID"] || row["zk_user_id"] || row["User ID"] || row["User Pin"]);
          const rawEmail = row["User Email"] || row["user_email"] || row["Email"] || row["email"];

          // Try to lookup UUID from Serial Number first
          const foundMachine = attendanceMachines.find(m => m.serial_number === String(rawMachine) || m.id === rawMachine);

          if (!foundMachine) return null;

          return {
            machine_id: foundMachine.id,
            zk_user_id: rawZKId,
            user_email: rawEmail
          };
        }).filter(Boolean);

        if (mappedData.length > 0) {
          const res = await fetch("/api/admin/attendance-mapping", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${session.access_token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "bulk_add_mapping", data: mappedData })
          });
          if (res.ok) {
            setSubmitMessage({ type: "success", text: `Successfully mapped ${mappedData.length} users!` });
            fetchAttendanceMappings();
          }
        }
      } catch (err) {
        console.error(err);
        setSubmitMessage({ type: "error", text: "Failed to parse Excel file." });
      } finally {
        setIsUploadingMapping(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const deleteMachine = async (id: string) => {
    if (!confirm("Remove this machine?")) return;
    try {
      await fetch(`/api/admin/attendance-config?id=${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      fetchAttendanceConfig();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    if (!session || !isManager) return;
    setLoadingUsers(true);
    try {
      const response = await fetch("/api/admin/users", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await response.json();
      if (data.profiles) setUsers(data.profiles);
    } catch (err) {
      console.error("Users fetch error:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const roles = Array.isArray(profile?.roles) ? profile.roles : [profile?.role].filter(r => r !== null && r !== undefined);
  const isSuperAdmin = roles.includes(1);
  const isManager = isSuperAdmin || roles.includes(5);
  const canUploadVideos = isSuperAdmin || roles.includes(2);

  // Fetch Data Hooks
  useEffect(() => {
    if (activeView === "users") fetchUsers();
    if (activeView === "notifications") fetchUsers(); // Pre-load users for manual targeting
    if (activeView === "bc-class") fetchLectures();
    if (activeView === "youtube-channels") {
      fetchYtChannels();
      fetchUsers();
    }
    if (activeView === "usage-analytics") fetchAnalytics();
    if (activeView === "attendance-machines" && isSuperAdmin) {
      fetchAttendanceConfig();
      fetchAttendanceMappings();
      fetchUsers(); // Required for email suggestions
      fetchVirtualMachineInchargeData();
    }
  }, [activeView, session, profile?.roles, profile?.role, isSuperAdmin, isManager]);

  // Poll for syncing channels progress in background (silent refresh)
  useEffect(() => {
    if (activeView !== "youtube-channels") return;

    const hasSyncingChannel = ytChannels.some(c => c.sync_status === "syncing");
    if (!hasSyncingChannel) return;

    const interval = setInterval(() => {
      fetchYtChannels(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [ytChannels, activeView]); // eslint-disable-line react-hooks/exhaustive-deps


  const roleNames: Record<number, string> = {
    1: "Super Admin",
    2: "Video Uploader",
    3: "Attendance Incharge",
    4: "BC Access",
    5: "Manager",
    6: "Viewer",
    7: "Virtual Machine Incharge"
  };

  const roleColors: Record<number, string> = {
    1: "bg-red-50 text-red-700 border-red-100",
    2: "bg-orange-50 text-orange-700 border-orange-100",
    3: "bg-blue-50 text-blue-700 border-blue-100",
    4: "bg-emerald-50 text-emerald-700 border-emerald-100",
    5: "bg-purple-50 text-purple-700 border-purple-100",
    6: "bg-slate-50 text-slate-700 border-slate-100",
    7: "bg-cyan-50 text-cyan-700 border-cyan-100"
  };

  // Pagination Logic
  const filteredLectures = (lectures || []).filter(l =>
    l.title?.toLowerCase().includes(lectureSearch.toLowerCase()) ||
    l.speaker_name?.toLowerCase().includes(lectureSearch.toLowerCase())
  );
  const totalLecturePages = Math.ceil(filteredLectures.length / (lecturesPerPage || 10));
  const paginatedLectures = filteredLectures.slice((lecturePage - 1) * lecturesPerPage, lecturePage * lecturesPerPage);

  const filteredUsers = (users || []).filter(u => {
    const s = userSearch.toLowerCase();
    const matchesSearch =
      u.email?.toLowerCase().includes(s) ||
      (u.full_name?.toLowerCase().includes(s)) ||
      (u.temple?.toLowerCase().includes(s)) ||
      (u.mobile?.toLowerCase().includes(s));
    const matchesRole = roleFilter === "all" || (Array.isArray(u.roles) ? u.roles.includes(Number(roleFilter)) : u.role === Number(roleFilter));
    return matchesSearch && matchesRole;
  });

  const totalUserPages = Math.ceil(filteredUsers.length / (usersPerPage || 10));
  const paginatedUsers = filteredUsers.slice((userPage - 1) * usersPerPage, userPage * usersPerPage);

  // Pagination UI Helper
  const generatePagination = (currentPage: number, totalPages: number) => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }

    if (currentPage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
  };

  const getCleanId = (idOrUrl: string) => {
    if (!idOrUrl) return "";
    if (idOrUrl.length === 11 && !idOrUrl.includes("/")) return idOrUrl;
    return extractYouTubeId(idOrUrl) || "";
  };

  useEffect(() => {
    setUserPage(1);
  }, [userSearch, roleFilter, usersPerPage, userViewMode]);

  useEffect(() => {
    setLecturePage(1);
  }, [lectureSearch, lecturesPerPage, bcViewMode]);

  const fetchLectures = async () => {
    if (!session) return;
    setLoadingLectures(true);
    try {
      const resp = await fetch("/api/admin/lectures", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await resp.json();
      if (data.lectures) setLectures(data.lectures);
    } catch (err) {
      console.error("Lectures fetch error:", err);
    } finally {
      setLoadingLectures(false);
    }
  };

  const deleteLecture = async (id: string) => {
    if (!confirm("Are you sure you want to delete this lecture?")) return;
    try {
      const resp = await fetch(`/api/admin/lectures?id=${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      if (resp.ok) fetchLectures();
    } catch (err) {
      console.error("Delete lecture error:", err);
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm("DANGER: This will permanently delete this user and their account. Continue?")) return;
    try {
      const resp = await fetch(`/api/admin/users?id=${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      if (resp.ok) fetchUsers();
    } catch (err) {
      console.error("Delete user error:", err);
    }
  };

  const updateUserRoles = async (targetId: string, newRoles: number[]) => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ targetUserId: targetId, newRoles })
      });
      if (response.ok) fetchUsers();
    } catch (err) {
      console.error("Update roles error:", err);
    }
  };

  const handleGoogleLogin = async () => {
    // Moved to AuthUI
  };

  const handleEmailAuth = async (e: any) => {
    // Moved to AuthUI
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bcTitle || !bcBody) return;

    setIsBroadcasting(true);
    setSubmitMessage(null);

    try {
      const res = await fetch("/api/notifications/broadcast", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: bcTitle,
          body: bcBody,
          target: bcTarget,
          userIds: Array.from(selectedUserIds)
        })
      });

      if (res.ok) {
        setSubmitMessage({ type: "success", text: "Broadcast initiated successfully! Users will receive it shortly." });
        setBcTitle("");
        setBcBody("");
      } else {
        const err = await res.json();
        setSubmitMessage({ type: "error", text: err.error || "Broadcast failed" });
      }
    } catch (err) {
      setSubmitMessage({ type: "error", text: "Network error during broadcast" });
    } finally {
      setIsBroadcasting(false);
      setTimeout(() => setSubmitMessage(null), 5000);
    }
  };

  const extractYouTubeId = (url: string) => {
    if (!url) return null;

    // Robust Regex to match various YouTube URL formats
    // Handles: watch?v=, youtu.be/, embed/, v/, live/, /u/w/, youtube-nocookie.com, etc.
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube-nocookie\.com\/embed\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);

    if (match && match[1]) return match[1];

    // Fallback for short internal links if needed
    const shortLiveMatch = url.match(/live\/([a-zA-Z0-9_-]{11})/);
    return (shortLiveMatch && shortLiveMatch[1]) ? shortLiveMatch[1] : null;
  };

  const downloadSampleCSV = () => {
    const headers = "YouTube Link,Title,Speaker Name,Recording Date (YYYY-MM-DD)\n";
    const sampleRows = "https://www.youtube.com/watch?v=dQw4w9WgXcQ,Topic Title,H.G. Speaker Prabhu,2024-03-29\n";
    const blob = new Blob([headers + sampleRows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_lectures.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Date normalization moved to '@/lib/dateHelper'

  const processParsedRows = (rawRows: any[][]) => {
    // Skip header if it feels like one
    const startIdx = (rawRows[0] && String(rawRows[0][0]).toLowerCase().includes('youtube')) ? 1 : 0;

    const formattedLines = rawRows.slice(startIdx).map(row => {
      if (!row || row.length === 0) return null;
      const url = String(row[0] || "").trim();
      if (!url) return null;

      const title = String(row[1] || "").trim();
      const speaker = String(row[2] || "").trim();
      const date = row[3] ? normalizeDate(String(row[3])) : new Date().toISOString().split('T')[0];

      return `${url} | ${title} | ${speaker} | ${date}`;
    }).filter(Boolean);

    if (formattedLines.length > 0) {
      setBulkData((prev: string) => prev + (prev ? "\n" : "") + formattedLines.join("\n"));
      setSubmitMessage({
        type: "success",
        text: `Imported ${formattedLines.length} rows with smart data cleaning. Review and publish.`
      });
    } else {
      setSubmitMessage({ type: "error", text: "No valid data rows found in the file." });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = (event) => {
      try {
        if (isExcel) {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          processParsedRows(rows);
        } else {
          const text = event.target?.result as string;
          const rows = text.split(/\r?\n/).filter(l => l.trim()).map(line => {
            return line.split(/[|,]/).map(p => p.trim().replace(/^"|"$/g, ''));
          });
          processParsedRows(rows);
        }
      } catch (err) {
        console.error("File parse error:", err);
        setSubmitMessage({ type: "error", text: "Failed to parse file. Please ensure it's a valid Excel or CSV." });
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitMessage(null);
    setIsSubmitting(true);

    let payload: any = [];

    if (uploadMode === "single") {
      const videoId = extractYouTubeId(link);
      if (!videoId) {
        setSubmitMessage({ type: "error", text: "Invalid YouTube link format." });
        setIsSubmitting(false);
        return;
      }
      payload = {
        youtube_id: videoId,
        title: title || "Untitled Lecture",
        speaker_name: speaker || "Unknown Speaker",
        date: normalizeDate(date)
      };
    } else {
      // Process bulk data (format: URL | Title | Speaker | Date per line)
      const lines = bulkData.split("\n").filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split("|").map(x => x.trim());
        if (parts.length >= 1) {
          const [u, t, s, d] = parts;
          const vId = extractYouTubeId(u);
          if (vId) {
            payload.push({
              youtube_id: vId,
              title: t || "Untitled Lecture",
              speaker_name: s || "Unknown Speaker",
              date: normalizeDate(d)
            });
          }
        }
      }
      if (payload.length === 0) {
        setSubmitMessage({ type: "error", text: "No valid YouTube links found in the batch data." });
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const response = await fetch("/api/admin/lectures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      setSubmitMessage({ type: "success", text: `Successfully published ${Array.isArray(payload) ? payload.length : 1} lecture(s)!` });
      if (uploadMode === "single") {
        setLink(""); setSpeaker(""); setDate(""); setTitle("");
      } else {
        setBulkData("");
      }
    } catch (err: any) {
      setSubmitMessage({ type: "error", text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingProfile || (!session && !profileError)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-devo-600" />
        <p className="text-devo-800 font-medium animate-pulse">Loading secure dashboard...</p>
      </div>
    );
  }

  if (!session) {
    window.location.href = "/";
    return null;
  }



  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 pt-10">
      <div className={`${(activeView === 'attendance-tracing' || activeView === 'bcdb') ? 'max-w-none px-4 sm:px-10' : 'max-w-7xl mx-auto px-4'}`}>
        {/* VIEW: Dashboard Home (Grid Cards) */}
        {activeView === "home" && (
          <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center space-y-1">
              <h1 className="text-2xl sm:text-5xl font-outfit font-black text-devo-950 tracking-tight leading-tight">System <span className="text-transparent bg-clip-text bg-gradient-to-r from-devo-600 to-orange-500">Workspace</span></h1>
              <p className="text-slate-400 font-bold text-[10px] sm:text-base uppercase tracking-[0.2em]">Platform Resource Manager</p>
            </div>

            {/* Notification Setup Banner for Managers */}
            {isManager && !pushEnabled && (
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 sm:p-8 rounded-[2rem] text-white shadow-2xl shadow-purple-200 border border-white/20 flex flex-col sm:flex-row items-center justify-between gap-6 animate-pulse hover:animate-none group transition-all">
                <div className="flex items-center gap-6 text-center sm:text-left">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform">
                    <AlertCircle className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black font-outfit">Action Required: Enable Alerts</h3>
                    <p className="text-white/80 font-medium text-sm mt-1">You are missing travel desk alerts. Enable push notifications to receive instant mobile updates.</p>
                  </div>
                </div>
                <button
                  onClick={() => subscribePush().catch(e => setSubmitMessage({ type: "error", text: "Permission Blocked: Enable in settings" }))}
                  className="bg-white text-purple-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-xl active:scale-95 whitespace-nowrap"
                >
                  Enable Notifications Now
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {/* BC Class Card */}
              {canUploadVideos && (
                <button
                  onClick={() => navigateToView("bc-class")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-orange-500 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-orange-500 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-200 group-hover:rotate-6 transition-transform shrink-0">
                    <FileVideo className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">BC Class</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Publish Single or Bulk YouTube lectures and manage the entire video repository.</p>
                    </div>
                    <div className="flex items-center gap-2 text-orange-600 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}

              {/* User Roles Card */}
              {isSuperAdmin && (
                <button
                  onClick={() => navigateToView("users")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-blue-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100 group-hover:-rotate-6 transition-transform shrink-0">
                    <Users className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">User Roles</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Control system access, assign authorities, and audit all registered members.</p>
                    </div>
                    <div className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}

              {/* YouTube Channels Card */}
              {isSuperAdmin && (
                <button
                  onClick={() => navigateToView("youtube-channels")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-indigo-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-indigo-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 group-hover:-rotate-3 transition-transform shrink-0">
                    <Play className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">YouTube Hub</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Manage devotional channels, update handles, and fix blank photos with ease.</p>
                    </div>
                    <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}

              {/* Usage Insights Card */}
              {isSuperAdmin && (
                <button
                  onClick={() => navigateToView("usage-analytics")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-emerald-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100 group-hover:-rotate-6 transition-transform shrink-0">
                    <Clock className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">Usage Insights</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Track daily visits, monitor user activity, and visualize community engagement.</p>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}
              {/* Attendance Machine Card */}
              {isSuperAdmin && (
                <button
                  onClick={() => navigateToView("attendance-machines")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-cyan-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-cyan-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-cyan-100 group-hover:-rotate-12 transition-transform shrink-0">
                    <Activity className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">Attendance Hub</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Manage biometric devices, authorize new serial numbers, and tune ingestion windows.</p>
                    </div>
                    <div className="flex items-center gap-2 text-cyan-600 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}

              {/* Notification Center Card */}
              {isManager && (
                <button
                  onClick={() => navigateToView("notifications")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-purple-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-purple-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-100 group-hover:-rotate-6 transition-transform shrink-0">
                    <Mail className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">Notification Center</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Send important broadcast alerts and updates to all registered members.</p>
                    </div>
                    <div className="flex items-center gap-2 text-purple-600 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}
              {/* Attendance Tracing Card */}
              {isManager && (
                <button
                  onClick={() => navigateToView("attendance-tracing")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-indigo-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-indigo-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 group-hover:-rotate-6 transition-transform shrink-0">
                    <Monitor className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">Attendance Tracing</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Monitor 3-session attendance, view matrix reports, and switch between users and machines.</p>
                    </div>
                    <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}

              {/* BCDB Card */}
              {isManager && (
                <button
                  onClick={() => navigateToView("bcdb")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-indigo-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-indigo-900 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 group-hover:-rotate-3 transition-transform shrink-0">
                    <Grid className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">BCDB Portal</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Access the Ashram Connect directory, manage personnel records, and handle master imports.</p>
                    </div>
                    <div className="flex items-center gap-2 text-indigo-900 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}

              {/* Policy Manual Card */}
              {isManager && (
                <button
                  onClick={() => navigateToView("policies")}
                  className="group relative bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-slate-200 hover:border-indigo-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-left overflow-hidden h-auto sm:h-[260px] flex sm:block items-center gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500 hidden sm:block" />
                  <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-indigo-700 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 group-hover:-rotate-6 transition-transform shrink-0">
                    <BookOpen className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="relative z-10 sm:mt-4 flex-1 min-w-0">
                    <div>
                      <h3 className="text-lg sm:text-2xl font-black text-devo-950 uppercase tracking-tight sm:normal-case">Policy Manual</h3>
                      <p className="text-slate-500 font-medium text-[10px] sm:text-sm mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">Upload official Ashram guidelines and PDFs for restricted member access.</p>
                    </div>
                    <div className="flex items-center gap-2 text-indigo-700 font-black text-[10px] uppercase tracking-widest mt-1 sm:mt-4">
                      Enter <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform" />
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}

        {/* VIEW: BC Class Uploads */}
        {activeView === "bc-class" && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <button
                onClick={() => navigateToView("home")}
                className="flex items-center gap-2 text-devo-600 font-black uppercase tracking-widest text-xs hover:gap-3 transition-all"
              >
                <ArrowRight className="w-4 h-4 rotate-180" /> Back to Dashboard
              </button>
              <div className="flex p-1 bg-white rounded-2xl shadow-sm border border-slate-100">
                <button
                  onClick={() => setUploadMode('single')}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${uploadMode === 'single' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-500'}`}
                >
                  Single Upload
                </button>
                <button
                  onClick={() => setUploadMode('bulk')}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${uploadMode === 'bulk' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-500'}`}
                >
                  Bulk Import
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Form Side */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl border border-slate-300">
                  <h2 className="text-2xl font-outfit font-black text-devo-950 mb-6 flex items-center gap-3">
                    <CloudUpload className="w-6 h-6 text-orange-500" /> Upload Work
                  </h2>

                  {submitMessage && (
                    <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${submitMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {submitMessage.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                      <p className="font-bold text-sm">{submitMessage.text}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {uploadMode === "single" ? (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">YouTube Link</label>
                          <input type="url" required placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-300 rounded-2xl focus:bg-white focus:border-orange-400 outline-none transition-all font-bold" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Speech Title</label>
                          <input type="text" required placeholder="Subject of lecture" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-300 rounded-2xl focus:bg-white focus:border-orange-400 outline-none transition-all font-bold" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Speaker</label>
                          <input type="text" required placeholder="Name" value={speaker} onChange={(e) => setSpeaker(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-300 rounded-2xl focus:bg-white focus:border-orange-400 outline-none transition-all font-bold" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Recording Date</label>
                          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-300 rounded-2xl focus:bg-white focus:border-orange-400 outline-none transition-all font-bold" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="relative group">
                            <input type="file" accept=".xlsx,.csv" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                            <div className="h-24 bg-orange-50 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-center p-2 group-hover:bg-white group-hover:border-orange-400 transition-all">
                              <FileSpreadsheet className="w-6 h-6 text-orange-500" />
                              <p className="text-[10px] font-black uppercase text-orange-600 mt-1">Upload File</p>
                            </div>
                          </div>
                          <button type="button" onClick={downloadSampleCSV} className="h-24 bg-slate-50 border-2 border-slate-300 rounded-2xl flex flex-col items-center justify-center text-center p-2 hover:bg-white hover:border-orange-500 transition-all shadow-sm">
                            <Download className="w-6 h-6 text-slate-400" />
                            <p className="text-[10px] font-black uppercase text-slate-500 mt-1">Template</p>
                          </button>
                        </div>
                        <textarea rows={6} placeholder="Link | Title | Speaker | Date" value={bulkData} onChange={(e) => setBulkData(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-300 rounded-[2rem] focus:bg-white focus:border-orange-400 font-mono text-xs" />
                      </div>
                    )}

                    <button disabled={isSubmitting} className="w-full bg-orange-500 hover:bg-black py-4 rounded-2xl text-white font-black text-sm tracking-widest uppercase transition-all shadow-lg active:scale-95 disabled:opacity-50">
                      {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Publish to Library"}
                    </button>
                  </form>
                </div>
              </div>

              {/* List Side */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-300">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <h2 className="text-2xl font-outfit font-black text-devo-950 flex items-center gap-3">
                      <HardDrive className="w-7 h-7 text-devo-600" /> Manage Lectures
                    </h2>
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-4 top-3 h-4 w-4 text-slate-300" />
                        <input
                          type="text"
                          placeholder="Search records..."
                          value={lectureSearch}
                          onChange={(e) => setLectureSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl focus:bg-white focus:border-orange-400 outline-none transition-all text-sm font-bold"
                        />
                      </div>
                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button
                          onClick={() => setBcViewMode("list")}
                          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${bcViewMode === "list" ? "bg-white text-devo-950 shadow-sm border border-slate-200/50" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          <List className="w-4 h-4" /> List
                        </button>
                        <button
                          onClick={() => setBcViewMode("grid")}
                          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${bcViewMode === "grid" ? "bg-white text-devo-950 shadow-sm border border-slate-200/50" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          <LayoutGrid className="w-4 h-4" /> Grid
                        </button>
                      </div>
                    </div>
                  </div>

                  {bcViewMode === "list" ? (
                    <div className="overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="hidden md:table w-full text-left border-collapse min-w-[600px]">
                          <thead>
                            <tr className="border-b border-slate-50">
                              <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Preview</th>
                              <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Lecture Info</th>
                              <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {loadingLectures ? (
                              <tr><td colSpan={3} className="py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-devo-100" /></td></tr>
                            ) : paginatedLectures.length === 0 ? (
                              <tr><td colSpan={3} className="py-20 text-center font-bold text-slate-300">No lectures found</td></tr>
                            ) : paginatedLectures.map(l => (
                              <tr key={l.id} className="group hover:bg-slate-50/50 transition-colors">
                                <td className="py-4 px-2">
                                  <div className="w-20 aspect-video rounded-lg overflow-hidden bg-slate-100 relative border-2 border-slate-300">
                                    {getCleanId(l.youtube_id) ? (
                                      <Image
                                        src={`https://i.ytimg.com/vi/${getCleanId(l.youtube_id)}/mqdefault.jpg`}
                                        alt={l.title}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-slate-200">
                                        <FileVideo className="w-6 h-6 text-slate-400" />
                                      </div>
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Play className="w-5 h-5 text-white fill-current" />
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 px-4 min-w-[200px]">
                                  <p className="font-bold text-devo-950 text-sm line-clamp-1">{l.title}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs font-bold text-devo-400">{l.speaker_name}</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-200" />
                                    <span className="text-xs font-medium text-slate-400">{new Date(l.date).toLocaleDateString()}</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <button
                                    onClick={() => deleteLecture(l.id)}
                                    className="p-2.5 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Ultra-Compact Mobile List (Pure Detail) */}
                      <div className="md:hidden flex flex-col gap-2 mt-4">
                        {loadingLectures ? (
                          <div className="py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-devo-100" /></div>
                        ) : paginatedLectures.length === 0 ? (
                          <div className="py-20 text-center font-bold text-slate-300">No lectures found</div>
                        ) : paginatedLectures.map(l => (
                          <div key={`mobile-list-detail-${l.id}`} className="flex items-center justify-between gap-4 p-4 bg-white border-2 border-slate-300 rounded-2xl shadow-sm relative group overflow-hidden">
                            <div className="flex-1 min-w-0 pr-4">
                              <p className="font-black text-devo-950 text-sm leading-tight line-clamp-2 mb-2">{l.title}</p>
                              <div className="flex items-center gap-2 mt-1 px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg w-fit">
                                <span className="text-[10px] font-black text-devo-600 truncate max-w-[120px]">{l.speaker_name}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                                <span className="text-[10px] font-black text-slate-400 whitespace-nowrap">{new Date(l.date).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteLecture(l.id)}
                              className="p-3 text-red-500 bg-red-50 hover:bg-red-500 hover:text-white border-2 border-transparent active:border-red-100 rounded-xl transition-all shadow-sm"
                              title="Delete"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                      {loadingLectures ? (
                        <div className="col-span-full py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-devo-100" /></div>
                      ) : paginatedLectures.length === 0 ? (
                        <div className="col-span-full py-20 text-center font-bold text-slate-300">No lectures found</div>
                      ) : paginatedLectures.map(l => (
                        <div key={`grid-${l.id}`} className="flex flex-col gap-3 p-4 bg-white border-2 border-slate-300 rounded-2xl shadow-sm relative group hover:border-orange-400 focus-within:border-orange-400 transition-all">
                          <div className="w-full aspect-video rounded-xl overflow-hidden bg-slate-100 relative shadow-sm border-2 border-slate-300">
                            {getCleanId(l.youtube_id) ? (
                              <Image
                                src={`https://i.ytimg.com/vi/${getCleanId(l.youtube_id)}/mqdefault.jpg`}
                                alt={l.title}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-200">
                                <FileVideo className="w-8 h-8 text-slate-400" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <Play className="w-10 h-10 text-white fill-current opacity-80" />
                            </div>
                          </div>

                          <div className="flex flex-col flex-1 min-w-0">
                            <h3 className="font-black text-devo-950 text-sm sm:text-base leading-snug line-clamp-2">{l.title}</h3>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-auto pt-3 gap-2">
                              <span className="text-[10px] sm:text-[11px] font-black text-devo-600 truncate bg-orange-50 border border-orange-100 px-2 py-1 rounded-md inline-block w-fit">{l.speaker_name}</span>
                              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(l.date).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => deleteLecture(l.id)}
                            className="absolute top-2 right-2 p-2 bg-white/90 backdrop-blur-sm text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-md border-2 border-slate-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 z-10"
                            title="Delete Lecture"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  <div className="mt-8 pt-6 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-slate-400 uppercase">Rows:</span>
                      <select
                        value={lecturesPerPage}
                        onChange={(e) => { setLecturesPerPage(Number(e.target.value)); setLecturePage(1); }}
                        className="bg-slate-50 border-2 border-slate-300 rounded-lg px-2 py-1 text-xs font-bold font-outfit focus:bg-white focus:border-orange-400"
                      >
                        {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <span className="text-[10px] font-bold text-slate-400 italic">Showing {(lecturePage - 1) * lecturesPerPage + 1}-{Math.min(lecturePage * lecturesPerPage, filteredLectures.length)} of {filteredLectures.length}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        disabled={lecturePage === 1}
                        onClick={() => setLecturePage(p => p - 1)}
                        className="p-3 rounded-2xl bg-white border-2 border-slate-300 text-devo-600 disabled:opacity-30 disabled:pointer-events-none hover:border-orange-400 transition-all shadow-sm"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-1">
                        {generatePagination(lecturePage, totalLecturePages).map((p, i) => (
                          typeof p === 'number' ? (
                            <button
                              key={i}
                              onClick={() => setLecturePage(p)}
                              className={`w-10 h-10 rounded-xl text-xs font-black transition-all border-2 ${lecturePage === p ? 'bg-devo-950 text-white border-devo-950 shadow-lg' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-500'}`}
                            >
                              {p}
                            </button>
                          ) : (
                            <span key={i} className="px-1 text-slate-300 font-bold">...</span>
                          )
                        ))}
                      </div>

                      <button
                        disabled={lecturePage === totalLecturePages}
                        onClick={() => setLecturePage(p => p + 1)}
                        className="p-3 rounded-2xl bg-white border-2 border-slate-300 text-devo-600 disabled:opacity-30 disabled:pointer-events-none hover:border-orange-400 transition-all shadow-sm"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: User Management */}
        {activeView === "users" && isSuperAdmin && (
          <div className="space-y-8 animate-in slide-in-from-right-4 duration-500 pb-20">
            <button
              onClick={() => setActiveView("home")}
              className="flex items-center gap-2 text-devo-600 font-black uppercase tracking-widest text-xs hover:gap-3 transition-all"
            >
              <ArrowRight className="w-4 h-4 rotate-180" /> Back to Dashboard
            </button>

            {/* User Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {[
                { label: 'Total Members', count: users.length, icon: Users, color: 'bg-indigo-600' },
                { label: 'Super Admins', count: users.filter(u => (Array.isArray(u.roles) ? u.roles.includes(1) : u.role === 1)).length, icon: Shield, color: 'bg-red-600' },
                { label: 'Video Uploaders', count: users.filter(u => (Array.isArray(u.roles) ? u.roles.includes(2) : u.role === 2)).length, icon: Upload, color: 'bg-orange-500' },
                { label: 'Managers', count: users.filter(u => (Array.isArray(u.roles) ? u.roles.includes(5) : u.role === 5)).length, icon: UserCheck, color: 'bg-emerald-600' }
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-[2rem] shadow-lg border border-slate-300 flex flex-col items-center text-center space-y-2">
                  <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center text-white shadow-lg`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                  <h4 className="text-2xl font-black text-devo-950">{stat.count}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] shadow-xl border border-slate-300">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
                <h2 className="text-3xl font-outfit font-black text-devo-950 flex items-center gap-4">
                  <Users className="w-8 h-8 text-blue-600" /> Member Access
                </h2>

                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-4 top-3 h-4 w-4 text-slate-300" />
                    <input
                      type="text"
                      placeholder="Find member..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl focus:bg-white focus:border-blue-400 outline-none transition-all text-sm font-bold"
                    />
                  </div>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                    className="bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest focus:bg-white focus:border-blue-400 outline-none"
                  >
                    <option value="all">Every Role</option>
                    {Object.entries(roleNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setUserViewMode("list")}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${userViewMode === "list" ? "bg-white text-devo-950 shadow-sm border border-slate-200/50" : "text-slate-400 hover:text-slate-600"}`}
                    >
                      <List className="w-4 h-4" /> List
                    </button>
                    <button
                      onClick={() => setUserViewMode("grid")}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${userViewMode === "grid" ? "bg-white text-devo-950 shadow-sm border border-slate-200/50" : "text-slate-400 hover:text-slate-600"}`}
                    >
                      <LayoutGrid className="w-4 h-4" /> Grid
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-visible">
                <div className="overflow-visible -mx-6 sm:mx-0">
                  <table className="hidden lg:table w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr>
                        <th className="px-6 pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Member Profile</th>
                        <th className="px-6 pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Access Credentials</th>
                        <th className="px-6 pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Authority Level</th>
                        <th className="px-6 pb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Settings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingUsers ? (
                        <tr><td colSpan={4} className="py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-100" /></td></tr>
                      ) : filteredUsers.length === 0 ? (
                        <tr><td colSpan={4} className="py-20 text-center font-bold text-slate-300">No members match search</td></tr>
                      ) : paginatedUsers.map((u: any) => (
                        <tr key={u.id} className="group hover:bg-blue-50/30 transition-colors">
                          <td className="px-6 py-6 font-bold text-slate-600 text-sm">
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-lg ${u.role === 1 ? 'bg-red-500' : 'bg-devo-600'}`}>
                                {u.full_name ? u.full_name[0].toUpperCase() : u.email?.[0]?.toUpperCase() || 'U'}
                              </div>
                              <div className="min-w-0">
                                <p className="font-black text-devo-950 text-base leading-none mb-1">{u.full_name || 'Incomplete Profile'}</p>
                                <p className="text-[11px] font-bold text-devo-600 uppercase tracking-widest">{u.temple || 'No Center'}</p>
                                <p className="text-[10px] font-medium text-slate-400 mt-1">{u.mobile || 'No Mobile'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-6 font-bold text-slate-600 text-sm">
                            {u.email}
                            <div className="text-[10px] font-black text-slate-300 mt-1 uppercase tracking-tighter">Joined: {new Date(u.created_at).toLocaleDateString()}</div>
                          </td>
                          <td className="px-6 py-6 border-slate-50">
                            <div className="flex flex-wrap gap-2">
                              {(Array.isArray(u.roles) ? u.roles : [u.role].filter((r: any) => r != null)).map((rId: any) => (
                                <span key={rId} className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest shadow-sm ${roleColors[Number(rId)] || 'bg-slate-50'}`}>
                                  {roleNames[Number(rId)] || 'Member'}
                                </span>
                              ))}
                              {(!Array.isArray(u.roles) || u.roles.length === 0) && !u.role && (
                                <span className="px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest shadow-sm bg-slate-50 text-slate-400">
                                  Member
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setOpenRoleDropdownUserId(prev => prev === u.id ? null : u.id)}
                                  className="bg-white border-2 border-slate-300 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:border-blue-400 transition-all shadow-sm flex items-center gap-2"
                                >
                                  Manage Roles <Plus className="w-3 h-3" />
                                </button>
                                <div className={`absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl transition-all p-2 z-[2000] ${openRoleDropdownUserId === u.id ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 py-2 border-b border-slate-50 mb-1">Select Roles</div>
                                  {Object.entries(roleNames).map(([id, name]) => {
                                    const rId = parseInt(id);
                                    const uRoles = Array.isArray(u.roles) ? u.roles : [u.role].filter((r: any) => r != null);
                                    const isSelected = uRoles.includes(rId);
                                    return (
                                      <button
                                        key={id}
                                        onClick={() => {
                                          const nextRoles = isSelected ? uRoles.filter((r: any) => r !== rId) : [...uRoles, rId];
                                          updateUserRoles(u.id, nextRoles);
                                        }}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                      >
                                        {name}
                                        {isSelected && <CheckCircle className="w-3 h-3" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <button
                                onClick={() => deleteUser(u.id)}
                                className="p-3 text-red-500 hover:text-white border-2 border-slate-300 hover:bg-red-600 rounded-xl transition-all shadow-sm"
                                title="Delete User Permanently"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Rendering Strategy */}
                <div className="lg:hidden mt-4">
                  {loadingUsers ? (
                    <div className="py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-100" /></div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="py-20 text-center font-bold text-slate-300">No members match search</div>
                  ) : userViewMode === "list" ? (
                    <div className="flex flex-col gap-2">
                      {paginatedUsers.map((u: any) => (
                        <div key={`mobile-user-list-final-${u.id}`} className="flex flex-col gap-3 p-3.5 bg-white border-2 border-slate-300 rounded-2xl shadow-sm relative group">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-devo-950 text-sm leading-tight truncate">{u.full_name || 'Incomplete Profile'}</p>
                              <p className="text-[10px] font-bold text-slate-400 truncate mt-0.5">{u.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {u.id !== session?.user?.id && (
                                <button
                                  onClick={() => deleteUser(u.id)}
                                  className="p-2 text-red-500 bg-red-50 hover:bg-red-500 hover:text-white border-2 border-transparent active:border-red-100 rounded-xl transition-all"
                                  title="Remove Member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                            <div className="relative flex-1">
                              <button
                                type="button"
                                onClick={() => setOpenRoleDropdownUserId(prev => prev === u.id ? null : u.id)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest flex items-center justify-between"
                              >
                                Roles <Plus className="w-3 h-3" />
                              </button>
                              <div className={`absolute bottom-full left-0 mb-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl transition-all p-1.5 z-[2000] ${openRoleDropdownUserId === u.id ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                                {Object.entries(roleNames).map(([id, name]) => {
                                  const rId = parseInt(id);
                                  const uRoles = Array.isArray(u.roles) ? u.roles : [u.role].filter((r: number | null): r is number => r != null);
                                  const isSelected = uRoles.includes(rId);
                                  return (
                                    <button
                                      key={id}
                                      onClick={() => {
                                        const nextRoles = isSelected ? uRoles.filter((r: any) => r !== rId) : [...uRoles, rId];
                                        updateUserRoles(u.id, nextRoles);
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-tight flex items-center justify-between mb-1 last:mb-0 ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-500'}`}
                                    >
                                      {name}
                                      {isSelected && <CheckCircle className="w-2.5 h-2.5" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase text-devo-600 truncate max-w-[120px]">
                              {u.temple || 'No Center'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Visual Card View */
                    <div className="flex flex-col gap-4">
                      {paginatedUsers.map((u: any) => (
                        <div key={`mobile-user-card-${u.id}`} className="flex flex-col gap-4 p-5 bg-white border-2 border-slate-300 rounded-2xl shadow-sm relative">
                          <div className="flex items-start gap-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-md flex-shrink-0 ${u.role === 1 ? 'bg-red-500' : 'bg-devo-600'}`}>
                              {u.full_name ? u.full_name[0].toUpperCase() : u.email?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                <h3 className="font-black text-devo-950 text-lg leading-tight truncate">{u.full_name || 'Incomplete Profile'}</h3>
                              </div>
                              <p className="text-sm font-bold text-slate-500 truncate mt-0.5">{u.email}</p>

                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(Array.isArray(u.roles) ? u.roles : [u.role].filter((r: number | null): r is number => r != null)).map((rId: number) => (
                                  <span key={rId} className={`px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest whitespace-nowrap ${roleColors[Number(rId)] || 'bg-slate-50'}`}>
                                    {roleNames[Number(rId)] || 'Member'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-200 mt-0 flex flex-col sm:flex-row gap-2">
                            <div className="relative flex-1">
                              <button
                                type="button"
                                onClick={() => setOpenRoleDropdownUserId(prev => prev === u.id ? null : u.id)}
                                className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-between"
                              >
                                Manage Roles <Plus className="w-4 h-4" />
                              </button>
                              <div className={`absolute bottom-full left-0 mb-2 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl transition-all p-2 z-[2000] ${openRoleDropdownUserId === u.id ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                                {Object.entries(roleNames).map(([id, name]) => {
                                  const rId = parseInt(id);
                                  const uRoles = Array.isArray(u.roles) ? u.roles : [u.role].filter((r: number | null): r is number => r != null);
                                  const isSelected = uRoles.includes(rId);
                                  return (
                                    <button
                                      key={id}
                                      onClick={() => {
                                        const nextRoles = isSelected ? uRoles.filter((r: number) => r !== rId) : [...uRoles, rId];
                                        updateUserRoles(u.id, nextRoles);
                                      }}
                                      className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-between mb-1 last:mb-0 ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'}`}
                                    >
                                      {name}
                                      {isSelected && <CheckCircle className="w-4 h-4" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteUser(u.id)}
                              className="p-3 bg-white text-red-500 hover:text-white border-2 border-slate-300 hover:border-red-600 hover:bg-red-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 font-bold"
                            >
                              <Trash2 className="w-5 h-5" />
                              <span className="sm:hidden">Delete</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Pagination Controls */}
              <div className="mt-8 pt-8 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Rows per page:</span>
                  <select
                    value={usersPerPage}
                    onChange={(e) => setUsersPerPage(Number(e.target.value))}
                    className="bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-2 text-xs font-bold outline-none cursor-pointer hover:border-blue-400 transition-all"
                  >
                    {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  {generatePagination(userPage, totalUserPages).map((p, i) => (
                    typeof p === 'number' ? (
                      <button
                        key={i}
                        onClick={() => setUserPage(p)}
                        className={`w-10 h-10 rounded-xl text-xs font-black transition-all border-2 ${userPage === p ? 'bg-devo-950 text-white border-devo-950 shadow-lg' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-500'}`}
                      >
                        {p}
                      </button>
                    ) : (
                      <span key={i} className="px-1 text-slate-300 font-bold">...</span>
                    )
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    disabled={userPage === 1}
                    onClick={() => setUserPage(p => p - 1)}
                    className="p-3 rounded-2xl bg-white border-2 border-slate-300 text-devo-600 disabled:opacity-30 disabled:pointer-events-none hover:border-devo-400 transition-all shadow-sm"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </button>
                  <button
                    disabled={userPage >= totalUserPages}
                    onClick={() => setUserPage(p => p + 1)}
                    className="p-3 rounded-2xl bg-white border-2 border-slate-300 text-devo-600 disabled:opacity-30 disabled:pointer-events-none hover:border-devo-400 transition-all shadow-sm"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: YouTube Channel Management */}
        {activeView === "youtube-channels" && isSuperAdmin && (
          <div className="space-y-8 animate-in slide-in-from-left-4 duration-500 pb-20">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <h2 className="text-2xl sm:text-3xl font-black text-devo-950 tracking-tight">YouTube <span className="text-indigo-600">Hub</span></h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-0.5">Media Source Management</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => fetchYtChannels()}
                  className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all active:scale-95 shadow-sm"
                  title="Refresh Channels"
                >
                  <List className="w-4 h-4" />
                </button>
                  <button
                    onClick={() => resetYtSyncStatus()}
                    className="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all active:scale-95 shadow-sm border border-rose-100"
                    title="Force Clear All Sync Statuses (Stuck Fix)"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRunGlobalSync}
                    disabled={isRunningGlobalSync}
                    className={`p-3 rounded-xl transition-all active:scale-95 shadow-sm border ${isRunningGlobalSync ? 'bg-slate-50 text-slate-300 border-slate-100' : 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100'}`}
                    title="Run Daily Incremental Sync for ALL Channels Now"
                  >
                    <Activity className={`w-4 h-4 ${isRunningGlobalSync ? 'animate-pulse' : ''}`} />
                  </button>
                <button
                  onClick={() => { 
                    setActiveYtChannel({ 
                      is_active: true, 
                      banner_style: "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)", 
                      order_index: (ytChannels.length + 1) * 10,
                      visibility: 'public'
                    }); 
                    setYtModalOpen(true); 
                    setYtAssignments([]);
                    setYtSelectedUserIds(new Set());
                  }}
                  className="flex-grow sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Add Channel
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
              {loadingYt ? (
                <div className="col-span-full py-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-500" /></div>
              ) : ytChannels.map((channel, index) => (
                <div key={channel.id} className="bg-white p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] shadow-sm hover:shadow-md border border-slate-200 hover:border-indigo-400 flex flex-col gap-4 sm:gap-5 group transition-all relative overflow-hidden">
                  <div className="flex items-center gap-4 sm:gap-5">
                    {/* Reorder Controls */}
                    <div className="flex flex-col gap-1 pr-2 border-r border-slate-100">
                      <button
                        disabled={index === 0}
                        onClick={() => handleYtChannelSwap(index, index - 1)}
                        className="p-1 text-slate-300 hover:text-indigo-600 disabled:opacity-20 transition-all hover:bg-slate-50 rounded"
                      >
                        <ChevronLeft className="w-5 h-5 rotate-90" />
                      </button>
                      <button
                        disabled={index === ytChannels.length - 1}
                        onClick={() => handleYtChannelSwap(index, index + 1)}
                        className="p-1 text-slate-300 hover:text-indigo-600 disabled:opacity-20 transition-all hover:bg-slate-50 rounded"
                      >
                        <ChevronLeft className="w-5 h-5 -rotate-90" />
                      </button>
                    </div>

                    <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl overflow-hidden shadow-inner border-2 border-white shrink-0 ${!channel.is_active && 'grayscale opacity-40'}`}>
                      {channel.custom_logo ? (
                        <Image src={channel.custom_logo} alt={channel.name} width={64} height={64} className="object-cover" unoptimized />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300 font-black text-[10px]">{channel.order_index}</div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pr-10">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-devo-950 text-sm sm:text-base leading-tight truncate">{channel.name}</h3>
                        <span className="text-[9px] font-black bg-slate-50 px-1.5 py-0.5 rounded text-slate-400">#{channel.order_index}</span>
                      </div>
                      <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 font-mono mt-0.5 truncate">{channel.channel_id}</p>

                      {/* Sync Status & Timestamp */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                          syncingChannels.has(channel.channel_id) ? 'bg-indigo-50 border-indigo-100 text-indigo-600' :
                          channel.sync_status === 'syncing' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                          channel.sync_status === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                          channel.sync_status === 'error' ? 'bg-rose-50 border-rose-100 text-rose-600' :
                          'bg-slate-50 border-slate-100 text-slate-400'
                        }`}>
                          {syncingChannels.has(channel.channel_id) ? (
                            <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Syncing...</>
                          ) : channel.sync_status === 'syncing' ? (
                            <><Activity className="w-2.5 h-2.5 animate-pulse" /> Deep Syncing</>
                          ) : channel.sync_status === 'completed' ? (
                            <><CheckCircle className="w-2.5 h-2.5" /> Completed</>
                          ) : channel.sync_status === 'error' ? (
                            <><AlertCircle className="w-2.5 h-2.5" /> Failed</>
                          ) : (
                            "Never Synced"
                          )}
                        </div>
                        {channel.hide_shorts && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border bg-slate-100 border-slate-200 text-slate-500">
                            Shorts Hidden
                          </div>
                        )}
                        {channel.last_sync_at && (
                          <div className="flex items-center gap-1 text-[8px] font-bold text-slate-400 whitespace-nowrap">
                            <Clock className="w-2 h-2" /> {new Date(channel.last_sync_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                      {/* Background Sync Live Progress from DB metadata — Only shown when NOT manually syncing in foreground */}
                      {channel.sync_status === 'syncing' && !syncingChannels.has(channel.channel_id) && channel.metadata && (() => {
                        const meta = channel.metadata as any;
                        return (
                          <div className="mt-2 p-2 bg-indigo-50 border border-indigo-100 rounded-lg space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                {meta.stage === 'uploads' ? '📥 Main Upload Sync' : meta.stage === 'deep_scan' ? '🔍 Deep Playlist Scan' : '⏳ Starting...'}
                                {meta.engine && (
                                  <span className="ml-2 px-1 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[7px] border border-indigo-200">
                                    Engine: {meta.engine}
                                  </span>
                                )}
                              </span>
                              {meta.totalOnYT && (
                                <span className="text-[8px] font-bold text-slate-400">~{Number(meta.totalOnYT).toLocaleString()} on YT</span>
                              )}
                            </div>
                             {meta.stage === 'deep_scan' && meta.playlistProgress && (
                              <div className="space-y-0.5">
                                <div className="flex justify-between text-[8px] font-bold text-indigo-500">
                                  <span>Playlists: {meta.playlistProgress}</span>
                                  {meta.deepTotal > 0 && <span>+{Number(meta.deepTotal).toLocaleString()} new</span>}
                                </div>
                                <div className="h-1 bg-indigo-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                                    style={{ width: `${Math.min(100, (parseInt(meta.playlistProgress) / parseInt(meta.playlistProgress.split('/')[1])) * 100)}%` }} />
                                </div>
                              </div>
                            )}
                            {meta.stage === 'uploads' && meta.uploadsTotal > 0 && meta.totalOnYT && (
                              <div className="space-y-0.5 mt-1">
                                <div className="flex justify-between text-[8px] font-bold text-indigo-500">
                                  <span>Videos: {Number(meta.uploadsTotal).toLocaleString()} / {Number(meta.totalOnYT).toLocaleString()}</span>
                                  <span>{Math.round((meta.uploadsTotal / parseInt(meta.totalOnYT)) * 100)}%</span>
                                </div>
                                <div className="h-1 bg-indigo-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 transition-all duration-500 rounded-full"
                                    style={{ width: `${Math.min(100, (meta.uploadsTotal / parseInt(meta.totalOnYT)) * 100)}%` }} />
                                </div>
                              </div>
                            )}
                            {meta.uploadsTotal > 0 && meta.stage !== 'uploads' && (
                              <div className="text-[8px] font-bold text-emerald-600">✓ Uploads: {Number(meta.uploadsTotal).toLocaleString()} synced</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="absolute top-4 right-4 flex gap-1">
                      <button
                        onClick={() => handleSyncChannel(channel.channel_id)}
                        disabled={syncingChannels.has(channel.channel_id)}
                        className={`p-2 rounded-lg border transition-all shadow-sm ${syncingChannels.has(channel.channel_id)
                          ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                          : 'bg-white text-indigo-600 border-slate-100 hover:border-indigo-600 hover:bg-indigo-50'
                          }`}
                        title="Sync Metadata (Foreground - Quick)"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${syncingChannels.has(channel.channel_id) ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleBackgroundSync(channel.channel_id)}
                        disabled={syncingChannels.has(channel.channel_id)}
                        className={`p-2 rounded-lg border transition-all shadow-sm ${syncingChannels.has(channel.channel_id)
                          ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                          : 'bg-white text-orange-600 border-slate-100 hover:border-orange-600 hover:bg-orange-50'
                          }`}
                        title="Deep Background Sync (Server-side - Best for 35K+)"
                      >
                        <Activity className={`w-3.5 h-3.5 ${channel.sync_status === 'syncing' ? 'animate-pulse' : ''}`} />
                      </button>
                      <button 
                        onClick={() => resetYtSyncStatus(channel.channel_id)}
                        className="p-2 bg-white text-slate-400 hover:text-rose-500 rounded-lg border border-slate-100 hover:border-rose-500 transition-all shadow-sm"
                        title="Force Clear Status (Stuck Fix)"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { 
                        setActiveYtChannel(channel); 
                        setYtModalOpen(true); 
                        setYtAssignments([]);
                        setYtSelectedUserIds(new Set());
                        fetchYtAssignments(channel.id);
                      }} className="p-2 bg-white text-slate-400 hover:text-indigo-600 rounded-lg border border-slate-100 hover:border-indigo-600 transition-all shadow-sm">
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteYtChannel(channel.id)} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg border border-slate-100 hover:border-red-500 transition-all shadow-sm">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {!channel.is_active && <span className="absolute bottom-3 right-3 px-1.5 py-0.5 bg-slate-50 text-slate-300 text-[6px] font-black uppercase rounded tracking-widest border border-slate-100">Inactive</span>}
                </div>
              ))}
            </div>

            {/* Modal Logic */}
            {ytModalOpen && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg rounded-[2rem] sm:rounded-[3rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in duration-200">
                  <div className="px-6 py-6 sm:p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-xl sm:text-2xl font-black text-devo-950 tracking-tight">{activeYtChannel?.id ? 'Adjust' : 'Register'} Channel</h2>
                    <button onClick={() => setYtModalOpen(false)} className="p-2 hover:bg-white rounded-full text-slate-400 transition-all shadow-sm"><X className="w-6 h-6" /></button>
                  </div>

                  <div className="px-6 py-6 sm:p-8 space-y-5 sm:space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-1">
                      <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Display Index (Portal Order)</label>
                      <input type="number" value={activeYtChannel?.order_index || 0} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActiveYtChannel((prev: any) => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))} className="w-full p-3 sm:p-4 bg-slate-50 border-2 border-slate-200 rounded-xl sm:rounded-2xl focus:border-indigo-500 font-black outline-none transition-all text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">YouTube Channel ID</label>
                      <div className="flex gap-3">
                        <input type="text" value={activeYtChannel?.channel_id || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActiveYtChannel((prev: any) => ({ ...prev, channel_id: e.target.value }))} placeholder="UC..." className="flex-grow p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 font-mono text-sm outline-none transition-all" />
                        <button onClick={handleFetchYtInfo} disabled={isFetchingYt || !activeYtChannel?.channel_id} className="px-6 bg-slate-950 text-white rounded-2xl hover:bg-black disabled:opacity-30 text-[10px] font-black uppercase tracking-widest transition-all">
                          {isFetchingYt ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Portal Display Name</label>
                      <input type="text" value={activeYtChannel?.name || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActiveYtChannel((prev: any) => ({ ...prev, name: e.target.value }))} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 font-black outline-none transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Visibility</label>
                      <select 
                        value={activeYtChannel?.visibility || 'public'} 
                        onChange={(e) => setActiveYtChannel((prev: any) => ({ ...prev, visibility: e.target.value }))}
                        className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 font-black outline-none transition-all text-sm"
                      >
                        <option value="public">Public (Everyone)</option>
                        <option value="private">Private (Restricted)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Hide Shorts in Portal</label>
                      <select 
                        value={activeYtChannel?.hide_shorts ? 'true' : 'false'} 
                        onChange={(e) => setActiveYtChannel((prev: any) => ({ ...prev, hide_shorts: e.target.value === 'true' }))}
                        className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 font-black outline-none transition-all text-sm"
                      >
                        <option value="false">Show Shorts (Default)</option>
                        <option value="true">Hide Shorts (Do Not Show)</option>
                      </select>
                    </div>

                    {activeYtChannel?.visibility === 'private' && (
                      <div className="space-y-4 pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Assigned Users</label>
                        
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setYtUserDropdownOpen(!ytUserDropdownOpen)}
                            className="w-full px-4 py-4 bg-indigo-50 border-2 border-indigo-100 rounded-2xl font-bold text-sm text-left text-indigo-900 outline-none hover:bg-indigo-100 transition-all flex justify-between items-center"
                          >
                            <span>Add User to Channel</span>
                            <Plus className="w-4 h-4" />
                          </button>

                          {ytUserDropdownOpen && (
                            <div className="absolute z-[120] mt-2 w-full bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 animate-in fade-in slide-in-from-top-2">
                              <div className="flex gap-2 mb-3">
                                <input
                                  type="text"
                                  placeholder="Search users..."
                                  value={ytUserSearch}
                                  onChange={(e) => setYtUserSearch(e.target.value)}
                                  className="flex-grow px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                                />
                                <button 
                                  onClick={() => {
                                    const filtered = users
                                      .filter(u => !ytAssignments.some(a => a.user_id === u.id))
                                      .filter(u => {
                                        const q = ytUserSearch.toLowerCase();
                                        return (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
                                      });
                                    setYtSelectedUserIds(new Set(filtered.map(u => u.id)));
                                  }}
                                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 transition-all"
                                >
                                  All
                                </button>
                              </div>
                              
                              <div className="max-h-52 overflow-y-auto mb-4 custom-scrollbar">
                                {users
                                  .filter(u => !ytAssignments.some(a => a.user_id === u.id))
                                  .filter(u => {
                                    const q = ytUserSearch.toLowerCase();
                                    return (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
                                  })
                                  .map(u => {
                                    const isSelected = ytSelectedUserIds.has(u.id);
                                    return (
                                      <button
                                        key={u.id}
                                        onClick={() => {
                                          const next = new Set(ytSelectedUserIds);
                                          if (isSelected) next.delete(u.id);
                                          else next.add(u.id);
                                          setYtSelectedUserIds(next);
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-3 mb-1 ${isSelected ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                                      >
                                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-200"}`}>
                                          {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="text-xs font-black truncate">{u.full_name || u.email}</div>
                                          <div className="text-[10px] font-bold text-slate-400 truncate">{u.email}</div>
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>

                              <div className="flex gap-2 pt-2 border-t border-slate-100">
                                <button 
                                  onClick={() => setYtUserDropdownOpen(false)}
                                  className="flex-1 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                                >
                                  Cancel
                                </button>
                                <button 
                                  disabled={ytSelectedUserIds.size === 0}
                                  onClick={handleBulkAssignYt}
                                  className="flex-[2] py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg disabled:opacity-30"
                                >
                                  Assign {ytSelectedUserIds.size} Users
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {ytAssignments.map(a => (
                            <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-slate-700 truncate">{a.profiles?.full_name || a.profiles?.email}</p>
                                <p className="text-[10px] font-bold text-slate-400 truncate">{a.profiles?.email}</p>
                              </div>
                              <button onClick={() => handleRemoveYtAssignment(a.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors shrink-0">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          {ytAssignments.length === 0 && (
                            <p className="text-[10px] font-bold text-slate-400 italic text-center py-2">No users assigned yet.</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Manual Logo Upload (Stability)</label>
                      <div className="flex items-center gap-5 p-5 bg-indigo-50/30 border-2 border-dashed border-indigo-100 rounded-3xl">
                        <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-white shadow-md border-2 border-white shrink-0">
                          {activeYtChannel?.custom_logo ? (
                            <Image src={activeYtChannel.custom_logo} alt="Logo" fill className="object-cover" unoptimized />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-indigo-200"><Play className="w-10 h-10 opacity-20" /></div>
                          )}
                        </div>
                        <div className="flex-grow space-y-2">
                          <p className="text-[10px] font-bold text-indigo-700/60 leading-tight">Host your own logo to prevent blank image issues.</p>
                          <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl cursor-pointer hover:bg-black transition-all shadow-md">
                            <Upload className="w-4 h-4" />
                            {isUploadingYt ? "Processing..." : "Select Image"}
                            <input type="file" className="hidden" onChange={handleYtLogoUpload} accept="image/*" />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 pl-1">Or Paste Image URL (Supports Google Drive share links)</label>
                      <input
                        type="text"
                        value={activeYtChannel?.custom_logo || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          let val = e.target.value.trim();
                          // Auto-convert Google Drive links to direct public usercontent URLs
                          const driveMatch = val.match(/\/d\/([a-zA-Z0-9_-]+)/);
                          if (driveMatch) {
                            val = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
                          }
                          setActiveYtChannel((prev: any) => ({ ...prev, custom_logo: val }));
                        }}
                        placeholder="https://lh3.googleusercontent.com/d/... or any public image URL"
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
                      />
                    </div>
                    
                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <input type="checkbox" checked={activeYtChannel?.is_active ?? true} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActiveYtChannel((prev: any) => ({ ...prev, is_active: e.target.checked }))} className="w-6 h-6 accent-indigo-600 cursor-pointer" />
                      <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Active in Portal</span>
                    </div>
                  </div>
                  <div className="p-8 bg-slate-50 border-t border-slate-200 flex gap-4">
                    <button onClick={() => setYtModalOpen(false)} className="flex-grow py-4 border-2 border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-white transition-all">Discard</button>
                    <button onClick={saveYtChannel} className="flex-[2] py-4 bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-black transition-all shadow-xl shadow-indigo-100">Commit Changes</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: Usage Analytics - PREMIUM HIGH-FIDELITY */}
        {activeView === "usage-analytics" && isSuperAdmin && (
          <div className="space-y-6 animate-in slide-in-from-left-4 duration-500 pb-32 max-w-7xl">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-outfit font-black text-slate-900 tracking-tight">Admin — <span className="text-indigo-600">Analytics</span></h1>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wide">Daily summary and member presence.</p>
            </div>

            {/* Stat Cards Row - More Compact */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-tr from-indigo-600 to-indigo-500 p-4 sm:p-5 rounded-3xl text-white shadow-lg shadow-indigo-100 flex flex-col justify-between h-[130px] sm:h-[150px] relative overflow-hidden group">
                <LayoutGrid className="absolute right-[-5px] top-[-5px] w-16 sm:w-20 h-16 sm:h-20 opacity-10 group-hover:scale-110 transition-transform" strokeWidth={3} />
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 opacity-70" />
                  <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest opacity-80">Total Days</span>
                </div>
                <h3 className="text-3xl sm:text-4xl font-black">{stats?.totalDaysActive || "0"}</h3>
              </div>

              <div 
                className="bg-gradient-to-tr from-purple-600 to-fuchsia-500 p-4 sm:p-5 rounded-3xl text-white shadow-lg shadow-purple-100 flex flex-col justify-between h-[130px] sm:h-[150px] relative overflow-hidden group cursor-help"
                title={stats?.visitorsInView ? `${stats.visitorsInView.toLocaleString()} Total Visitors` : undefined}
              >
                <Users className="absolute right-[-5px] top-[-5px] w-16 sm:w-20 h-16 sm:h-20 opacity-10 group-hover:scale-110 transition-transform" strokeWidth={3} />
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 opacity-70" />
                  <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest opacity-80">Visitors</span>
                </div>
                <h3 className="text-3xl sm:text-4xl font-black">
                  {stats?.visitorsInView 
                    ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(stats.visitorsInView)
                    : "0"
                  }
                </h3>
              </div>

              <div className="bg-gradient-to-tr from-emerald-600 to-teal-500 p-4 sm:p-5 rounded-3xl text-white shadow-lg shadow-emerald-100 flex flex-col justify-between h-[130px] sm:h-[150px] relative overflow-hidden group">
                <Activity className="absolute right-[-5px] top-[-5px] w-16 sm:w-20 h-16 sm:h-20 opacity-10 group-hover:scale-110 transition-transform" strokeWidth={3} />
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 opacity-70" />
                  <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest opacity-80">Avg / Day</span>
                </div>
                <h3 className="text-3xl sm:text-4xl font-black">{stats?.avgVisitorsPerDay || "0"}</h3>
              </div>

              <div className="bg-gradient-to-tr from-rose-600 to-orange-500 p-4 sm:p-5 rounded-3xl text-white shadow-lg shadow-rose-100 flex flex-col justify-between h-[130px] sm:h-[150px] relative overflow-hidden group">
                <ArrowRight className="absolute right-[-5px] top-[-5px] w-16 sm:w-20 h-16 sm:h-20 opacity-10 group-hover:scale-110 rotate-[-45deg] transition-transform" strokeWidth={3} />
                <div className="flex items-center gap-2">
                  <FileVideo className="w-3.5 h-3.5 opacity-70" />
                  <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest opacity-80">Best Count</span>
                </div>
                <div>
                  <h3 className="text-3xl sm:text-4xl font-black">{stats?.busiestCount || "0"}</h3>
                </div>
              </div>
            </div>

            {/* Activity Trend - Premium Line Graph with Axes */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xl space-y-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Activity Analytics</h2>
                </div>
                <div className="hidden sm:flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-indigo-600 shadow-sm" />
                    <span className="text-[9px] font-black uppercase text-slate-400">Total Visitors</span>
                  </div>
                </div>
              </div>

              {/* Custom SVG Line Graph with Area Gradient & Proper Axes */}
              <div className="relative h-[240px] sm:h-[300px] w-full group">
                {/* Y-Axis Labels */}
                <div className="absolute left-0 h-full flex flex-col justify-between text-[8px] font-black text-slate-300 py-4 z-10 pointer-events-none">
                  <span>{Math.max(...(history || []).map(h => h.count), 1)}</span>
                  <span>{Math.floor(Math.max(...(history || []).map(h => h.count), 1) / 2)}</span>
                  <span>0</span>
                </div>

                <div className="ml-8 h-full relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* X & Y Axis Lines */}
                    <line x1="0" y1="200" x2="1000" y2="200" stroke="#f1f5f9" strokeWidth="2" />
                    <line x1="0" y1="0" x2="0" y2="200" stroke="#f1f5f9" strokeWidth="2" />

                    {/* The Main Line Path (Smooth Spline) */}
                    <path
                      d={(history || []).slice(0, 15).reverse().reduce((acc, curr, i, arr) => {
                        const maxCount = Math.max(...(history || []).map(h => h.count), 1);
                        const x = (i / (Math.min(history.length, 15) - 1)) * 1000;
                        const y = 200 - (curr.count / maxCount) * 180 - 10;

                        if (i === 0) return `M ${x} ${y}`;

                        // Calculate Cubic Bezier midpoints
                        const prev = arr[i - 1];
                        const prevMax = Math.max(...(history || []).map(h => h.count), 1);
                        const px = ((i - 1) / (Math.min(history.length, 15) - 1)) * 1000;
                        const py = 200 - (prev.count / prevMax) * 180 - 10;

                        const cx1 = px + (x - px) / 2;
                        const cy1 = py;
                        const cx2 = px + (x - px) / 2;
                        const cy2 = y;

                        return `${acc} C ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`;
                      }, "")}
                      fill="none"
                      stroke="url(#lineGrad)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-xl"
                    />

                    {/* Area Fill (Smooth Spline) */}
                    <path
                      d={(history || []).slice(0, 15).reverse().reduce((acc, curr, i, arr) => {
                        const maxCount = Math.max(...(history || []).map(h => h.count), 1);
                        const x = (i / (Math.min(history.length, 15) - 1)) * 1000;
                        const y = 200 - (curr.count / maxCount) * 180 - 10;

                        if (i === 0) return `M ${x} 200 L ${x} ${y}`;

                        const prev = arr[i - 1];
                        const prevMax = Math.max(...(history || []).map(h => h.count), 1);
                        const px = ((i - 1) / (Math.min(history.length, 15) - 1)) * 1000;
                        const py = 200 - (prev.count / prevMax) * 180 - 10;

                        const cx1 = px + (x - px) / 2;
                        const cy1 = py;
                        const cx2 = px + (x - px) / 2;
                        const cy2 = y;

                        const main = `${acc} C ${cx1} ${cy1} ${cx2} ${cy2} ${x} ${y}`;
                        if (i === Math.min(history.length, 15) - 1) return `${main} L ${x} 200 Z`;
                        return main;
                      }, "")}
                      fill="url(#areaGrad)"
                      className="opacity-40"
                    />
                  </svg>

                  {/* Interactive Points & X-Axis */}
                  <div className="absolute inset-0 flex justify-between pointer-events-none">
                    {(history || []).slice(0, 15).reverse().map((day, i) => {
                      const maxCount = Math.max(...(history || []).map(h => h.count), 1);
                      const topPercent = 100 - (day.count / maxCount) * 90 - 5;
                      return (
                        <div key={day.date} className="relative flex-1 flex flex-col items-center group/p">
                          <div
                            style={{ top: `${topPercent}%` }}
                            className="absolute w-3 h-3 bg-white border-2 border-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.3)] z-20 transition-all group-hover/p:scale-[2] group-hover/p:bg-indigo-600 pointer-events-auto cursor-pointer"
                          />
                          <div className="absolute top-[-35px] opacity-0 group-hover/p:opacity-100 transition-all translate-y-2 group-hover/p:translate-y-0 bg-slate-950 text-white text-[9px] font-black px-2 py-1 rounded-md z-30 pointer-events-none shadow-xl border border-white/10">
                            {day.count}
                          </div>
                          <div className="absolute bottom-[-25px] text-[7px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap rotate-[-45deg] sm:rotate-0 origin-top-left transition-colors group-hover/p:text-indigo-600">
                            {(i === 0 || i % 2 === 0 || i === Math.min(history.length, 15) - 1) ? day.date.split('-').slice(1).join('/') : ""}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Visitors Table Wrapper - Slimmed */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden">
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-0.5">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Visitors Feed</h2>
                    <p className="text-slate-400 font-bold text-[10px] uppercase">Member traffic log.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rows per page:</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRowsPerPage(Number(e.target.value))}
                      className="bg-slate-50 border-2 border-slate-100 px-4 py-2 rounded-xl text-xs font-black focus:outline-none focus:border-indigo-500"
                    >
                      {[5, 10, 20, 50].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto overflow-visible">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-separate border-slate-50">
                        <th className="pb-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-left">Date</th>
                        <th className="pb-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Visitors</th>
                        <th className="pb-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {loadingAnalytics ? (
                        <tr><td colSpan={3} className="py-20 text-center"><Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto" /></td></tr>
                      ) : (history || []).slice((analyticsPage - 1) * rowsPerPage, analyticsPage * rowsPerPage).map((day) => (
                        <React.Fragment key={day.date}>
                          <tr className="group border-b border-separate border-slate-50 last:border-0">
                            <td className="py-4 sm:py-8">
                              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">{day.date}</p>
                              <p className="hidden sm:block text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                {new Date(day.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })}
                              </p>
                            </td>
                            <td className="py-4 sm:py-8 text-center">
                              <div className="inline-flex items-center gap-2 bg-indigo-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-indigo-100">
                                <Users className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="text-[10px] sm:text-xs font-black text-indigo-700">{day.count} <span className="opacity-60 ml-0.5">users</span></span>
                              </div>
                            </td>
                            <td className="py-4 sm:py-8 text-right">
                              <button
                                onClick={() => day.date === expandedDate ? setExpandedDate(null) : fetchDetailedUsers(day.date)}
                                className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl inline-flex items-center gap-2 sm:gap-3 font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all ${day.date === expandedDate ? 'bg-slate-900 text-white shadow-xl' : 'border-2 border-slate-100 text-slate-400 hover:border-indigo-600 hover:text-indigo-600'}`}
                              >
                                <span className="hidden sm:inline">{day.date === expandedDate ? "Hide Users" : "View Users"}</span>
                                <span className="sm:hidden">{day.date === expandedDate ? "Hide" : "Users"}</span>
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${day.date === expandedDate ? 'rotate-90' : ''}`} />
                              </button>
                            </td>
                          </tr>

                          {/* EXPANDED VIEW: Dark Purple Portal */}
                          {day.date === expandedDate && (
                            <tr>
                              <td colSpan={3} className="py-2">
                                <div className="bg-[#3b1b6d] rounded-[1.5rem] p-4 sm:p-6 shadow-2xl relative overflow-hidden animate-in slide-in-from-top-2 duration-300">
                                  <div className="relative z-10 space-y-6">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/10 rounded-xl flex items-center justify-center text-white shrink-0">
                                          <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                                        </div>
                                        <div>
                                          <h4 className="text-xs sm:text-sm font-black text-white leading-tight">Presence for {day.date}</h4>
                                          <p className="text-indigo-300 font-bold text-[7px] sm:text-[8px] uppercase tracking-widest leading-none mt-1">{expandedUsers.length} total members</p>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left">
                                        <thead className="border-b border-white/10">
                                          <tr>
                                            <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">Member</th>
                                            <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-indigo-300/60 hidden sm:table-cell">Details</th>
                                            <th className="pb-3 text-[9px] font-black uppercase tracking-widest text-indigo-300/60 text-right">Time</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                          {loadingExpanded ? (
                                            <tr><td colSpan={3} className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-white opacity-40 mx-auto" /></td></tr>
                                          ) : expandedUsers.slice((expandedPage - 1) * expandedRowsPerPage, expandedPage * expandedRowsPerPage).map(user => (
                                            <tr key={user.id} className="group hover:bg-white/5 transition-colors">
                                              <td className="py-4 font-black text-xs text-white leading-tight">
                                                {user.name}
                                                <p className="text-[8px] font-bold text-indigo-400 sm:hidden">{user.email}</p>
                                              </td>
                                              <td className="py-4 font-medium text-[10px] text-indigo-200 opacity-60 hidden sm:table-cell">{user.email}</td>
                                              <td className="py-4 text-right">
                                                <div className="text-right">
                                                  <p className="text-[10px] font-black text-indigo-200">{new Date(user.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* Expansion Pagination */}
                                    <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                                      <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest order-2 sm:order-1">Page <span className="text-white">{expandedPage}</span> of {totalExpandedPages || 1}</p>
                                      <div className="flex gap-2 order-1 sm:order-2 w-full sm:w-auto">
                                        <button
                                          onClick={() => setExpandedPage((prev: any) => Math.max(prev - 1, 1))}
                                          disabled={expandedPage === 1}
                                          className="flex-1 sm:flex-none px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-black text-[10px] uppercase disabled:opacity-20 transition-all shadow-md active:scale-95 border border-white/5"
                                        >
                                          Prev
                                        </button>
                                        <button
                                          onClick={() => setExpandedPage((prev: any) => Math.min(prev + 1, totalExpandedPages))}
                                          disabled={expandedPage === totalExpandedPages || totalExpandedPages === 0}
                                          className="flex-1 sm:flex-none px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-black text-[10px] uppercase disabled:opacity-20 transition-all shadow-md active:scale-95 border border-white/5"
                                        >
                                          Next
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Main Pagination */}
                <div className="pt-10 flex flex-col sm:flex-row justify-between items-center gap-6 border-t border-slate-50">
                  <button
                    onClick={() => setAnalyticsPage((prev: any) => Math.max(prev - 1, 1))}
                    disabled={analyticsPage === 1}
                    className="w-full sm:w-auto px-8 py-3 rounded-2xl border-2 border-slate-100 font-extrabold text-slate-400 hover:border-indigo-600 disabled:opacity-30 disabled:border-slate-50"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-2">
                    {generatePagination(analyticsPage, totalAnalyticsPages).map((p, i) => (
                      <button
                        key={i}
                        onClick={() => typeof p === 'number' && setAnalyticsPage(p)}
                        className={`w-10 h-10 rounded-xl font-black text-xs transition-all ${p === analyticsPage ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setAnalyticsPage((prev: any) => Math.min(prev + 1, totalAnalyticsPages))}
                    disabled={analyticsPage === totalAnalyticsPages}
                    className="w-full sm:w-auto px-8 py-3 rounded-2xl border-2 border-slate-100 font-extrabold text-slate-400 hover:border-indigo-600 disabled:opacity-30 disabled:border-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: Attendance Machines */}
        {(activeView === "attendance-machines" && isSuperAdmin) && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <button
                onClick={() => navigateToView("home")}
                className="flex items-center gap-2 text-cyan-600 font-black uppercase tracking-widest text-xs hover:gap-3 transition-all"
              >
                <ArrowRight className="w-4 h-4 rotate-180" /> Back to Dashboard
              </button>
              <h2 className="text-2xl font-outfit font-black text-devo-950 flex items-center gap-3">
                <Activity className="w-7 h-7 text-cyan-600" /> Attendance Management
              </h2>
            </div>

            {/* Sub-Tabs Switcher */}
            <div className="flex p-1 bg-slate-100 rounded-2xl w-fit mb-8">
              <button
                onClick={() => setAttendanceSubView("devices")}
                className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${attendanceSubView === "devices" ? 'bg-white text-cyan-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Device Management
              </button>
              <button
                onClick={() => setAttendanceSubView("mappings")}
                className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${attendanceSubView === "mappings" ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                User Mapping Hub
              </button>
              <button
                onClick={() => setAttendanceSubView("vm-incharge")}
                className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${attendanceSubView === "vm-incharge" ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                VM Role Assign
              </button>
            </div>

            {attendanceSubView === "devices" ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Instructions and Global Settings */}
                <div className="lg:col-span-1 space-y-6">
                  {/* Quick Setup Guide */}
                  <div className="bg-gradient-to-br from-cyan-600 to-blue-700 p-6 sm:p-8 rounded-[2rem] shadow-xl text-white">
                    <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5" /> Quick Setup Guide
                    </h3>
                    <div className="space-y-4 text-xs font-bold opacity-90 leading-relaxed">
                      <div className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">1</span>
                        <p>Add the device <strong>Serial Number</strong> below to authorize it.</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">2</span>
                        <p>Set <strong>Server Address</strong> to: <br />
                          <code className="bg-black/20 p-1 rounded mt-1 inline-block select-all">https://ashram-connect-nine.vercel.app</code>
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">3</span>
                        <p>Set <strong>Port</strong> to <code className="bg-black/20 px-1.5 py-0.5 rounded">443</code> and <strong>Protocol</strong> to <code className="bg-black/20 px-1.5 py-0.5 rounded">HTTPS</code>.</p>
                      </div>
                      <div className="mt-4 p-3 bg-black/20 rounded-xl text-[10px] italic">
                        <strong>Note:</strong> Multiple machines use this same URL. Our server automatically identifies each one by its unique <strong>Serial Number (SN)</strong>, so there is never any confusion.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText("https://ashram-connect-nine.vercel.app");
                        setSubmitMessage({ type: "success", text: "Server URL copied to clipboard!" });
                        setTimeout(() => setSubmitMessage(null), 3000);
                      }}
                      className="mt-6 w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-white/20"
                    >
                      Copy Server URL
                    </button>
                  </div>

                  {/* FOOTER: Global Role Pill */}
                  <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-200">
                    <h3 className="text-lg font-black text-devo-950 mb-6 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-orange-500" /> Prasadam Count Settings
                    </h3>
                    {attendanceSettings && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Time</label>
                            <input
                              type="time"
                              value={attendanceSettings.prasadam_start_time || "02:00:00"}
                              onChange={(e) => setAttendanceSettings({ ...attendanceSettings, prasadam_start_time: e.target.value })}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Time</label>
                            <input
                              type="time"
                              value={attendanceSettings.prasadam_end_time || "07:30:00"}
                              onChange={(e) => setAttendanceSettings({ ...attendanceSettings, prasadam_end_time: e.target.value })}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Machines for Count</label>
                          <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {attendanceMachines.map(m => (
                              <label key={m.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors border border-transparent has-[:checked]:border-orange-200 has-[:checked]:bg-orange-50">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                  checked={(attendanceSettings.prasadam_machine_ids || []).includes(m.id)}
                                  onChange={(e) => {
                                    const current = attendanceSettings.prasadam_machine_ids || [];
                                    const next = e.target.checked
                                      ? [...current, m.id]
                                      : current.filter((id: string) => id !== m.id);
                                    setAttendanceSettings({ ...attendanceSettings, prasadam_machine_ids: next });
                                  }}
                                />
                                <div>
                                  <div className="text-xs font-black text-slate-900">{m.description || 'Unnamed Machine'}</div>
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">{m.serial_number}</div>
                                </div>
                              </label>
                            ))}
                            {attendanceMachines.length === 0 && (
                              <div className="text-[10px] italic text-slate-400 py-4 text-center">No machines available</div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sync Base Date</label>
                          <input
                            type="date"
                            value={attendanceSettings.sync_from_date}
                            onChange={(e) => setAttendanceSettings({ ...attendanceSettings, sync_from_date: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                          />
                        </div>

                        <button
                          onClick={handleUpdateSettings}
                          disabled={isUpdatingSettings}
                          className="w-full bg-slate-900 text-white font-black text-xs py-4 rounded-xl uppercase tracking-widest hover:bg-orange-600 transition-colors shadow-lg mt-4 flex items-center justify-center gap-2"
                        >
                          {isUpdatingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {isUpdatingSettings ? "Saving Settings..." : "Save All Attendance Settings"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Add New Machine */}
                  <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-xl border border-slate-200">
                    <h3 className="text-lg font-black text-devo-950 mb-6 flex items-center gap-2">
                      <Plus className="w-5 h-5 text-cyan-500" /> Authorize New Machine
                    </h3>
                    <form onSubmit={handleAddMachine} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Serial Number</label>
                        <input type="text" required placeholder="e.g. NCD8253500015" value={newMachineSN} onChange={(e) => setNewMachineSN(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold uppercase" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                        <input type="text" placeholder="e.g. Main Gate Machine" value={newMachineDesc} onChange={(e) => setNewMachineDesc(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingestion Start</label>
                          <input type="time" value={newMachineStart} onChange={(e) => setNewMachineStart(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingestion End</label>
                          <input type="time" value={newMachineEnd} onChange={(e) => setNewMachineEnd(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                        </div>
                      </div>
                      <button disabled={isSubmitting} className="w-full bg-cyan-600 text-white font-black text-xs py-4 rounded-xl uppercase tracking-widest hover:bg-black transition-colors shadow-lg">
                        {isSubmitting ? "Adding..." : "Add Machine"}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Machine List */}
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h3 className="font-black text-xl text-devo-950 uppercase tracking-tight">Authorized Devices</h3>
                      <div className="px-4 py-1 bg-cyan-50 text-cyan-600 rounded-full text-[10px] font-black uppercase">{attendanceMachines.length} Active</div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-white border-b border-slate-100">
                            <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Device Info</th>
                            <th className="px-8 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Window</th>
                            <th className="px-8 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceMachines.map((m) => (
                            <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.is_active ? 'bg-cyan-50 text-cyan-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <HardDrive className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-black text-devo-950 text-base">{m.serial_number}</div>
                                    <div className="flex items-center gap-1 group/edit">
                                      <input
                                        type="text"
                                        className="text-slate-400 text-xs font-bold bg-transparent border-none p-0 focus:ring-0 w-full hover:text-slate-600 focus:text-slate-900 transition-colors cursor-text"
                                        value={m.description || ""}
                                        placeholder="Add description..."
                                        onBlur={(e) => updateMachineSettings(m.id, { description: e.target.value })}
                                        onChange={(e) => {
                                          const updated = attendanceMachines.map(item => item.id === m.id ? { ...item, description: e.target.value } : item);
                                          setAttendanceMachines(updated);
                                        }}
                                      />
                                      <Settings className="w-3 h-3 text-slate-300 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-8 py-6">
                                <div className="flex items-center justify-center gap-2">
                                  <input
                                    type="time"
                                    value={m.ingestion_start || "02:00:00"}
                                    className="px-2 py-1 text-[10px] font-black bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-cyan-600"
                                    onChange={(e) => {
                                      const updated = attendanceMachines.map(item => item.id === m.id ? { ...item, ingestion_start: e.target.value } : item);
                                      setAttendanceMachines(updated);
                                    }}
                                    onBlur={(e) => updateMachineSettings(m.id, { ingestion_start: e.target.value })}
                                  />
                                  <span className="text-slate-300 font-bold">-</span>
                                  <input
                                    type="time"
                                    value={m.ingestion_end || "11:00:00"}
                                    className="px-2 py-1 text-[10px] font-black bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-cyan-600"
                                    onChange={(e) => {
                                      const updated = attendanceMachines.map(item => item.id === m.id ? { ...item, ingestion_end: e.target.value } : item);
                                      setAttendanceMachines(updated);
                                    }}
                                    onBlur={(e) => updateMachineSettings(m.id, { ingestion_end: e.target.value })}
                                  />
                                </div>
                              </td>
                              <td className="px-8 py-6 text-center">
                                <button
                                  onClick={() => updateMachineSettings(m.id, { is_active: !m.is_active })}
                                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${m.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
                                >
                                  {m.is_active ? "Enabled" : "Disabled"}
                                </button>
                              </td>
                              <td className="px-8 py-6 text-right">
                                <button onClick={() => deleteMachine(m.id)} className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {attendanceMachines.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-8 py-20 text-center text-slate-300 font-bold italic">No machines registered</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : attendanceSubView === "mappings" ? (
              /** 
               * NEW VIEW: USER MAPPING HUB
               */
              <div className="space-y-12">
                {/* Header Controls */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Email or ID</label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Find mapping..."
                        className="w-full pl-11 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold shadow-sm focus:border-indigo-600 transition-all"
                        value={mappingSearch}
                        onChange={(e) => setMappingSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-8 flex flex-wrap gap-4 items-center justify-end">
                    <label className="relative flex flex-col items-center justify-center px-8 py-4 bg-white border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-600 cursor-pointer group transition-all">
                      <div className="flex items-center gap-3">
                        {isUploadingMapping ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <FileSpreadsheet className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />}
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-indigo-600">Bulk Excel Mapping</span>
                      </div>
                      <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleBulkMappingUpload} />
                    </label>

                    <button
                      onClick={() => {
                        const wb = XLSX.utils.book_new();

                        // Sheet 1: The Template
                        const templateData = [["Machine Serial Number", "ZK User ID", "User Email"]];
                        const wsTemplate = XLSX.utils.aoa_to_sheet(templateData);
                        XLSX.utils.book_append_sheet(wb, wsTemplate, "Mapping Template");

                        // Sheet 2: Reference Data (Helper)
                        const refData = [["MACHINE LIST (Copy Serial Number)", "DESCRIPTION"]];
                        attendanceMachines.forEach(m => {
                          refData.push([m.serial_number, m.description || ""]);
                        });

                        const wsRef = XLSX.utils.aoa_to_sheet(refData);
                        XLSX.utils.book_append_sheet(wb, wsRef, "Reference Data");

                        XLSX.writeFile(wb, "attendance_mapping_template.xlsx");
                      }}
                      className="p-4 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 transition-all"
                      title="Download Template"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Quick Add Form */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-700 p-8 rounded-[2.5rem] shadow-2xl text-white">
                  <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                    <UserPlus className="w-6 h-6" /> Single Mapping Entry
                  </h3>

                  {submitMessage && (
                    <div className={`mb-8 p-5 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300 ${submitMessage.type === 'success'
                      ? 'bg-emerald-100/10 border-2 border-emerald-500/30 text-emerald-50'
                      : 'bg-rose-100/10 border-2 border-rose-500/30 text-rose-50'
                      }`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${submitMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                        {submitMessage.type === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black tracking-tight">{submitMessage.type === 'success' ? 'Success!' : 'Mapping Error'}</p>
                        <p className="text-xs font-bold opacity-80">{submitMessage.text}</p>
                      </div>
                      <button onClick={() => setSubmitMessage(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-4 h-4 opacity-50" />
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleAddMapping} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">Select Machine</label>
                      <select
                        value={mappingMachineId}
                        onChange={(e) => setMappingMachineId(e.target.value)}
                        className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:text-indigo-900 transition-all"
                      >
                        <option value="" className="text-black">Select Machine</option>
                        {attendanceMachines.map(m => (
                          <option key={m.id} value={m.id} className="text-black">{m.description} ({m.serial_number})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">Machine User ID</label>
                      <input
                        type="text"
                        placeholder="e.g. 101"
                        value={mappingZKId}
                        onChange={(e) => setMappingZKId(e.target.value)}
                        className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:text-indigo-900 transition-all placeholder:text-white/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">System User Email</label>
                      <input
                        type="email"
                        placeholder="user@example.com"
                        value={mappingEmail}
                        onChange={(e) => setMappingEmail(e.target.value)}
                        list="user-emails"
                        className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:text-indigo-900 transition-all placeholder:text-white/40"
                      />
                      <datalist id="user-emails">
                        {users.map(u => (
                          <option key={u.id} value={u.email}>{u.full_name}</option>
                        ))}
                      </datalist>
                    </div>
                    <button disabled={isSubmitting} className="px-8 py-4 bg-white text-indigo-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-900 hover:text-white transition-all shadow-xl">
                      {isSubmitting ? "Processing..." : "Create Mapping"}
                    </button>
                  </form>
                </div>

                {/* Grouped Mapping View */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {attendanceMachines.map(m => {
                    const machineMappings = attendanceMappings.filter(amp =>
                      amp.machine_id === m.id &&
                      (amp.user_email.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                        amp.zk_user_id.toString().includes(mappingSearch))
                    );

                    if (mappingSearch && machineMappings.length === 0) return null;

                    return (
                      <div key={m.id} className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col">
                        <div className="p-6 sm:p-8 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                          <div>
                            <h4 className="text-lg font-black text-devo-950">{m.description}</h4>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.serial_number}</div>
                          </div>
                          <div className="px-4 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-400">
                            {machineMappings.length} MAPPINGS
                          </div>
                        </div>

                        <div className="overflow-x-auto flex-1">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-slate-50/50">
                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">User ID</th>
                                <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Account (Name / Email)</th>
                                <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {machineMappings.map(amp => {
                                const userData = users.find(u => u.email?.toLowerCase() === amp.user_email?.toLowerCase());
                                return (
                                  <tr key={amp.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 font-black text-indigo-600 text-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px]">#{amp.zk_user_id}</span>
                                      </div>
                                    </td>
                                    <td className="px-8 py-4">
                                      <div className="flex flex-col">
                                        <div className="font-bold text-slate-900 text-sm">{userData?.full_name || "—"}</div>
                                        <div className="font-bold text-slate-400 text-[10px] tracking-tight">{amp.user_email}</div>
                                      </div>
                                    </td>
                                    <td className="px-8 py-4 text-right">
                                      <button onClick={() => deleteMapping(amp.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {machineMappings.length === 0 && (
                                <tr>
                                  <td colSpan={3} className="px-8 py-10 text-center text-slate-400 italic text-xs font-bold">No mappings found</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="bg-gradient-to-r from-cyan-600 to-blue-700 p-8 rounded-[2.5rem] shadow-2xl text-white">
                  <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                    <Monitor className="w-6 h-6" /> Assign Virtual Machine Incharge
                  </h3>
                  {submitMessage && (
                    <div className={`mb-8 p-5 rounded-2xl flex items-center gap-4 ${submitMessage.type === 'success'
                      ? 'bg-emerald-100/10 border-2 border-emerald-500/30 text-emerald-50'
                      : 'bg-rose-100/10 border-2 border-rose-500/30 text-rose-50'
                      }`}>
                      {submitMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                      <p className="text-xs font-bold">{submitMessage.text}</p>
                    </div>
                  )}
                  <form onSubmit={assignVirtualMachineIncharge} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">Virtual Machine</label>
                      <select
                        value={vmMachineId}
                        onChange={(e) => setVmMachineId(e.target.value)}
                        className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl font-bold text-sm outline-none focus:bg-white focus:text-indigo-900 transition-all"
                      >
                        <option value="" className="text-black">Select Virtual Machine</option>
                        {attendanceMachines.filter((m) => !!m.is_virtual).map((m) => (
                          <option key={m.id} value={m.id} className="text-black">
                            {m.description || m.serial_number}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black opacity-80 uppercase tracking-widest ml-1">Incharge User</label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setVmUserDropdownOpen((prev) => !prev)}
                          className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl font-bold text-sm text-left outline-none hover:bg-white/20 transition-all"
                        >
                          {vmInchargeUserId
                            ? (() => {
                              const selectedUser = users.find((u) => u.id === vmInchargeUserId);
                              return selectedUser ? `${selectedUser.full_name || selectedUser.email} (${selectedUser.email})` : "Select User";
                            })()
                            : "Select User"}
                        </button>

                        {vmUserDropdownOpen && (
                          <div className="absolute z-30 mt-2 w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-2">
                            <input
                              type="text"
                              placeholder="Search by name or email"
                              value={vmInchargeSearch}
                              onChange={(e) => setVmInchargeSearch(e.target.value)}
                              className="w-full mb-2 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-black outline-none focus:border-indigo-500"
                            />
                            <div className="max-h-52 overflow-y-auto">
                              {users
                                .filter((u) => {
                                  const q = vmInchargeSearch.trim().toLowerCase();
                                  if (!q) return true;
                                  return (
                                    (u.full_name || "").toLowerCase().includes(q) ||
                                    (u.email || "").toLowerCase().includes(q)
                                  );
                                })
                                .map((u) => (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => {
                                      setVmInchargeUserId(u.id);
                                      setVmUserDropdownOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700"
                                  >
                                    <div className="text-xs font-black">{u.full_name || u.email}</div>
                                    <div className="text-[10px] font-bold text-slate-400">{u.email}</div>
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      disabled={isSubmitting || !vmMachineId || !vmInchargeUserId}
                      className={`px-8 py-4 font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-xl ${isSubmitting || !vmMachineId || !vmInchargeUserId
                        ? "bg-white/50 text-indigo-300 cursor-not-allowed"
                        : "bg-white text-indigo-600 hover:bg-slate-900 hover:text-white"
                        }`}
                    >
                      {isSubmitting ? "Assigning..." : "Assign Role 7"}
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                  <div className="p-6 sm:p-8 bg-slate-50 border-b border-slate-100">
                    <h4 className="text-lg font-black text-devo-950">Current Virtual Machine Incharge Assignments</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50/50">
                          <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Machine</th>
                          <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Incharge</th>
                          <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {vmInchargeAssignments.map((row) => {
                          const machine = attendanceMachines.find((m) => m.id === row.machine_id);
                          const inchargeUser = users.find((u) => u.id === row.incharge_user_id);
                          return (
                            <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-8 py-4">
                                <div className="font-bold text-slate-900 text-sm">{machine?.description || machine?.serial_number || "Unknown Machine"}</div>
                                <div className="font-bold text-slate-400 text-[10px] tracking-tight">{machine?.serial_number || "-"}</div>
                              </td>
                              <td className="px-8 py-4">
                                <div className="font-bold text-slate-900 text-sm">{inchargeUser?.full_name || row.incharge_user_email}</div>
                                <div className="font-bold text-slate-400 text-[10px] tracking-tight">{row.incharge_user_email}</div>
                              </td>
                              <td className="px-8 py-4 text-right">
                                <button onClick={() => deleteVirtualMachineInchargeAssignment(row.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {vmInchargeAssignments.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-8 py-10 text-center text-slate-400 italic text-xs font-bold">No virtual machine incharge assignments found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: Notification Center (Broadcast) */}
        {activeView === "notifications" && isManager && (
          <div className="space-y-8 animate-in slide-in-from-right-4 duration-500 pb-20">
            <button
              onClick={() => navigateToView("home")}
              className="flex items-center gap-2 text-devo-600 font-black uppercase tracking-widest text-xs hover:gap-3 transition-all"
            >
              <ArrowRight className="w-4 h-4 rotate-180" /> Back to Dashboard
            </button>

            <div className="max-w-3xl mx-auto">
              <div className="bg-white p-8 sm:p-12 rounded-[2.5rem] shadow-2xl border border-slate-200">
                <div className="text-center mb-10">
                  <div className="w-20 h-20 bg-purple-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-purple-100 shadow-sm">
                    <Mail className="w-10 h-10 text-purple-600" />
                  </div>
                  <h2 className="text-3xl font-outfit font-black text-devo-950">Broadcast Center</h2>
                  <p className="text-slate-400 font-medium mt-2">Send an instant push notification to all registered users.</p>
                </div>

                <form onSubmit={handleBroadcast} className="space-y-6">
                  {submitMessage && (
                    <div className={`p-4 rounded-2xl flex items-start gap-4 border ${submitMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                      {submitMessage.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                      <p className="text-sm font-bold">{submitMessage.text}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Notification Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Schedule Update"
                      value={bcTitle}
                      onChange={(e) => setBcTitle(e.target.value)}
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:bg-white focus:border-purple-400 outline-none transition-all font-bold"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Message Body</label>
                    <textarea
                      required
                      placeholder="Enter the message you want users to see on their device..."
                      rows={4}
                      value={bcBody}
                      onChange={(e) => setBcBody(e.target.value)}
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:bg-white focus:border-purple-400 outline-none transition-all font-bold resize-none"
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Target Audience</label>
                    <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-2xl">
                      <button
                        type="button"
                        onClick={() => setBcTarget("all")}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${bcTarget === 'all' ? 'bg-white text-devo-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        Everyone
                      </button>
                      <button
                        type="button"
                        onClick={() => setBcTarget("bcdb")}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${bcTarget === 'bcdb' ? 'bg-white text-devo-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        BCDB Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setBcTarget("manual")}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${bcTarget === 'manual' ? 'bg-white text-devo-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        Select Users
                      </button>
                    </div>
                  </div>

                  {bcTarget === "manual" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search users to include..."
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                          className="w-full pl-12 pr-6 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:bg-white focus:border-purple-400 outline-none transition-all text-xs font-bold"
                        />
                      </div>

                      <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                        {users.filter(u => u.full_name?.toLowerCase().includes(userSearchTerm.toLowerCase()) || u.email?.toLowerCase().includes(userSearchTerm.toLowerCase())).map(u => (
                          <label key={u.id} className={`flex items-center gap-4 p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedUserIds.has(u.id) ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-50 hover:border-slate-100'}`}>
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                              checked={selectedUserIds.has(u.id)}
                              onChange={(e) => {
                                const next = new Set(selectedUserIds);
                                if (e.target.checked) next.add(u.id);
                                else next.delete(u.id);
                                setSelectedUserIds(next);
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-black text-devo-950 truncate">{u.full_name || 'Anonymous'}</p>
                              <p className="text-[9px] font-bold text-slate-400 truncate uppercase tracking-tighter">{u.email}</p>
                            </div>
                            {u.role === 1 && <Shield className="w-3 h-3 text-purple-400" />}
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-between items-center px-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedUserIds.size} Users Selected</p>
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds(new Set())}
                          className="text-[10px] font-black text-purple-600 uppercase tracking-widest hover:underline">
                          Clear All
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex gap-4">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-1" />
                    <p className="text-[10px] font-bold text-amber-800 leading-relaxed uppercase tracking-wide">
                      {bcTarget === 'all' && <>This will send a notification to <span className="font-black underline">Every</span> registered user.</>}
                      {bcTarget === 'bcdb' && <>This will target only users found in the <span className="font-black">Bhakti Center Database</span>.</>}
                      {bcTarget === 'manual' && <>This will target the <span className="font-black">{selectedUserIds.size} specific users</span> you have selected above.</>}
                    </p>
                  </div>

                  <button
                    disabled={isBroadcasting || !bcTitle || !bcBody || (bcTarget === 'manual' && selectedUserIds.size === 0)}
                    className="w-full py-5 bg-devo-950 hover:bg-purple-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-slate-200 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 active:scale-95"
                  >
                    {isBroadcasting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Globe className="w-5 h-5" /> {bcTarget === 'all' ? 'Send Broadcast to All' : bcTarget === 'bcdb' ? 'Send to BCDB Members' : `Send to ${selectedUserIds.size} Selected Users`}
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Broadcast History List */}
              <div className="mt-8 sm:mt-12 bg-white/50 backdrop-blur-sm p-4 sm:p-10 rounded-[2.5rem] border border-slate-200">
                <h3 className="text-lg sm:text-xl font-black font-outfit text-devo-950 mb-6 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-slate-400" /> Recent Activity
                </h3>

                <NotificationsHistoryList limit={10} />
              </div>
            </div>
          </div>
        )}

        {/* VIEW: Attendance Tracing */}
        {activeView === "attendance-tracing" && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 max-w-none">
            <button
              onClick={() => navigateToView("home")}
              className="flex items-center gap-2 text-devo-600 font-black uppercase tracking-widest text-xs hover:gap-3 transition-all"
            >
              <ArrowRight className="w-4 h-4 rotate-180" /> Back to Dashboard
            </button>
            <AttendanceTracing isAdmin={isManager} session={session} profile={profile} />
          </div>
        )}

        {/* VIEW: BCDB Portal */}
        {activeView === "bcdb" && (
          <div className="space-y-6 sm:space-y-10 animate-in slide-in-from-bottom-4 duration-500 max-w-none">
            <div className="px-1">
              <button onClick={() => navigateToView("home")} className="flex items-center gap-2 text-indigo-600 font-black uppercase tracking-widest text-[10px] sm:text-xs hover:gap-3 transition-all bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-indigo-100 shadow-sm">
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 rotate-180" /> Back to Dashboard
              </button>
            </div>
            <BCDBManager session={session} isAdmin={isManager} />
          </div>
        )}

        {/* VIEW: Policy Manual Admin */}
        {activeView === "policies" && (
          <div className="space-y-6 sm:space-y-10 animate-in slide-in-from-bottom-4 duration-500 max-w-none">
            <div className="px-1">
              <button onClick={() => navigateToView("home")} className="flex items-center gap-2 text-indigo-600 font-black uppercase tracking-widest text-[10px] sm:text-xs hover:gap-3 transition-all bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-indigo-100 shadow-sm">
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 rotate-180" /> Back to Dashboard
              </button>
            </div>
            <AdminPolicyManager session={session} />
          </div>
        )}
      </div>
    </div>
  );

  // --- Helper Methods for YT Mgmt ---
  async function fetchYtChannels(silent = false) {
    const isSilent = silent || ytChannels.length > 0;
    if (!isSilent) setLoadingYt(true);
    try {
      const res = await fetch("/api/admin/youtube-channels", {
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      if (data.channels) setYtChannels(data.channels);
    } catch (err) {
      console.error(err);
    } finally {
      if (!isSilent) setLoadingYt(false);
    }
  }

  async function handleRunGlobalSync() {
    const activeChannels = ytChannels.filter(c => c.is_active);
    if (!confirm(`Run daily sync for ${activeChannels.length} active channels now? This will fetch the latest 50 videos for each channel.`)) return;
    
    setIsRunningGlobalSync(true);
    try {
      // Process each channel sequentially for live feedback and stability
      for (const channel of activeChannels) {
        // Skip if a deep background sync is already in progress
        if (channel.sync_status === 'syncing') continue;

        try {
          // Call the incremental sync API for this channel
          await handleSyncChannel(channel.channel_id, false, true); // true for isIncremental
        } catch (err) {
          console.error(`Global Sync failed for ${channel.name}:`, err);
        }
      }
      alert("Global Daily Sync completed!");
    } catch (err: any) {
      alert("An error occurred during global sync: " + err.message);
    } finally {
      setIsRunningGlobalSync(false);
      fetchYtChannels();
    }
  }

  async function resetYtSyncStatus(channelId?: string) {
    if (channelId && !confirm("Force clear sync status for this channel?")) return;
    if (!channelId && !confirm("Force clear sync status for ALL channels? This will stop all background indicators.")) return;

    try {
      if (channelId) {
        const channelRecord = ytChannels.find(c => c.channel_id === channelId);
        if (!channelRecord) throw new Error("Channel record not found");
        
        const res = await fetch("/api/admin/youtube-channels", {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ 
            id: channelRecord.id, 
            sync_status: null, 
            metadata: null,
            sync_error: null,
            sync_cursor: null
          })
        });
        if (!res.ok) throw new Error("Failed to clear sync status via API");
      } else {
        // Reset all channels
        for (const channel of ytChannels) {
          await fetch("/api/admin/youtube-channels", {
            method: "PUT",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({ 
              id: channel.id, 
              sync_status: null, 
              metadata: null,
              sync_error: null,
              sync_cursor: null
            })
          });
        }
      }
      fetchYtChannels();
    } catch (err: any) {
      alert("Failed to reset status: " + err.message);
    }
  }

  async function handleBackgroundSync(channelId: string) {
    if (syncingChannels.has(channelId)) return;
    
    const confirmed = window.confirm(
      "⚠️ Deep Sync Warning\n\n" +
      "Running a Deep Sync scans ALL historical playlists and videos for this channel, which consumes a significant amount of YouTube API quota.\n\n" +
      "If the channel is already fully synced, please use the circular arrow (Quick Sync) instead to grab new updates.\n\n" +
      "Are you sure you want to proceed with a Deep Sync?"
    );
    if (!confirmed) return;
    
    setSyncingChannels(prev => new Set(prev).add(channelId));
    
    try {
      // Fire the background sync — server handles everything, responds immediately
      const res = await fetch("/api/admin/youtube/background-sync", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ channelId })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to start background sync");
      
      alert(`✅ Background sync started for channel!\n\nThe server is now downloading all videos. You can close this page and come back later.\n\nCheck the channel status — it will update to "completed" when done.`);
      
      // Once successfully started on server, we can clear the LOCAL syncing state
      // The UI will now show the Background Sync Progress box based on DB status
      setSyncingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });

      // Immediately fetch channel list silently to update status to "syncing"
      fetchYtChannels(true);

    } catch (err: any) {
      alert("Failed to start background sync: " + err.message);
      setSyncingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  }

  async function handleSyncChannel(channelId: string, isTurbo: boolean = false, isIncrementalForce: boolean = false) {
    if (syncingChannels.has(channelId)) return;

    setSyncingChannels(prev => new Set(prev).add(channelId));
    setSyncProgress(prev => ({ ...prev, [channelId]: { pages: 0, total: 0 } }));

    try {
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      let cursor: string | null = null;
      let hasMore = true;
      let pass = 0;
      const maxPasses = isIncrementalForce ? 1 : (isTurbo ? 1000 : 300);
      const pagesPerRequest = isIncrementalForce ? 1 : (isTurbo ? 10 : 3);

      while (hasMore && pass < maxPasses) {
        pass += 1;
        let attempt = 0;
        while (attempt < 3) {
          attempt += 1;
          try {
            const syncPayload = JSON.stringify({ 
              channelId: channelId, 
              isIncremental: isIncrementalForce, 
              cursor: cursor, 
              maxPages: pagesPerRequest 
            });
            const ytSyncResponse: Response = await fetch("/api/admin/youtube/sync", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session?.access_token}`
              },
              body: syncPayload
            });
            
            const syncResult = await ytSyncResponse.json();

            if (ytSyncResponse.ok) {
              hasMore = Boolean(syncResult.hasMore);
              cursor = syncResult.nextCursor || null;
              
              setSyncProgress(prev => ({
                ...prev,
                [channelId]: { 
                  pages: (prev[channelId]?.pages || 0) + (syncResult.pagesProcessed || 0),
                  total: (prev[channelId]?.total || 0) + (syncResult.totalSynced || 0)
                }
              }));
              break;
            }

            if (ytSyncResponse.status === 504 && syncResult.retryable && attempt < 3) {
              await sleep(1000 * attempt);
              continue;
            }

            throw new Error(syncResult.error || `Server returned ${ytSyncResponse.status}`);
          } catch (fetchErr: any) {
            const errorMsg = fetchErr.message || "";
            const isNetworkError = errorMsg.includes('fetch failed') || errorMsg.includes('Failed to fetch') || fetchErr.name === 'TypeError';
            
            if (isNetworkError && attempt < 5) {
              console.warn(`[Sync] Network error for ${channelId}, retrying (${attempt}/5)...`, errorMsg);
              await sleep(2000 * attempt);
              continue;
            }
            throw fetchErr;
          }
        }
      }

      if (hasMore && !isIncrementalForce) {
        throw new Error("Channel is extremely large. Please run another sync pass or use the local CLI script.");
      }

      fetchYtChannels();
    } catch (err: any) {
      console.error("Sync Error:", err);
      const isLocal = window.location.hostname === 'localhost';
      const helpMsg = isLocal 
        ? `\n\nTIP: For very large channels (>35K videos), run this in your terminal:\nnode scripts/sync-youtube.js ${channelId}`
        : "";
      alert("Sync failed: " + err.message + helpMsg);
    } finally {
      setSyncingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  }

  async function handleFetchYtInfo() {
    if (!activeYtChannel?.channel_id) return;
    setIsFetchingYt(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const infoRes = await fetch(`/api/youtube?channelId=${activeYtChannel.channel_id}`, { headers });
      const data = await infoRes.json();
      if (data.channelTitle) {
        setActiveYtChannel((prev: any) => ({
          ...prev,
          name: data.channelTitle,
          custom_logo: data.channelLogo
        }));
      }
    } catch (err) {
      alert("Fetching data from YouTube failed.");
    } finally {
      setIsFetchingYt(false);
    }
  }

  async function handleYtLogoUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingYt(true);
    try {
      const fileName = `ch_${activeYtChannel?.channel_id || Date.now()}_${Date.now()}`;
      const { data, error } = await supabase.storage.from('youtube-assets').upload(`logos/${fileName}`, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('youtube-assets').getPublicUrl(`logos/${fileName}`);
      setActiveYtChannel((prev: any) => ({ ...prev, custom_logo: publicUrl }));
    } catch (err) {
      console.error(err);
      alert("Logo upload failed.");
    } finally {
      setIsUploadingYt(false);
    }
  }

  async function saveYtChannel() {
    try {
      const method = activeYtChannel?.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/youtube-channels", {
        method,
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(activeYtChannel)
      });
      if (res.ok) {
        setYtModalOpen(false);
        fetchYtChannels();
      }
    } catch (err) {
      alert("Failed to save channel.");
    }
  }

  async function deleteYtChannel(id: string) {
    if (!confirm("Are you sure? This removes the channel from the portal.")) return;
    try {
      const res = await fetch(`/api/admin/youtube-channels?id=${id}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      });
      if (res.ok) fetchYtChannels();
    } catch (err) {
      console.error(err);
    }
  }


  async function handleYtChannelSwap(index1: number, index2: number) {
    const ch1 = ytChannels[index1];
    const ch2 = ytChannels[index2];
    if (!ch1 || !ch2) return;

    // Swap indices
    const idx1 = ch1.order_index;
    const idx2 = ch2.order_index;

    // Optimistic Update UI
    const updated = [...ytChannels];
    updated[index1] = { ...ch1, order_index: idx2 };
    updated[index2] = { ...ch2, order_index: idx1 };
    // Re-sort locally
    updated.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    setYtChannels(updated);

    try {
      // Persist both
      await Promise.all([
        fetch("/api/admin/youtube-channels", {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ id: ch1.id, order_index: idx2 })
        }),
        fetch("/api/admin/youtube-channels", {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ id: ch2.id, order_index: idx1 })
        })
      ]);
      fetchYtChannels(); // Final sync
    } catch (err) {
      alert("Persistence error");
      fetchYtChannels();
    }
  }

  // YT Assignments logic
  async function fetchYtAssignments(channelId: string) {
    try {
      const res = await fetch(`/api/admin/youtube-channels/assignments?channelId=${channelId}`, {
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      if (data.assignments) setYtAssignments(data.assignments);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAddYtAssignment(userId: string) {
    if (!activeYtChannel?.id) {
      alert("Please save the channel first before assigning users.");
      return;
    }
    try {
      const response = await fetch("/api/admin/youtube-channels/assignments", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ channel_id: activeYtChannel.id, user_id: userId })
      });
      if (response.ok) fetchYtAssignments(activeYtChannel.id);

    } catch (err) {
      alert("Failed to assign user.");
    }
  }

  async function handleRemoveYtAssignment(id: string) {
    try {
      const response = await fetch(`/api/admin/youtube-channels/assignments?id=${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session?.access_token}` }
      });
      if (response.ok && activeYtChannel?.id) fetchYtAssignments(activeYtChannel.id);

    } catch (err) {
      alert("Failed to remove assignment.");
    }
  }

  async function handleBulkAssignYt() {
    if (!activeYtChannel?.id || ytSelectedUserIds.size === 0) return;
    try {
      const response = await fetch("/api/admin/youtube-channels/assignments", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
          channel_id: activeYtChannel.id, 
          user_ids: Array.from(ytSelectedUserIds) 
        })
      });
      if (response.ok) {

        fetchYtAssignments(activeYtChannel.id);
        setYtSelectedUserIds(new Set());
        setYtUserDropdownOpen(false);
      }
    } catch (err) {
      alert("Failed to assign users.");
    }
  }
}
