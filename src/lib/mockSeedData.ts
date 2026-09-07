// Standalone demo seed data. This file replaces Firestore entirely (see
// useFirestoreCollection.ts) -- every collection the real app reads is
// pre-populated here with a believable "GreenPoint Lawn & Landscape"
// dataset instead of live production data. Dates are computed relative to
// "today" at load time so the demo never looks stale, no matter when it's
// actually opened.

const DAY = 86400000;
const today = new Date();
today.setHours(0, 0, 0, 0);

const ymd = (offsetDays: number): string => {
  const d = new Date(today.getTime() + offsetDays * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthsAgoYmd = (monthsAgo: number, day: number): string => {
  const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const longDate = (offsetDays: number): string =>
  new Date(today.getTime() + offsetDays * DAY).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const isoNow = (offsetDays = 0): string => new Date(today.getTime() + offsetDays * DAY).toISOString();

export const MOCK_SEED_DATA: Record<string, any[]> = {
  customers: [
    { id: "cust_1", company: "Ridgeview HOA", contact: "Carla Jennings", phone: "(555) 201-4432", email: "carla@ridgeviewhoa.org", address: "4400 Ridgeview Dr, Ridgeview, TX 76052", openJobs: 2, outstandingBalance: 2150, lifetimeValue: 58200, status: "Active", type: "Commercial", isVIP: true, recentlyAdded: false },
    { id: "cust_2", company: "Ortiz Residence", contact: "Diane Ortiz", phone: "(555) 774-3321", email: "diane.ortiz@gmail.com", address: "15 Sunset Ave, Haslet, TX 76052", openJobs: 1, outstandingBalance: 0, lifetimeValue: 4920, status: "Active", type: "Residential", isVIP: false, recentlyAdded: false },
    { id: "cust_3", company: "First Baptist Church", contact: "Marcus Webb", phone: "(555) 118-2290", email: "facilities@fbchaslet.org", address: "200 Chapel Rd, Haslet, TX 76052", openJobs: 1, outstandingBalance: 1180, lifetimeValue: 22300, status: "Active", type: "Commercial", isVIP: false, recentlyAdded: false },
    { id: "cust_4", company: "Voss Residence", contact: "Harold Voss", phone: "(555) 662-0099", email: "hvoss@outlook.com", address: "909 Elm St, Haslet, TX 76052", openJobs: 0, outstandingBalance: 0, lifetimeValue: 1980, status: "Active", type: "Residential", isVIP: false, recentlyAdded: false },
    { id: "cust_5", company: "Riverside Diner", contact: "Sandra Kim", phone: "(555) 441-7765", email: "sandra@riversidediner.com", address: "12 Riverside Way, Fort Worth, TX 76052", openJobs: 0, outstandingBalance: 3100, lifetimeValue: 5410, status: "Past Due", type: "Commercial", isVIP: false, recentlyAdded: false },
    { id: "cust_6", company: "Lakeside Church", contact: "Tom Reilly", phone: "(555) 220-9981", email: "tom@lakesidechurch.org", address: "501 Lake Shore Dr, Fort Worth, TX 76052", openJobs: 0, outstandingBalance: 0, lifetimeValue: 780, status: "Inactive", type: "Commercial", isVIP: false, recentlyAdded: false },
    { id: "cust_7", company: "Pineview Golf Club", contact: "Angela Petrov", phone: "(555) 887-3345", email: "angela@pineviewgc.com", address: "1 Fairway Blvd, Haslet, TX 76052", openJobs: 0, outstandingBalance: 0, lifetimeValue: 0, status: "Potential", type: "Commercial", isVIP: false, recentlyAdded: true },
    { id: "cust_8", company: "Northgate Plaza", contact: "Derrick Holt", phone: "(555) 556-2210", email: "dholt@northgateplaza.com", address: "88 Northgate Rd, Fort Worth, TX 76052", openJobs: 0, outstandingBalance: 0, lifetimeValue: 0, status: "Potential", type: "Commercial", isVIP: false, recentlyAdded: true },
  ],

  leads: [
    { id: "lead_1", name: "Tom Reilly", company: "Lakeside Church", phone: "(555) 220-9981", email: "tom@lakesidechurch.org", source: "Google Business Profile", salesRep: "Sarah M.", status: "Estimate Sent", estimatedValue: 2400, dateAdded: ymd(-3), addedDaysAgo: 3 },
    { id: "lead_2", name: "Brookstone Apartments", company: "Brookstone Apartments", phone: "(555) 990-4471", email: "manager@brookstoneapts.com", source: "Referral", salesRep: "Unassigned", status: "New", estimatedValue: 18000, dateAdded: ymd(-1), addedDaysAgo: 1 },
    { id: "lead_3", name: "Sandra Kim", company: "Riverside Diner", phone: "(555) 441-7765", email: "sandra@riversidediner.com", source: "Website", salesRep: "Sarah M.", status: "Contacted", estimatedValue: 650, dateAdded: ymd(-4), addedDaysAgo: 4 },
    { id: "lead_4", name: "Angela Petrov", company: "Pineview Golf Club", phone: "(555) 887-3345", email: "angela@pineviewgc.com", source: "Phone Call", salesRep: "Mike D.", status: "Estimate Sent", estimatedValue: 42000, dateAdded: ymd(-5), addedDaysAgo: 5 },
    { id: "lead_5", name: "Harold Voss", company: "Voss Residence", phone: "(555) 662-0099", email: "hvoss@outlook.com", source: "Google Business Profile", salesRep: "Sarah M.", status: "Won", estimatedValue: 1200, dateAdded: ymd(-11), addedDaysAgo: 11 },
    { id: "lead_6", name: "Riverside Diner", company: "Riverside Diner", phone: "(555) 441-7765", email: "sandra@riversidediner.com", source: "Referral", salesRep: "Mike D.", status: "Contacted", estimatedValue: 3100, dateAdded: ymd(-6), addedDaysAgo: 6 },
    { id: "lead_7", name: "Renee Ford", company: "", phone: "(555) 302-8871", email: "renee.ford@gmail.com", source: "Facebook", salesRep: "Unassigned", status: "New", estimatedValue: 800, dateAdded: ymd(-1), addedDaysAgo: 1 },
    { id: "lead_8", name: "Derrick Holt", company: "Northgate Plaza", phone: "(555) 556-2210", email: "dholt@northgateplaza.com", source: "Phone Call", salesRep: "Unassigned", status: "New", estimatedValue: 27000, dateAdded: ymd(-1), addedDaysAgo: 1 },
    { id: "lead_9", name: "Lakeside Church Annex", company: "Lakeside Church", phone: "(555) 220-9981", email: "tom@lakesidechurch.org", source: "Website", salesRep: "Sarah M.", status: "Lost", estimatedValue: 9500, dateAdded: ymd(-19), addedDaysAgo: 19 },
    { id: "lead_10", name: "Marcus Webb", company: "First Baptist Church", phone: "(555) 118-2290", email: "facilities@fbchaslet.org", source: "Referral", salesRep: "Mike D.", status: "Qualified", estimatedValue: 1950, dateAdded: ymd(-2), addedDaysAgo: 2 },
  ],

  estimates: [
    { id: "est_1", number: "EST-1042", customerName: "Angela Petrov", company: "Pineview Golf Club", status: "Sent", salesRep: "Mike D.", amount: 42000, createdDate: longDate(-5), expirationDate: longDate(25), notes: "Full course landscape renovation -- fairway edging, bunker refresh, irrigation zone upgrade." },
    { id: "est_2", number: "EST-1041", customerName: "Brookstone Apartments", company: "Brookstone Apartments", status: "Draft", salesRep: "Sarah M.", amount: 18000, createdDate: longDate(-1), expirationDate: longDate(29), notes: "Annual grounds maintenance contract, 12-month term." },
    { id: "est_3", number: "EST-1039", customerName: "Derrick Holt", company: "Northgate Plaza", status: "Sent", salesRep: "Mike D.", amount: 6400, createdDate: longDate(-2), expirationDate: longDate(28), notes: "Seasonal color rotation install, 4x per year." },
    { id: "est_4", number: "EST-1037", customerName: "Tom Reilly", company: "Lakeside Church", status: "Accepted", salesRep: "Sarah M.", amount: 2400, createdDate: longDate(-8), expirationDate: longDate(22), notes: "Backyard renovation -- sod replacement, new bed borders." },
    { id: "est_5", number: "EST-1032", customerName: "Sandra Kim", company: "Riverside Diner", status: "Accepted", salesRep: "Mike D.", amount: 3100, createdDate: longDate(-14), expirationDate: longDate(16), notes: "Patio landscape refresh." },
    { id: "est_6", number: "EST-1030", customerName: "Tom Reilly", company: "Lakeside Church", status: "Declined", salesRep: "Sarah M.", amount: 9500, createdDate: longDate(-19), expirationDate: longDate(11), notes: "Tree removal & grading, declined -- budget." },
  ],

  scheduling_events: [
    { id: "evt_1", eventType: "Job", date: ymd(0), startTime: "08:00", endTime: "10:00", customer: "Carla Jennings", customerPhone: "(555) 201-4432", customerAddress: "4400 Ridgeview Dr, Ridgeview, TX", assignedEmployee: "Danny Reyes", assignedCrew: "Crew 1", location: "4400 Ridgeview Dr, Ridgeview, TX", priority: "Medium", notes: "", status: "Scheduled", title: "Irrigation Repair", budget: 2150 },
    { id: "evt_2", eventType: "Job", date: ymd(0), startTime: "09:30", endTime: "11:00", customer: "Diane Ortiz", customerPhone: "(555) 774-3321", customerAddress: "15 Sunset Ave, Haslet, TX", assignedEmployee: "J. Alvarez", assignedCrew: "Crew 2", location: "15 Sunset Ave, Haslet, TX", priority: "Low", notes: "", status: "Scheduled", title: "Weekly Mow & Trim", budget: 210 },
    { id: "evt_3", eventType: "Estimate", date: ymd(0), startTime: "11:00", endTime: "12:00", customer: "Marcus Webb", customerPhone: "(555) 118-2290", customerAddress: "200 Chapel Rd, Haslet, TX", assignedEmployee: "Priya Nair", assignedCrew: "Crew 3", location: "200 Chapel Rd, Haslet, TX", priority: "Medium", notes: "", status: "Scheduled", title: "Install Consult", budget: 0 },
    { id: "evt_4", eventType: "Job", date: ymd(1), startTime: "08:00", endTime: "12:00", customer: "First Baptist Church", customerPhone: "(555) 118-2290", customerAddress: "200 Chapel Rd, Haslet, TX", assignedEmployee: "Danny Reyes", assignedCrew: "Crew 1", location: "200 Chapel Rd, Haslet, TX", priority: "Medium", notes: "", status: "Scheduled", title: "Mulch Install", budget: 1180 },
    { id: "evt_5", eventType: "Job", date: ymd(2), startTime: "09:00", endTime: "10:30", customer: "Harold Voss", customerPhone: "(555) 662-0099", customerAddress: "909 Elm St, Haslet, TX", assignedEmployee: "J. Alvarez", assignedCrew: "Crew 2", location: "909 Elm St, Haslet, TX", priority: "Low", notes: "", status: "Scheduled", title: "Sod Replacement", budget: 1200 },
    { id: "evt_6", eventType: "Job", date: ymd(-1), startTime: "08:00", endTime: "10:00", customer: "Carla Jennings", customerPhone: "(555) 201-4432", customerAddress: "4400 Ridgeview Dr, Ridgeview, TX", assignedEmployee: "Danny Reyes", assignedCrew: "Crew 1", location: "4400 Ridgeview Dr, Ridgeview, TX", priority: "Medium", notes: "", status: "Scheduled", title: "Fertilizer App", budget: 285 },
    { id: "evt_7", eventType: "Job", date: ymd(-2), startTime: "13:00", endTime: "15:00", customer: "Sandra Kim", customerPhone: "(555) 441-7765", customerAddress: "12 Riverside Way, Fort Worth, TX", assignedEmployee: "Priya Nair", assignedCrew: "Crew 3", location: "12 Riverside Way, Fort Worth, TX", priority: "Low", notes: "", status: "Scheduled", title: "Patio Refresh Walkthrough", budget: 0 },
    { id: "evt_8", eventType: "Job", date: ymd(4), startTime: "08:00", endTime: "11:00", customer: "Ridgeview HOA", customerPhone: "(555) 201-4432", customerAddress: "4400 Ridgeview Dr, Ridgeview, TX", assignedEmployee: "Danny Reyes", assignedCrew: "Crew 1", location: "4400 Ridgeview Dr, Ridgeview, TX", priority: "High", notes: "", status: "Scheduled", title: "Common Area Cleanup", budget: 640 },
  ],

  inventory: [
    { id: "inv_1", name: "Mulch (Brown, cu yd)", category: "Landscape Material", vendor: "SiteOne Landscape", manufacturer: "Generic", sku: "MUL-BR-01", barcode: "", qrCode: "", description: "Double-ground brown hardwood mulch", quantity: 42, unit: "cu yd", minQuantity: 20, maxQuantity: 80, location: "Yard A", unitCost: 28, sellingPrice: 45, notes: "", photo: "", isFavorite: false, lastUpdated: ymd(-1), quantityHistory: [], purchaseHistory: [], usageHistory: [] },
    { id: "inv_2", name: "Fertilizer 16-4-8 (50lb)", category: "Chemicals", vendor: "SiteOne Landscape", manufacturer: "Lesco", sku: "FERT-1648", barcode: "", qrCode: "", description: "Granular lawn fertilizer", quantity: 18, unit: "bag", minQuantity: 15, maxQuantity: 40, location: "Warehouse", unitCost: 34.5, sellingPrice: 55, notes: "", photo: "", isFavorite: false, lastUpdated: ymd(-3), quantityHistory: [], purchaseHistory: [], usageHistory: [] },
    { id: "inv_3", name: 'Trimmer Line .095"', category: "Parts", vendor: "Sunbelt Rentals", manufacturer: "Stihl", sku: "TRM-095", barcode: "", qrCode: "", description: "Replacement trimmer line spool", quantity: 6, unit: "spool", minQuantity: 10, maxQuantity: 30, location: "Truck 2", unitCost: 12, sellingPrice: 0, notes: "Low stock", photo: "", isFavorite: false, lastUpdated: ymd(0), quantityHistory: [], purchaseHistory: [], usageHistory: [] },
    { id: "inv_4", name: 'Mower Blades (21")', category: "Parts", vendor: "SiteOne Landscape", manufacturer: "Toro", sku: "BLD-21", barcode: "", qrCode: "", description: "Replacement mower blades", quantity: 24, unit: "each", minQuantity: 12, maxQuantity: 48, location: "Warehouse", unitCost: 9.75, sellingPrice: 0, notes: "", photo: "", isFavorite: false, lastUpdated: ymd(-5), quantityHistory: [], purchaseHistory: [], usageHistory: [] },
    { id: "inv_5", name: "Pre-emergent Herbicide", category: "Chemicals", vendor: "SiteOne Landscape", manufacturer: "Lesco", sku: "HERB-PE1", barcode: "", qrCode: "", description: "Pre-emergent weed control", quantity: 9, unit: "bag", minQuantity: 8, maxQuantity: 25, location: "Warehouse", unitCost: 58, sellingPrice: 85, notes: "Low stock", photo: "", isFavorite: false, lastUpdated: ymd(-2), quantityHistory: [], purchaseHistory: [], usageHistory: [] },
    { id: "inv_6", name: 'Irrigation Valves 1"', category: "Parts", vendor: "SiteOne Landscape", manufacturer: "Rain Bird", sku: "IRR-VLV1", barcode: "", qrCode: "", description: "1-inch irrigation zone valve", quantity: 31, unit: "each", minQuantity: 10, maxQuantity: 40, location: "Warehouse", unitCost: 14.25, sellingPrice: 0, notes: "", photo: "", isFavorite: false, lastUpdated: ymd(-7), quantityHistory: [], purchaseHistory: [], usageHistory: [] },
    { id: "inv_7", name: "Diesel Fuel (gal)", category: "Fuel", vendor: "Local Fuel Co", manufacturer: "", sku: "FUEL-DSL", barcode: "", qrCode: "", description: "Diesel fuel, on-hand storage", quantity: 85, unit: "gal", minQuantity: 40, maxQuantity: 150, location: "Yard B", unitCost: 3.92, sellingPrice: 0, notes: "", photo: "", isFavorite: false, lastUpdated: ymd(0), quantityHistory: [], purchaseHistory: [], usageHistory: [] },
    { id: "inv_8", name: "Sod (pallet)", category: "Landscape Material", vendor: "SiteOne Landscape", manufacturer: "", sku: "SOD-PAL", barcode: "", qrCode: "", description: "St. Augustine sod pallet", quantity: 3, unit: "pallet", minQuantity: 5, maxQuantity: 15, location: "Yard A", unitCost: 210, sellingPrice: 310, notes: "Low stock", photo: "", isFavorite: false, lastUpdated: ymd(-1), quantityHistory: [], purchaseHistory: [], usageHistory: [] },
  ],

  documents: [
    { id: "doc_1", name: "Ridgeview HOA - Service Contract.pdf", customer: "Ridgeview HOA", employee: "Mike Donovan", vendor: "None", job: "None", type: "Contracts", folder: "Customers", uploadedBy: "Mike Donovan", date: ymd(-40), size: "212 KB", status: "Signed", isFavorite: false, isArchived: false, notes: "", tags: ["Contract"], estimateId: "None", invoiceId: "None", lastModified: ymd(-40) },
    { id: "doc_2", name: "EST-1042.pdf", customer: "Pineview Golf Club", employee: "Mike Donovan", vendor: "None", job: "None", type: "Estimates", folder: "Estimates", uploadedBy: "Mike Donovan", date: ymd(-5), size: "88 KB", status: "Sent", isFavorite: false, isArchived: false, notes: "", tags: ["Estimate"], estimateId: "est_1", invoiceId: "None", lastModified: ymd(-5) },
    { id: "doc_3", name: "General Liability Certificate.pdf", customer: "None", employee: "Mike Donovan", vendor: "None", job: "None", type: "Insurance", folder: "Company", uploadedBy: "Mike Donovan", date: ymd(-200), size: "340 KB", status: "Archived", isFavorite: true, isArchived: false, notes: "", tags: ["Insurance"], estimateId: "None", invoiceId: "None", lastModified: ymd(-200) },
    { id: "doc_4", name: "Receipt - Home Depot.jpg", customer: "None", employee: "J. Alvarez", vendor: "Home Depot", job: "None", type: "Receipt", folder: "Company", uploadedBy: "J. Alvarez", date: ymd(-1), size: "1.2 MB", status: "Draft", isFavorite: false, isArchived: false, notes: "AI Snapshot scan", tags: ["Receipt"], estimateId: "None", invoiceId: "None", lastModified: ymd(-1) },
    { id: "doc_5", name: "INV-3391.pdf", customer: "Ridgeview HOA", employee: "Mike Donovan", vendor: "None", job: "None", type: "Invoices", folder: "Customers", uploadedBy: "Mike Donovan", date: ymd(-2), size: "76 KB", status: "Signed", isFavorite: false, isArchived: false, notes: "", tags: ["Invoice"], estimateId: "None", invoiceId: "inv_1", lastModified: ymd(-2) },
  ],

  roster: [
    { id: "GPL-7734", name: "Cole Bennett", role: "Technician", code: "GPL-7734", status: "Pending" },
    { id: "GPL-2210", name: "Priya Nair", role: "Crew Lead", code: "GPL-2210", status: "Used" },
  ],

  bulletins: [
    { id: "bul_1", author: "Mike Donovan", role: "Owner", date: longDate(-6), title: "Holiday Schedule - Labor Day", content: "Office closed Monday 9/1. Crews on normal schedule Tue-Fri.", status: "approved" },
    { id: "bul_2", author: "Sarah Mitchell", role: "Office Manager", date: longDate(-9), title: "New Safety Vests In", content: "Pick up your new hi-vis vests from the warehouse before your next job.", status: "approved" },
    { id: "bul_3", author: "Mike Donovan", role: "Owner", date: longDate(-14), title: "Q3 Bonus Structure", content: "Great work hitting Q2 targets -- Q3 bonus details posted in Documents > Employee Records.", status: "approved" },
  ],

  notifications: [
    { id: "notif_1", screenId: "accounting", title: "Invoice Paid", message: "Invoice #3391 paid by Ridgeview HOA -- $2,150", isRead: false, timestamp: isoNow(0) },
    { id: "notif_2", screenId: "inventory", title: "Low Inventory", message: 'Trimmer Line .095" below reorder level', isRead: false, timestamp: isoNow(0) },
    { id: "notif_3", screenId: "estimates", title: "Estimate Approved", message: "Estimate EST-1037 approved by Tom Reilly", isRead: true, timestamp: isoNow(-1) },
    { id: "notif_4", screenId: "timeclock", title: "Clock In", message: "Danny Reyes clocked in", isRead: true, timestamp: isoNow(-1) },
    { id: "notif_5", screenId: "leads", title: "New Lead", message: "New lead: Northgate Plaza (Phone Call)", isRead: true, timestamp: isoNow(-2) },
  ],

  recent_ai_actions: [],
  snapshots: [],

  revenue_events: [
    { id: "rev_1", date: isoNow(-2), amount: 2150, customer: "Ridgeview HOA", jobId: "evt_1", estimateId: "" },
    { id: "rev_2", date: isoNow(-3), amount: 1180, customer: "First Baptist Church", jobId: "evt_4", estimateId: "" },
    { id: "rev_3", date: isoNow(-7), amount: 285, customer: "Carla Jennings", jobId: "evt_6", estimateId: "" },
    { id: "rev_4", date: isoNow(-10), amount: 3100, customer: "Riverside Diner", jobId: "evt_7", estimateId: "est_5" },
    { id: "rev_5", date: isoNow(-15), amount: 1200, customer: "Harold Voss", jobId: "evt_5", estimateId: "est_4" },
    { id: "rev_6", date: `${monthsAgoYmd(1, 9)}T12:00:00.000Z`, amount: 9800, customer: "Ridgeview HOA", jobId: "", estimateId: "" },
    { id: "rev_7", date: `${monthsAgoYmd(2, 14)}T12:00:00.000Z`, amount: 8600, customer: "First Baptist Church", jobId: "", estimateId: "" },
    { id: "rev_8", date: `${monthsAgoYmd(3, 20)}T12:00:00.000Z`, amount: 7100, customer: "Various", jobId: "", estimateId: "" },
  ],

  employees: [
    { id: "mike@greenpointlandscape.com", email: "mike@greenpointlandscape.com", firstName: "Mike", lastName: "Donovan", address: "4400 Ridgeview Dr, Suite 3, Haslet, TX", phone: "(555) 200-1000", photo: "", goals: "", hourlyRate: 0, role: "Owner", permissions: ["ALL"], businessEmail: "mike@greenpointlandscape.com", createdAt: isoNow(-900) },
    { id: "sarah@greenpointlandscape.com", email: "sarah@greenpointlandscape.com", firstName: "Sarah", lastName: "Mitchell", address: "", phone: "(555) 200-1001", photo: "", goals: "", hourlyRate: 24, role: "Office Manager", permissions: [], businessEmail: "mike@greenpointlandscape.com", createdAt: isoNow(-800) },
    { id: "danny@greenpointlandscape.com", email: "danny@greenpointlandscape.com", firstName: "Danny", lastName: "Reyes", address: "", phone: "(555) 200-1002", photo: "", goals: "", hourlyRate: 22, role: "Crew Lead", permissions: [], businessEmail: "mike@greenpointlandscape.com", createdAt: isoNow(-700) },
    { id: "jalvarez@greenpointlandscape.com", email: "jalvarez@greenpointlandscape.com", firstName: "J.", lastName: "Alvarez", address: "", phone: "(555) 200-1003", photo: "", goals: "", hourlyRate: 22, role: "Crew Lead", permissions: [], businessEmail: "mike@greenpointlandscape.com", createdAt: isoNow(-650) },
    { id: "priya@greenpointlandscape.com", email: "priya@greenpointlandscape.com", firstName: "Priya", lastName: "Nair", address: "", phone: "(555) 200-1004", photo: "", goals: "", hourlyRate: 22, role: "Crew Lead", permissions: [], businessEmail: "mike@greenpointlandscape.com", createdAt: isoNow(-500) },
    { id: "tostrowski@greenpointlandscape.com", email: "tostrowski@greenpointlandscape.com", firstName: "T.", lastName: "Ostrowski", address: "", phone: "(555) 200-1005", photo: "", goals: "", hourlyRate: 19, role: "Technician", permissions: [], businessEmail: "mike@greenpointlandscape.com", createdAt: isoNow(-400) },
  ],

  time_clock_logs: [
    { id: "tcl_1", employeeEmail: "jalvarez@greenpointlandscape.com", employeeName: "J. Alvarez", type: "Clock In", date: ymd(0), time: "7:02 AM", timestamp: isoNow(0), gps: "" },
    { id: "tcl_2", employeeEmail: "danny@greenpointlandscape.com", employeeName: "Danny Reyes", type: "Clock In", date: ymd(0), time: "6:55 AM", timestamp: isoNow(0), gps: "" },
    { id: "tcl_3", employeeEmail: "priya@greenpointlandscape.com", employeeName: "Priya Nair", type: "Clock In", date: ymd(0), time: "7:10 AM", timestamp: isoNow(0), gps: "" },
    { id: "tcl_4", employeeEmail: "sarah@greenpointlandscape.com", employeeName: "Sarah Mitchell", type: "Clock In", date: ymd(0), time: "8:00 AM", timestamp: isoNow(0), gps: "" },
  ],

  transactions: [
    { id: "txn_1", type: "income", source: "invoice_payment", amount: 2150, description: "Ridgeview HOA", category: "Job Revenue", date: ymd(-2), createdAt: isoNow(-2) },
    { id: "txn_2", type: "income", source: "invoice_payment", amount: 1180, description: "First Baptist Church", category: "Job Revenue", date: ymd(-3), createdAt: isoNow(-3) },
    { id: "txn_3", type: "expense", source: "manual", amount: 640, description: "SiteOne Landscape", category: "Materials", date: ymd(-4), createdAt: isoNow(-4) },
    { id: "txn_4", type: "expense", source: "manual", amount: 310, description: "Local Fuel Co", category: "Fuel", date: ymd(-1), createdAt: isoNow(-1) },
    { id: "txn_5", type: "expense", source: "payroll", amount: 4820, description: "Payroll -- Pay Period Aug 18-31", category: "Payroll", date: ymd(-6), createdAt: isoNow(-6) },
    { id: "txn_6", type: "income", source: "invoice_payment", amount: 3100, description: "Riverside Diner", category: "Job Revenue", date: ymd(-10), createdAt: isoNow(-10) },
    { id: "txn_7", type: "expense", source: "manual", amount: 215, description: "Sunbelt Rentals", category: "Equipment", date: ymd(-11), createdAt: isoNow(-11) },
  ],

  chart_of_accounts: [],
  journal_entries: [],
  invoices: [
    { id: "inv_a", invoiceNumber: "INV-3391", customer: "Ridgeview HOA", lineItems: [], taxRate: 0, issuedDate: ymd(-3), dueDate: ymd(11), status: "paid", amountPaid: 2150, createdAt: isoNow(-3) },
    { id: "inv_b", invoiceNumber: "INV-3388", customer: "Carla Jennings", lineItems: [], taxRate: 0, issuedDate: ymd(-2), dueDate: ymd(12), status: "sent", amountPaid: 0, createdAt: isoNow(-2) },
    { id: "inv_c", invoiceNumber: "INV-3385", customer: "Riverside Diner", lineItems: [], taxRate: 0, issuedDate: ymd(-15), dueDate: ymd(-1), status: "overdue", amountPaid: 0, createdAt: isoNow(-15) },
  ],
  bills: [],
  vendors: [],
  conversations: [
    { id: "conv_1", title: "Carla Jennings", type: "Customer Chat", lastMessage: "Thanks for the quick turnaround today!", lastMessageSender: "Carla Jennings", lastMessageTime: isoNow(0), unreadCount: 1 },
    { id: "conv_2", title: "Diane Ortiz", type: "Customer Chat", lastMessage: "Can we push tomorrow's mow to Thursday?", lastMessageSender: "Diane Ortiz", lastMessageTime: isoNow(0), unreadCount: 1 },
    { id: "conv_3", title: "Crew Chat", type: "Crew Chat", lastMessage: "Low on trimmer line, restocking after this job.", lastMessageSender: "J. Alvarez", lastMessageTime: isoNow(-1), unreadCount: 0 },
  ],
  bank_accounts: [],
  recurring_transactions: [],
  mileage_logs: [],
  budgets: [],
  sales_tax_rates: [],
};
