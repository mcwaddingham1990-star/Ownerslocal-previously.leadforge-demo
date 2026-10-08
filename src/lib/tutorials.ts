/**
 * Owner'sLOCAL Simple User Guide, split into one tutorial per page/tab.
 * Keys are OS_SCREENS ids (App.tsx) for pages in the left menu, plus ids for
 * the full-screen views that live outside it (sign-in, onboarding, customer
 * portal, remote signing, subscription required).
 *
 * Shown automatically the first time an account opens a page (until they
 * tick "Don't show this again"), and any time from the sidebar's
 * "Revisit Tutorial" button.
 */
export interface Tutorial {
  title: string;
  paragraphs: string[];
}

/** The guide's opening paragraphs; shown under the Dashboard tutorial, usually the first page anyone sees. */
export const GUIDE_INTRO: string[] = [
  "Owner’sLOCAL is built to keep the everyday parts of running a service business in one place. Most pages are connected, so information entered in one area may also appear where it belongs in another area.",
  "What you can see and change depends on your job role and permissions. If a button or page is missing, your account may not have permission to use it.",
];

export const TUTORIALS: Record<string, Tutorial> = {
  sign_in: {
    title: "Sign In",
    paragraphs: [
      "Use this page to enter Owner’sLOCAL. Business owners and employees can sign in with their business account. Employees can also use an invite code when they are joining a business for the first time.",
      "Customers have their own sign-in option. If you are setting up a new business account, follow the prompts to create the account and complete the business setup before entering the main app.",
    ],
  },
  onboarding: {
    title: "Business Setup / Onboarding",
    paragraphs: [
      "This is where a new business tells Owner’sLOCAL who they are and how their team works. Enter the requested business information, choose your team roles, and decide what each role should be allowed to access.",
      "Read each section before continuing. When everything looks correct, finish the setup to enter Owner’sLOCAL. Most of these choices can be changed later in Settings or Roster.",
    ],
  },
  dashboard: {
    title: "Dashboard",
    paragraphs: [
      "The Dashboard is your business at a glance. It can show things such as revenue, active leads, today’s jobs, messages, inventory warnings, employee information, and company announcements.",
      "Use the cards to quickly see what needs attention. Click a card when you want to open that part of Owner’sLOCAL and see the full details. Management users can also choose which cards they want displayed.",
    ],
  },
  ai_assistant: {
    title: "AI Assistant",
    paragraphs: [
      "The AI Assistant lets you ask questions about information already inside your business account. Type a normal question, such as “What jobs do I have this week?” or “How is my business doing?” and send it.",
      "You can also create business reports, review recent AI activity, and control how the assistant works. Use the settings on this page to choose what it knows, how it talks, and whether it may only suggest an action or ask for approval before making one.",
    ],
  },
  integrations: {
    title: "Integrations",
    paragraphs: [
      "Integrations connect Owner’sLOCAL with other services and tools. Open an integration to see whether it is connected, what it does, and what setup information it needs.",
      "This page also contains tools for website lead forms, connection logs, webhooks, backups, and other advanced connections. If you are unsure about an advanced setting, leave it alone until you know what the connected service requires.",
    ],
  },
  automations: {
    title: "Automations",
    paragraphs: [
      "Automations are optional shortcuts that follow a simple WHEN → IF → DO pattern: when something happens (for example, an estimate is accepted), if your conditions are met (for example, the amount is over $5,000), do one or more things you already do by hand (create the job, notify a manager, send the customer a confirmation).",
      "Every automation starts OFF. Nothing changes until you switch one on, and every manual button keeps working the same either way. Automations never delete records, move money, issue refunds, or change approved prices. Use History to see exactly what each automation did, skipped, or couldn't do.",
    ],
  },
  missed_call_textback: {
    title: "Missed Call Text-Back",
    paragraphs: [
      "Missed Call Text-Back automatically sends a reply when your business misses a phone call. The feature uses the separate Owner’sLOCAL Android app and does not work the same way on an iPhone.",
      "Download the Android app, sign in with the same Owner’sLOCAL account, write your automatic reply, and choose the calling apps you use. After setup, this page shows the calls it has recorded and whether a text was sent back or a new lead was created.",
    ],
  },
  owner_protection: {
    title: "Money at Risk",
    paragraphs: [
      "Money at Risk watches your jobs, estimates, invoices and customer messages and lists anything that could cost you money: finished work that hasn't been invoiced, overdue invoices, extra work without a signed change order, costs running over the approved estimate, and jobs closed without photos or signatures.",
      "Each item shows the dollar amount when it's known, why it matters, and one button that fixes it, such as Create Change Order, Get Signature, Send Invoice, Add Photos, or Review Job. The scores at the bottom show how well each job is protected. Open a job to see its full Owner Protection checklist and Proof Timeline.",
    ],
  },
  revenue: {
    title: "Revenue",
    paragraphs: [
      "Revenue is the big-picture money page. It shows money coming in, money going out, profit, cash flow, job costs, unpaid money, and other financial information for the time period you choose.",
      "Change the time view to Day, Week, Pay Period, Month, Quarter, or Annual. Use the quick buttons to record an expense, add a payment, run payroll, or create an invoice. Click the different money sections when you need to see the records behind the totals.",
    ],
  },
  accounting: {
    title: "Accounting",
    paragraphs: [
      "Accounting keeps the detailed financial records behind your business. This is where you can work with invoices, customer balances, payments, expenses, bills, statements, and bookkeeping records.",
      "To create an invoice, choose the customer, add the work or items being charged, check the total, and save it. When money is received, record the payment so the customer balance stays correct. You can also open customer statements, print records, and create PDFs.",
    ],
  },
  payments: {
    title: "Payments",
    paragraphs: [
      "Payments is where your business connects Stripe to collect money from your customers. This is different from Billing, which is where you pay for Owner’sLOCAL itself.",
      "Choose Connect Stripe and complete Stripe’s setup. Once connected, use the Payments tab to review customer payments, Payouts & Balance to see money being sent to your bank, and Account & Tax to manage the Stripe account.",
    ],
  },
  billing: {
    title: "Billing",
    paragraphs: [
      "Billing is for your Owner’sLOCAL subscription. It is not where you collect money from your own customers.",
      "This page shows whether your Owner’sLOCAL subscription is active, when it renews or ends, and how many employee seats are included. Use Subscribe to start service, Manage Billing to change an existing subscription, or enter an authorized access code when one has been provided.",
    ],
  },
  customers: {
    title: "Customers",
    paragraphs: [
      "Customers is your main customer list. It stores names, businesses, phone numbers, email addresses, locations, account status, open jobs, balances, and customer history.",
      "Use Add New Customer to create a customer. Use the search box to find someone quickly, then open their record to see or change their information. Quick actions can also start things such as an estimate, membership, job, or other work connected to that customer.",
    ],
  },
  leads: {
    title: "Leads",
    paragraphs: [
      "A lead is someone who may become a customer. The Leads page helps you keep track of who contacted you, where they came from, who is handling them, and how close they are to buying.",
      "Use Add Lead for a new prospect. Update the lead’s status as you work with them, and use the filters or sales pipeline to find the people who need attention. When a lead is ready, you can turn that lead into a customer, create an estimate, schedule an appointment, or send a message.",
    ],
  },
  estimates: {
    title: "Estimates & Bids",
    paragraphs: [
      "Estimates & Bids is where you price work before it becomes a job. You can add labor, materials, services, taxes, and discounts, and Owner’sLOCAL calculates the total.",
      "Choose Create New Estimate, select the customer, enter the work and prices, then review the final amount. After saving, use the estimate’s actions to send it, collect a signature, attach it to another record, edit it, or turn accepted work into a job.",
    ],
  },
  scheduling: {
    title: "Scheduling",
    paragraphs: [
      "Scheduling is your business calendar. It shows appointments, jobs, visits, and other scheduled work by date and time.",
      "Move through the calendar with Previous and Next, or search for a customer or event. Filters can narrow the calendar by employee, crew, event type, priority, status, or date. Open an event when you need to see or change its details.",
    ],
  },
  dispatch: {
    title: "Dispatch",
    paragraphs: [
      "Dispatch answers the question: Who is going where, and for which job? It shows scheduled work along with the employee, crew, vehicle, priority, time, and current status.",
      "Find the job you want and assign or change the worker, crew, or vehicle. Update the status as the work moves forward. Use Open Live Map when you need to see the work geographically instead of only as a list.",
    ],
  },
  routes: {
    title: "Interactive Map & Routes",
    paragraphs: [
      "The Map & Routes page puts your business activity on a map. It can show jobs, leads, technicians, service areas, and recorded routes when that information is available.",
      "Use the search box or filters to show only the information you need. You can choose a technician, inspect a past route, or create service territories that show where your business accepts work. Click a map item to see the information connected to it.",
    ],
  },
  employee_locations: {
    title: "Employee Locations",
    paragraphs: [
      "Employee Locations shows the location information of employees who are allowed to share their location while working. It is mainly a management tool for seeing where field employees are during the workday.",
      "Search for an employee and open their card for more information. Tracking On means location sharing is enabled; it does not mean the employee is being tracked every second forever. Location information depends on the employee’s permissions, clock status, device, and available GPS data.",
    ],
  },
  jobs: {
    title: "Jobs",
    paragraphs: [
      "Jobs is where accepted work is managed from start to finish. Each job can hold the customer, service location, assigned employee, work status, job tracking, materials, costs, work orders, memberships, purchase orders, and activity history.",
      "Search for a job or choose New Job. Open a job to assign workers, update the work, add materials, use Job Tracking, create a work order, review job costs, or save and send job documents. When the work changes, keep the job record updated so the rest of Owner’sLOCAL stays useful.",
      "Inside a job, tap the No Tap Info Entry microphone and just talk: what you did, materials used, what the customer asked for or approved, and what has to happen next. Or snap photos and they're sorted into before, after, damage, receipts and serial numbers for you. You get a quick Review & Save screen first, so nothing is saved until you check it.",
    ],
  },
  timeclock: {
    title: "Time Clock",
    paragraphs: [
      "The Time Clock records when employees work. Employees can clock in, clock out, take breaks, and build a work history for the current pay period.",
      "Managers with permission can search the whole team, review hours, see current work status, make approved time changes, and clock employees when necessary. Job assignments, pay-period hours, overtime, and estimated pay are shown here so time records can be checked before payroll.",
    ],
  },
  payroll: {
    title: "Payroll",
    paragraphs: [
      "Payroll turns employee time records and pay rates into an estimated payroll summary. It shows regular hours, overtime hours, estimated pay, employee status, and previous payroll information.",
      "Choose the work state, pay schedule, workweek, and pay period you want to review. Check each employee’s hours before using the information for payroll. You can also download the report as a CSV file or use Print / PDF to save a readable copy.",
    ],
  },
  training: {
    title: "Training",
    paragraphs: [
      "Training keeps employee courses, lessons, quizzes, certifications, and progress together. It can show what training is required, what is in progress, what has been completed, and which certifications may be expired.",
      "Choose a course to open its lessons. Work through the material, complete the questions, and submit the quiz when ready. Users with the proper permission can also create training material and manage the training records for the company.",
    ],
  },
  roster: {
    title: "Roster",
    paragraphs: [
      "Roster is your employee directory and access-control center. It stores employee contact information, roles, pay rates, permissions, approval settings, and field GPS settings.",
      "Use Invite Employee to add someone new and give that person an onboarding code. Open an existing employee to edit their information or access. Be careful with permissions: they decide what that employee may view, add, edit, or delete throughout Owner’sLOCAL.",
    ],
  },
  inventory: {
    title: "Inventory",
    paragraphs: [
      "Inventory keeps track of the materials, parts, tools, and other items your business uses. It shows quantities, value, low-stock warnings, out-of-stock items, storage locations, vendors, purchase history, and scheduled deliveries.",
      "Search for an item or use the filters to narrow the list. Open an item to change its quantity or details, and keep material usage updated when supplies are used on jobs. You can also import or export spreadsheet data and open connected purchasing records.",
    ],
  },
  documents: {
    title: "Documents",
    paragraphs: [
      "Documents is the business filing cabinet. It holds uploaded files and records such as PDFs, work orders, service agreements, purchase orders, signed documents, and other business paperwork.",
      "Use search or filters to find a file, or open a folder to browse related documents. From a document’s actions, you can open it in the e-sign editor, share it, download it, print it, or delete it. You can also upload files from a phone and combine photos into a PDF.",
    ],
  },
  snapshots: {
    title: "Snapshots Folder",
    paragraphs: [
      "A Snapshot is a saved copy of what a page’s information looked like at that time. It is useful when you want a record of the page, its filters, and the data that was showing.",
      "Open a folder to see its saved Snapshots, then choose a Snapshot to inspect its details. You can review its date and saved information, download its metadata, or delete it when it is no longer needed.",
    ],
  },
  messages: {
    title: "Messages",
    paragraphs: [
      "Messages brings business conversations into one workspace. It can include team conversations and customer communication, while keeping the two types clearly separated.",
      "Choose a conversation to read it or use New Message to begin one. When messaging your team, select the employee and optionally connect the conversation to a job or estimate. Use the customer messaging option when the message is meant to leave your internal team and reach a customer.",
    ],
  },
  bulletins: {
    title: "Bulletins",
    paragraphs: [
      "Bulletins is the company announcement board. Use it for information the whole team may need, such as schedule notices, reminders, safety information, or company updates.",
      "Enter a title and message, then choose Post Bulletin. Owners and approved managers can publish directly. Posts from other employees may wait for management approval before the rest of the team can see them.",
    ],
  },
  notifications: {
    title: "Notifications",
    paragraphs: [
      "Notifications tells you when something inside Owner’sLOCAL needs your attention. A notification may be connected to a job, customer, estimate, time-clock request, message, or other business activity.",
      "Choose All, Unread, or Read to control what you see. Tap a notification to read it and, when available, open the related part of Owner’sLOCAL. You can also mark notifications read or unread and delete ones you no longer need.",
    ],
  },
  settings: {
    title: "Settings",
    paragraphs: [
      "Settings is where you control how your Owner’sLOCAL business account works. It includes business information, employee access, roles, departments, business hours, holidays, payroll choices, financial settings, app preferences, and security-related options.",
      "Choose a section from the Settings menu, make the changes you need, and save them. Because some settings affect the entire business, check your changes carefully before leaving the page.",
    ],
  },
  owner_console: {
    title: "Owner Console / Owner Settings",
    paragraphs: [
      "Owner Console is a private management area for the business owner. Employees without owner access cannot use it.",
      "The owner can use this area to review permissions, business settings, system activity, database information, AI activity, and other higher-level controls. This page is meant for managing the system itself, so change settings only when you understand what the change will affect.",
    ],
  },
  customer_portal: {
    title: "Customer Portal",
    paragraphs: [
      "The Customer Portal gives customers a simple place to work with your business without giving them access to your Owner’sLOCAL business account. Customers can see their own jobs, estimates, appointments, invoices, documents, service agreements, and messages.",
      "Customers can approve or decline estimates, check job progress, book an open appointment time online (when the business has Online Booking turned on), request new service, send messages, and review the information your business has shared with them. They can also create a free customer account so their Owner’sLOCAL information is easier to access again later.",
    ],
  },
  remote_signing: {
    title: "Remote Document Signing",
    paragraphs: [
      "Remote Signing lets a customer or other signer sign a document from the secure link you send them. They do not need an Owner’sLOCAL account just to sign.",
      "Open the link and review the document first. Then enter the full legal name and either type or draw the signature. Submit it when finished. Owner’sLOCAL sends the completed signature back to the connected document and business record.",
    ],
  },
  subscription_required: {
    title: "Subscription Required Screen",
    paragraphs: [
      "This screen appears when the business needs active Owner’sLOCAL access before entering the app. It protects the business account without deleting the information already stored in it.",
      "The owner can subscribe, use an authorized access code, or sign out. Employees normally do not manage the company subscription themselves. Once valid access is confirmed, Owner’sLOCAL allows the account back into the main business system.",
    ],
  },
};
