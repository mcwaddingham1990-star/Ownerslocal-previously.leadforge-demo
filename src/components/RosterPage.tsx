import React, { useState, useMemo, useEffect } from "react";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAuth } from "../context/AuthContext";
import { MODULE_CATALOG } from "./RolePermissionEditorModal";
import { defaultGranularFromModuleList, GranularPermissions, getPermissionFlags, PermissionAction } from "../types/permissions";
import { Search, UserPlus, Edit3, X, Copy, Shield, Phone, Mail, MapPin } from "lucide-react";
import type { EmployeeRecord } from "../types/domain";
import { composeEmail, composeSms, callNumber } from "../lib/deviceHandoff";
import { isManagerRole } from "../lib/notificationsService";
import { GpsPrivacyNotice } from "./GpsPrivacyNotice";
import { RecentRoutesSection } from "./RecentRoutesSection";
import { CreateWorkOrderPicker } from "./CreateWorkOrderPicker";
import { BulkImportModal } from "./BulkImportModal";
import { normalizeEmailForMatch, type ImportFieldSpec, type DuplicateCheckResult } from "../lib/spreadsheetImport";

type EmployeeImportKey = "name" | "email" | "phone" | "role";
const EMPLOYEE_IMPORT_FIELDS: ImportFieldSpec<EmployeeImportKey>[] = [
  { key: "name", label: "Name", aliases: ["name", "employee name", "full name", "first name"], required: true },
  { key: "email", label: "Email", aliases: ["email", "email address", "e-mail"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "cell", "mobile"] },
  { key: "role", label: "Role", aliases: ["role", "position", "title", "job title"] }
];

function genInviteCode(role: string): string {
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const cleanRolePrefix = role.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "STAFF";
  return `${cleanRolePrefix}-${randomStr}`;
}

type InviteRole = { id: string; name: string; permissions: string[]; modulePermissions: GranularPermissions; isCustom?: boolean };
type InviteMode = "" | "select" | "custom";

export const ONBOARDING_ROLE_TEMPLATES: Array<[string, string, string[]]> = [
  ["owner", "Owner", MODULE_CATALOG.map(m => m.id)],
  ["general_manager", "General Manager", ["customers","leads","estimates","jobs","scheduling","dispatch","routes","employee_locations","inventory","documents","messages","timeclock","ai_assistant","settings"]],
  ["office_manager", "Office Manager", ["dashboard","revenue","accounting","customers","leads","estimates","invoices","scheduling","dispatch","routes","employee_locations","jobs","timeclock","inventory","documents","pdf_editor","esign","messages","roster","training","reports","settings"]],
  ["operations_manager", "Operations Manager", ["scheduling","dispatch","routes","employee_locations","jobs","inventory","documents","messages"]],
  ["dispatcher", "Dispatcher", ["dispatch","routes","employee_locations","scheduling","jobs","customers"]],
  ["scheduler", "Scheduler", ["scheduling","customers","jobs","messages"]],
  ["sales_manager", "Sales Manager", ["customers","leads","estimates","messages","ai_assistant"]],
  ["sales_representative", "Sales Representative", ["customers","leads","estimates","messages","ai_assistant"]],
  ["estimator", "Estimator", ["customers","leads","estimates","documents","pdf_editor","esign"]],
  ["project_manager", "Project Manager", ["customers","scheduling","dispatch","routes","employee_locations","jobs","inventory","documents","messages"]],
  ["field_supervisor", "Field Supervisor", ["jobs","scheduling","dispatch","routes","employee_locations","inventory","documents","messages"]],
  ["technician", "Technician", ["jobs","timeclock","messages","documents"]],
  ["apprentice", "Apprentice", ["jobs","timeclock","messages"]],
  ["installer", "Installer", ["jobs","timeclock","inventory","documents","messages"]],
  ["driver", "Driver", ["routes","jobs","timeclock","messages"]],
  ["warehouse_manager", "Warehouse / Inventory Manager", ["inventory","documents","messages"]],
  ["purchasing_manager", "Purchasing Manager", ["inventory","documents"]],
  ["customer_service", "Customer Service Representative", ["customers","leads","scheduling","messages"]],
  ["marketing_manager", "Marketing Manager", ["customers","leads","marketing","ai_assistant"]],
  ["accountant", "Accountant / Bookkeeper", ["customers","estimates","invoices","accounting","reports"]],
  ["hr_manager", "HR Manager", ["documents","timeclock"]],
  ["safety_manager", "Safety Manager", ["jobs","documents"]],
  ["it_administrator", "IT Administrator", MODULE_CATALOG.map(m => m.id)]
];

