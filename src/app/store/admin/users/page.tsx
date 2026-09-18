"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, Search, Filter, ShieldCheck, UserPlus, Phone, Building, Crown, X, Check, RefreshCw, ChevronDown, RotateCcw, Pencil, AlertTriangle } from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";
import { PaginationControls } from "@/components/PaginationControls";

interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  mobile: string;
  temple: string;
  kurta_size: string;
  chappal_size: string;
  color_preference: string;
  sarvadhan_access_requested: boolean;
  store_access_level: 'none' | 'general' | 'internal';
  has_special_access: boolean; // legacy
  is_store_admin: boolean;
  is_bcdb_user: boolean;
}

// iOS-Style Toggle Switch
function ToggleSwitch({ checked, onChange, label, activeColor = 'bg-green-500', disabled = false }: { checked: boolean; onChange: () => void; label?: string; activeColor?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`inline-flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div
        className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
          checked ? activeColor : 'bg-slate-300'
        }`}
      >
        <div
          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
      {label && (
        <span className={`text-xs font-bold transition-colors ${checked ? 'text-slate-800' : 'text-slate-400'}`}>
          {label}
        </span>
      )}
    </button>
  );
}

export default function StoreUserManagement() {
  const [session, setSession] = useState<any>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const { storeUser, loading: authLoading } = useStoreAuth();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "managers" | "special" | "requests">("all");
  const [sortMode, setSortMode] = useState<"name_asc" | "name_desc">("name_asc");
  const [selectedTemples, setSelectedTemples] = useState<string[]>([]);
  const [templeSearchQuery, setTempleSearchQuery] = useState("");
  const [isTempleDropdownOpen, setIsTempleDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const templeDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close temple dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (templeDropdownRef.current && !templeDropdownRef.current.contains(event.target as Node)) {
        setIsTempleDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Grant Access Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserForModal, setSelectedUserForModal] = useState<string>("");
  const [modalGrantAccessLevel, setModalGrantAccessLevel] = useState<'none' | 'general' | 'internal'>('none');
  const [modalGrantManager, setModalGrantManager] = useState(false);
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [isModalUserDropdownOpen, setIsModalUserDropdownOpen] = useState(false);

  const filteredAllUsersForModal = useMemo(() => {
    let list = allUsers;
    if (modalSearchQuery.trim()) {
      const q = modalSearchQuery.toLowerCase();
      list = allUsers.filter(u => 
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.mobile || "").toLowerCase().includes(q) ||
        (u.temple || "").toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      const nameA = (a.full_name || "").trim();
      const nameB = (b.full_name || "").trim();

      const isA_NA = !nameA || nameA.toUpperCase() === "N/A";
      const isB_NA = !nameB || nameB.toUpperCase() === "N/A";

      if (isA_NA && !isB_NA) return 1;
      if (!isA_NA && isB_NA) return -1;
      if (isA_NA && isB_NA) return 0;

      return nameA.localeCompare(nameB);
    });
  }, [allUsers, modalSearchQuery]);

  const selectUserInModal = (u: ManagedUser) => {
    setSelectedUserForModal(u.id);
    setModalGrantAccessLevel(u.store_access_level === 'none' ? 'general' : u.store_access_level);
    setModalGrantManager(u.is_store_admin);
    setIsModalUserDropdownOpen(false);
    setModalSearchQuery("");
  };

  // Edit User Profile Modal State
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editTemple, setEditTemple] = useState("");
  const [editKurtaSize, setEditKurtaSize] = useState("-");
  const [editChappalSize, setEditChappalSize] = useState("-");
  const [editColorPreference, setEditColorPreference] = useState("-");
  const [editStoreAccessLevel, setEditStoreAccessLevel] = useState<'none' | 'general' | 'internal'>('none');
  const [editIsStoreAdmin, setEditIsStoreAdmin] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const openEditModal = (user: ManagedUser) => {
    setEditingUser(user);
    setEditFullName(user.full_name || "");
    setEditMobile(user.mobile || "");
    setEditTemple(user.temple || "");
    setEditKurtaSize(user.kurta_size || "-");
    setEditChappalSize(user.chappal_size || "-");
    setEditColorPreference(user.color_preference || "-");
    setEditStoreAccessLevel(user.store_access_level || "none");
    setEditIsStoreAdmin(user.is_store_admin || false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !editingUser) return;
    setIsSubmittingEdit(true);

    // Optimistic UI update
    setUsers(prev => prev.map(u => u.id === editingUser.id ? {
      ...u,
      full_name: editFullName,
      mobile: editMobile,
      temple: editTemple,
      kurta_size: editKurtaSize,
      chappal_size: editChappalSize,
      color_preference: editColorPreference,
      store_access_level: editStoreAccessLevel,
      is_store_admin: editIsStoreAdmin
    } : u));

    const res = await fetch('/api/store/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        id: editingUser.id,
        email: editingUser.email,
        full_name: editFullName,
        mobile: editMobile,
        temple: editTemple,
        kurta_size: editKurtaSize,
        chappal_size: editChappalSize,
        color_preference: editColorPreference,
        store_access_level: editStoreAccessLevel,
        is_store_admin: editIsStoreAdmin
      })
    });

    if (res.ok) {
      setEditingUser(null);
      fetchUsers(session.access_token);
    } else {
      const err = await res.json();
      alert("Error updating profile: " + (err.error || "Failed to update profile"));
      fetchUsers(session.access_token);
    }
    setIsSubmittingEdit(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUsers(session.access_token);
    });
  }, []);

  const fetchUsers = async (token: string) => {
    setLoading(true);
    const res = await fetch('/api/store/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
    setLoading(false);
  };

  const fetchAllUsersForModal = async () => {
    if (!session) return;
    const res = await fetch('/api/store/admin/users?all=true', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setAllUsers(data);
    }
  };

  const openModal = () => {
    setIsModalOpen(true);
    setSelectedUserForModal("");
    setModalSearchQuery("");
    setIsModalUserDropdownOpen(false);
    fetchAllUsersForModal();
  };

  // Change Store Access Level
  const changeStoreAccess = async (user: ManagedUser, newLevel: 'none' | 'general' | 'internal') => {
    if (!session) return;
    
    // Optimistic UI update
    setUsers(users.map(u => u.id === user.id ? { ...u, store_access_level: newLevel } : u));

    const res = await fetch('/api/store/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        store_access_level: newLevel
      })
    });

    if (!res.ok) fetchUsers(session.access_token);
  };

  const [confirmModalData, setConfirmModalData] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Toggle Manager Post (is_store_admin)
  const toggleManagerRole = async (user: ManagedUser) => {
    if (!session) return;
    const newStatus = !user.is_store_admin;

    if (newStatus) {
      setConfirmModalData({
        title: "Assign Store Manager Post?",
        message: `Are you sure you want to assign Store Manager post to ${user.full_name || user.email}?`,
        onConfirm: () => executeToggleManagerRole(user, newStatus)
      });
      return;
    }

    executeToggleManagerRole(user, newStatus);
  };

  const executeToggleManagerRole = async (user: ManagedUser, newStatus: boolean) => {
    if (!session) return;
    setUsers(users.map(u => u.id === user.id ? { ...u, is_store_admin: newStatus } : u));

    const res = await fetch('/api/store/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        is_store_admin: newStatus
      })
    });

    if (!res.ok) fetchUsers(session.access_token);
  };

  // Grant Access via Modal
  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !selectedUserForModal) return;
    setIsSubmittingModal(true);

    const targetUser = allUsers.find(u => u.id === selectedUserForModal);
    if (!targetUser) return;

    const res = await fetch('/api/store/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        id: targetUser.id,
        email: targetUser.email,
        full_name: targetUser.full_name,
        mobile: targetUser.mobile,
        temple: targetUser.temple,
        store_access_level: modalGrantAccessLevel,
        is_store_admin: modalGrantManager
      })
    });

    if (res.ok) {
      setIsModalOpen(false);
      setSelectedUserForModal("");
      setModalGrantAccessLevel('none');
      setModalGrantManager(false);
      fetchUsers(session.access_token);
    } else {
      const err = await res.json();
      alert("Error: " + err.error);
    }
    setIsSubmittingModal(false);
  };

  // Bulk Sync Temple & Mobile from Main DB
  const handleBulkSync = async (reset: boolean = false) => {
    if (!session) return;
    if (reset) {
      setConfirmModalData({
        title: "Perform Fresh Resync?",
        message: "Are you sure you want to perform a Fresh Resync? This will reset existing store users and re-import all fresh profile data from the Main DB.",
        onConfirm: () => executeBulkSync(reset)
      });
      return;
    }
    executeBulkSync(reset);
  };

  const executeBulkSync = async (reset: boolean) => {
    if (!session) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/store/admin/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({ reset })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Synced successfully!");
        fetchUsers(session.access_token);
      } else {
        alert("Sync error: " + (data.error || "Failed to sync"));
      }
    } catch (err: any) {
      alert("Sync failed: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Temple user counts & list derivation
  const templeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach(u => {
      if (u.temple && u.temple.trim() !== "" && u.temple !== "N/A") {
        counts[u.temple] = (counts[u.temple] || 0) + 1;
      }
    });
    return counts;
  }, [users]);

  const uniqueTemples = useMemo(() => {
    return Object.keys(templeCounts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [templeCounts]);

  const filteredTemplesList = useMemo(() => {
    if (!templeSearchQuery.trim()) return uniqueTemples;
    const q = templeSearchQuery.toLowerCase();
    return uniqueTemples.filter(t => t.toLowerCase().includes(q));
  }, [uniqueTemples, templeSearchQuery]);

  const toggleTemple = (temple: string) => {
    setSelectedTemples(prev =>
      prev.includes(temple) ? prev.filter(t => t !== temple) : [...prev, temple]
    );
  };

  const selectAllTemples = () => {
    setSelectedTemples([...uniqueTemples]);
  };

  const clearTempleFilter = () => {
    setSelectedTemples([]);
    setTempleSearchQuery("");
  };

  // Filtered User List
  const filteredUsers = users.filter(user => {
    // Mode filter
    if (filterMode === "managers" && !user.is_store_admin) return false;
    if (filterMode === "special" && user.store_access_level === 'none' && !user.is_bcdb_user) return false;
    if (filterMode === "requests" && !user.sarvadhan_access_requested) return false;

    // Multi-Temple filter
    if (selectedTemples.length > 0 && !selectedTemples.includes(user.temple)) return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = user.full_name?.toLowerCase().includes(q) || false;
      const emailMatch = user.email?.toLowerCase().includes(q) || false;
      const mobileMatch = user.mobile?.toLowerCase().includes(q) || false;
      const templeMatch = user.temple?.toLowerCase().includes(q) || false;
      return nameMatch || emailMatch || mobileMatch || templeMatch;
    }
    return true;
  });

  // Sort logic (A-Z by default, with N/A pushed to the bottom)
  filteredUsers.sort((a, b) => {
    const nameA = (a.full_name || "").trim();
    const nameB = (b.full_name || "").trim();

    const isA_NA = !nameA || nameA.toUpperCase() === "N/A";
    const isB_NA = !nameB || nameB.toUpperCase() === "N/A";

    if (isA_NA && !isB_NA) return 1;
    if (!isA_NA && isB_NA) return -1;
    if (isA_NA && isB_NA) return 0;

    if (sortMode === "name_desc") {
      return nameB.localeCompare(nameA);
    }
    // Default: name_asc (A-Z)
    return nameA.localeCompare(nameB);
  });

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterMode, selectedTemples, sortMode, pageSize]);

  const totalUsers = users.length;
  const totalManagers = users.filter(u => u.is_store_admin).length;
  const totalSpecial = users.filter(u => u.store_access_level !== 'none' || u.is_bcdb_user).length;
  const totalRequests = users.filter(u => u.sarvadhan_access_requested).length;

  const hasActiveFilters = searchQuery.trim() !== "" || filterMode !== "all" || selectedTemples.length > 0 || sortMode !== "name_asc";

  if (authLoading || loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-devo-500" /></div>;

  const canAccessAdminPanel = storeUser?.can_access_admin_panel ?? storeUser?.is_super_or_store_admin;

  if (!canAccessAdminPanel) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-slate-200">
          <h2 className="text-xl font-bold text-amber-600 mb-2 font-outfit">Store Admin Access Required</h2>
          <p className="text-slate-600 text-xs sm:text-sm font-medium mb-6">
            Store Managers have access to the Approvals Queue only. This page is restricted to Store Admins.
          </p>
          <a href="/store/admin/approvals" className="inline-block px-5 py-2.5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors text-xs sm:text-sm">
            Go to Approvals Queue
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-16">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-outfit flex items-center gap-2">
            <Users className="w-6 h-6 sm:w-8 sm:h-8 text-amber-600" />
            <span>User Management</span>
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5 hidden sm:block">
            View all approved users, size profiles, store access levels, and assign Store Managers.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
          <button
            onClick={() => handleBulkSync(false)}
            disabled={isSyncing}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition-all text-xs disabled:opacity-50"
            title="Fast sync mobile and temple from Main DB"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Main DB'}</span>
          </button>

          <button
            onClick={openModal}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all text-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Add User</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Cards (Compact 2x2 Grid on Mobile) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
        <div 
          onClick={() => setFilterMode("all")}
          className={`p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer ${
            filterMode === "all" ? 'bg-amber-50 border-amber-300 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase mb-0.5">Approved Users</div>
          <div className="text-lg sm:text-2xl font-black text-slate-800 font-outfit">{totalUsers}</div>
        </div>

        <div 
          onClick={() => setFilterMode("managers")}
          className={`p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer ${
            filterMode === "managers" ? 'bg-amber-50 border-amber-300 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] sm:text-xs font-bold text-amber-600 uppercase mb-0.5 flex items-center gap-1">
            <Crown className="w-3 h-3" />
            Managers
          </div>
          <div className="text-lg sm:text-2xl font-black text-amber-700 font-outfit">{totalManagers}</div>
        </div>

        <div 
          onClick={() => setFilterMode("special")}
          className={`p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer ${
            filterMode === "special" ? 'bg-amber-50 border-amber-300 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] sm:text-xs font-bold text-teal-600 uppercase mb-0.5 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Access Granted
          </div>
          <div className="text-lg sm:text-2xl font-black text-teal-700 font-outfit">{totalSpecial}</div>
        </div>

        <div 
          onClick={() => setFilterMode("requests")}
          className={`p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer ${
            filterMode === "requests" ? 'bg-amber-50 border-amber-300 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] sm:text-xs font-bold text-orange-600 uppercase mb-0.5">Sarvadhan Req</div>
          <div className="text-lg sm:text-2xl font-black text-orange-700 font-outfit">{totalRequests}</div>
        </div>
      </div>

      {/* Main Users Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-visible w-full">
        
        {/* Card Header & Search Bar */}
        <div className="p-5 bg-slate-50/90 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <h2 className="font-bold text-slate-800 text-xl font-outfit whitespace-nowrap">
              Approved User Directory
            </h2>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
              {filteredUsers.length} users
            </span>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[260px] md:max-w-md w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, email, mobile, temple..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-amber-500 shadow-2xs transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter & Sort Controls Sub-Bar */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 bg-slate-100/50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {/* Filter mode */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 border border-slate-200 rounded-xl shadow-2xs font-medium text-slate-600 min-w-0">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={filterMode}
                onChange={e => setFilterMode(e.target.value as any)}
                className="bg-transparent outline-none cursor-pointer font-bold text-slate-800 w-full text-[11px] sm:text-xs truncate"
              >
                <option value="all">All Approved Users</option>
                <option value="managers">Store Managers Only</option>
                <option value="special">Access Granted</option>
                <option value="requests">Sarvadhan Requests</option>
              </select>
            </div>

            {/* Searchable Multi-Select Temple Filter Dropdown */}
            {uniqueTemples.length > 0 && (
              <div className="relative min-w-0" ref={templeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsTempleDropdownOpen(!isTempleDropdownOpen)}
                  className={`w-full flex items-center justify-between gap-1 px-2.5 py-1.5 bg-white border rounded-xl shadow-2xs font-semibold text-[11px] sm:text-xs transition-all ${
                    selectedTemples.length > 0
                      ? 'border-amber-500 bg-amber-50/70 text-amber-900 ring-2 ring-amber-400/20'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="truncate">
                    {selectedTemples.length === 0
                      ? "Temples: All"
                      : selectedTemples.length === 1
                      ? `Temple: ${selectedTemples[0]}`
                      : `${selectedTemples.length} Temples`}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isTempleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Popup */}
                {isTempleDropdownOpen && (
                  <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search temple name..."
                        value={templeSearchQuery}
                        onChange={e => setTempleSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-amber-500 focus:bg-white transition-all"
                      />
                      {templeSearchQuery && (
                        <button 
                          onClick={() => setTempleSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1 px-1 text-[10px] sm:text-[11px] font-semibold text-slate-500 border-b border-slate-100 pb-2">
                      <span className="truncate">{selectedTemples.length === 0 ? "All temples selected" : `${selectedTemples.length} selected`}</span>
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                        <button
                          type="button"
                          onClick={selectAllTemples}
                          className="text-amber-600 hover:text-amber-700 hover:underline font-bold"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={clearTempleFilter}
                          className="text-slate-400 hover:text-slate-600 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {filteredTemplesList.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 font-medium">
                          No temples match "{templeSearchQuery}"
                        </div>
                      ) : (
                        filteredTemplesList.map(t => {
                          const isSelected = selectedTemples.includes(t);
                          const count = templeCounts[t] || 0;
                          return (
                            <div
                              key={t}
                              onClick={() => toggleTemple(t)}
                              className={`flex items-center justify-between p-2 rounded-xl text-xs font-medium cursor-pointer transition-colors select-none ${
                                isSelected ? 'bg-amber-50 text-amber-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate pr-2">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                  isSelected ? 'bg-amber-600 border-amber-600 text-white' : 'border-slate-300 bg-white'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span className="truncate">{t}</span>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                                isSelected ? 'bg-amber-200/60 text-amber-800' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {count}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sort mode */}
            <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 bg-white px-2.5 py-1.5 border border-slate-200 rounded-xl shadow-2xs font-medium text-slate-600 min-w-0">
              <span className="text-slate-400 font-bold shrink-0">Sort:</span>
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value as any)}
                className="bg-transparent outline-none cursor-pointer font-bold text-slate-800 w-full text-[11px] sm:text-xs"
              >
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
              </select>
            </div>
          </div>

          {/* Reset All Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterMode("all");
                setSelectedTemples([]);
                setSortMode("name_asc");
                setPage(1);
                setPageSize(20);
              }}
              className="px-2.5 py-1.5 font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl flex items-center justify-center gap-1 transition-all shrink-0 text-xs"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Mobile Card View for User Directory (Ultra-Compact, 4-5 per screen!) */}
        <div className="block md:hidden p-2.5 space-y-2">
          {paginatedUsers.map((user, idx) => {
            const isEven = idx % 2 === 0;

            return (
              <div
                key={user.id}
                className={`rounded-xl border p-2.5 shadow-2xs space-y-1.5 transition-colors ${
                  isEven
                    ? "bg-white border-l-4 border-l-indigo-600 border-slate-200/90"
                    : "bg-slate-50/90 border-l-4 border-l-emerald-600 border-slate-300/80"
                }`}
              >
                {/* Line 1: Name + Email + Edit Button */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-1.5 truncate">
                      <span className="truncate">{user.full_name || "N/A"}</span>
                      {user.sarvadhan_access_requested && (
                        <span className="text-[8px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.2 rounded uppercase shrink-0">
                          Req
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{user.email}</div>
                  </div>

                  <button
                    onClick={() => openEditModal(user)}
                    disabled={!storeUser?.is_super_or_store_admin}
                    className="p-1 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg border border-slate-200 shrink-0 transition-colors disabled:opacity-50"
                    title="Edit User Profile"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-600" />
                  </button>
                </div>

                {/* Line 2: Phone | Temple | Sizing Badges */}
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px]">
                  <div className="flex items-center gap-1.5 text-slate-600 font-semibold truncate">
                    <span className="truncate">📞 {user.mobile || "N/A"}</span>
                    <span>•</span>
                    <span className="truncate">🏛️ {user.temple || "N/A"}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 font-mono font-bold text-slate-700">
                    <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                      K:{user.kurta_size !== '-' ? user.kurta_size : 'N/A'}
                    </span>
                    <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                      C:{user.chappal_size !== '-' ? user.chappal_size : 'N/A'}
                    </span>
                    {user.color_preference !== '-' && (
                      <span className={`px-1.5 py-0.2 rounded ${
                        user.color_preference === 'Saffron' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {user.color_preference}
                      </span>
                    )}
                  </div>
                </div>

                {/* Line 3: Inline Access Level & Manager Role Controls */}
                <div className="bg-slate-100/70 rounded-lg px-2 py-1 border border-slate-200/60 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Access:</span>
                    <select
                      value={user.store_access_level}
                      disabled={!storeUser?.is_super_or_store_admin}
                      onChange={(e) => changeStoreAccess(user, e.target.value as any)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-bold border outline-none cursor-pointer disabled:opacity-50 ${
                        user.store_access_level === 'internal'
                          ? 'bg-teal-50 text-teal-700 border-teal-200'
                          : user.store_access_level === 'general'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-white text-slate-500 border-slate-200'
                      }`}
                    >
                      <option value="none">None</option>
                      <option value="general">General</option>
                      <option value="internal">Internal</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <ToggleSwitch
                      checked={user.is_store_admin}
                      onChange={() => toggleManagerRole(user)}
                      activeColor="bg-amber-600"
                      disabled={!storeUser?.is_super_or_store_admin}
                    />
                    <span className={`text-[10px] font-bold ${user.is_store_admin ? 'text-amber-700' : 'text-slate-500'}`}>
                      {user.is_store_admin ? 'Manager' : 'User'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div className="p-8 text-center text-slate-400 font-medium bg-slate-50 rounded-xl border border-slate-200 text-xs">
              No users match your filter criteria.
            </div>
          )}
        </div>

        {/* Desktop Directory Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100/70 border-b border-slate-200">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">User Profile</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase">Contact & Temple</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Kurta Size</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Chappal Size</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Color Pref</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Store Access</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Manager Post</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map(user => {
                return (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    
                    {/* User Profile */}
                    <td className="p-4">
                      <div className="font-bold text-slate-800 text-sm">{user.full_name || "N/A"}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                      {user.sarvadhan_access_requested && (
                        <span className="inline-block mt-1 text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          Requested Access
                        </span>
                      )}
                    </td>

                    {/* Contact & Temple */}
                    <td className="p-4 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-700 font-semibold mb-0.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{user.mobile || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        <span>{user.temple || "N/A"}</span>
                      </div>
                    </td>

                    {/* Kurta Size */}
                    <td className="p-4 text-center">
                      <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs border border-slate-200">
                        {user.kurta_size !== '-' ? `Size ${user.kurta_size}` : '-'}
                      </span>
                    </td>

                    {/* Chappal Size */}
                    <td className="p-4 text-center">
                      <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 font-bold rounded-lg text-xs border border-slate-200">
                        {user.chappal_size !== '-' ? `Size ${user.chappal_size}` : '-'}
                      </span>
                    </td>

                    {/* Color Pref */}
                    <td className="p-4 text-center">
                      {user.color_preference !== '-' ? (
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${
                          user.color_preference === 'Saffron' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}>
                          {user.color_preference}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>

                    {/* Store Access Level */}
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <select 
                          value={user.store_access_level}
                          disabled={!storeUser?.is_super_or_store_admin}
                          onChange={(e) => changeStoreAccess(user, e.target.value as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            user.store_access_level === 'internal' 
                              ? 'bg-teal-50 text-teal-700 border-teal-200' 
                              : user.store_access_level === 'general'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          <option value="none">None</option>
                          <option value="general">General</option>
                          <option value="internal">Internal</option>
                        </select>
                        {user.is_bcdb_user && user.store_access_level === 'internal' && (
                           <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wide">BCDB Verified</span>
                        )}
                      </div>
                    </td>

                    {/* Manager Role Toggle */}
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ToggleSwitch
                          checked={user.is_store_admin}
                          onChange={() => toggleManagerRole(user)}
                          activeColor="bg-amber-600"
                          disabled={!storeUser?.is_super_or_store_admin}
                        />
                        <span className={`text-[11px] font-bold flex items-center gap-1 ${user.is_store_admin ? 'text-amber-700' : 'text-slate-400'}`}>
                          {user.is_store_admin && <Crown className="w-3 h-3 text-amber-600" />}
                          {user.is_store_admin ? 'Store Manager' : 'Regular User'}
                        </span>
                      </div>
                    </td>

                    {/* Edit User Profile Action */}
                    <td className="p-4 text-center">
                      <button
                        onClick={() => openEditModal(user)}
                        disabled={!storeUser?.is_super_or_store_admin}
                        className="p-2 text-slate-700 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-all border border-slate-200 shadow-2xs text-xs font-bold flex items-center gap-1.5 mx-auto disabled:opacity-50"
                        title="Edit User Profile"
                      >
                        <Pencil className="w-3.5 h-3.5 text-amber-600" />
                        Edit Profile
                      </button>
                    </td>

                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 font-medium">
                    No users match your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100">
          <PaginationControls
            currentPage={page}
            pageSize={pageSize}
            totalItems={filteredUsers.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[20, 50, 100]}
          />
        </div>
      </div>

      {/* Grant Access Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 font-outfit">
                <UserPlus className="w-5 h-5 text-amber-600" />
                Grant Store Access / Assign Manager
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Select Registered User Profile</label>
                {allUsers.length === 0 ? (
                  <div className="text-sm text-slate-500 py-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> Loading registered profiles...
                  </div>
                ) : selectedUserForModal ? (
                  /* Selected User Card */
                  (() => {
                    const selUser = allUsers.find(u => u.id === selectedUserForModal);
                    if (!selUser) return null;
                    return (
                      <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-amber-600 text-white font-bold text-xs flex items-center justify-center font-outfit uppercase shrink-0">
                            {(selUser.full_name || selUser.email || "U").substring(0, 2)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-sm">{selUser.full_name || "N/A"}</div>
                            <div className="text-xs text-slate-500">{selUser.email}</div>
                            <div className="text-[11px] text-slate-600 flex items-center gap-2 mt-0.5">
                              <span>Temple: {selUser.temple || "N/A"}</span>
                              {selUser.store_access_level !== 'none' && (
                                <span className="bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                  Current: {selUser.store_access_level}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUserForModal("");
                            setIsModalUserDropdownOpen(true);
                          }}
                          className="px-3 py-1.5 bg-white text-slate-700 hover:text-amber-700 hover:bg-slate-50 rounded-lg transition-all text-xs font-bold border border-slate-200 shadow-2xs"
                        >
                          Change
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  /* Search Input & Custom Scrollable List */
                  <div className="relative">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search by name, email, mobile, temple..."
                        value={modalSearchQuery}
                        onFocus={() => setIsModalUserDropdownOpen(true)}
                        onChange={e => {
                          setModalSearchQuery(e.target.value);
                          setIsModalUserDropdownOpen(true);
                        }}
                        className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-amber-500 focus:bg-white shadow-2xs transition-all"
                      />
                      {modalSearchQuery && (
                        <button 
                          type="button"
                          onClick={() => setModalSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Scrollable Custom Options Box */}
                    <div className="mt-2 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 space-y-1 z-30 custom-scrollbar">
                      {filteredAllUsersForModal.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 font-medium">
                          No profiles match "{modalSearchQuery}"
                        </div>
                      ) : (
                        filteredAllUsersForModal.map(u => (
                          <div
                            key={u.id}
                            onClick={() => selectUserInModal(u)}
                            className="p-2.5 rounded-xl hover:bg-amber-50/80 cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs select-none"
                          >
                            <div className="truncate pr-2">
                              <div className="font-bold text-slate-800 truncate">{u.full_name || "N/A"}</div>
                              <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5 truncate">Temple: {u.temple || "N/A"}</div>
                            </div>
                            <div className="text-right shrink-0">
                              {u.store_access_level !== 'none' ? (
                                <span className="inline-block bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {u.store_access_level}
                                </span>
                              ) : (
                                <span className="inline-block bg-slate-100 text-slate-500 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                  Not Approved
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-800">Store Access Level</div>
                    <div className="text-xs text-slate-500">Determine what items this user can request</div>
                  </div>
                  <select 
                    value={modalGrantAccessLevel}
                    onChange={e => setModalGrantAccessLevel(e.target.value as any)}
                    className="px-3 py-2 rounded-lg text-sm font-bold border border-slate-200 outline-none cursor-pointer bg-white text-slate-700 shadow-sm"
                  >
                    <option value="none">None</option>
                    <option value="general">General (Limited Items)</option>
                    <option value="internal">Internal (All Items)</option>
                  </select>
                </label>

                <label className="flex items-center justify-between cursor-pointer border-t border-slate-200 pt-3">
                  <div>
                    <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Crown className="w-4 h-4 text-amber-600" />
                      Assign Store Manager Post
                    </div>
                    <div className="text-xs text-slate-500">Gives full Store Admin privileges (approvals, items management)</div>
                  </div>
                  <ToggleSwitch
                    checked={modalGrantManager}
                    onChange={() => setModalGrantManager(!modalGrantManager)}
                    activeColor="bg-amber-600"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  disabled={isSubmittingModal || !selectedUserForModal || (modalGrantAccessLevel === 'none' && !modalGrantManager)}
                  type="submit"
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2 text-sm shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmittingModal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Permissions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Profile Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 font-outfit">
                <Pencil className="w-5 h-5 text-amber-600" />
                Edit User Profile (Store DB)
              </h2>
              <button onClick={() => setEditingUser(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="text-xs text-slate-500 bg-amber-50/80 p-3 rounded-xl border border-amber-200/70 font-medium">
                Editing profile details stored directly in Store DB for <span className="font-bold text-slate-800">{editingUser.email}</span>.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={e => setEditFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Mobile Number</label>
                  <input
                    type="text"
                    value={editMobile}
                    onChange={e => setEditMobile(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Temple</label>
                  <input
                    type="text"
                    value={editTemple}
                    onChange={e => setEditTemple(e.target.value)}
                    placeholder="e.g. NVCC, Juhu, etc."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Color Preference</label>
                  <select
                    value={editColorPreference}
                    onChange={e => setEditColorPreference(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800"
                  >
                    <option value="-">- None -</option>
                    <option value="Saffron">Saffron</option>
                    <option value="White">White</option>
                    <option value="Any">Any</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Kurta Size</label>
                  <select
                    value={editKurtaSize}
                    onChange={e => setEditKurtaSize(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800"
                  >
                    <option value="-">- None -</option>
                    {['36', '38', '40', '42', '44', '46', '48', '50'].map(sz => (
                      <option key={sz} value={sz}>Size {sz}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Chappal Size</label>
                  <select
                    value={editChappalSize}
                    onChange={e => setEditChappalSize(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-medium text-xs text-slate-800"
                  >
                    <option value="-">- None -</option>
                    {['6', '7', '8', '9', '10', '11', '12'].map(sz => (
                      <option key={sz} value={sz}>Size {sz}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Store Access Level</div>
                    <div className="text-[11px] text-slate-500">Items accessibility for this user</div>
                  </div>
                  <select 
                    value={editStoreAccessLevel}
                    onChange={e => setEditStoreAccessLevel(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 outline-none cursor-pointer bg-white text-slate-700 shadow-2xs"
                  >
                    <option value="none">None</option>
                    <option value="general">General (Limited Items)</option>
                    <option value="internal">Internal (All Items)</option>
                  </select>
                </label>

                <label className="flex items-center justify-between cursor-pointer border-t border-slate-200 pt-3">
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-600" />
                      Assign Store Manager Post
                    </div>
                    <div className="text-[11px] text-slate-500">Gives full Store Admin privileges</div>
                  </div>
                  <ToggleSwitch
                    checked={editIsStoreAdmin}
                    onChange={() => setEditIsStoreAdmin(!editIsStoreAdmin)}
                    activeColor="bg-amber-600"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  disabled={isSubmittingEdit}
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2 text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmittingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Profile Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Popup Modal */}
      {confirmModalData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-slate-800 text-base font-outfit">{confirmModalData.title}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {confirmModalData.message}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmModalData(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const data = confirmModalData;
                  setConfirmModalData(null);
                  if (data) data.onConfirm();
                }}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors shadow-2xs"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
