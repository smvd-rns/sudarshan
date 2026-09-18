"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Loader2, CheckCircle, XCircle, Clock, Plus, Search, Building, 
  Calendar, ArrowUpDown, RotateCcw, Edit3, User, UserPlus, X, Check, 
  ShoppingBag, IndianRupee, Filter, History, Shield, FileText, Trash2, AlertTriangle, RefreshCw,
  CheckSquare, Square, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";
import { parseItemVariants, ItemVariant } from "@/lib/store-variant-utils";

interface StoreItem {
  id: string;
  item_code: string;
  item_name: string;
  category?: string;
  cost?: number;
  variants?: any;
  is_available?: boolean;
}

interface SelectedItemCartEntry {
  cart_key: string;
  item_id: string;
  item_name: string;
  item_code?: string;
  cost?: number;
  quantity: number;
  selected_variant?: string;
  available_variants?: ItemVariant[];
}

interface PendingRequest {
  id: string;
  user_id: string;
  item_id: string;
  quantity: number;
  selected_variant?: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  store_users?: {
    full_name: string;
    email: string;
    temple?: string;
    store_access_level?: string;
  };
  store_items?: {
    item_code: string;
    item_name: string;
    cost?: number;
    variants?: string[];
  };
  lastIssuedDate?: string | null;
}

interface ReimbursementRecord {
  id: string;
  user_id: string;
  entry_date: string;
  item_details: string;
  amount: number;
  created_at: string;
  store_users?: {
    full_name: string;
    email: string;
    temple?: string;
    store_access_level?: string;
  };
}

interface ApprovedUser {
  id: string;
  full_name: string;
  email: string;
  temple?: string;
  mobile?: string;
  store_access_level?: string;
}

interface UnifiedHistoryItem {
  id: string;
  type: 'approved_request' | 'reimbursement';
  date: string;
  userId: string;
  userName: string;
  userEmail: string;
  userTemple: string;
  storeAccessLevel: string;
  itemDetails: string;
  quantity?: number;
  amount?: number;
  approvedBy?: string;
  source?: string;
  raw: any;
}

import { PaginationControls } from "@/components/PaginationControls";

