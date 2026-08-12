export const permissions=['dashboard.read','sales.read','sales.create','sales.refund','sales.void','products.read','products.manage','inventory.read','inventory.adjust','inventory.transfer','customers.read','customers.manage','suppliers.read','suppliers.manage','purchases.read','purchases.manage','expenses.read','expenses.manage','employees.read','employees.manage','reports.read','settings.manage','audit.read'] as const;
export type Permission=typeof permissions[number];
export const rolePermissions:Record<string,readonly Permission[]>={
 owner:permissions, admin:permissions.filter(x=>x!=='settings.manage'),
 manager:permissions.filter(x=>!['settings.manage','audit.read','employees.manage'].includes(x)),
 accountant:['dashboard.read','sales.read','expenses.read','expenses.manage','reports.read'],
 inventory_manager:['dashboard.read','products.read','products.manage','inventory.read','inventory.adjust','inventory.transfer','suppliers.read','suppliers.manage','purchases.read','purchases.manage'],
 seller:['sales.read','sales.create','products.read','inventory.read','customers.read','customers.manage']
};
