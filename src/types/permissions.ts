// Per-module permissions. View, Create & Edit, and Delete are independent
// capabilities. Legacy single-level values are still accepted so existing
// employee accounts and role templates continue to work after this upgrade.

export type PermissionAction = "view" | "edit" | "delete";
export type PermissionLevel = "none" | PermissionAction;
export type PermissionFlags = Record<PermissionAction, boolean>;
export type ModulePermission = PermissionLevel | PermissionFlags;

export const PERMISSION_LEVELS: PermissionLevel[] = ["none", "view", "edit", "delete"];

export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  none: "No Access",
  view: "View",
  edit: "Create & Edit",
  delete: "Delete"
};

export type GranularPermissions = Record<string, ModulePermission>;

const EMPTY_FLAGS: PermissionFlags = { view: false, edit: false, delete: false };

export function normalizePermission(value: ModulePermission | undefined): PermissionFlags {
  if (!value || value === "none") return { ...EMPTY_FLAGS };
  if (typeof value === "object") {
    return {
      view: value.view === true,
      edit: value.edit === true,
      delete: value.delete === true
    };
  }

  // Preserve the old hierarchical meaning for records saved before
  // multi-select permissions existed.
  if (value === "delete") return { view: true, edit: true, delete: true };
  if (value === "edit") return { view: true, edit: true, delete: false };
  return { view: true, edit: false, delete: false };
}

export function hasPermission(
  granular: GranularPermissions | undefined,
  moduleId: string,
  action: PermissionAction
): boolean {
  if (!granular) return false;
  return normalizePermission(granular[moduleId])[action];
}

export function getPermissionFlags(
  granular: GranularPermissions | undefined,
  moduleId: string
): PermissionFlags {
  return normalizePermission(granular?.[moduleId]);
}

// Kept for older callers. A multi-select module is reported as the highest
// enabled capability, while all authorization checks use hasPermission().
export function getPermissionLevel(
  granular: GranularPermissions | undefined,
  moduleId: string
): PermissionLevel {
  const flags = getPermissionFlags(granular, moduleId);
  if (flags.delete) return "delete";
  if (flags.edit) return "edit";
  if (flags.view) return "view";
  return "none";
}

export function defaultGranularFromModuleList(
  modules: string[],
  level: PermissionLevel = "view"
): GranularPermissions {
  const result: GranularPermissions = {};
  const flags = normalizePermission(level);
  for (const moduleId of modules) result[moduleId] = { ...flags };
  return result;
}

/** Owners always have every capability in every module. */
export function fullAccessGranular(modules: string[]): GranularPermissions {
  const result: GranularPermissions = {};
  for (const moduleId of modules) {
    result[moduleId] = { view: true, edit: true, delete: true };
  }
  return result;
}