export default function StoreApprovals() {
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  // Data States
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [approvedRequestsHistory, setApprovedRequestsHistory] = useState<PendingRequest[]>([]);
  const [reimbursementsHistory, setReimbursementsHistory] = useState<ReimbursementRecord[]>([]);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [users, setUsers] = useState<ApprovedUser[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { storeUser, loading: authLoading } = useStoreAuth();

  const currentManagerName = useMemo(() => {
    if (storeUser?.full_name && storeUser.full_name.trim() && storeUser.full_name !== "Store Manager" && storeUser.full_name !== "Manager") {
      return storeUser.full_name.trim();
    }
    if (session?.user?.user_metadata?.full_name && session.user.user_metadata.full_name.trim()) {
      return session.user.user_metadata.full_name.trim();
    }
    if (storeUser?.email) {
      const prefix = storeUser.email.split('@')[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    if (session?.user?.email) {
      const prefix = session.user.email.split('@')[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    return "Store Manager";
  }, [storeUser, session]);

  // ---------------------------------------------------------------------------
  // TAB 1: Pending Approvals Search & Filter State
  // ---------------------------------------------------------------------------
  const [t1Search, setT1Search] = useState("");
  const [t1TempleFilter, setT1TempleFilter] = useState("all");
  const [t1SortBy, setT1SortBy] = useState<"fifo_asc" | "date_desc" | "name_asc" | "item_asc">("fifo_asc"); // Default 1st come 1st serve
  const [t1StartDate, setT1StartDate] = useState("");
  const [t1EndDate, setT1EndDate] = useState("");
  const [t1DatePreset, setT1DatePreset] = useState<"all" | "today" | "this_month" | "last_month" | "this_year" | "custom">("all");
  const [t1Page, setT1Page] = useState(1);
  const [t1PageSize, setT1PageSize] = useState(20);

  // ---------------------------------------------------------------------------
  // TAB 2: History Search & Filter State
  // ---------------------------------------------------------------------------
  const [t2Search, setT2Search] = useState("");
  const [t2TypeFilter, setT2TypeFilter] = useState<"all" | "approved_request" | "reimbursement">("all");
  const [t2AccessLevelFilter, setT2AccessLevelFilter] = useState<"all" | "general" | "internal">("all");
  const [t2TempleFilter, setT2TempleFilter] = useState("all");
  const [t2UserFilter, setT2UserFilter] = useState("all");
  const [t2ApprovedByFilter, setT2ApprovedByFilter] = useState("all");
  const [t2SortBy, setT2SortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "name_asc">("date_desc");
  const [t2StartDate, setT2StartDate] = useState("");
  const [t2EndDate, setT2EndDate] = useState("");
  const [t2DatePreset, setT2DatePreset] = useState<"all" | "today" | "this_month" | "last_month" | "this_year" | "custom">("all");
  const [t2Page, setT2Page] = useState(1);
  const [t2PageSize, setT2PageSize] = useState(20);

  // ---------------------------------------------------------------------------
  // MODAL STATES
  // ---------------------------------------------------------------------------
  // Modal 1: Add Request for App User
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [addUserSelectedUserId, setAddUserSelectedUserId] = useState("");
  const [addUserSearchQuery, setAddUserSearchQuery] = useState("");
  const [isAddUserDropdownOpen, setIsAddUserDropdownOpen] = useState(false);
  const [addUserRequestDate, setAddUserRequestDate] = useState<string>("");

  // Modal 1 Multi-Item Search State
  const [userSelectedItems, setUserSelectedItems] = useState<SelectedItemCartEntry[]>([]);
  const [userItemSearchQuery, setUserItemSearchQuery] = useState("");
  const [isUserItemDropdownOpen, setIsUserItemDropdownOpen] = useState(false);
  const [expandedUserItemIds, setExpandedUserItemIds] = useState<string[]>([]);

  // Modal 2: Add Request for Guest User
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestTemple, setGuestTemple] = useState("");
  const [guestMobile, setGuestMobile] = useState("");
  const [guestRequestDate, setGuestRequestDate] = useState<string>("");

  // Modal 2 Multi-Item Search State
  const [guestSelectedItems, setGuestSelectedItems] = useState<SelectedItemCartEntry[]>([]);
  const [guestItemSearchQuery, setGuestItemSearchQuery] = useState("");
  const [isGuestItemDropdownOpen, setIsGuestItemDropdownOpen] = useState(false);
  const [expandedGuestItemIds, setExpandedGuestItemIds] = useState<string[]>([]);

  const formatLastIssuedDate = (dateStr?: string | null) => {
    if (!dateStr) return { date: "Never Issued", duration: "", isNever: true };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { date: "Never Issued", duration: "", isNever: true };

    const dateFormatted = d.toLocaleDateString();
    
    const now = new Date();
    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffTime = startOfNow - startOfD;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let durationStr = "";
    if (diffDays <= 0) {
      durationStr = "Today";
    } else if (diffDays === 1) {
      durationStr = "1 day ago";
    } else if (diffDays < 30) {
      durationStr = `${diffDays} days ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      const remainingDays = diffDays % 30;
      if (months === 1) {
        durationStr = remainingDays > 0 ? `1 mo ${remainingDays}d ago` : `1 month ago`;
      } else {
        durationStr = `${months} months ago`;
      }
    } else {
      const years = (diffDays / 365).toFixed(1);
      durationStr = `${years} yrs ago`;
    }

    return { date: dateFormatted, duration: durationStr, isNever: false };
  };

  const parseVariantLabel = (vStr?: string | null): string => {
    if (!vStr) return "";
    try {
      const parsed = JSON.parse(vStr);
      if (parsed && typeof parsed === "object") {
        if (parsed.variant !== undefined) return parsed.variant;
        if (parsed.label !== undefined) return parsed.label;
      }
    } catch (e) {}
    return vStr;
  };

  const parseVariantMeta = (vStr?: string | null): { approvedBy?: string; source?: string } => {
    if (!vStr) return {};
    try {
      const parsed = JSON.parse(vStr);
      if (parsed && typeof parsed === "object") {
        return {
          approvedBy: parsed.approved_by || parsed.approvedBy,
          source: parsed.source
        };
      }
    } catch (e) {}
    return {};
  };

  const toggleUserItemExpand = (itemId: string) => {
    setExpandedUserItemIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleGuestItemExpand = (itemId: string) => {
    setExpandedGuestItemIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  // Modal 3: Edit Pending Request
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PendingRequest | null>(null);
  const [editItemId, setEditItemId] = useState("");
  const [editVariant, setEditVariant] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");

  const [isModalSubmitting, setIsModalSubmitting] = useState(false);

  // Tab 2 Master Audit Delete state
  const [deleteConfirmT2Item, setDeleteConfirmT2Item] = useState<UnifiedHistoryItem | null>(null);
  const [isDeletingT2, setIsDeletingT2] = useState(false);

  const handleDeleteT2Item = async () => {
    if (!deleteConfirmT2Item || !session) return;
    setIsDeletingT2(true);
    try {
      const token = await getFreshToken();
      if (!token) throw new Error("Authentication session expired.");

      const rawId = deleteConfirmT2Item.raw?.id;
      if (!rawId) throw new Error("Invalid record ID");

      const endpoint = deleteConfirmT2Item.type === 'reimbursement'
        ? `/api/store/reimbursements?id=${rawId}`
        : `/api/store/requests?id=${rawId}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete record");
      }

      if (deleteConfirmT2Item.type === 'reimbursement') {
        setReimbursementsHistory(prev => prev.filter(r => r.id !== rawId));
      } else {
        setApprovedRequestsHistory(prev => prev.filter(r => r.id !== rawId));
      }
      setDeleteConfirmT2Item(null);
    } catch (err: any) {
      alert("Delete failed: " + (err.message || "Error deleting record"));
    } finally {
      setIsDeletingT2(false);
    }
  };

  // Refs for Click Outside
  const addUserDropdownRef = useRef<HTMLDivElement>(null);
  const userItemDropdownRef = useRef<HTMLDivElement>(null);
  const guestItemDropdownRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // INITIALIZATION & FETCHING
  // ---------------------------------------------------------------------------
  const getFreshToken = async (): Promise<string | null> => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.access_token) {
        setSession(currentSession);
        return currentSession.access_token;
      }
    } catch (e) {
      console.error("Error getting fresh session:", e);
    }
    return session?.access_token || null;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchAllData(session.access_token);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (addUserDropdownRef.current && !addUserDropdownRef.current.contains(event.target as Node)) {
        setIsAddUserDropdownOpen(false);
      }
      if (userItemDropdownRef.current && !userItemDropdownRef.current.contains(event.target as Node)) {
        setIsUserItemDropdownOpen(false);
      }
      if (guestItemDropdownRef.current && !guestItemDropdownRef.current.contains(event.target as Node)) {
        setIsGuestItemDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAllData = async (token: string) => {
    setLoading(true);
    await Promise.all([
      fetchPendingRequests(token),
      fetchApprovedRequestsHistory(token),
      fetchReimbursementsHistory(token),
      fetchStoreItems(token),
      fetchApprovedUsers(token)
    ]);
    setLoading(false);
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      const token = await getFreshToken();
      if (token) {
        await Promise.all([
          fetchPendingRequests(token),
          fetchApprovedRequestsHistory(token),
          fetchReimbursementsHistory(token),
          fetchStoreItems(token),
          fetchApprovedUsers(token)
        ]);
      }
    } catch (e) {
      console.error("Error refreshing store approvals data:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchPendingRequests = async (token: string) => {
    const res = await fetch('/api/store/requests?mode=pending', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
      const pendingData = await res.json();
      
      const resApproved = await fetch('/api/store/requests?mode=approved', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let approvedData: any[] = [];
      if (resApproved.ok) approvedData = await resApproved.json();

      const enhancedData = pendingData.map((req: any) => {
        const userApproved = approvedData.filter(a => a.user_id === req.user_id && a.item_id === req.item_id);
        const lastApproved = userApproved.length > 0 ? userApproved[0] : null;
        return {
          ...req,
          lastIssuedDate: lastApproved?.created_at || null
        };
      });
      setRequests(enhancedData);
    }
  };

  const fetchApprovedRequestsHistory = async (token: string) => {
    const res = await fetch('/api/store/requests?mode=approved', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setApprovedRequestsHistory(data);
    }
  };

  const fetchReimbursementsHistory = async (token: string) => {
    const res = await fetch('/api/store/reimbursements', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setReimbursementsHistory(data);
    }
  };

  const fetchStoreItems = async (token: string) => {
    const res = await fetch('/api/store/items?all=true', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setItems(data);
    }
  };

  const fetchApprovedUsers = async (token: string) => {
    const res = await fetch('/api/store/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
  };

  // ---------------------------------------------------------------------------
  // MULTI-ITEM SELECTION HANDLERS (MODAL 1 & MODAL 2)
  // ---------------------------------------------------------------------------
  const filteredCatalogItems = (query: string) => {
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(i => 
      (i.item_name || "").toLowerCase().includes(q) ||
      (i.item_code || "").toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q)
    );
  };

  // Modal 1 Cart Handlers
  const toggleUserItemVariantSelection = (item: StoreItem, variantLabel?: string, variantCost?: number) => {
    const key = `${item.id}_${variantLabel || 'default'}`;
    const parsed = parseItemVariants(item.variants, item.cost || 0).filter(v => v.is_available !== false);

    setUserSelectedItems(prev => {
      const existingIdx = prev.findIndex(i => i.cart_key === key);
      if (existingIdx >= 0) {
        return prev.filter(i => i.cart_key !== key);
      }
      return [
        ...prev,
        {
          cart_key: key,
          item_id: item.id,
          item_name: item.item_name,
          item_code: item.item_code,
          cost: variantCost !== undefined ? variantCost : (item.cost || 0),
          quantity: 1,
          selected_variant: variantLabel || "",
          available_variants: parsed
        }
      ];
    });
  };

  const selectAllUserItemsFiltered = (query: string) => {
    const list = filteredCatalogItems(query);
    setUserSelectedItems(prev => {
      const newItems = [...prev];
      list.forEach(item => {
        const parsed = parseItemVariants(item.variants, item.cost || 0).filter(v => v.is_available !== false);
        if (parsed.length > 0) {
          parsed.forEach(v => {
            const key = `${item.id}_${v.label}`;
            if (!newItems.some(i => i.cart_key === key)) {
              newItems.push({
                cart_key: key,
                item_id: item.id,
                item_name: item.item_name,
                item_code: item.item_code,
                cost: v.cost,
                quantity: 1,
                selected_variant: v.label,
                available_variants: parsed
              });
            }
          });
        } else {
          const key = `${item.id}_default`;
          if (!newItems.some(i => i.cart_key === key)) {
            newItems.push({
              cart_key: key,
              item_id: item.id,
              item_name: item.item_name,
              item_code: item.item_code,
              cost: item.cost || 0,
              quantity: 1,
              selected_variant: "",
              available_variants: []
            });
          }
        }
      });
      return newItems;
    });
  };

  const removeUserItem = (idx: number) => {
    setUserSelectedItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateUserItemQty = (idx: number, qty: number) => {
    setUserSelectedItems(prev => {
      const copy = [...prev];
      copy[idx].quantity = Math.max(1, qty);
      return copy;
    });
  };

  const updateUserItemVariant = (idx: number, variantLabel: string) => {
    setUserSelectedItems(prev => {
      const copy = [...prev];
      const target = copy[idx];
      target.selected_variant = variantLabel;
      const matched = target.available_variants?.find(v => v.label === variantLabel);
      if (matched && typeof matched.cost === 'number') {
        target.cost = matched.cost;
      }
      target.cart_key = `${target.item_id}_${variantLabel}`;
      return copy;
    });
  };

  // Modal 2 Cart Handlers (Guest)
  const toggleGuestItemVariantSelection = (item: StoreItem, variantLabel?: string, variantCost?: number) => {
    const key = `${item.id}_${variantLabel || 'default'}`;
    const parsed = parseItemVariants(item.variants, item.cost || 0).filter(v => v.is_available !== false);

    setGuestSelectedItems(prev => {
      const existingIdx = prev.findIndex(i => i.cart_key === key);
      if (existingIdx >= 0) {
        return prev.filter(i => i.cart_key !== key);
      }
      return [
        ...prev,
        {
          cart_key: key,
          item_id: item.id,
          item_name: item.item_name,
          item_code: item.item_code,
          cost: variantCost !== undefined ? variantCost : (item.cost || 0),
          quantity: 1,
          selected_variant: variantLabel || "",
          available_variants: parsed
        }
      ];
    });
  };

  const selectAllGuestItemsFiltered = (query: string) => {
    const list = filteredCatalogItems(query);
    setGuestSelectedItems(prev => {
      const newItems = [...prev];
      list.forEach(item => {
        const parsed = parseItemVariants(item.variants, item.cost || 0).filter(v => v.is_available !== false);
        if (parsed.length > 0) {
          parsed.forEach(v => {
            const key = `${item.id}_${v.label}`;
            if (!newItems.some(i => i.cart_key === key)) {
              newItems.push({
                cart_key: key,
                item_id: item.id,
                item_name: item.item_name,
                item_code: item.item_code,
                cost: v.cost,
                quantity: 1,
                selected_variant: v.label,
                available_variants: parsed
              });
            }
          });
        } else {
          const key = `${item.id}_default`;
          if (!newItems.some(i => i.cart_key === key)) {
            newItems.push({
              cart_key: key,
              item_id: item.id,
              item_name: item.item_name,
              item_code: item.item_code,
              cost: item.cost || 0,
              quantity: 1,
              selected_variant: "",
              available_variants: []
            });
          }
        }
      });
      return newItems;
    });
  };

  const removeGuestItem = (idx: number) => {
    setGuestSelectedItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateGuestItemQty = (idx: number, qty: number) => {
    setGuestSelectedItems(prev => {
      const copy = [...prev];
      copy[idx].quantity = Math.max(1, qty);
      return copy;
    });
  };

  const updateGuestItemVariant = (idx: number, variantLabel: string) => {
    setGuestSelectedItems(prev => {
      const copy = [...prev];
      const target = copy[idx];
      target.selected_variant = variantLabel;
      const matched = target.available_variants?.find(v => v.label === variantLabel);
      if (matched && typeof matched.cost === 'number') {
        target.cost = matched.cost;
      }
      target.cart_key = `${target.item_id}_${variantLabel}`;
      return copy;
    });
  };

  // ---------------------------------------------------------------------------
  // DATE PRESET HELPERS
  // ---------------------------------------------------------------------------
  const applyPreset = (
    preset: "all" | "today" | "this_month" | "last_month" | "this_year",
    setPreset: (p: any) => void,
    setStart: (s: string) => void,
    setEnd: (e: string) => void
  ) => {
    setPreset(preset);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (preset === "all") {
      setStart("");
      setEnd("");
    } else if (preset === "today") {
      const todayStr = now.toISOString().split("T")[0];
      setStart(todayStr);
      setEnd(todayStr);
    } else if (preset === "this_month") {
      const start = new Date(year, month, 1).toISOString().split("T")[0];
      const end = new Date(year, month + 1, 0).toISOString().split("T")[0];
      setStart(start);
      setEnd(end);
    } else if (preset === "last_month") {
      const start = new Date(year, month - 1, 1).toISOString().split("T")[0];
      const end = new Date(year, month, 0).toISOString().split("T")[0];
      setStart(start);
      setEnd(end);
    } else if (preset === "this_year") {
      setStart(`${year}-01-01`);
      setEnd(`${year}-12-31`);
    }
  };

  // ---------------------------------------------------------------------------
  // TAB 1: MEMOIZED FILTER & SORT (PENDING REQUESTS - FIFO)
  // ---------------------------------------------------------------------------
  const uniqueT1Temples = useMemo(() => {
    const set = new Set<string>();
    requests.forEach(r => {
      if (r.store_users?.temple) set.add(r.store_users.temple);
    });
    return Array.from(set).sort();
  }, [requests]);

  const filteredT1Requests = useMemo(() => {
    let list = [...requests];

    // Search
    if (t1Search.trim()) {
      const q = t1Search.toLowerCase().trim();
      list = list.filter(r => {
        const name = (r.store_users?.full_name || "").toLowerCase();
        const email = (r.store_users?.email || "").toLowerCase();
        const temple = (r.store_users?.temple || "").toLowerCase();
        const item = (r.store_items?.item_name || "").toLowerCase();
        const itemCode = (r.store_items?.item_code || "").toLowerCase();
        const variant = (r.selected_variant || "").toLowerCase();
        return name.includes(q) || email.includes(q) || temple.includes(q) || item.includes(q) || itemCode.includes(q) || variant.includes(q);
      });
    }

    // Temple
    if (t1TempleFilter !== "all") {
      list = list.filter(r => (r.store_users?.temple || "") === t1TempleFilter);
    }

    // Date Range
    if (t1StartDate) {
      list = list.filter(r => (r.created_at || "").split('T')[0] >= t1StartDate);
    }
    if (t1EndDate) {
      list = list.filter(r => (r.created_at || "").split('T')[0] <= t1EndDate);
    }

    // Sort: Default is FIFO (Oldest first: 1st entry 1st view to admin)
    list.sort((a, b) => {
      if (t1SortBy === "fifo_asc") {
        return (a.created_at || "").localeCompare(b.created_at || "");
      }
      if (t1SortBy === "date_desc") {
        return (b.created_at || "").localeCompare(a.created_at || "");
      }
      if (t1SortBy === "name_asc") {
        const nameA = (a.store_users?.full_name || "").trim();
        const nameB = (b.store_users?.full_name || "").trim();
        return nameA.localeCompare(nameB);
      }
      if (t1SortBy === "item_asc") {
        const itemA = (a.store_items?.item_name || "").trim();
        const itemB = (b.store_items?.item_name || "").trim();
        return itemA.localeCompare(itemB);
      }
      return 0;
    });

    return list;
  }, [requests, t1Search, t1TempleFilter, t1SortBy, t1StartDate, t1EndDate]);

  const paginatedT1Requests = useMemo(() => {
    const startIndex = (t1Page - 1) * t1PageSize;
    return filteredT1Requests.slice(startIndex, startIndex + t1PageSize);
  }, [filteredT1Requests, t1Page, t1PageSize]);

  useEffect(() => {
    setT1Page(1);
  }, [t1Search, t1TempleFilter, t1SortBy, t1StartDate, t1EndDate, t1PageSize]);

  const hasT1ActiveFilters = t1Search.trim() !== "" || t1TempleFilter !== "all" || t1SortBy !== "fifo_asc" || t1StartDate !== "" || t1EndDate !== "";

  const clearT1Filters = () => {
    setT1Search("");
    setT1TempleFilter("all");
    setT1SortBy("fifo_asc");
    setT1StartDate("");
    setT1EndDate("");
    setT1DatePreset("all");
    setT1Page(1);
    setT1PageSize(20);
  };

  // ---------------------------------------------------------------------------
  // TAB 2: UNIFIED HISTORY MASTER LIST
  // ---------------------------------------------------------------------------
  const masterHistoryList = useMemo<UnifiedHistoryItem[]>(() => {
    const list: UnifiedHistoryItem[] = [];

    // Approved Requests
    approvedRequestsHistory.forEach(req => {
      const itemCost = Number(req.store_items?.cost || 0);
      const qty = Number(req.quantity || 1);
      const isGuest = req.store_users?.full_name?.includes("(Guest)");

      const meta = parseVariantMeta(req.selected_variant);
      const cleanVariant = parseVariantLabel(req.selected_variant);

      let approvedBy = meta.approvedBy || (req as any).approved_by_name || (req as any).approved_by;
      if (!approvedBy || approvedBy === "Store Manager" || approvedBy === "Manager") {
        approvedBy = currentManagerName;
      }
      let source = meta.source || (isGuest ? 'Guest Entry' : 'Self Request');

      list.push({
        id: `req_${req.id}`,
        type: 'approved_request',
        date: req.created_at || "",
        userId: req.user_id,
        userName: req.store_users?.full_name || "Unknown",
        userEmail: req.store_users?.email || "",
        userTemple: req.store_users?.temple || "N/A",
        storeAccessLevel: req.store_users?.store_access_level || "internal",
        itemDetails: `${req.store_items?.item_name || "Item"}${cleanVariant ? ` (${cleanVariant})` : ''}`,
        quantity: qty,
        amount: itemCost ? itemCost * qty : 0,
        approvedBy,
        source,
        raw: req
      });
    });

    // Reimbursements
    reimbursementsHistory.forEach(reimb => {
      const meta = parseVariantMeta((reimb as any).notes || (reimb as any).item_details);
      let approvedBy = meta.approvedBy || (reimb as any).created_by_name || (reimb as any).approved_by;
      if (!approvedBy || approvedBy === "Store Manager" || approvedBy === "Manager") {
        approvedBy = currentManagerName;
      }
      list.push({
        id: `reimb_${reimb.id}`,
        type: 'reimbursement',
        date: reimb.entry_date || reimb.created_at || "",
        userId: reimb.user_id,
        userName: reimb.store_users?.full_name || "Unknown",
        userEmail: reimb.store_users?.email || "",
        userTemple: reimb.store_users?.temple || "N/A",
        storeAccessLevel: reimb.store_users?.store_access_level || "internal",
        itemDetails: reimb.item_details || "Manual Reimbursement",
        amount: Number(reimb.amount || 0),
        approvedBy,
        source: "Reimbursement",
        raw: reimb
      });
    });

    return list;
  }, [approvedRequestsHistory, reimbursementsHistory, currentManagerName]);

  const uniqueT2Temples = useMemo(() => {
    const set = new Set<string>();
    masterHistoryList.forEach(item => {
      if (item.userTemple && item.userTemple !== "N/A") set.add(item.userTemple);
    });
    return Array.from(set).sort();
  }, [masterHistoryList]);

  const uniqueT2Users = useMemo(() => {
    const map = new Map<string, string>();
    masterHistoryList.forEach(item => {
      if (item.userId) map.set(item.userId, item.userName);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [masterHistoryList]);

  const uniqueT2Approvers = useMemo(() => {
    const set = new Set<string>();
    masterHistoryList.forEach(item => {
      if (item.approvedBy && item.approvedBy.trim()) {
        set.add(item.approvedBy.trim());
      }
    });
    return Array.from(set).sort();
  }, [masterHistoryList]);

  const filteredT2History = useMemo(() => {
    let list = [...masterHistoryList];

    // Search
    if (t2Search.trim()) {
      const q = t2Search.toLowerCase().trim();
      list = list.filter(h => {
        return (
          h.userName.toLowerCase().includes(q) ||
          h.userEmail.toLowerCase().includes(q) ||
          h.userTemple.toLowerCase().includes(q) ||
          h.itemDetails.toLowerCase().includes(q) ||
          (h.amount || 0).toString().includes(q)
        );
      });
    }

    // Type filter
    if (t2TypeFilter !== "all") {
      list = list.filter(h => h.type === t2TypeFilter);
    }

    // Access Level filter
    if (t2AccessLevelFilter !== "all") {
      list = list.filter(h => (h.storeAccessLevel || "internal") === t2AccessLevelFilter);
    }

    // Temple filter
    if (t2TempleFilter !== "all") {
      list = list.filter(h => h.userTemple === t2TempleFilter);
    }

    // Devotee / User filter
    if (t2UserFilter !== "all") {
      list = list.filter(h => h.userId === t2UserFilter);
    }

    // Approved By / Manager filter
    if (t2ApprovedByFilter !== "all") {
      list = list.filter(h => h.approvedBy === t2ApprovedByFilter);
    }

    // Date Range
    if (t2StartDate) {
      list = list.filter(h => h.date.split('T')[0] >= t2StartDate);
    }
    if (t2EndDate) {
      list = list.filter(h => h.date.split('T')[0] <= t2EndDate);
    }

    // Sort
    list.sort((a, b) => {
      if (t2SortBy === "date_desc") {
        return b.date.localeCompare(a.date);
      }
      if (t2SortBy === "date_asc") {
        return a.date.localeCompare(b.date);
      }
      if (t2SortBy === "amount_desc") {
        return (b.amount || 0) - (a.amount || 0);
      }
      if (t2SortBy === "name_asc") {
        return a.userName.localeCompare(b.userName);
      }
      return 0;
    });

    return list;
  }, [masterHistoryList, t2Search, t2TypeFilter, t2AccessLevelFilter, t2TempleFilter, t2UserFilter, t2ApprovedByFilter, t2SortBy, t2StartDate, t2EndDate]);

  const paginatedT2History = useMemo(() => {
    const startIndex = (t2Page - 1) * t2PageSize;
    return filteredT2History.slice(startIndex, startIndex + t2PageSize);
  }, [filteredT2History, t2Page, t2PageSize]);

  useEffect(() => {
    setT2Page(1);
  }, [t2Search, t2TypeFilter, t2AccessLevelFilter, t2TempleFilter, t2UserFilter, t2ApprovedByFilter, t2SortBy, t2StartDate, t2EndDate, t2PageSize]);

  const hasT2ActiveFilters = t2Search.trim() !== "" || t2TypeFilter !== "all" || t2AccessLevelFilter !== "all" || t2TempleFilter !== "all" || t2UserFilter !== "all" || t2ApprovedByFilter !== "all" || t2SortBy !== "date_desc" || t2StartDate !== "" || t2EndDate !== "";

  const clearT2Filters = () => {
    setT2Search("");
    setT2TypeFilter("all");
    setT2AccessLevelFilter("all");
    setT2TempleFilter("all");
    setT2UserFilter("all");
    setT2ApprovedByFilter("all");
    setT2SortBy("date_desc");
    setT2StartDate("");
    setT2EndDate("");
    setT2DatePreset("all");
    setT2Page(1);
    setT2PageSize(20);
  };

  // Total History Amount
  const totalT2Amount = useMemo(() => {
    return filteredT2History.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [filteredT2History]);

  // ---------------------------------------------------------------------------
  // ACTIONS (APPROVE / REJECT / EDIT / ADD MULTI-ITEM REQUEST)
  // ---------------------------------------------------------------------------
  const handleApproveOrReject = async (id: string, action: 'approved' | 'rejected') => {
    const token = await getFreshToken();
    if (!token) {
      alert("Session expired. Please refresh the page and try again.");
      return;
    }
    setActionLoading(id);
    
    if (action === 'approved') {
      const targetReq = requests.find(r => r.id === id);
      const managerName = currentManagerName;

      const rawVariant = targetReq?.selected_variant || "";
      const cleanVar = parseVariantLabel(rawVariant);
      const existingMeta = parseVariantMeta(rawVariant);

      const updatedVariantJSON = JSON.stringify({
        variant: cleanVar,
        approved_by: managerName,
        source: existingMeta.source || (targetReq?.store_users?.full_name?.includes("(Guest)") ? 'Guest Entry' : 'Self Request')
      });

      const res = await fetch('/api/store/requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id,
          status: 'approved',
          selected_variant: updatedVariantJSON
        })
      });

      if (res.ok) {
        setRequests(prev => prev.filter(r => r.id !== id));
        fetchApprovedRequestsHistory(token);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Error approving request: " + (err.error || "Server error"));
      }
    } else {
      const res = await fetch(`/api/store/requests?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setRequests(prev => prev.filter(r => r.id !== id));
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Error rejecting request: " + (err.error || "Server error"));
      }
    }
    setActionLoading(null);
  };

  // Open Edit Modal
  const openEditModal = (req: PendingRequest) => {
    setEditingRequest(req);
    setEditItemId(req.item_id);
    setEditVariant(req.selected_variant || "");
    setEditQuantity(req.quantity.toString());
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;

    const token = await getFreshToken();
    if (!token) {
      alert("Session expired. Please refresh the page and try again.");
      return;
    }

    setIsModalSubmitting(true);
    try {
      const res = await fetch('/api/store/requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: editingRequest.id,
          item_id: editItemId,
          quantity: parseInt(editQuantity, 10) || 1,
          selected_variant: editVariant || null
        })
      });

      if (res.ok) {
        setIsEditModalOpen(false);
        fetchPendingRequests(token);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("Error updating request: " + (err.error || "Failed to update"));
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsModalSubmitting(false);
    }
  };

  // Add Multi-Item Request for Registered App User
  const handleAddUserRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserSelectedUserId || userSelectedItems.length === 0) return;

    const token = await getFreshToken();
    if (!token) {
      alert("Session expired. Please refresh the page and try again.");
      return;
    }

    setIsModalSubmitting(true);
    try {
      const results = await Promise.all(
        userSelectedItems.map(item =>
          fetch('/api/store/requests', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              target_user_id: addUserSelectedUserId,
              item_id: item.item_id,
              quantity: item.quantity,
              request_date: addUserRequestDate || undefined,
              selected_variant: JSON.stringify({
                variant: item.selected_variant || "",
                source: "Added by Manager"
              })
            })
          })
        )
      );

      const failedResults = results.filter(r => !r.ok);
      if (failedResults.length === 0) {
        setIsAddUserModalOpen(false);
        setAddUserSelectedUserId("");
        setUserSelectedItems([]);
        setUserItemSearchQuery("");
        setAddUserRequestDate("");
        fetchPendingRequests(token);
      } else {
        const errors = await Promise.all(
          failedResults.map(async r => {
            try { return (await r.json()).error; } catch { return "Failed"; }
          })
        );
        alert(`Failed to submit ${failedResults.length} request(s): ` + errors.join(", "));
        fetchPendingRequests(token);
      }
    } catch (err: any) {
      alert("Error submitting request: " + err.message);
    } finally {
      setIsModalSubmitting(false);
    }
  };

  // Add Multi-Item Request for Guest User (Senior Monk / Visitor)
  const handleGuestRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || guestSelectedItems.length === 0) return;

    const token = await getFreshToken();
    if (!token) {
      alert("Session expired. Please refresh the page and try again.");
      return;
    }

    setIsModalSubmitting(true);
    try {
      const firstItem = guestSelectedItems[0];
      const resFirst = await fetch('/api/store/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          is_guest: true,
          guest_name: guestName.trim(),
          guest_temple: guestTemple.trim() || "Guest Temple",
          guest_mobile: guestMobile.trim() || "N/A",
          item_id: firstItem.item_id,
          quantity: firstItem.quantity,
          request_date: guestRequestDate || undefined,
          selected_variant: JSON.stringify({
            variant: firstItem.selected_variant || "",
            source: "Guest Entry"
          })
        })
      });

      if (!resFirst.ok) {
        const err = await resFirst.json().catch(() => ({}));
        alert("Error creating guest request: " + (err.error || "Failed to create"));
        setIsModalSubmitting(false);
        return;
      }

      const firstData = await resFirst.json();
      const guestUserId = firstData.user_id;

      if (guestSelectedItems.length > 1 && guestUserId) {
        const remainingItems = guestSelectedItems.slice(1);
        const remResults = await Promise.all(
          remainingItems.map(item =>
            fetch('/api/store/requests', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                target_user_id: guestUserId,
                item_id: item.item_id,
                quantity: item.quantity,
                request_date: guestRequestDate || undefined,
                selected_variant: JSON.stringify({
                  variant: item.selected_variant || "",
                  source: "Guest Entry"
                })
              })
            })
          )
        );

        const remFailed = remResults.filter(r => !r.ok);
        if (remFailed.length > 0) {
          const errors = await Promise.all(
            remFailed.map(async r => {
              try { return (await r.json()).error; } catch { return "Failed"; }
            })
          );
          alert(`Guest created, but ${remFailed.length} item(s) failed: ` + errors.join(", "));
        }
      }

      setIsGuestModalOpen(false);
      setGuestName("");
      setGuestTemple("");
      setGuestMobile("");
      setGuestSelectedItems([]);
      setGuestItemSearchQuery("");
      fetchPendingRequests(token);
      fetchApprovedUsers(token);
    } catch (err: any) {
      alert("Error creating guest request: " + err.message);
    } finally {
      setIsModalSubmitting(false);
    }
  };

  const selectedUserObj = users.find(u => u.id === addUserSelectedUserId);

  const sortedUsersList = useMemo(() => {
    let list = users;
    if (addUserSearchQuery.trim()) {
      const q = addUserSearchQuery.toLowerCase();
      list = users.filter(u => 
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.temple || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [users, addUserSearchQuery]);

  if (authLoading || loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-devo-500" /></div>;

  const canAccessApprovals = storeUser?.can_access_approvals ?? (storeUser?.is_store_admin || storeUser?.is_super_or_store_admin || storeUser?.is_store_manager);

  if (!canAccessApprovals) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-slate-200">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2 font-outfit">Access Denied</h1>
          <p className="text-slate-600 font-medium mb-6 text-sm">
            You do not have permission to view the Store Approvals Queue. This page is restricted to Store Managers and Store Admins.
          </p>
          <a href="/store/request" className="inline-block px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors text-sm">
            Return to Store Request
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-16 space-y-6">
      {/* ─── Page Header Bar ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black font-outfit text-slate-800 flex items-center gap-2 sm:gap-3">
            <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-devo-600 shrink-0" />
            <span>Store Approvals & Master History</span>
          </h1>
        </div>

        {/* Tab Switcher & Quick Add / Refresh Buttons */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleRefreshData}
            disabled={isRefreshing}
            className="px-3 sm:px-3.5 py-2 sm:py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs text-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
            title="Refresh Table Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>

          {activeTab === "pending" && (
            <>
              <button
                onClick={() => {
                  setAddUserSelectedUserId("");
                  setUserSelectedItems([]);
                  setUserItemSearchQuery("");
                  setAddUserRequestDate(new Date().toISOString().split('T')[0]);
                  setIsAddUserModalOpen(true);
                }}
                className="px-3.5 py-2 sm:py-2.5 bg-devo-600 hover:bg-devo-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs text-xs transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ Add Request for User</span>
              </button>

              <button
                onClick={() => {
                  setGuestName("");
                  setGuestTemple("");
                  setGuestMobile("");
                  setGuestSelectedItems([]);
                  setGuestItemSearchQuery("");
                  setGuestRequestDate(new Date().toISOString().split('T')[0]);
                  setIsGuestModalOpen(true);
                }}
                className="col-span-2 sm:col-span-1 px-3.5 py-2 sm:py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-2xs text-xs transition-all cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Add Request for Guest</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Subsection Tabs (Tab 1: Items Request | Tab 2: Master History) ────── */}
      <div className="flex items-center gap-1 sm:gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar scroll-smooth">
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-3.5 sm:px-5 py-2.5 sm:py-3 font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "pending"
              ? "border-devo-600 text-devo-700 bg-devo-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Items Request Queue</span>
          <span className={`ml-0.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black ${
            requests.length > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"
          }`}>
            {requests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`px-3.5 sm:px-5 py-2.5 sm:py-3 font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "history"
              ? "border-devo-600 text-devo-700 bg-devo-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          }`}
        >
          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Master Audit History</span>
          <span className="ml-0.5 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black bg-slate-100 text-slate-600">
            {masterHistoryList.length}
          </span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: REQUEST APPROVALS (PENDING LIST - FIFO ORDER)                */}
      {/* =================================================================== */}
      {activeTab === "pending" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 sm:p-5 space-y-3 sm:space-y-4 w-full">
          {/* Section Summary Header */}
          <div className="flex flex-row items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-800 text-sm sm:text-lg font-outfit flex items-center gap-1.5 sm:gap-2">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0" />
                <span>Pending Requests Queue</span>
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRefreshData}
                disabled={isRefreshing}
                className="px-2 py-1 bg-white hover:bg-amber-50 border border-amber-200 text-amber-900 font-bold rounded-xl flex items-center gap-1 text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                title="Refresh Pending Requests Queue"
              >
                <RefreshCw className={`w-3 h-3 text-amber-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <span className="bg-amber-50 text-amber-900 border border-amber-200/80 text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 shrink-0">
                <span className="hidden sm:inline">Showing:</span>
                <span className="font-black text-amber-700">{filteredT1Requests.length} of {requests.length} pending</span>
              </span>
            </div>
          </div>

          {/* Tab 1 Toolbar (Search, Temple, Date Range, Sort) */}
          <div className="flex flex-col gap-2.5 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200/80">
            {/* Top Row: Search, Temple, Sort */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-stretch lg:items-center gap-2">
              {/* Search Box */}
              <div className="relative lg:flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search devotee, item, temple..."
                  value={t1Search}
                  onChange={e => setT1Search(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:border-devo-500 shadow-2xs"
                />
                {t1Search && (
                  <button onClick={() => setT1Search("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Temple Filter */}
              <div className="relative min-w-0">
                <select
                  value={t1TempleFilter}
                  onChange={e => setT1TempleFilter(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-devo-500 appearance-none cursor-pointer"
                >
                  <option value="all">All Temples ({requests.length})</option>
                  {uniqueT1Temples.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Building className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Sort Dropdown */}
              <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
                <select
                  value={t1SortBy}
                  onChange={e => setT1SortBy(e.target.value as any)}
                  className="w-full pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-devo-500 appearance-none cursor-pointer"
                >
                  <option value="fifo_asc">1st Entry 1st View (Oldest First)</option>
                  <option value="date_desc">Recent Submissions (Newest First)</option>
                  <option value="name_asc">Devotee Name: A to Z</option>
                  <option value="item_asc">Item Name: A to Z</option>
                </select>
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Reset */}
              {hasT1ActiveFilters && (
                <button
                  onClick={clearT1Filters}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 border border-amber-200 transition-colors shrink-0"
                  title="Reset search and filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Bottom Row: Date Presets & Pickers */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 pt-2.5 border-t border-slate-200/60 text-xs">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-bold text-slate-600 flex items-center gap-1 mr-1 text-[11px]">
                  <Calendar className="w-3.5 h-3.5 text-devo-600" />
                  <span>Range:</span>
                </span>
                {(["all", "today", "this_month", "last_month"] as const).map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPreset(preset, setT1DatePreset, setT1StartDate, setT1EndDate)}
                    className={`px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-bold transition-all ${
                      t1DatePreset === preset ? "bg-devo-600 text-white shadow-2xs" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {preset === "all" ? "All Time" : preset === "today" ? "Today" : preset === "this_month" ? "This Month" : "Last Month"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full lg:w-auto">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[10px] font-semibold text-slate-500 shrink-0">From:</span>
                  <input
                    type="date"
                    value={t1StartDate}
                    onChange={e => {
                      setT1StartDate(e.target.value);
                      setT1DatePreset("custom");
                    }}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] sm:text-xs font-medium text-slate-800 outline-none focus:border-devo-500 shadow-2xs min-w-0"
                  />
                </div>

                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[10px] font-semibold text-slate-500 shrink-0">To:</span>
                  <input
                    type="date"
                    value={t1EndDate}
                    onChange={e => {
                      setT1EndDate(e.target.value);
                      setT1DatePreset("custom");
                    }}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] sm:text-xs font-medium text-slate-800 outline-none focus:border-devo-500 shadow-2xs min-w-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Pending Requests List: Mobile Compact Card View */}
          <div className="block md:hidden space-y-2.5">
            {paginatedT1Requests.map((req, idx) => {
              const isGuest = req.store_users?.full_name?.includes("(Guest)");
              const queueNum = (t1Page - 1) * t1PageSize + idx + 1;
              const isEven = idx % 2 === 0;

              return (
                <div
                  key={req.id}
                  className={`rounded-xl border p-2.5 shadow-2xs space-y-2 transition-colors ${
                    isEven
                      ? "bg-white border-l-4 border-l-devo-600 border-slate-200/90"
                      : "bg-slate-50/90 border-l-4 border-l-amber-500 border-slate-300/80"
                  }`}
                >
                  {/* Top Line: Queue # + Devotee Name + Temple + Qty */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-devo-100 text-devo-900 font-bold font-mono text-[10px] shrink-0">
                        #{queueNum}
                      </span>
                      <div className="font-bold text-slate-800 text-xs flex items-center gap-1 min-w-0">
                        <span className="truncate">{req.store_users?.full_name || "Unknown"}</span>
                        {(() => {
                          const meta = parseVariantMeta(req.selected_variant);
                          const source = meta.source || (isGuest ? 'Guest Entry' : 'Self Request');
                          return (
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                              source === 'Guest Entry' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                              source === 'Added by Manager' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                              'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}>
                              {source}
                            </span>
                          );
                        })()}
                      </div>
                      {req.store_users?.temple && (
                        <span className="text-[10px] text-slate-500 font-medium truncate shrink-0">
                          ({req.store_users.temple})
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-black text-black bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-lg text-xs sm:text-sm shadow-2xs shrink-0">
                      Qty: <span className="font-black text-sm text-black">{req.quantity}</span>
                    </span>
                  </div>

                  {/* Middle Line: Item Requested (Prominent!), Code, Variant & Last Issued */}
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="font-black text-slate-900 text-sm tracking-tight truncate">
                        {req.store_items?.item_name || "Item"}
                      </span>
                      {req.store_items?.item_code && (
                        <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded font-mono shrink-0">
                          #{req.store_items.item_code}
                        </span>
                      )}
                      {parseVariantLabel(req.selected_variant) && (
                        <span className="text-xs font-bold text-black bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md shrink-0">
                          {parseVariantLabel(req.selected_variant)}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 shrink-0">
                      {(() => {
                        const lastIssuedInfo = formatLastIssuedDate(req.lastIssuedDate);
                        if (lastIssuedInfo.isNever) {
                          return <span className="text-slate-400 font-medium">Never</span>;
                        }
                        return (
                          <span className="text-amber-900 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1">
                            <span>Last: {lastIssuedInfo.date}</span>
                            <span className="text-slate-700 font-black">({lastIssuedInfo.duration})</span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Bottom Line: Action Buttons (Edit, Reject, Approve) */}
                  <div className="flex items-center justify-end gap-1.5 pt-0.5">
                    <button
                      disabled={actionLoading === req.id}
                      onClick={() => openEditModal(req)}
                      className="p-1 text-slate-500 hover:text-devo-700 hover:bg-devo-50 rounded-lg border border-slate-200 transition-colors"
                      title="Edit Request Details"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      disabled={actionLoading === req.id}
                      onClick={() => handleApproveOrReject(req.id, 'rejected')}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-lg text-xs transition-colors disabled:opacity-50"
                    >
                      {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      Reject
                    </button>

                    <button
                      disabled={actionLoading === req.id}
                      onClick={() => handleApproveOrReject(req.id, 'approved')}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs disabled:opacity-50"
                    >
                      {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Approve
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredT1Requests.length === 0 && (
              <div className="p-8 text-center text-slate-400 font-medium bg-slate-50 rounded-xl border border-slate-200 text-xs">
                {hasT1ActiveFilters ? "No pending requests match your active search/filter criteria." : "No pending requests to approve."}
              </div>
            )}
          </div>

          {/* Pending Requests Table (Desktop / Tablet View) */}
          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead className="bg-slate-100/70 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center w-12"># Queue</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Devotee / Guest</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Item Requested</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Qty</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Last Issued Date</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedT1Requests.map((req, idx) => {
                  const isGuest = req.store_users?.full_name?.includes("(Guest)");
                  const queueNum = (t1Page - 1) * t1PageSize + idx + 1;

                  return (
                    <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold font-mono text-xs">
                          #{queueNum}
                        </span>
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">{req.store_users?.full_name || "Unknown"}</span>
                          {(() => {
                            const meta = parseVariantMeta(req.selected_variant);
                            const source = meta.source || (isGuest ? 'Guest Entry' : 'Self Request');
                            return (
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                source === 'Guest Entry' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                                source === 'Added by Manager' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                                'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}>
                                {source}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="text-xs text-slate-500">{req.store_users?.email}</div>
                        {req.store_users?.temple && (
                          <div className="text-[10px] text-slate-400 mt-0.5">Temple: {req.store_users.temple}</div>
                        )}
                      </td>

                      <td className="p-4 text-sm">
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span>{req.store_items?.item_name || "Item"}</span>
                          {req.store_items?.item_code && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                              #{req.store_items.item_code}
                            </span>
                          )}
                        </div>
                        {parseVariantLabel(req.selected_variant) && (
                          <div className="text-xs text-black bg-amber-50 inline-block px-2 py-0.5 rounded-md mt-1 font-bold border border-amber-200/60">
                            {parseVariantLabel(req.selected_variant)}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-center font-mono font-bold text-slate-700 text-sm">
                        {req.quantity}
                      </td>

                      <td className="p-4 text-xs font-medium">
                        {(() => {
                          const lastIssuedInfo = formatLastIssuedDate(req.lastIssuedDate);
                          if (lastIssuedInfo.isNever) {
                            return <span className="text-slate-400 font-normal">Never Issued</span>;
                          }
                          return (
                            <div className="space-y-0.5">
                              <span className="text-amber-900 bg-amber-50 border border-amber-200/90 px-2.5 py-1 rounded-md font-bold inline-block">
                                {lastIssuedInfo.date}
                              </span>
                              <div className="text-[11px] font-bold text-slate-700 font-mono flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                <span>{lastIssuedInfo.duration}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Edit Button */}
                          <button
                            disabled={actionLoading === req.id}
                            onClick={() => openEditModal(req)}
                            className="p-1.5 text-slate-500 hover:text-devo-700 hover:bg-devo-50 rounded-lg border border-slate-200 hover:border-devo-200 transition-colors"
                            title="Edit Request Details"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {/* Approve Button */}
                          <button
                            disabled={actionLoading === req.id}
                            onClick={() => handleApproveOrReject(req.id, 'approved')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs disabled:opacity-50"
                          >
                            {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            Approve
                          </button>

                          {/* Reject Button */}
                          <button
                            disabled={actionLoading === req.id}
                            onClick={() => handleApproveOrReject(req.id, 'rejected')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-lg text-xs transition-colors disabled:opacity-50"
                          >
                            {actionLoading === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredT1Requests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 font-medium">
                      {hasT1ActiveFilters ? "No pending requests match your active search/filter criteria." : "No pending requests to approve."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tab 1 Pagination Controls */}
          <PaginationControls
            currentPage={t1Page}
            pageSize={t1PageSize}
            totalItems={filteredT1Requests.length}
            onPageChange={setT1Page}
            onPageSizeChange={setT1PageSize}
            pageSizeOptions={[20, 50, 100]}
          />
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: MASTER ISSUED & REIMBURSEMENTS HISTORY                      */}
      {/* =================================================================== */}
      {activeTab === "history" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4 w-full">
          {/* Section Summary Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-800 text-lg font-outfit flex items-center gap-2">
                <History className="w-5 h-5 text-devo-600" />
                Master Audit History Ledger
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshData}
                disabled={isRefreshing}
                className="px-2.5 py-1.5 bg-white hover:bg-devo-50 border border-devo-200 text-devo-950 font-bold rounded-xl flex items-center gap-1.5 text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                title="Refresh Master Audit History"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-devo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <span className="bg-devo-50 text-devo-950 border border-devo-200/80 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-2xs">
                <span>Total Calculated Value:</span>
                <span className="font-mono font-black text-devo-700 text-sm">
                  ₹{totalT2Amount.toLocaleString()}
                </span>
              </span>
            </div>
          </div>

          {/* Tab 2 Toolbar (Search, Approved By, Type, Access Level, Temple, Date, Sort) */}
          <div className="flex flex-col gap-2.5 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200/80">
            {/* Row 1: Search Box (2 cols), Approved By, Types, Access, Temples */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
              {/* Search Box */}
              <div className="relative lg:col-span-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search devotee, item, temple..."
                  value={t2Search}
                  onChange={e => setT2Search(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:border-devo-500 shadow-2xs"
                />
                {t2Search && (
                  <button onClick={() => setT2Search("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Approved By Filter Dropdown */}
              <div className="relative min-w-0">
                <select
                  value={t2ApprovedByFilter}
                  onChange={e => setT2ApprovedByFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-devo-500 cursor-pointer truncate shadow-2xs"
                >
                  <option value="all">✓ Approved By: All ({uniqueT2Approvers.length})</option>
                  {uniqueT2Approvers.map(name => (
                    <option key={name} value={name}>✓ Approved By: {name}</option>
                  ))}
                </select>
              </div>

              {/* Type Filter */}
              <div className="relative min-w-0">
                <select
                  value={t2TypeFilter}
                  onChange={e => setT2TypeFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-devo-500 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Types</option>
                  <option value="approved_request">Approved Requests</option>
                  <option value="reimbursement">Reimbursements</option>
                </select>
              </div>

              {/* Access Level Filter */}
              <div className="relative min-w-0">
                <select
                  value={t2AccessLevelFilter}
                  onChange={e => setT2AccessLevelFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-devo-500 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Access</option>
                  <option value="general">General Access</option>
                  <option value="internal">Internal Access</option>
                </select>
              </div>

              {/* Temple Filter */}
              <div className="relative min-w-0">
                <select
                  value={t2TempleFilter}
                  onChange={e => setT2TempleFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-devo-500 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Temples ({uniqueT2Temples.length})</option>
                  {uniqueT2Temples.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Sort Dropdown (Left) & Date Range Presets / Pickers (Right) */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-2.5 border-t border-slate-200/60 text-xs">
              {/* Sort Dropdown (Left) */}
              <div className="relative min-w-0 w-full md:w-56 shrink-0">
                <select
                  value={t2SortBy}
                  onChange={e => setT2SortBy(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-devo-500 cursor-pointer shadow-2xs"
                >
                  <option value="date_desc">Date: Newest First</option>
                  <option value="date_asc">Date: Oldest First</option>
                  <option value="amount_desc">Amount: High to Low</option>
                  <option value="name_asc">Devotee: A to Z</option>
                </select>
              </div>

              {/* Date Presets & Pickers (Right) */}
              <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end w-full md:w-auto">
                <div className="flex items-center gap-1 flex-wrap overflow-x-auto no-scrollbar py-0.5 max-w-full">
                  <span className="font-bold text-slate-500 text-[10px] uppercase shrink-0">Range:</span>
                  {(["all", "today", "this_month", "last_month"] as const).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyPreset(preset, setT2DatePreset, setT2StartDate, setT2EndDate)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${
                        t2DatePreset === preset ? "bg-devo-600 text-white shadow-2xs" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {preset === "all" ? "All Time" : preset === "today" ? "Today" : preset === "this_month" ? "This Month" : "Last Month"}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                  <div className="flex items-center gap-1 flex-1 sm:flex-initial min-w-0">
                    <span className="text-[10px] font-semibold text-slate-500 shrink-0">From:</span>
                    <input
                      type="date"
                      value={t2StartDate}
                      onChange={e => {
                        setT2StartDate(e.target.value);
                        setT2DatePreset("custom");
                      }}
                      className="w-full px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 outline-none focus:border-devo-500 shadow-2xs min-w-0"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-1 sm:flex-initial min-w-0">
                    <span className="text-[10px] font-semibold text-slate-500 shrink-0">To:</span>
                    <input
                      type="date"
                      value={t2EndDate}
                      onChange={e => {
                        setT2EndDate(e.target.value);
                        setT2DatePreset("custom");
                      }}
                      className="w-full px-1.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 outline-none focus:border-devo-500 shadow-2xs min-w-0"
                    />
                  </div>
                  {hasT2ActiveFilters && (
                    <button
                      onClick={clearT2Filters}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] rounded-md flex items-center justify-center gap-1 border border-amber-200 transition-colors shrink-0"
                      title="Reset search and filters"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Card View for Master History Ledger */}
          <div className="block md:hidden space-y-2.5">
            {paginatedT2History.map((item, idx) => {
              const displayDate = item.date ? new Date(item.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
              const isEven = idx % 2 === 0;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3 shadow-2xs space-y-2 transition-colors ${
                    isEven
                      ? "bg-white border-l-4 border-l-teal-600 border-slate-200/90"
                      : "bg-slate-50/90 border-l-4 border-l-purple-500 border-slate-300/80"
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                    <span className="text-xs font-semibold text-slate-500">{displayDate}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-md text-[10px] border border-emerald-200/60">
                        <CheckCircle className="w-3 h-3" />
                        Issued / Saved
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmT2Item(item)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                        title="Delete Record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 text-sm truncate">{item.userName}</div>
                      <div className="text-[11px] text-slate-500 truncate">{item.userEmail}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {item.userTemple && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                            Temple: {item.userTemple}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          item.storeAccessLevel === 'internal' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {item.storeAccessLevel}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right space-y-1">
                      {item.type === 'approved_request' ? (
                        <>
                          <div>
                            <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${
                              item.source === 'Guest Entry' ? 'bg-purple-100 text-purple-800' :
                              item.source === 'Added by Manager' ? 'bg-indigo-100 text-indigo-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {item.source || 'Self Request'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-600 font-medium">
                            Approved by <strong className="text-slate-900 font-bold">{item.approvedBy || currentManagerName}</strong>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded text-[10px]">
                              Reimbursement
                            </span>
                          </div>
                          {item.approvedBy && (
                            <div className="text-[10px] text-slate-600 font-medium">
                              Logged by <strong className="text-slate-900 font-bold">{item.approvedBy}</strong>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-100/70 rounded-xl p-2.5 border border-slate-200/60 flex items-center justify-between gap-2 text-xs">
                    <div className="font-black text-slate-900 text-xs min-w-0 truncate">
                      {item.itemDetails}
                    </div>
                    <div className="shrink-0 text-right">
                      {item.quantity && (
                        <div className="text-[10px] font-mono font-semibold text-slate-500">Qty: {item.quantity}</div>
                      )}
                      <div className="text-xs font-mono font-bold text-slate-800">
                        ₹{(item.amount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredT2History.length === 0 && (
              <div className="p-8 text-center text-slate-400 font-medium bg-slate-50 rounded-xl border border-slate-200 text-xs">
                {hasT2ActiveFilters ? "No history entries match your active search/filter criteria." : "No history records found."}
              </div>
            )}
          </div>

          {/* Unified Master History Table (Desktop / Tablet View) */}
          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100/70 border-b border-slate-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Date</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Devotee / User</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Record Type / Origin</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase">Item / Details</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Qty / Cost</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedT2History.map(item => {
                  const displayDate = item.date ? new Date(item.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';

                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 text-xs font-semibold text-slate-600 whitespace-nowrap">
                        {displayDate}
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-slate-800 text-sm">{item.userName}</div>
                        <div className="text-xs text-slate-500">{item.userEmail}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {item.userTemple && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">
                              Temple: {item.userTemple}
                            </span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            item.storeAccessLevel === 'internal' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {item.storeAccessLevel}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 text-center whitespace-nowrap">
                        {item.type === 'approved_request' ? (
                          <div className="space-y-1 inline-block text-center">
                            <div>
                              <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                                item.source === 'Guest Entry' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                                item.source === 'Added by Manager' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                                'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}>
                                {item.source || 'Self Request'}
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-600 flex items-center justify-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>Approved by <strong className="text-slate-900 font-bold">{item.approvedBy || currentManagerName}</strong></span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1 inline-block text-center">
                            <span className="inline-block px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-full text-[10px] uppercase tracking-wider">
                              Reimbursement
                            </span>
                            {item.approvedBy && (
                              <div className="text-[11px] font-semibold text-slate-600">
                                Logged by <strong className="text-slate-900 font-bold">{item.approvedBy}</strong>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-xs">
                        <div className="font-bold text-slate-800 text-sm whitespace-pre-wrap">{item.itemDetails}</div>
                      </td>

                      <td className="p-4 text-right whitespace-nowrap">
                        {item.quantity && (
                          <div className="text-xs font-mono font-bold text-slate-600">Qty: {item.quantity}</div>
                        )}
                        <div className="text-sm font-mono font-bold text-slate-800">
                          ₹{(item.amount || 0).toFixed(2)}
                        </div>
                      </td>

                      <td className="p-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg text-[11px] border border-emerald-200/60">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Issued / Saved
                        </span>
                      </td>

                      <td className="p-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmT2Item(item)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                          title="Delete History Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredT2History.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-medium">
                      {hasT2ActiveFilters ? "No history entries match your active search/filter criteria." : "No history records found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tab 2 Pagination Controls */}
          <PaginationControls
            currentPage={t2Page}
            pageSize={t2PageSize}
            totalItems={filteredT2History.length}
            onPageChange={setT2Page}
            onPageSizeChange={setT2PageSize}
            pageSizeOptions={[20, 50, 100]}
          />
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: ADD REQUEST FOR REGISTERED APP USER (MULTI-ITEM)          */}
      {/* =================================================================== */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl sm:max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-6 sm:py-4 shrink-0 bg-white">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2 font-outfit">
                <User className="w-5 h-5 text-devo-600" />
                Add Request on Behalf of Devotee
              </h2>
              <button onClick={() => setIsAddUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddUserRequestSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
                {/* Devotee Combobox */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Select Registered Devotee
                  </label>
                  {selectedUserObj ? (
                    <div className="bg-devo-50 border border-devo-200 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div className="truncate">
                        <div className="font-bold text-slate-800 text-xs truncate">{selectedUserObj.full_name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{selectedUserObj.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAddUserSelectedUserId("");
                          setIsAddUserDropdownOpen(true);
                        }}
                        className="px-3 py-1 bg-white text-slate-700 hover:text-devo-700 rounded-lg text-xs font-bold border border-slate-200 shrink-0"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="relative" ref={addUserDropdownRef}>
                      <input
                        type="text"
                        placeholder="Search devotee by name, email, temple..."
                        value={addUserSearchQuery}
                        onFocus={() => setIsAddUserDropdownOpen(true)}
                        onChange={e => {
                          setAddUserSearchQuery(e.target.value);
                          setIsAddUserDropdownOpen(true);
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-devo-500"
                      />

                      {isAddUserDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-50 custom-scrollbar">
                          {sortedUsersList.map(u => (
                            <div
                              key={u.id}
                              onClick={() => {
                                setAddUserSelectedUserId(u.id);
                                setIsAddUserDropdownOpen(false);
                              }}
                              className="p-2 hover:bg-devo-50 rounded-lg cursor-pointer text-xs select-none"
                            >
                              <div className="font-bold text-slate-800">{u.full_name || "N/A"}</div>
                              <div className="text-[10px] text-slate-500">{u.email}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Request Date Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-devo-600" />
                    Select Request Date
                  </label>
                  <input
                    type="date"
                    value={addUserRequestDate}
                    onChange={e => setAddUserRequestDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-devo-500 focus:bg-white transition-all cursor-pointer"
                  />
                </div>

                {/* Multi-Item Search & Select Dropdown */}
                <div className="relative" ref={userItemDropdownRef}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">
                      Select Items (Searchable & Multi-Select)
                    </label>
                    {userSelectedItems.length > 0 && (
                      <span className="text-[11px] font-bold text-devo-700 bg-devo-50 px-2.5 py-0.5 rounded-full border border-devo-200">
                        {userSelectedItems.length} item{userSelectedItems.length > 1 ? 's' : ''} selected
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search store items by name, code (#001), category..."
                      value={userItemSearchQuery}
                      onFocus={() => setIsUserItemDropdownOpen(true)}
                      onChange={e => {
                        setUserItemSearchQuery(e.target.value);
                        setIsUserItemDropdownOpen(true);
                      }}
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-devo-500 focus:bg-white shadow-2xs transition-all"
                    />
                    {userItemSearchQuery && (
                      <button 
                        type="button"
                        onClick={() => setUserItemSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filtered Store Items Options */}
                  {isUserItemDropdownOpen && (
                    <div className="mt-2 max-h-[350px] overflow-y-auto bg-white border border-slate-200/90 rounded-xl shadow-md p-3 z-20 custom-scrollbar space-y-2">
                      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-slate-500 border-b border-slate-100 pb-1.5 mb-1">
                        <span>{filteredCatalogItems(userItemSearchQuery).length} items available</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => selectAllUserItemsFiltered(userItemSearchQuery)}
                            className="text-devo-600 hover:underline font-bold text-[10px]"
                          >
                            Select All Match
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setIsUserItemDropdownOpen(false)}
                            className="text-slate-500 hover:text-slate-800 font-bold text-[10px]"
                          >
                            Done
                          </button>
                        </div>
                      </div>

                      {filteredCatalogItems(userItemSearchQuery).length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 font-medium">
                          No store items found matching "{userItemSearchQuery}"
                        </div>
                      ) : (
                        filteredCatalogItems(userItemSearchQuery).map(item => {
                          const itemVariants = parseItemVariants(item.variants, item.cost || 0).filter(v => v.is_available !== false);

                          if (itemVariants.length > 0) {
                            const isExpanded = expandedUserItemIds.includes(item.id) || Boolean(userItemSearchQuery.trim());
                            return (
                              <div key={item.id} className="border border-slate-200/90 rounded-xl bg-white overflow-hidden shadow-2xs space-y-0">
                                {/* Main Item Header Row (Clicking toggles variant dropdown container) */}
                                <div
                                  onClick={() => toggleUserItemExpand(item.id)}
                                  className="p-2.5 bg-slate-50/90 hover:bg-slate-100 cursor-pointer transition-colors flex items-center justify-between gap-2.5 text-xs select-none border-b border-slate-100"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                                        <span className="truncate">{item.item_name}</span>
                                        {item.item_code && (
                                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono shrink-0">
                                            #{item.item_code}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-500 font-mono">From ₹{item.cost || 0}</div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {/* Direct Dropdown Selection on Main Item Row */}
                                    <select
                                      onClick={e => e.stopPropagation()}
                                      onChange={e => {
                                        e.stopPropagation();
                                        if (e.target.value) {
                                          const matched = itemVariants.find(v => v.label === e.target.value);
                                          toggleUserItemVariantSelection(item, e.target.value, matched?.cost);
                                          e.target.value = "";
                                        }
                                      }}
                                      className="px-2 py-1 bg-white border border-devo-300 rounded-lg text-xs font-bold text-devo-800 outline-none cursor-pointer focus:border-devo-500 shadow-2xs max-w-[145px]"
                                    >
                                      <option value="">-- Pick Variant --</option>
                                      {itemVariants.map(v => (
                                        <option key={v.label} value={v.label}>
                                          {v.label} (₹{v.cost})
                                        </option>
                                      ))}
                                    </select>

                                    <span className="text-[10px] font-bold text-devo-700 bg-devo-100 px-2 py-1 rounded-lg shrink-0 flex items-center gap-1">
                                      {itemVariants.length} Variants {isExpanded ? '▲' : '▼'}
                                    </span>
                                  </div>
                                </div>

                                {/* Expanded Dropdown Panel listing all variants */}
                                {isExpanded && (
                                  <div className="p-2 bg-slate-50/40 space-y-1">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase px-1 pb-0.5">Select Variant(s):</div>
                                    {itemVariants.map(v => {
                                      const variantKey = `${item.id}_${v.label}`;
                                      const isSelected = userSelectedItems.some(i => i.cart_key === variantKey);
                                      return (
                                        <div
                                          key={v.label}
                                          onClick={() => toggleUserItemVariantSelection(item, v.label, v.cost)}
                                          className={`p-2 rounded-lg cursor-pointer transition-all flex items-center justify-between gap-2 text-xs select-none ${
                                            isSelected ? "bg-devo-50 border border-devo-200 shadow-2xs font-semibold" : "bg-white hover:bg-slate-100 border border-slate-100"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0 pl-1">
                                            <div className="shrink-0 text-devo-600">
                                              {isSelected ? (
                                                <CheckSquare className="w-3.5 h-3.5 text-devo-600" />
                                              ) : (
                                                <Square className="w-3.5 h-3.5 text-slate-300" />
                                              )}
                                            </div>
                                            <span className="text-slate-800 font-medium truncate">{v.label}</span>
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-mono text-[11px] text-slate-600 font-bold">₹{v.cost}</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                              isSelected ? "bg-devo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-devo-100 hover:text-devo-800"
                                            }`}>
                                              {isSelected ? "Selected ✓" : "+ Select"}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          const defaultKey = `${item.id}_default`;
                          const isSelected = userSelectedItems.some(i => i.cart_key === defaultKey);
                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleUserItemVariantSelection(item)}
                              className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 text-xs select-none ${
                                isSelected ? "bg-devo-50 border border-devo-200/90 shadow-2xs" : "hover:bg-slate-50 border border-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div className="shrink-0 text-devo-600">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-devo-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                                    <span className="truncate">{item.item_name}</span>
                                    {item.item_code && (
                                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono shrink-0">
                                        #{item.item_code}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">₹{item.cost || 0}</div>
                                </div>
                              </div>
                              
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-colors ${
                                isSelected ? "bg-devo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-devo-100 hover:text-devo-800"
                              }`}>
                                {isSelected ? "Selected ✓" : "+ Select"}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Items Cart Box */}
                {userSelectedItems.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase">
                      <span className="flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5 text-devo-600" />
                        Selected Items ({userSelectedItems.length})
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setUserSelectedItems([])}
                        className="text-[10px] text-rose-600 hover:underline capitalize font-bold"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {userSelectedItems.map((item, idx) => (
                        <div key={item.cart_key || `${item.item_id}_${idx}`} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5 truncate">
                              <span className="truncate">{item.item_name}</span>
                              {item.item_code && (
                                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono shrink-0">
                                  #{item.item_code}
                                </span>
                              )}
                            </div>
                            {item.cost !== undefined && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                ₹{item.cost} × {item.quantity} = ₹{(item.cost * item.quantity).toFixed(2)}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Variant Picker if available */}
                            {item.available_variants && item.available_variants.length > 0 && (
                              <div className="flex items-center gap-1 bg-white border border-devo-200 rounded-lg px-2 py-1 shadow-2xs">
                                <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">Variant:</span>
                                <select
                                  value={item.selected_variant || ""}
                                  onChange={e => updateUserItemVariant(idx, e.target.value)}
                                  className="bg-transparent text-xs font-bold text-devo-800 outline-none cursor-pointer max-w-[140px] truncate"
                                >
                                  {item.available_variants.map(v => (
                                    <option key={v.label} value={v.label}>
                                      {v.label} {typeof v.cost === 'number' ? `(₹${v.cost})` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Quantity Counter */}
                            <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
                              <button
                                type="button"
                                onClick={() => updateUserItemQty(idx, item.quantity - 1)}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-100 text-xs font-bold"
                              >
                                -
                              </button>
                              <span className="px-2 py-1 text-xs font-mono font-bold text-slate-800 min-w-[24px] text-center">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateUserItemQty(idx, item.quantity + 1)}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-100 text-xs font-bold"
                              >
                                +
                              </button>
                            </div>

                            {/* Trash Icon */}
                            <button
                              type="button"
                              onClick={() => removeUserItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Remove Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-devo-50/60 border border-devo-100 rounded-xl p-2.5 flex items-center justify-between text-xs font-bold text-devo-900">
                      <span>Total Estimated Amount:</span>
                      <span className="font-mono text-sm text-devo-700">
                        ₹{userSelectedItems.reduce((acc, curr) => acc + (curr.cost || 0) * curr.quantity, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Fixed Footer Buttons */}
              <div className="flex items-center justify-end gap-2 p-3 sm:px-6 sm:py-4 bg-slate-50 border-t border-slate-200/80 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={isModalSubmitting || !addUserSelectedUserId || userSelectedItems.length === 0}
                  type="submit"
                  className="px-5 py-2 bg-devo-600 hover:bg-devo-700 text-white font-bold rounded-xl flex items-center gap-2 text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isModalSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Submit {userSelectedItems.length > 0 ? `(${userSelectedItems.length} Items)` : 'Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: ADD REQUEST FOR GUEST USER (MULTI-ITEM)                   */}
      {/* =================================================================== */}
      {isGuestModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl sm:max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-6 sm:py-4 shrink-0 bg-white">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2 font-outfit">
                <UserPlus className="w-5 h-5 text-purple-600" />
                Add Request for Guest Monk / Visiting Devotee
              </h2>
              <button onClick={() => setIsGuestModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuestRequestSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Guest Devotee / Monk Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HG Devamrita Das Swamiji"
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Temple / City</label>
                    <input
                      type="text"
                      placeholder="e.g. ISKCON Vrindavan"
                      value={guestTemple}
                      onChange={e => setGuestTemple(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Mobile / Contact (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 9876543210"
                      value={guestMobile}
                      onChange={e => setGuestMobile(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                      Select Request Date
                    </label>
                    <input
                      type="date"
                      value={guestRequestDate}
                      onChange={e => setGuestRequestDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-purple-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Multi-Item Search & Select Dropdown for Guest */}
                <div className="relative" ref={guestItemDropdownRef}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">
                      Select Items Needed (Searchable & Multi-Select)
                    </label>
                    {guestSelectedItems.length > 0 && (
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                        {guestSelectedItems.length} item{guestSelectedItems.length > 1 ? 's' : ''} selected
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search store items by name, code (#001), category..."
                      value={guestItemSearchQuery}
                      onFocus={() => setIsGuestItemDropdownOpen(true)}
                      onChange={e => {
                        setGuestItemSearchQuery(e.target.value);
                        setIsGuestItemDropdownOpen(true);
                      }}
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-purple-500 focus:bg-white shadow-2xs transition-all"
                    />
                    {guestItemSearchQuery && (
                      <button 
                        type="button"
                        onClick={() => setGuestItemSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filtered Store Items Options */}
                  {isGuestItemDropdownOpen && (
                    <div className="mt-2 max-h-[350px] overflow-y-auto bg-white border border-slate-200/90 rounded-xl shadow-md p-3 z-20 custom-scrollbar space-y-2">
                      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-slate-500 border-b border-slate-100 pb-1.5 mb-1">
                        <span>{filteredCatalogItems(guestItemSearchQuery).length} items available</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => selectAllGuestItemsFiltered(guestItemSearchQuery)}
                            className="text-purple-600 hover:underline font-bold text-[10px]"
                          >
                            Select All Match
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setIsGuestItemDropdownOpen(false)}
                            className="text-slate-500 hover:text-slate-800 font-bold text-[10px]"
                          >
                            Done
                          </button>
                        </div>
                      </div>

                      {filteredCatalogItems(guestItemSearchQuery).length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 font-medium">
                          No store items found matching "{guestItemSearchQuery}"
                        </div>
                      ) : (
                        filteredCatalogItems(guestItemSearchQuery).map(item => {
                          const itemVariants = parseItemVariants(item.variants, item.cost || 0).filter(v => v.is_available !== false);

                          if (itemVariants.length > 0) {
                            const isExpanded = expandedGuestItemIds.includes(item.id) || Boolean(guestItemSearchQuery.trim());
                            return (
                              <div key={item.id} className="border border-slate-200/90 rounded-xl bg-white overflow-hidden shadow-2xs space-y-0">
                                {/* Main Item Header Row */}
                                <div
                                  onClick={() => toggleGuestItemExpand(item.id)}
                                  className="p-2.5 bg-slate-50/90 hover:bg-slate-100 cursor-pointer transition-colors flex items-center justify-between gap-2.5 text-xs select-none border-b border-slate-100"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                                        <span className="truncate">{item.item_name}</span>
                                        {item.item_code && (
                                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono shrink-0">
                                            #{item.item_code}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-500 font-mono">From ₹{item.cost || 0}</div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <select
                                      onClick={e => e.stopPropagation()}
                                      onChange={e => {
                                        e.stopPropagation();
                                        if (e.target.value) {
                                          const matched = itemVariants.find(v => v.label === e.target.value);
                                          toggleGuestItemVariantSelection(item, e.target.value, matched?.cost);
                                          e.target.value = "";
                                        }
                                      }}
                                      className="px-2 py-1 bg-white border border-purple-300 rounded-lg text-xs font-bold text-purple-800 outline-none cursor-pointer focus:border-purple-500 shadow-2xs max-w-[145px]"
                                    >
                                      <option value="">-- Pick Variant --</option>
                                      {itemVariants.map(v => (
                                        <option key={v.label} value={v.label}>
                                          {v.label} (₹{v.cost})
                                        </option>
                                      ))}
                                    </select>

                                    <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-1 rounded-lg shrink-0 flex items-center gap-1">
                                      {itemVariants.length} Variants {isExpanded ? '▲' : '▼'}
                                    </span>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="p-2 bg-slate-50/40 space-y-1">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase px-1 pb-0.5">Select Variant(s):</div>
                                    {itemVariants.map(v => {
                                      const variantKey = `${item.id}_${v.label}`;
                                      const isSelected = guestSelectedItems.some(i => i.cart_key === variantKey);
                                      return (
                                        <div
                                          key={v.label}
                                          onClick={() => toggleGuestItemVariantSelection(item, v.label, v.cost)}
                                          className={`p-2 rounded-lg cursor-pointer transition-all flex items-center justify-between gap-2 text-xs select-none ${
                                            isSelected ? "bg-purple-50 border border-purple-200 shadow-2xs font-semibold" : "bg-white hover:bg-slate-100 border border-slate-100"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0 pl-1">
                                            <div className="shrink-0 text-purple-600">
                                              {isSelected ? (
                                                <CheckSquare className="w-3.5 h-3.5 text-purple-600" />
                                              ) : (
                                                <Square className="w-3.5 h-3.5 text-slate-300" />
                                              )}
                                            </div>
                                            <span className="text-slate-800 font-medium truncate">{v.label}</span>
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-mono text-[11px] text-slate-600 font-bold">₹{v.cost}</span>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                              isSelected ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-purple-100 hover:text-purple-800"
                                            }`}>
                                              {isSelected ? "Selected ✓" : "+ Select"}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          const defaultKey = `${item.id}_default`;
                          const isSelected = guestSelectedItems.some(i => i.cart_key === defaultKey);
                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleGuestItemVariantSelection(item)}
                              className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 text-xs select-none ${
                                isSelected ? "bg-purple-50 border border-purple-200/90 shadow-2xs" : "hover:bg-slate-50 border border-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div className="shrink-0 text-purple-600">
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-purple-600" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                                    <span className="truncate">{item.item_name}</span>
                                    {item.item_code && (
                                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono shrink-0">
                                        #{item.item_code}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">₹{item.cost || 0}</div>
                                </div>
                              </div>
                              
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-colors ${
                                isSelected ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-purple-100 hover:text-purple-800"
                              }`}>
                                {isSelected ? "Selected ✓" : "+ Select"}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Guest Items Cart Box */}
                {guestSelectedItems.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase">
                      <span className="flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
                        Selected Items ({guestSelectedItems.length})
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setGuestSelectedItems([])}
                        className="text-[10px] text-rose-600 hover:underline capitalize font-bold"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {guestSelectedItems.map((item, idx) => (
                        <div key={item.cart_key || `${item.item_id}_${idx}`} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5 truncate">
                              <span className="truncate">{item.item_name}</span>
                              {item.item_code && (
                                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono shrink-0">
                                  #{item.item_code}
                                </span>
                              )}
                            </div>
                            {item.cost !== undefined && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                ₹{item.cost} × {item.quantity} = ₹{(item.cost * item.quantity).toFixed(2)}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.available_variants && item.available_variants.length > 0 && (
                              <div className="flex items-center gap-1 bg-white border border-purple-200 rounded-lg px-2 py-1 shadow-2xs">
                                <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">Variant:</span>
                                <select
                                  value={item.selected_variant || ""}
                                  onChange={e => updateGuestItemVariant(idx, e.target.value)}
                                  className="bg-transparent text-xs font-bold text-purple-800 outline-none cursor-pointer max-w-[140px] truncate"
                                >
                                  {item.available_variants.map(v => (
                                    <option key={v.label} value={v.label}>
                                      {v.label} {typeof v.cost === 'number' ? `(₹${v.cost})` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
                              <button
                                type="button"
                                onClick={() => updateGuestItemQty(idx, item.quantity - 1)}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-100 text-xs font-bold"
                              >
                                -
                              </button>
                              <span className="px-2 py-1 text-xs font-mono font-bold text-slate-800 min-w-[24px] text-center">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateGuestItemQty(idx, item.quantity + 1)}
                                className="px-2 py-1 text-slate-500 hover:bg-slate-100 text-xs font-bold"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeGuestItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Remove Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-2.5 flex items-center justify-between text-xs font-bold text-purple-900">
                      <span>Total Estimated Amount:</span>
                      <span className="font-mono text-sm text-purple-700">
                        ₹{guestSelectedItems.reduce((acc, curr) => acc + (curr.cost || 0) * curr.quantity, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Fixed Footer Buttons */}
              <div className="flex items-center justify-end gap-2 p-3 sm:px-6 sm:py-4 bg-slate-50 border-t border-slate-200/80 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => setIsGuestModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={isModalSubmitting || !guestName.trim() || guestSelectedItems.length === 0}
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl flex items-center gap-2 text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isModalSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Submit Guest Request {guestSelectedItems.length > 0 ? `(${guestSelectedItems.length} Items)` : ''}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: EDIT PENDING REQUEST                                      */}
      {/* =================================================================== */}
      {isEditModalOpen && editingRequest && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-6 sm:py-4 shrink-0 bg-white">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 font-outfit">
                <Edit3 className="w-5 h-5 text-devo-600" />
                Edit Pending Request Details
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                  <div className="font-bold text-slate-800">{editingRequest.store_users?.full_name}</div>
                  <div className="text-slate-500">{editingRequest.store_users?.email}</div>
                  {editingRequest.store_users?.temple && <div className="text-slate-400 text-[10px] mt-0.5">Temple: {editingRequest.store_users.temple}</div>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Item</label>
                  <select
                    value={editItemId}
                    onChange={e => {
                      setEditItemId(e.target.value);
                      setEditVariant("");
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-devo-500"
                  >
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.item_name} {item.item_code ? `(#${item.item_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    const foundItem = items.find(i => i.id === editItemId);
                    if (!foundItem) return null;
                    const parsedEditVariants = parseItemVariants(foundItem.variants, foundItem.cost || 0);
                    if (parsedEditVariants.length > 0) {
                      return (
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Variant</label>
                          <select
                            value={editVariant}
                            onChange={e => setEditVariant(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-devo-500"
                          >
                            <option value="">-- Pick Variant --</option>
                            {parsedEditVariants.map(v => (
                              <option key={v.label} value={v.label}>
                                {v.label} {typeof v.cost === 'number' ? `(₹${v.cost})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={editQuantity}
                      onChange={e => setEditQuantity(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-devo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Fixed Footer Buttons */}
              <div className="flex items-center justify-end gap-2 p-3 sm:px-6 sm:py-4 bg-slate-50 border-t border-slate-200/80 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={isModalSubmitting}
                  type="submit"
                  className="px-5 py-2 bg-devo-600 hover:bg-devo-700 text-white font-bold rounded-xl flex items-center gap-2 text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isModalSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Master Audit History */}
      {deleteConfirmT2Item && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-slate-800 text-base font-outfit">Delete Audit Record?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Are you sure you want to delete the record for <strong className="text-slate-800">{deleteConfirmT2Item.userName}</strong> ({deleteConfirmT2Item.itemDetails}) from the Master Audit History?
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmT2Item(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingT2}
                onClick={handleDeleteT2Item}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingT2 ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