const DEFAULT_INVITE_ROLES: InviteRole[] = ONBOARDING_ROLE_TEMPLATES.map(([id, name, permissions]) => ({
  id, name, permissions, modulePermissions: defaultGranularFromModuleList(permissions, id === "owner" ? "delete" : "edit")
}));

import { StructuredAddressFields } from "./StructuredAddressFields";

export const RosterPage: React.FC = () => {
  const { employees, setEmployees, timeClockLogs } = useDomainData();
  const { triggerNotification, logOperationalEvent, navigateToScreen } = useNavTelemetry();
  const { loggedInUser, businessId } = useAuth();

  const [search, setSearch] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
  const [isWorkOrderPickerOpen, setIsWorkOrderPickerOpen] = useState(false);
  const [workOrderEmployee, setWorkOrderEmployee] = useState<string>("");
  const [isInviting, setIsInviting] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<InviteRole[]>(DEFAULT_INVITE_ROLES);
  const [inviteMode, setInviteMode] = useState<InviteMode>("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [invitePermissions, setInvitePermissions] = useState<GranularPermissions>({});
  const [customRoleName, setCustomRoleName] = useState("");
  const [customRoleReady, setCustomRoleReady] = useState(false);
  const [requireTimeClockVerification, setRequireTimeClockVerification] = useState(false);
  const [inviteGpsTrackingEnabled, setInviteGpsTrackingEnabled] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState<string | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkInviteResults, setBulkInviteResults] = useState<Array<{ name: string; role: string; code: string }>>([]);

  // A row is a likely duplicate if its email (or, lacking one, its exact
  // name) already matches a real employee already on the roster -- no
  // point re-inviting someone who already has an account.
  const checkEmployeeDuplicate = (row: Partial<Record<EmployeeImportKey, string>>): DuplicateCheckResult => {
    const email = normalizeEmailForMatch(row.email);
    const name = (row.name || "").trim().toLowerCase();
    const match = employees.find(e =>
      (email && normalizeEmailForMatch(e.email) === email) ||
      (!email && name && `${e.firstName} ${e.lastName}`.trim().toLowerCase() === name)
    );
    if (match) return { isDuplicate: true, reason: `Matches existing employee "${match.firstName} ${match.lastName}"` };
    return { isDuplicate: false };
  };
  const managerRole = (loggedInUser?.role || "").toLowerCase();
  const canManageRoles = !loggedInUser?.isEmployee || managerRole.includes("owner") || managerRole.includes("manager") || managerRole.includes("admin");

  useEffect(() => {
    if (!businessId) return;
    getDoc(doc(db, "business_profiles", businessId)).then(snap => {
      const saved = snap.data()?.selectedRoles as InviteRole[] | undefined;
      if (!saved?.length) return;
      const merged = [...DEFAULT_INVITE_ROLES];
      for (const role of saved) {
        const normalized = { ...role, modulePermissions: role.modulePermissions || defaultGranularFromModuleList(role.permissions || [], "edit") };
        const index = merged.findIndex(r => r.id === normalized.id);
        if (index >= 0) merged[index] = normalized; else merged.push(normalized);
      }
      setAvailableRoles(merged);
    }).catch(err => console.error("Couldn't load onboarding roles:", err));
  }, [businessId]);

  const selectedInviteRole = availableRoles.find(r => r.id === inviteRoleId);
  const startInviteMode = (mode: InviteMode) => {
    setInviteMode(mode);
    setInviteRoleId(mode === "custom" ? "__custom__" : "");
    setCustomRoleName("");
    setCustomRoleReady(false);
    setInvitePermissions({});
  };
  const chooseRole = (roleId: string) => {
    setInviteRoleId(roleId);
    setCustomRoleName("");
    setCustomRoleReady(false);
    const role = availableRoles.find(r => r.id === roleId);
    setInvitePermissions(role ? structuredClone(role.modulePermissions) : {});
  };

  const togglePermission = (moduleId: string, action: PermissionAction) => {
    setInvitePermissions(prev => {
      const flags = getPermissionFlags(prev, moduleId);
      return { ...prev, [moduleId]: { ...flags, [action]: !flags[action] } };
    });
  };

  const statusFor = (email: string): "Clocked In" | "On Break" | "Off Duty" | "Not Clocked In Yet" => {
    const logs = timeClockLogs.filter(l => l.employeeEmail === email);
    if (logs.length === 0) return "Not Clocked In Yet";
    const last = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (last.type === "Break Start") return "On Break";
    if (last.type === "Clock Out") return "Off Duty";
    return "Clocked In";
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter(e =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q)
    );
  }, [employees, search]);

  const openEmployeeEditor = (employee: EmployeeRecord) => {
    const role = availableRoles.find(item => item.name === employee.role);
    setEditingEmployee({
      ...employee,
      granularPermissions: employee.granularPermissions || (role ? structuredClone(role.modulePermissions) : {})
    });
  };

  const handleSaveEdit = async () => {
    if (!editingEmployee) return;
    const permissions = MODULE_CATALOG.filter(mod => {
      const flags = getPermissionFlags(editingEmployee.granularPermissions, mod.id);
      return flags.view || flags.edit || flags.delete;
    }).map(mod => mod.id);
    const savedEmployee = { ...editingEmployee, permissions };
    setEmployees(prev => prev.map(e => (e.email === savedEmployee.email ? savedEmployee : e)));
    if (savedEmployee.userUid) {
      await setDoc(doc(db, "user_profiles", savedEmployee.userUid), {
        role: savedEmployee.role,
        permissions,
        granularPermissions: savedEmployee.granularPermissions,
        requireTimeClockVerification: !!savedEmployee.requireTimeClockVerification
      }, { merge: true });
    }
    triggerNotification(`Updated ${editingEmployee.firstName} ${editingEmployee.lastName}.`);
    if (logOperationalEvent) logOperationalEvent("Employee Updated", `${editingEmployee.firstName} ${editingEmployee.lastName}`, "👤");
    setEditingEmployee(null);
  };

  const chooseEmployeeRole = (roleId: string) => {
    if (!editingEmployee) return;
    const role = availableRoles.find(item => item.id === roleId);
    if (!role) return;
    setEditingEmployee({
      ...editingEmployee,
      role: role.name,
      granularPermissions: structuredClone(role.modulePermissions)
    });
  };

  const toggleEmployeePermission = (moduleId: string, action: PermissionAction) => {
    if (!editingEmployee) return;
    const current = editingEmployee.granularPermissions || {};
    const flags = getPermissionFlags(current, moduleId);
    setEditingEmployee({
      ...editingEmployee,
      granularPermissions: { ...current, [moduleId]: { ...flags, [action]: !flags[action] } }
    });
  };

  const handleGenerateInvite = async () => {
    if (!businessId) {
      triggerNotification("Missing business account — please sign in again.");
      return;
    }
    const roleName = inviteRoleId === "__custom__" ? customRoleName.trim() : selectedInviteRole?.name;
    if (!roleName) { triggerNotification("Enter a name for the custom role."); return; }
    const code = genInviteCode(roleName);
    const permissions = MODULE_CATALOG.filter(m => {
      const flags = getPermissionFlags(invitePermissions, m.id);
      return flags.view || flags.edit || flags.delete;
    }).map(m => m.id);
    try {
      if (inviteMode === "custom") {
        const customRole: InviteRole = {
          id: `custom_${customRoleName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          name: customRoleName.trim(),
          permissions,
          modulePermissions: invitePermissions,
          isCustom: true
        };
        const nextRoles = [...availableRoles.filter(role => role.id !== customRole.id), customRole];
        setAvailableRoles(nextRoles);
        await setDoc(doc(db, "business_profiles", businessId), { selectedRoles: nextRoles }, { merge: true });
      }
      await setDoc(doc(db, "employee_invites", code), {
        code,
        role: roleName,
        businessEmail: businessId,
        permissions,
        granularPermissions: invitePermissions,
        requireTimeClockVerification,
        gpsTrackingEnabled: inviteGpsTrackingEnabled,
        status: "pending",
        createdAt: new Date().toISOString()
      });
      setGeneratedInviteCode(code);
      triggerNotification(`Invite code generated for ${roleName}.`);
    } catch (err) {
      console.error("Error generating invite:", err);
      triggerNotification("Couldn't generate an invite code — check your connection and try again.");
    }
  };

  // Bulk import: a real employee record only exists once that person has
  // actually signed up with a real Firebase Auth account (see firestore.rules
  // -- employees/{email} and user_profiles are keyed off a real uid, and
  // that's deliberate: it's the same boundary the security hardening this
  // app went through pins businessEmail/role on). So importing a whole team
  // from a spreadsheet doesn't fabricate `employees` docs for people who
  // haven't signed up yet -- instead it bulk-generates one real,
  // already-role-assigned invite code per row (same write handleGenerateInvite
  // does, just looped), so the owner can hand every hire their own code at
  // once instead of running this dialog 500 times by hand.
  const handleBulkImportEmployees = async (rows: Array<Partial<Record<EmployeeImportKey, string>>>) => {
    if (!businessId) {
      triggerNotification("Missing business account — please sign in again.");
      return;
    }
    const fallbackRole = availableRoles.find(r => r.id === "technician") || availableRoles[0];
    const results: Array<{ name: string; role: string; code: string }> = [];
    for (const row of rows) {
      const name = row.name?.trim();
      if (!name) continue;
      const roleQuery = (row.role || "").trim().toLowerCase();
      const matchedRole = roleQuery ? availableRoles.find(r => r.name.toLowerCase() === roleQuery || r.name.toLowerCase().includes(roleQuery)) : undefined;
      const role = matchedRole || fallbackRole;
      const permissions = MODULE_CATALOG.filter(m => {
        const flags = getPermissionFlags(role.modulePermissions, m.id);
        return flags.view || flags.edit || flags.delete;
      }).map(m => m.id);
      const code = genInviteCode(role.name);
      try {
        await setDoc(doc(db, "employee_invites", code), {
          code,
          role: role.name,
          businessEmail: businessId,
          permissions,
          granularPermissions: role.modulePermissions,
          requireTimeClockVerification: false,
          gpsTrackingEnabled: false,
          status: "pending",
          createdAt: new Date().toISOString(),
          // Display-only convenience so the owner can match a code back to
          // the row it came from -- redemption itself still only trusts the
          // account that actually signs up with this code (App.tsx's
          // invite-signup flow), never these fields.
          prefilledName: name,
          prefilledEmail: row.email?.trim() || "",
          prefilledPhone: row.phone?.trim() || ""
        });
        results.push({ name, role: role.name, code });
      } catch (err) {
        console.error("Error generating bulk invite for", name, err);
      }
    }
    if (!results.length) {
      triggerNotification("No invite codes were generated -- make sure at least the Name column is mapped.");
      return;
    }
    setBulkInviteResults(results);
    triggerNotification(`✅ Generated ${results.length} invite code(s). Copy them below to send out.`);
    if (logOperationalEvent) logOperationalEvent("Bulk Invites Generated", `Generated ${results.length} employee invite codes from spreadsheet`, "📥");
  };

  const undoLastBulkInvite = async () => {
    const codes = bulkInviteResults.map(r => r.code);
    try {
      await Promise.all(codes.map(code => deleteDoc(doc(db, "employee_invites", code))));
      triggerNotification(`Undone -- removed ${codes.length} invite code(s). Anyone who already used one keeps their account.`);
      if (logOperationalEvent) logOperationalEvent("Import Undone", `Removed ${codes.length} unused invite codes from the last import`, "↩️");
    } catch (err) {
      console.error("Error undoing bulk invites:", err);
      triggerNotification("Couldn't remove all the invite codes -- check your connection and try again.");
    }
    setBulkInviteResults([]);
  };

  const statusColor = (status: string) =>
    status === "Clocked In"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : status === "On Break"
      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
      : status === "Off Duty"
      ? "bg-slate-500/10 text-slate-600 border-slate-500/20"
      : "bg-slate-200 text-slate-500 border-slate-300";

  return (
    <div className="space-y-4 animate-fade-in text-left">
      <div className="bg-[#C7E3FA] rounded-3xl p-5 border border-[#9EC8EF] shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">Roster</h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-0.5">Real employee directory — {employees.length} team member{employees.length === 1 ? "" : "s"}</p>
          </div>
          {canManageRoles && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setIsBulkImportOpen(true)}
                className="px-3.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] text-xs font-bold rounded-xl uppercase tracking-wide flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" /> Import Team
              </button>
              <button
                onClick={() => { setIsInviting(true); setGeneratedInviteCode(null); }}
                className="px-3.5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase tracking-wide flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" /> Invite Employee
              </button>
            </div>
          )}
        </div>

        <div className="relative mt-4">
          <Search className="w-4 h-4 text-[#5E7393] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or role..."
            className="w-full pl-9 pr-4 py-2.5 text-xs bg-white border border-[#9EC8EF] rounded-xl focus:outline-none focus:border-[#4A86F7] text-[#1F3557] font-medium"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#C7E3FA] rounded-3xl p-10 border border-[#9EC8EF] shadow-sm text-center">
          <UserPlus className="w-10 h-10 text-[#5E7393] mx-auto mb-3" />
          <h3 className="text-sm font-black text-[#1F3557] uppercase">
            {employees.length === 0 ? "No Employees Yet" : "No Matches"}
          </h3>
          <p className="text-xs text-[#5E7393] font-sans mt-1 max-w-sm mx-auto">
            {employees.length === 0
              ? "Invite your first team member to start assigning jobs, tracking hours, and managing permissions."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(emp => {
            const status = statusFor(emp.email);
            const initials = `${emp.firstName[0] || ""}${emp.lastName[0] || ""}`.toUpperCase();
            return (
              <div key={emp.email} className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF] font-black text-xs flex items-center justify-center shadow-sm">
                      {initials}
                    </div>
                    <div>
                      <p className="font-black text-[#1F3557] text-xs">{emp.firstName} {emp.lastName}</p>
                      <p className="text-[10px] text-[#5E7393] font-bold uppercase tracking-wide">{emp.role}</p>
                    </div>
                  </div>
                  {canManageRoles && <button onClick={() => openEmployeeEditor(emp)} title="Edit employee" className="text-[#5E7393] hover:text-[#1F3557] cursor-pointer">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>}
                </div>

                <div className="space-y-1 text-[10.5px] text-[#1F3557]">
                  <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-[#5E7393] shrink-0" /> <span className="truncate">{emp.email}</span></div>
                  {emp.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-[#5E7393] shrink-0" /> {emp.phone}</div>}
                  {emp.address && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-[#5E7393] shrink-0" /> <span className="truncate">{emp.address}</span></div>}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#9EC8EF]/30">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${statusColor(status)}`}>{status}</span>
                  {emp.hourlyRate > 0 && <span className="text-[10px] font-bold text-[#1F3557]">${emp.hourlyRate}/hr</span>}
                </div>

                {/* Real device handoff -- opens this device's phone/messaging/mail app. */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button disabled={!emp.phone} onClick={() => callNumber(emp.phone)} className="px-2 py-1 bg-white hover:bg-[#EAF5FF] disabled:opacity-40 disabled:cursor-not-allowed border border-[#9EC8EF] rounded-lg text-[9px] font-bold text-[#315C9F] uppercase cursor-pointer">Call</button>
                  <button disabled={!emp.phone} onClick={() => composeSms({ to: emp.phone })} className="px-2 py-1 bg-white hover:bg-[#EAF5FF] disabled:opacity-40 disabled:cursor-not-allowed border border-[#9EC8EF] rounded-lg text-[9px] font-bold text-[#315C9F] uppercase cursor-pointer">Text</button>
                  <button onClick={() => composeEmail({ to: emp.email })} className="px-2 py-1 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-lg text-[9px] font-bold text-[#315C9F] uppercase cursor-pointer">Email</button>
                </div>
                <button onClick={() => { setWorkOrderEmployee(`${emp.firstName} ${emp.lastName}`.trim()); setIsWorkOrderPickerOpen(true); }} className="w-full px-2 py-1.5 bg-white hover:bg-[#EAF5FF] border border-dashed border-[#315C9F] rounded-lg text-[9px] font-black text-[#315C9F] uppercase cursor-pointer">🧰 Create Work Order</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white/60 border border-dashed border-[#9EC8EF] rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#1F3557]">
          <Shield className="w-4 h-4 text-[#315C9F] shrink-0" />
          <span>Permissions are managed by role, not per person — configure what each role can access.</span>
        </div>
        <button
          onClick={() => {
            navigateToScreen("settings", { section: "roles" });
            triggerNotification("Opening Settings → Roles…");
          }}
          className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-white border border-[#9EC8EF] text-[#315C9F] text-[10.5px] font-bold rounded-xl uppercase whitespace-nowrap cursor-pointer"
        >
          Manage Roles
        </button>
      </div>

      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[420px] shadow-2xl space-y-2.5 text-xs">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-black text-[#1F3557] uppercase">Edit Employee</h3>
              <button onClick={() => setEditingEmployee(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={editingEmployee.firstName} onChange={e => setEditingEmployee({ ...editingEmployee, firstName: e.target.value })} placeholder="First name" className="border border-slate-200 rounded-xl px-3 py-2" />
              <input value={editingEmployee.lastName} onChange={e => setEditingEmployee({ ...editingEmployee, lastName: e.target.value })} placeholder="Last name" className="border border-slate-200 rounded-xl px-3 py-2" />
            </div>
            <input value={editingEmployee.phone} onChange={e => setEditingEmployee({ ...editingEmployee, phone: e.target.value })} placeholder="Phone" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <StructuredAddressFields
              label="Home Address"
              value={editingEmployee.address}
              onChange={address => setEditingEmployee({ ...editingEmployee, address })}
              compact
              inputClassName="w-full border border-slate-200 rounded-xl px-3 py-2"
            />
            <label className="text-[9px] uppercase text-slate-400 font-bold">Role</label>
            <select
              value={availableRoles.find(role => role.name === editingEmployee.role)?.id || ""}
              onChange={e => chooseEmployeeRole(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
            >
              <option value="" disabled>{editingEmployee.role || "Select role"}</option>
              {availableRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
            <details className="border border-slate-200 rounded-xl overflow-hidden">
              <summary className="px-3 py-2 bg-slate-50 font-bold text-[#1F3557] cursor-pointer">Edit employee permissions</summary>
              <div className="max-h-[240px] overflow-y-auto p-2 space-y-1.5">
                {MODULE_CATALOG.map(mod => {
                  const flags = getPermissionFlags(editingEmployee.granularPermissions, mod.id);
                  return <div key={mod.id} className="rounded-lg border border-slate-100 p-2">
                    <div className="font-bold text-[10px] text-[#1F3557] mb-1.5">{mod.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {(["view","edit","delete"] as PermissionAction[]).map(action => <label key={action} className="flex items-center gap-1 text-[9px] text-slate-600">
                        <input type="checkbox" checked={flags[action]} onChange={() => toggleEmployeePermission(mod.id, action)} />
                        {action === "edit" ? "Create & Edit" : action[0].toUpperCase() + action.slice(1)}
                      </label>)}
                    </div>
                  </div>;
                })}
              </div>
            </details>
            <input type="number" value={editingEmployee.hourlyRate} onChange={e => setEditingEmployee({ ...editingEmployee, hourlyRate: parseFloat(e.target.value) || 0 })} placeholder="Hourly rate" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
              <input type="checkbox" checked={!!editingEmployee.requireTimeClockVerification} onChange={e => setEditingEmployee({ ...editingEmployee, requireTimeClockVerification: e.target.checked })} className="mt-0.5" />
              <span><strong className="block text-[#1F3557]">Require manager approval</strong><span className="text-[9px] text-slate-500">Every clock-in/out is marked pending until a manager reviews and approves it remotely, from their own device -- never by anyone entering credentials on this employee's device.</span></span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
              <input type="checkbox" checked={!!editingEmployee.gpsTrackingEnabled} onChange={e => setEditingEmployee({ ...editingEmployee, gpsTrackingEnabled: e.target.checked })} className="mt-0.5" />
              <span><strong className="block text-[#1F3557]">Enable field GPS tracking</strong><span className="text-[9px] text-slate-500">While clocked in, this employee's real device location reports periodically so their live position and route show on the Interactive Map. Off by default -- turn off any time, right here.</span></span>
            </label>
            <GpsPrivacyNotice />
            {editingEmployee.gpsTrackingEnabled && (
              <RecentRoutesSection businessId={businessId} employeeEmail={editingEmployee.email} />
            )}
            {editingEmployee.requireTimeClockVerification && (
              <label className="flex flex-col gap-1 text-[10px] font-bold text-[#5E7393] pl-1">
                Assigned manager (optional)
                <select
                  value={editingEmployee.assignedManagerEmail || ""}
                  onChange={e => setEditingEmployee({ ...editingEmployee, assignedManagerEmail: e.target.value || undefined })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-normal text-[#1F3557]"
                >
                  <option value="">Every owner/manager (default)</option>
                  {employees.filter(e => isManagerRole(e.role) && e.email !== editingEmployee.email).map(mgr => (
                    <option key={mgr.email} value={mgr.email}>{mgr.firstName} {mgr.lastName} ({mgr.role})</option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditingEmployee(null)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button onClick={handleSaveEdit} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      {isInviting && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[400px] shadow-2xl space-y-2.5 text-xs">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-black text-[#1F3557] uppercase">Invite Employee</h3>
              <button onClick={() => setIsInviting(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            {!generatedInviteCode ? (
              <>
                <label className="text-[9px] uppercase text-slate-400 font-bold">Role setup</label>
                <select value={inviteMode} onChange={e => startInviteMode(e.target.value as InviteMode)} className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white">
                  <option value="" disabled>Choose one...</option>
                  <option value="select">Select Role</option>
                  <option value="custom">Custom Role</option>
                </select>
                {inviteMode === "select" && (
                  <select value={inviteRoleId} onChange={e => chooseRole(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white">
                    <option value="" disabled>Select an onboarding role...</option>
                    {availableRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                )}
                {inviteMode === "custom" && !customRoleReady && (
                  <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                    <label className="block text-[9px] uppercase text-slate-400 font-bold">Custom role name</label>
                    <input autoFocus value={customRoleName} onChange={e => { setCustomRoleName(e.target.value); setCustomRoleReady(false); }} placeholder="Enter custom role name" className="flex-1 border border-slate-200 rounded-xl px-3 py-2" />
                    <button type="button" disabled={!customRoleName.trim()} onClick={() => { setInvitePermissions({}); setCustomRoleReady(true); }} className="w-full py-2 rounded-xl bg-[#315C9F] text-white font-bold disabled:opacity-40">Save Role</button>
                  </div>
                )}
                {((inviteMode === "select" && !!inviteRoleId) || (inviteMode === "custom" && customRoleReady)) && <details className="border border-slate-200 rounded-xl overflow-hidden" open>
                  <summary className="px-3 py-2 bg-slate-50 font-bold text-[#1F3557] cursor-pointer">Choose permissions</summary>
                  <div className="max-h-[260px] overflow-y-auto p-2 space-y-1.5">
                    {MODULE_CATALOG.map(mod => {
                      const flags = getPermissionFlags(invitePermissions, mod.id);
                      return <div key={mod.id} className="rounded-lg border border-slate-100 p-2">
                        <div className="font-bold text-[10px] text-[#1F3557] mb-1.5">{mod.label}</div>
                        <div className="flex flex-wrap gap-2">
                          {(["view","edit","delete"] as PermissionAction[]).map(action => <label key={action} className="flex items-center gap-1 text-[9px] text-slate-600">
                            <input type="checkbox" checked={flags[action]} onChange={() => togglePermission(mod.id, action)} />
                            {action === "edit" ? "Create & Edit" : action[0].toUpperCase() + action.slice(1)}
                          </label>)}
                        </div>
                      </div>;
                    })}
                  </div>
                </details>}
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input type="checkbox" checked={requireTimeClockVerification} onChange={e => setRequireTimeClockVerification(e.target.checked)} className="mt-0.5" />
                  <span><strong className="block text-[#1F3557]">Require manager approval</strong><span className="text-[9px] text-slate-500">Every clock-in/out is marked pending until a manager reviews and approves it remotely, from their own device -- never by anyone entering credentials on this employee's device.</span></span>
                </label>
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input type="checkbox" checked={inviteGpsTrackingEnabled} onChange={e => setInviteGpsTrackingEnabled(e.target.checked)} className="mt-0.5" />
                  <span><strong className="block text-[#1F3557]">Enable field GPS tracking</strong><span className="text-[9px] text-slate-500">While clocked in, this employee's real device location reports periodically so their live position and route show on the Interactive Map. Off by default -- can be turned on or off any time from Settings or Roster.</span></span>
                </label>
                {inviteGpsTrackingEnabled && <GpsPrivacyNotice />}
                <button disabled={!inviteMode || !inviteRoleId || (inviteMode === "custom" && !customRoleReady)} onClick={handleGenerateInvite} className="w-full py-2 bg-[#315C9F] text-white rounded-xl font-bold mt-2 disabled:opacity-40">Generate Invite Code</button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-slate-500">Share this code with your new hire to complete signup:</p>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                  <span className="font-mono font-black text-[#1F3557] text-sm flex-1">{generatedInviteCode}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedInviteCode);
                      triggerNotification("Invite code copied.");
                    }}
                    className="text-[#315C9F]"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => setIsInviting(false)} className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl font-bold mt-2">Done</button>
              </>
            )}
          </div>
        </div>
      )}
      <CreateWorkOrderPicker
        isOpen={isWorkOrderPickerOpen}
        onClose={() => setIsWorkOrderPickerOpen(false)}
        prefillBase={{ assignedEmployees: workOrderEmployee ? [workOrderEmployee] : undefined }}
      />

      {isBulkImportOpen && (
        <BulkImportModal<EmployeeImportKey>
          title="Import Team"
          description="Upload a spreadsheet (CSV/TSV/Excel export, or a tabular PDF) of your team. This generates one real, role-assigned invite code per person -- each one still has to actually sign up with their code before they become a real employee record, same as inviting someone by hand."
          fields={EMPLOYEE_IMPORT_FIELDS}
          checkDuplicate={checkEmployeeDuplicate}
          rowLabel={row => row.name || ""}
          onConfirm={rows => void handleBulkImportEmployees(rows)}
          onClose={() => setIsBulkImportOpen(false)}
          confirmLabel="Generate Invite Codes"
        />
      )}

      {bulkInviteResults.length > 0 && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-black uppercase">Invite Codes Generated ({bulkInviteResults.length})</h3>
              <button onClick={() => setBulkInviteResults([])} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              <p className="text-[11px] text-[#5E7393]">Send each person their own code -- they'll enter it when they sign up.</p>
              <div className="border border-[#9EC8EF]/40 rounded-xl overflow-hidden divide-y divide-[#9EC8EF]/20">
                {bulkInviteResults.map(r => (
                  <div key={r.code} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{r.name}</p>
                      <p className="text-[10px] text-[#5E7393]">{r.role}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-black text-[#1F3557]">{r.code}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(`${r.name}: ${r.code}`)}
                        className="text-[#315C9F] cursor-pointer"
                        title="Copy"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(bulkInviteResults.map(r => `${r.name} (${r.role}): ${r.code}`).join("\n"))}
                className="w-full py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] rounded-xl font-bold text-xs cursor-pointer"
              >
                Copy All
              </button>
            </div>
            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 shrink-0 flex gap-2">
              <button onClick={() => void undoLastBulkInvite()} className="flex-1 py-2 bg-white border border-rose-200 text-rose-600 rounded-xl font-bold cursor-pointer">Undo</button>
              <button onClick={() => setBulkInviteResults([])} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold cursor-pointer">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
