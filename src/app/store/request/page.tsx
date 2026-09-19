"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  ShoppingCart,
  Send,
  Tag,
  Plus,
  Minus,
  Trash2,
  Search,
  User,
  UserCheck,
  UserPlus,
  X,
  Check,
  CheckCircle2,
  Package,
  ChevronDown,
  Sparkles,
  AlertCircle,
  Filter,
  ArrowRight,
  ArrowUpDown,
  LayoutList,
  LayoutGrid
} from "lucide-react";
import { useStoreAuth } from "@/components/StoreGuard";
import { parseItemVariants, getVariantCost, ItemVariant } from "@/lib/store-variant-utils";
import { PaginationControls } from "@/components/PaginationControls";

interface StoreItem {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  cost: number;
  variants: any[];
}

interface SelectedRequestItem {
  item_id: string;
  item_name: string;
  category: string;
  selected_variant: string;
  unit_cost: number;
  quantity: number;
}

interface RegisteredUser {
  id: string;
  full_name: string;
  email: string;
  temple: string;
  mobile: string;
}

export default function StoreRequest() {
  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const { storeUser, loading: authLoading } = useStoreAuth();

  // View mode switcher state: 'list' (default) or 'grid'
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Multi-item cart list state
  const [cartItems, setCartItems] = useState<SelectedRequestItem[]>([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Beneficiary selection state (for Store Admin / Manager)
  const [requestForMode, setRequestForMode] = useState<"self" | "registered" | "guest">("self");
  const [allRegisteredUsers, setAllRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [selectedTargetUserId, setSelectedTargetUserId] = useState<string>("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  // Guest details
  const [guestName, setGuestName] = useState("");
  const [guestTemple, setGuestTemple] = useState("");
  const [guestMobile, setGuestMobile] = useState("");

  // Catalog item search, category filter, and sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "General" | "Internal">("all");
  const [sortBy, setSortBy] = useState<"code_asc" | "name_asc" | "name_desc">("code_asc");

  // Pagination state (10, 20, 30)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selected variant state map per item card before adding to cart
  const [cardVariantMap, setCardVariantMap] = useState<Record<string, string>>({});

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const userDropdownRef = useRef<HTMLDivElement>(null);

  const canAccessAdminTools = !!(storeUser?.is_super_or_store_admin || storeUser?.is_store_admin || storeUser?.can_access_approvals || storeUser?.is_store_manager);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchItems(session.access_token);
        if (canAccessAdminTools) {
          fetchUsers(session.access_token);
        }
      }
    });
  }, [canAccessAdminTools]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchItems = async (token: string) => {
    const res = await fetch('/api/store/items', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setItems(data);
    }
  };

  const fetchUsers = async (token: string) => {
    const res = await fetch('/api/store/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setAllRegisteredUsers(data);
    }
  };

  // Filtered users for target user picker
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return allRegisteredUsers;
    const q = userSearchQuery.toLowerCase();
    return allRegisteredUsers.filter(u =>
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.temple || "").toLowerCase().includes(q) ||
      (u.mobile || "").toLowerCase().includes(q)
    );
  }, [allRegisteredUsers, userSearchQuery]);

  // Selected target user object
  const selectedTargetUserObj = useMemo(() => {
    return allRegisteredUsers.find(u => u.id === selectedTargetUserId);
  }, [allRegisteredUsers, selectedTargetUserId]);

  // Filtered catalog items
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(i => {
      if (i.category && i.category.trim()) cats.add(i.category.trim());
    });
    const catList = Array.from(cats);
    if (catList.length <= 1) return [];
    return ["all", ...catList];
  }, [items]);

  const filteredAndSortedItems = useMemo(() => {
    return items
      .filter(item => {
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = (item.item_name || "").toLowerCase().includes(q);
          const matchCode = (item.item_code || "").toLowerCase().includes(q);
          const matchCat = (item.category || "").toLowerCase().includes(q);
          return matchName || matchCode || matchCat;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "code_asc") return (a.item_code || "").localeCompare(b.item_code || "", undefined, { numeric: true });
        if (sortBy === "name_asc") return (a.item_name || "").localeCompare(b.item_name || "");
        if (sortBy === "name_desc") return (b.item_name || "").localeCompare(a.item_name || "");
        return 0;
      });
  }, [items, searchQuery, categoryFilter, sortBy]);

  // Reset page to 1 when search query, category filter, sort option or page size changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, sortBy, pageSize]);

  // Paginated catalog items
  const paginatedItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredAndSortedItems.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedItems, page, pageSize]);

  // Handle selecting variant for a specific card
  const setCardVariant = (itemId: string, variantLabel: string) => {
    setCardVariantMap(prev => ({ ...prev, [itemId]: variantLabel }));
  };

  // Add item to multi-item cart list
  const addItemToCart = (item: StoreItem, overrideVariantLabel?: string) => {
    const parsed = parseItemVariants(item.variants, item.cost);
    const chosenVariant = overrideVariantLabel ?? cardVariantMap[item.id] ?? (parsed.length > 0 ? (parsed.find(v => v.is_available !== false)?.label || parsed[0].label) : "");
    const unitCost = getVariantCost(chosenVariant, item.variants, item.cost);

    setCartItems(prev => {
      // Check if item with exact same variant is already in cart
      const existingIdx = prev.findIndex(ci => ci.item_id === item.id && ci.selected_variant === chosenVariant);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      }
      return [...prev, {
        item_id: item.id,
        item_name: item.item_name,
        category: item.category,
        selected_variant: chosenVariant,
        unit_cost: unitCost,
        quantity: 1
      }];
    });
    setSuccessMsg("");
    setErrorMsg("");
  };

  // Update item variant in cart
  const updateCartItemVariant = (index: number, newVariant: string) => {
    setCartItems(prev => {
      const copy = [...prev];
      const target = copy[index];
      const storeItem = items.find(i => i.id === target.item_id);
      if (storeItem) {
        target.selected_variant = newVariant;
        target.unit_cost = getVariantCost(newVariant, storeItem.variants, storeItem.cost);
      }
      return copy;
    });
  };

  // Update item quantity in cart
  const updateCartItemQuantity = (index: number, delta: number) => {
    setCartItems(prev => {
      const copy = [...prev];
      const newQty = copy[index].quantity + delta;
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      copy[index].quantity = newQty;
      return copy;
    });
  };

  // Direct set quantity
  const setCartItemQuantityDirect = (index: number, qty: number) => {
    if (isNaN(qty) || qty < 1) qty = 1;
    setCartItems(prev => {
      const copy = [...prev];
      copy[index].quantity = qty;
      return copy;
    });
  };

  // Remove item from cart
  const removeCartItem = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  // Calculate totals
  const totalCartQty = useMemo(() => cartItems.reduce((acc, ci) => acc + ci.quantity, 0), [cartItems]);
  const totalCartCost = useMemo(() => cartItems.reduce((acc, ci) => acc + (ci.unit_cost * ci.quantity), 0), [cartItems]);

  // Submit all requests
  const handleSubmitAll = async () => {
    if (!session || cartItems.length === 0) return;

    if (requestForMode === "registered" && !selectedTargetUserId) {
      setErrorMsg("Please select a registered devotee user.");
      return;
    }
    if (requestForMode === "guest" && !guestName.trim()) {
      setErrorMsg("Please enter the guest's name.");
      return;
    }

    setIsSubmitting(true);
    setSuccessMsg("");
    setErrorMsg("");

    const formatVariantPayload = (variantStr?: string | null) => {
      const vLabel = variantStr || "";
      let source = "Self Request";
      if (requestForMode === "guest") {
        source = "Guest Entry";
      } else if (requestForMode === "registered") {
        source = "Added by Manager";
      } else if (canAccessAdminTools) {
        source = "Added by Manager";
      }
      return JSON.stringify({
        variant: vLabel,
        source: source
      });
    };

    try {
      if (requestForMode === "guest") {
        // Guest mode: first item creates the guest user, rest reference the new guest user ID
        const first = cartItems[0];
        const resFirst = await fetch('/api/store/requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            is_guest: true,
            guest_name: guestName.trim(),
            guest_temple: guestTemple.trim() || "Guest Temple",
            guest_mobile: guestMobile.trim() || "N/A",
            item_id: first.item_id,
            quantity: first.quantity,
            selected_variant: formatVariantPayload(first.selected_variant)
          })
        });

        if (!resFirst.ok) {
          const err = await resFirst.json().catch(() => ({}));
          throw new Error(err.error || "Failed to submit request for guest");
        }

        const firstData = await resFirst.json();
        const createdGuestId = firstData.user_id;

        if (cartItems.length > 1 && createdGuestId) {
          const remaining = cartItems.slice(1);
          const remResults = await Promise.all(
            remaining.map(item =>
              fetch('/api/store/requests', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                  target_user_id: createdGuestId,
                  item_id: item.item_id,
                  quantity: item.quantity,
                  selected_variant: formatVariantPayload(item.selected_variant)
                })
              })
            )
          );

          const failed = remResults.filter(r => !r.ok);
          if (failed.length > 0) {
            throw new Error(`${failed.length} item(s) failed to submit.`);
          }
        }
      } else {
        // Self mode or Registered User mode
        const targetUserId = requestForMode === "registered" ? selectedTargetUserId : undefined;

        const results = await Promise.all(
          cartItems.map(item =>
            fetch('/api/store/requests', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({
                target_user_id: targetUserId,
                item_id: item.item_id,
                quantity: item.quantity,
                selected_variant: formatVariantPayload(item.selected_variant)
              })
            })
          )
        );

        const failed = results.filter(r => !r.ok);
        if (failed.length > 0) {
          const errTexts = await Promise.all(failed.map(async r => (await r.json().catch(() => ({}))).error || "Failed"));
          throw new Error(`Failed to submit ${failed.length} item(s): ` + errTexts.join(", "));
        }
      }

      setSuccessMsg(`Successfully submitted ${cartItems.length} item request(s)!`);
      setCartItems([]);
      setGuestName("");
      setGuestTemple("");
      setGuestMobile("");
      setSelectedTargetUserId("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit requests.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="p-10 text-center">
        <Loader2 className="animate-spin mx-auto text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black font-outfit text-slate-800 flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 sm:w-7 sm:h-7 text-amber-600" />
            Request Store Items
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Browse catalog, select item varieties & quantities, and submit multi-item requests.
          </p>
        </div>

        {cartItems.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>{cartItems.length} Items Selected ({totalCartQty} total qty)</span>
          </div>
        )}
      </div>

      {/* Admin Beneficiary Selector (For Store Admins / Managers) */}
      {canAccessAdminTools && (
        <div className="bg-gradient-to-r from-amber-500/10 via-slate-50 to-amber-500/5 p-4 rounded-2xl border border-amber-200/70 space-y-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-amber-700 font-bold" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Requesting For:</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setRequestForMode("self")}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                requestForMode === "self"
                  ? "bg-amber-600 border-amber-600 text-white shadow-2xs"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Myself</span>
            </button>

            <button
              type="button"
              onClick={() => setRequestForMode("registered")}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                requestForMode === "registered"
                  ? "bg-amber-600 border-amber-600 text-white shadow-2xs"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Devotee</span>
            </button>

            <button
              type="button"
              onClick={() => setRequestForMode("guest")}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                requestForMode === "guest"
                  ? "bg-amber-600 border-amber-600 text-white shadow-2xs"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Guest</span>
            </button>
          </div>

          {/* Registered User Search Picker */}
          {requestForMode === "registered" && (
            <div className="relative pt-1" ref={userDropdownRef}>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Select Registered Devotee</label>
              {selectedTargetUserObj ? (
                <div className="bg-white border border-amber-300 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="truncate">
                    <div className="font-bold text-slate-800 text-xs truncate">{selectedTargetUserObj.full_name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{selectedTargetUserObj.email} • 🏛️ {selectedTargetUserObj.temple || "N/A"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTargetUserId("");
                      setIsUserDropdownOpen(true);
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 shrink-0"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search devotee by name, email, temple..."
                    value={userSearchQuery}
                    onFocus={() => setIsUserDropdownOpen(true)}
                    onChange={e => {
                      setUserSearchQuery(e.target.value);
                      setIsUserDropdownOpen(true);
                    }}
                    className="w-full pl-8 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-amber-500 shadow-2xs"
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUserSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isUserDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-1 space-y-1 custom-scrollbar">
                      {filteredUsers.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">No users found</div>
                      ) : (
                        filteredUsers.map(u => (
                          <div
                            key={u.id}
                            onClick={() => {
                              setSelectedTargetUserId(u.id);
                              setIsUserDropdownOpen(false);
                            }}
                            className="p-2 rounded-lg hover:bg-amber-50 cursor-pointer text-xs transition-colors"
                          >
                            <div className="font-bold text-slate-800">{u.full_name}</div>
                            <div className="text-[10px] text-slate-500">{u.email} • 🏛️ {u.temple || "N/A"}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Guest User Fields */}
          {requestForMode === "guest" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Guest Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HG Radheshyam Das"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Guest Temple</label>
                <input
                  type="text"
                  placeholder="e.g. ISKCON Chowpatty"
                  value={guestTemple}
                  onChange={e => setGuestTemple(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Mobile No.</label>
                <input
                  type="text"
                  placeholder="e.g. 9822000000"
                  value={guestMobile}
                  onChange={e => setGuestMobile(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-800 font-bold rounded-2xl border border-emerald-200 flex items-center justify-between text-xs sm:text-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg("")} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 text-rose-800 font-bold rounded-2xl border border-rose-200 flex items-center justify-between text-xs sm:text-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg("")} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Multi-Item Basket (Top/Side) & Catalog Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (8 cols): Catalog Browser & Variety Picker */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2 font-outfit">
                  <Package className="w-4 h-4 text-amber-600" />
                  Store Item Catalog ({filteredAndSortedItems.length})
                </h2>

                {/* View Mode Switcher (List Default vs Grid) */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                      viewMode === "list"
                        ? "bg-white text-amber-700 shadow-2xs font-black"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="List View (Compact)"
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                      viewMode === "grid"
                        ? "bg-white text-amber-700 shadow-2xs font-black"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="Grid View (Cards)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                </div>
              </div>

              {/* Category Filter Pills & Sort Option */}
              <div className="flex flex-wrap items-center gap-2">
                {availableCategories.length > 0 && (
                  <div className="flex items-center gap-1">
                    {availableCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat as any)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                          categoryFilter === cat
                            ? "bg-amber-600 text-white shadow-2xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {cat === "all" ? "All Items" : cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Sort Dropdown */}
                <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 shadow-2xs">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="bg-transparent outline-none cursor-pointer font-bold text-slate-800 text-[11px] sm:text-xs truncate"
                  >
                    <option value="code_asc">Sort: Code</option>
                    <option value="name_asc">Sort: Name (A-Z)</option>
                    <option value="name_desc">Sort: Name (Z-A)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Catalog Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search catalog by item name, code, or variety..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-amber-500 focus:bg-white transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Catalog Items: List View (Default) vs Grid View */}
          {viewMode === "list" ? (
            /* COMPACT LIST VIEW (DEFAULT - STRICT SINGLE LINE ON MOBILE) */
            <div className="space-y-1.5">
              {paginatedItems.map(item => {
                const parsedVariants: ItemVariant[] = parseItemVariants(item.variants, item.cost);
                const selectedVarLabel = cardVariantMap[item.id] || (parsedVariants.length > 0 ? (parsedVariants.find(v => v.is_available !== false)?.label || parsedVariants[0].label) : "");
                const currentUnitPrice = getVariantCost(selectedVarLabel, item.variants, item.cost);
                const showPrices = !!storeUser?.is_super_or_store_admin;

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-slate-200/90 px-2.5 py-2 shadow-2xs flex items-center justify-between gap-1.5 sm:gap-2 hover:border-amber-400/80 transition-all group min-w-0"
                  >
                    {/* Left: Item Name */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm group-hover:text-amber-700 transition-colors truncate">
                          {item.item_name}
                        </span>
                        {showPrices && (
                          <span className={`hidden sm:inline-block text-[8px] sm:text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 uppercase tracking-wider ${
                            item.category === 'Internal' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {item.category}
                          </span>
                        )}
                      </div>
                      {showPrices && (
                        <div className="text-[10px] text-slate-400 font-mono hidden sm:block">CODE: {item.item_code || "N/A"}</div>
                      )}
                    </div>

                    {/* Middle: Variety Selector */}
                    {parsedVariants.length > 0 ? (
                      <div className="w-28 sm:w-44 shrink-0">
                        <select
                          value={selectedVarLabel}
                          onChange={e => setCardVariant(item.id, e.target.value)}
                          className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer text-slate-800 truncate"
                        >
                          {parsedVariants.map((v, idx) => {
                            const avail = v.is_available !== false;
                            return (
                              <option key={idx} value={v.label} disabled={!avail}>
                                {v.label} {showPrices ? `— ₹${v.cost}` : ''} {avail ? '' : '(Out of Stock)'}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 font-medium shrink-0 hidden sm:block">
                        Standard
                      </div>
                    )}

                    {/* Right: Price & Add Button */}
                    <div className="flex items-center gap-2 shrink-0">
                      {showPrices && (
                        <span className="text-xs font-black text-slate-900 font-mono shrink-0 hidden sm:inline">
                          ₹{currentUnitPrice}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => addItemToCart(item, selectedVarLabel)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-2xs transition-all active:scale-95 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredAndSortedItems.length === 0 && (
                <div className="bg-white p-8 text-center text-slate-400 font-medium rounded-2xl border border-slate-200 text-xs">
                  No store items found matching "{searchQuery}"
                </div>
              )}
            </div>
          ) : (
            /* GRID VIEW (CARDS ON DESKTOP, STRICT SINGLE LINE ON MOBILE) */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {paginatedItems.map(item => {
                const parsedVariants: ItemVariant[] = parseItemVariants(item.variants, item.cost);
                const selectedVarLabel = cardVariantMap[item.id] || (parsedVariants.length > 0 ? (parsedVariants.find(v => v.is_available !== false)?.label || parsedVariants[0].label) : "");
                const currentUnitPrice = getVariantCost(selectedVarLabel, item.variants, item.cost);
                const showPrices = !!storeUser?.is_super_or_store_admin;

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 p-2.5 sm:p-3.5 shadow-2xs flex flex-row sm:flex-col justify-between items-center sm:items-stretch gap-2 space-y-0 sm:space-y-3 hover:border-amber-400/80 transition-all group min-w-0"
                  >
                    {/* Mobile Left / Desktop Top Header */}
                    <div className="min-w-0 flex-1 sm:flex-initial">
                      <div className="flex items-center sm:items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold sm:font-black text-slate-900 text-xs sm:text-sm group-hover:text-amber-700 transition-colors truncate">
                            {item.item_name}
                          </div>
                          {showPrices && (
                            <div className="text-[10px] text-slate-400 font-mono hidden sm:block">CODE: {item.item_code || "N/A"}</div>
                          )}
                        </div>
                        {showPrices && (
                          <span className={`hidden sm:inline-block text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${
                            item.category === 'Internal' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {item.category}
                          </span>
                        )}
                      </div>

                      {/* Desktop Variety Label & Selector */}
                      {parsedVariants.length > 0 ? (
                        <div className="hidden sm:block mt-2.5 space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Select Variety / Size:</label>
                          <select
                            value={selectedVarLabel}
                            onChange={e => setCardVariant(item.id, e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500 cursor-pointer text-slate-800"
                          >
                            {parsedVariants.map((v, idx) => {
                              const avail = v.is_available !== false;
                              return (
                                <option key={idx} value={v.label} disabled={!avail}>
                                  {v.label} {showPrices ? `— ₹${v.cost}` : ''} {avail ? '' : '(Out of Stock)'}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      ) : (
                        <div className="hidden sm:block mt-2 text-[11px] text-slate-500 font-medium">
                          Standard Variety
                        </div>
                      )}
                    </div>

                    {/* Mobile Middle: Variety Selector Dropdown */}
                    {parsedVariants.length > 0 && (
                      <div className="sm:hidden w-28 shrink-0">
                        <select
                          value={selectedVarLabel}
                          onChange={e => setCardVariant(item.id, e.target.value)}
                          className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-amber-500 cursor-pointer text-slate-800 truncate"
                        >
                          {parsedVariants.map((v, idx) => {
                            const avail = v.is_available !== false;
                            return (
                              <option key={idx} value={v.label} disabled={!avail}>
                                {v.label} {showPrices ? `— ₹${v.cost}` : ''} {avail ? '' : '(Out of Stock)'}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    {/* Mobile Right / Desktop Bottom Footer */}
                    <div className="sm:pt-2 sm:border-t sm:border-slate-100 flex items-center justify-end sm:justify-between gap-2 shrink-0">
                      {showPrices ? (
                        <div className="hidden sm:block">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Price</span>
                          <span className="text-sm font-black text-slate-900 font-mono">₹{currentUnitPrice}</span>
                        </div>
                      ) : (
                        <div className="hidden sm:block text-[11px] text-slate-500 font-bold truncate">
                          {selectedVarLabel || "Standard Item"}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => addItemToCart(item, selectedVarLabel)}
                        className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg sm:rounded-xl text-xs flex items-center gap-1 sm:gap-1.5 shadow-2xs transition-all active:scale-95 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span className="hidden sm:inline">Add to Request</span>
                        <span className="sm:hidden">Add</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredAndSortedItems.length === 0 && (
                <div className="col-span-full bg-white p-8 text-center text-slate-400 font-medium rounded-2xl border border-slate-200 text-xs">
                  No store items found matching "{searchQuery}"
                </div>
              )}
            </div>
          )}

          {/* Pagination Controls */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <PaginationControls
              currentPage={page}
              pageSize={pageSize}
              totalItems={filteredAndSortedItems.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 20, 30]}
            />
          </div>
        </div>

        {/* Right Column (5 cols): Multi-Item Request Basket / Cart (Desktop Only) */}
        <div className="hidden lg:block lg:col-span-5 space-y-4 sticky top-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-4 space-y-4">
            
            {/* Basket Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 font-outfit">
                <ShoppingCart className="w-5 h-5 text-amber-600" />
                Selected Request List
              </h2>
              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCartItems([])}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear All
                </button>
              )}
            </div>

            {/* Selected Items List */}
            {cartItems.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-xs font-bold text-slate-600">Your Request List is Empty</div>
                <div className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Click "Add to Request" on any catalog item to build your multi-item request.
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                {cartItems.map((ci, idx) => {
                  const storeItem = items.find(i => i.id === ci.item_id);
                  const parsedVariants: ItemVariant[] = storeItem ? parseItemVariants(storeItem.variants, storeItem.cost) : [];
                  const showPrices = !!storeUser?.is_super_or_store_admin;

                  return (
                    <div
                      key={idx}
                      className="bg-slate-50/90 rounded-xl p-3 border border-slate-200/80 space-y-2 relative group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 pr-6">
                          <div className="font-bold text-slate-800 text-xs truncate">{ci.item_name}</div>
                          {showPrices ? (
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-mono">
                              ₹{ci.unit_cost} / unit
                            </span>
                          ) : (
                            ci.selected_variant ? (
                              <span className="text-[9px] font-bold bg-slate-200/80 text-slate-700 px-1.5 py-0.2 rounded">
                                {ci.selected_variant}
                              </span>
                            ) : null
                          )}
                        </div>

                        {/* Remove item button */}
                        <button
                          type="button"
                          onClick={() => removeCartItem(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors absolute right-2 top-2"
                          title="Remove item"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Variety Change Dropdown inside cart */}
                      {parsedVariants.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 shrink-0">Variety:</span>
                          <select
                            value={ci.selected_variant}
                            onChange={e => updateCartItemVariant(idx, e.target.value)}
                            className="bg-white px-2 py-1 border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-amber-500 w-full truncate text-slate-700"
                          >
                            {parsedVariants.map((v, vIdx) => (
                              <option key={vIdx} value={v.label} disabled={v.is_available === false}>
                                {v.label} {showPrices ? `(₹${v.cost})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Quantity Selector & Item Subtotal */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs">
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => updateCartItemQuantity(idx, -1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold active:scale-95"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={ci.quantity}
                            onChange={e => setCartItemQuantityDirect(idx, parseInt(e.target.value))}
                            className="w-8 text-center text-xs font-bold outline-none bg-transparent"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartItemQuantity(idx, 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold active:scale-95"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {showPrices ? (
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-medium">Subtotal</span>
                            <span className="font-black text-amber-900 font-mono text-xs">
                              ₹{(ci.unit_cost * ci.quantity).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-slate-400">
                            Qty: {ci.quantity}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Total Summary & Submit Action */}
            {cartItems.length > 0 && (
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200/70 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                    <span>Total Request Items:</span>
                    <span className="font-bold text-slate-800">{cartItems.length} items ({totalCartQty} total qty)</span>
                  </div>
                  {storeUser?.is_super_or_store_admin && (
                    <div className="flex items-center justify-between text-sm font-black text-amber-900">
                      <span>Total Estimated Cost:</span>
                      <span className="text-base font-mono">₹{totalCartCost.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmitAll}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Submitting Requests...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Submit {cartItems.length} Item Request(s)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Floating Mobile Bottom Action Bar (Positioned above fixed mobile tab bar z-[1000]) */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-20 left-3 right-3 z-[1001] bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-slate-700/60 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2.5 min-w-0 pl-1">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center font-mono shrink-0 shadow-xs">
              {cartItems.length}
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-white truncate">
                {cartItems.length} {cartItems.length === 1 ? "Item" : "Items"} ({totalCartQty} total qty)
              </div>
              {storeUser?.is_super_or_store_admin ? (
                <div className="text-[10px] text-amber-300 font-mono font-bold">Est. Total: ₹{totalCartCost.toFixed(2)}</div>
              ) : (
                <div className="text-[10px] text-slate-300">Tap to view & submit</div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileCartOpen(true)}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 transition-all shrink-0"
          >
            <span>View & Submit</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Mobile Slide-Up Drawer / Popup Modal (z-[1002] above mobile navbar) */}
      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[1002] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 max-w-lg w-full p-4 sm:p-5 space-y-4 max-h-[85vh] flex flex-col justify-between shadow-2xl animate-in slide-in-from-bottom duration-250">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-base font-outfit">Selected Request List ({cartItems.length})</h3>
              </div>

              <div className="flex items-center gap-2">
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCartItems([])}
                    className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMobileCartOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Items List */}
            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1 custom-scrollbar">
              {cartItems.map((ci, idx) => {
                const storeItem = items.find(i => i.id === ci.item_id);
                const parsedVariants: ItemVariant[] = storeItem ? parseItemVariants(storeItem.variants, storeItem.cost) : [];
                const showPrices = !!storeUser?.is_super_or_store_admin;

                return (
                  <div key={idx} className="bg-slate-50/90 rounded-xl p-3 border border-slate-200/80 space-y-2 relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 pr-6">
                        <div className="font-bold text-slate-800 text-xs truncate">{ci.item_name}</div>
                        {showPrices ? (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-mono">
                            ₹{ci.unit_cost} / unit
                          </span>
                        ) : (
                          ci.selected_variant ? (
                            <span className="text-[9px] font-bold bg-slate-200/80 text-slate-700 px-1.5 py-0.2 rounded">
                              {ci.selected_variant}
                            </span>
                          ) : null
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeCartItem(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-lg absolute right-2 top-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {parsedVariants.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 shrink-0">Variety:</span>
                        <select
                          value={ci.selected_variant}
                          onChange={e => updateCartItemVariant(idx, e.target.value)}
                          className="bg-white px-2 py-1 border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-amber-500 w-full truncate text-slate-700"
                        >
                          {parsedVariants.map((v, vIdx) => (
                            <option key={vIdx} value={v.label} disabled={v.is_available === false}>
                              {v.label} {showPrices ? `(₹${v.cost})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs">
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(idx, -1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-600 font-bold active:scale-95"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={ci.quantity}
                          onChange={e => setCartItemQuantityDirect(idx, parseInt(e.target.value))}
                          className="w-8 text-center text-xs font-bold outline-none bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(idx, 1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-600 font-bold active:scale-95"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {showPrices ? (
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-medium">Subtotal</span>
                          <span className="font-black text-amber-900 font-mono text-xs">
                            ₹{(ci.unit_cost * ci.quantity).toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold text-slate-400">
                          Qty: {ci.quantity}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer Submit */}
            <div className="pt-3 border-t border-slate-200 space-y-3 shrink-0">
              <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-200/70 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                  <span>Total Request Items:</span>
                  <span className="font-bold text-slate-800">{cartItems.length} items ({totalCartQty} total qty)</span>
                </div>
                {storeUser?.is_super_or_store_admin && (
                  <div className="flex items-center justify-between text-sm font-black text-amber-900">
                    <span>Total Estimated Cost:</span>
                    <span className="text-base font-mono">₹{totalCartCost.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  await handleSubmitAll();
                  setIsMobileCartOpen(false);
                }}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Submitting Requests...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Submit {cartItems.length} Item Request(s)</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
