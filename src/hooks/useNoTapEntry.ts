import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { hasEffectivePermission } from "../types/permissions";
import { resolveApproverEmails } from "../lib/notificationsService";
import { confirmJobCompletion } from "../lib/completionGuard";
import { generateEstimateNumber, formatEstimateDate, estimateExpirationDate } from "../lib/estimateDefaults";
import { jobDisplayNumber } from "../lib/ownerProtection";
import { PHOTO_CATEGORY_LABEL, tomorrowISO, type Capability, type CapturedPhoto, type Proposal } from "../lib/noTapEntry";
import type { DocumentItem, Estimate, SchedulingEvent } from "../types/domain";
import type { CompletionAttachment, CompletionMaterial, ProjectCompletionPlan } from "../types/completion";

export interface NoTapResult {
  done: string[];
  sentToManager: string[];
  skipped: string[];
  changeOrderIds: string[];
  followUps: SchedulingEvent[];
}

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const addHour = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(Math.min(23, (h || 0) + 1)).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
};

/**
 * Applies reviewed No Tap Info Entry proposals to the records Owner'sLOCAL
 * already has, through the same setters every other page uses (so they
 * persist and sync like any other edit). Each write is checked against the
 * signed-in user's permissions first; whatever they can't do directly is
 * sent to the owner/managers as a notification with the details instead.
 */
export function useNoTapEntry(job: SchedulingEvent, plan: ProjectCompletionPlan | undefined) {
  const { loggedInUser, simulatedRole, businessId } = useAuth();
  const data = useDomainData();
  const { logOperationalEvent } = useNavTelemetry();
  const actor = loggedInUser?.name || loggedInUser?.email || "Staff";
  const isOwner = !loggedInUser?.isEmployee && !simulatedRole;
  const can = (module: string) => isOwner || hasEffectivePermission(loggedInUser?.granularPermissions, loggedInUser?.permissions, module, "edit");
  const identity = [loggedInUser?.name, loggedInUser?.email].filter(Boolean).map(v => String(v).trim().toLowerCase());
  const isAssigned = identity.includes((job.assignedEmployee || "").trim().toLowerCase()) || identity.includes((job.assignedCrew || "").trim().toLowerCase());

  const caps: Record<Capability, boolean> = {
    job: can("jobs") || can("scheduling") || can("dispatch"),
    tracking: !!plan && (can("jobs") || isAssigned),
    inventory: can("inventory") && can("jobs"),
    schedule: can("scheduling") || can("jobs") || can("dispatch"),
    estimates: can("estimates"),
    documents: can("documents") || can("pdf_editor"),
    expenses: can("accounting") || can("payments"),
    notify: true,
  };
  const allowed = (p: Proposal) => p.needs.every(c => caps[c]);

  const managers = () => resolveApproverEmails(undefined, data.employees, businessId)
    .filter(email => !identity.includes(email.toLowerCase()));

  const notifyManagers = (title: string, description: string) => {
    if (!businessId) return;
    const now = new Date();
    data.setNotifications(prev => [...prev, ...managers().map((recipientEmail, i) => ({
      id: uid(`notif_notap_${i}`), businessId, recipientEmail, type: "general", title, description,
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), isRead: false, screenId: "jobs", createdAt: now.toISOString(),
    }))]);
  };

  /** Job Tracking: open goal to hang pending materials/photos on (first unfinished, else the last). */
  const targetGoalIndex = () => {
    if (!plan?.goals.length) return -1;
    const open = plan.goals.findIndex(g => !(g.completed || g.status === "Completed"));
    return open >= 0 ? open : plan.goals.length - 1;
  };

  const apply = async (proposals: Proposal[], photos: CapturedPhoto[], transcript: string): Promise<NoTapResult> => {
    const result: NoTapResult = { done: [], sentToManager: [], skipped: [], changeOrderIds: [], followUps: [] };
    const now = new Date();
    const stamp = now.toISOString();
    const number = jobDisplayNumber(job);
    const chosen = proposals.filter(p => p.selected);
    const forManager: string[] = [];

    // Everything that lands on the job record itself, applied in one write.
    const noteLines: string[] = [];
    const activity: NonNullable<SchedulingEvent["activity"]> = [];
    const materials: NonNullable<SchedulingEvent["materials"]> = [];
    const tags = new Set(job.tags || []);
    const trackingActivity: ProjectCompletionPlan["activity"] = [];
    const pendingMaterials: CompletionMaterial[] = [];
    const inventoryDeductions: Array<{ id: string; qty: number }> = [];
    const newEstimates: Estimate[] = [];
    const newEvents: SchedulingEvent[] = [];
    let finish = false;

    for (const p of chosen) {
      const permitted = allowed(p);
      switch (p.kind) {
        case "work":
          if (caps.job) { noteLines.push(`Work performed: ${p.text}`); activity.push({ id: uid("act"), timestamp: stamp, action: "Work performed", detail: p.text, by: actor }); }
          if (caps.tracking) trackingActivity.push({ id: uid("act"), action: "Work performed (No Tap Info Entry)", detail: p.text, by: actor, at: stamp });
          if (caps.job || caps.tracking) result.done.push("Work performed recorded"); else forManager.push(`Work performed: ${p.text}`);
          break;
        case "notes":
        case "equipment":
          if (permitted) { noteLines.push(p.text); result.done.push(p.kind === "notes" ? "Job notes updated" : "Equipment details saved to job notes"); }
          else if (caps.tracking) { trackingActivity.push({ id: uid("act"), action: p.kind === "notes" ? "Note" : "Equipment details", detail: p.text, by: actor, at: stamp }); result.done.push("Notes added to Job Tracking"); }
          else forManager.push(p.text);
          break;
        case "material": {
          const label = `${p.quantity}${p.unit ? ` ${p.unit}` : ""} ${p.name}`;
          const item = p.inventoryId ? data.inventoryList.find(i => i.id === p.inventoryId) : undefined;
          if (item && caps.inventory) {
            const already = inventoryDeductions.filter(d => d.id === item.id).reduce((n, d) => n + d.qty, 0);
            if (item.quantity - already < p.quantity) {
              result.skipped.push(`${label}: only ${item.quantity} ${item.unit} in inventory, not deducted`);
              if (caps.job) materials.push({ inventoryId: item.id, name: item.name, quantity: p.quantity, unitCost: item.unitCost });
            } else {
              inventoryDeductions.push({ id: item.id, qty: p.quantity });
              materials.push({ inventoryId: item.id, name: item.name, quantity: p.quantity, unitCost: item.unitCost });
              result.done.push(`Used ${label} (inventory updated)`);
            }
          } else if (item && caps.tracking && targetGoalIndex() >= 0) {
            pendingMaterials.push({ id: uid("mat"), inventoryItemId: item.id, inventoryItemName: item.name, quantity: p.quantity, notes: "Reported by No Tap Info Entry", submittedBy: actor, submittedAt: stamp, approvalStatus: "pending" });
            result.done.push(`Used ${label}: sent for inventory approval in Job Tracking`);
          } else if (!item && caps.job) {
            materials.push({ name: p.name, quantity: p.quantity, unitCost: p.unitCost || 0 });
            result.done.push(`Used ${label} (added to job materials)`);
          } else {
            forManager.push(`Material used: ${label}`);
          }
          break;
        }
        case "followup": {
          if (!p.date) { result.skipped.push(`Follow-up "${p.description}" has no date`); break; }
          if (!permitted) { forManager.push(`Follow-up ${p.date}${p.time ? ` ${p.time}` : ""}: ${p.description}`); break; }
          const start = p.time || "09:00";
          const event: SchedulingEvent = {
            id: uid("evt"), eventType: p.appointment ? "Follow-Up" : "Task", title: p.description, customType: p.description,
            date: p.date, startTime: start, endTime: addHour(start), customer: job.customer, customerId: job.customerId,
            customerPhone: job.customerPhone, customerEmail: job.customerEmail, customerAddress: job.customerAddress, location: job.location || job.customerAddress,
            assignedEmployee: job.assignedEmployee || "", priority: "Medium", status: job.assignedEmployee ? "Assigned" : "Unassigned",
            notes: `${p.description}\nFrom ${number} (No Tap Info Entry by ${actor}).`, createdAt: stamp, updatedAt: stamp,
            activity: [{ id: uid("act"), timestamp: stamp, action: `Created from ${number} by No Tap Info Entry`, by: actor }],
          };
          newEvents.push(event);
          result.followUps.push(event);
          activity.push({ id: uid("act"), timestamp: stamp, action: `Follow-up scheduled for ${p.date}${p.time ? ` ${p.time}` : ""}`, detail: p.description, by: actor });
          result.done.push(`${p.appointment ? "Appointment" : "Task"} added for ${p.date}`);
          break;
        }
        case "change_order": {
          const amountText = p.amount > 0 ? `$${p.amount.toLocaleString()}` : "an amount to be priced";
          if (!permitted) { forManager.push(`Change order${p.approved ? " (customer verbally approved)" : ""}: ${p.description}, ${amountText}`); break; }
          const est: Estimate = {
            id: `est_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, number: generateEstimateNumber(),
            customerName: job.customer, company: "", customerId: job.customerId, status: "Pending", salesRep: actor,
            amount: Math.max(0, p.amount), createdDate: formatEstimateDate(now), expirationDate: estimateExpirationDate(now),
            notes: [`Change order for ${number}: ${p.description}`, p.approved ? `Customer verbally approved ${amountText} on ${now.toLocaleString()} (recorded by ${actor}). Get a signature to confirm.` : ""].filter(Boolean).join("\n"),
            address: job.location || job.customerAddress, phone: job.customerPhone, changeOrderForJobId: job.id,
            ...(p.amount > 0 ? { lineItems: [{ id: uid("li"), description: p.description, quantity: 1, unitPrice: p.amount }] } : {}),
            source: job.source, sourceLeadId: job.sourceLeadId,
          };
          newEstimates.push(est);
          result.changeOrderIds.push(est.id);
          activity.push({ id: uid("act"), timestamp: stamp, action: p.approved ? `Customer verbally approved change order ${est.number}` : `Change order ${est.number} drafted`, detail: `${p.description} (${amountText})`, by: actor });
          result.done.push(`Change order ${est.number} created${p.approved ? " with the verbal approval noted" : ""}`);
          break;
        }
        case "part_order": {
          const label = `${p.quantity ? `${p.quantity} × ` : ""}${p.name}`;
          if (permitted) {
            newEvents.push({
              id: uid("evt"), eventType: "Task", title: `Order part: ${label}`, customType: `Order part: ${label}`, date: tomorrowISO(now), startTime: "08:00", endTime: "08:30",
              customer: job.customer, customerId: job.customerId, assignedEmployee: "", priority: "High", status: "Unassigned",
              notes: `Needed for ${number}. Reported by ${actor}.`, createdAt: stamp, updatedAt: stamp,
            });
            result.done.push(`Reminder to order ${label}`);
          }
          forManager.push(`Part needs ordering for ${number}: ${label}`);
          break;
        }
        case "issue":
          tags.add("Callback Risk");
          activity.push({ id: uid("act"), timestamp: stamp, action: `Possible ${p.issueKind === "other" ? "issue" : p.issueKind} flagged`, detail: p.description, by: actor });
          if (caps.tracking) trackingActivity.push({ id: uid("act"), action: `Possible ${p.issueKind} flagged`, detail: p.description, by: actor, at: stamp });
          forManager.push(`⚠ Possible ${p.issueKind === "other" ? "issue" : p.issueKind} on ${number}: ${p.description}`);
          if (caps.job) result.done.push("Job flagged as a possible callback");
          break;
        case "expense":
          if (!permitted) { forManager.push(`Receipt for ${number}: ${p.vendor} $${p.amount.toFixed(2)} (${p.date})`); break; }
          await data.saveTransaction({ type: "expense", source: "ai_scan", amount: p.amount, description: p.vendor, category: "Materials", date: p.date, createdAt: stamp, createdBy: loggedInUser?.email, jobId: job.id });
          result.done.push(`Logged $${p.amount.toFixed(2)} ${p.vendor} expense to this job`);
          break;
        case "finish":
          if (caps.job) finish = true; else forManager.push(`${actor} reports ${number} is finished.`);
          break;
      }
    }

    // Photos -> Documents (linked to the job, tagged so Owner Protection reads them), plus Job Tracking attachments.
    const photoDocs: DocumentItem[] = [];
    if (photos.length && caps.documents) {
      photos.forEach(ph => {
        const label = PHOTO_CATEGORY_LABEL[ph.category];
        const a = ph.analysis;
        const evidenceTag = ph.category === "before" ? "Before Photos" : ph.category === "after" || ph.category === "completed" ? "After Photos" : `${label} Photos`;
        const taken = new Date(ph.takenAt);
        photoDocs.push({
          id: uid(`doc_photo_${job.id}`), name: `${label} – ${ph.fileName}`, customer: job.customer, employee: actor, vendor: a?.receiptVendor || "None", job: job.id,
          type: ph.category === "receipt" ? "Receipts" : "Progress Photos", folder: "Jobs", uploadedBy: actor, date: taken.toISOString().slice(0, 10),
          size: `${Math.max(1, Math.round((ph.dataUrl.length * 3) / 4 / 1024))} KB`, status: "Completed", isFavorite: false, isArchived: false,
          notes: [a?.caption, a?.modelNumber && `Model ${a.modelNumber}`, a?.serialNumber && `Serial ${a.serialNumber}`, a?.receiptTotal != null && `Receipt total $${a.receiptTotal.toFixed(2)}`].filter(Boolean).join(" · ") || `${label} photo for ${number}`,
          tags: ["Job Photo", evidenceTag, "No Tap Info Entry"], estimateId: "None", invoiceId: "None",
          ...(ph.category === "receipt" && a?.receiptTotal != null ? { receiptAmount: a.receiptTotal } : {}),
          lastModified: taken.toISOString().replace("T", " ").substring(0, 19), url: ph.dataUrl,
        });
      });
      data.setDocuments(prev => [...prev, ...photoDocs]);
      activity.push({ id: uid("act"), timestamp: stamp, action: `${photoDocs.length} photo${photoDocs.length === 1 ? "" : "s"} added`, detail: Object.entries(photos.reduce<Record<string, number>>((acc, p) => { acc[PHOTO_CATEGORY_LABEL[p.category]] = (acc[PHOTO_CATEGORY_LABEL[p.category]] || 0) + 1; return acc; }, {})).map(([k, v]) => `${v} ${k}`).join(", "), by: actor });
      result.done.push(`${photoDocs.length} photo${photoDocs.length === 1 ? "" : "s"} filed to the job`);
    } else if (photos.length) {
      result.skipped.push("Photos weren't saved: your role can't add documents");
    }

    // Job record
    if (caps.job && (noteLines.length || activity.length || materials.length || tags.size !== (job.tags || []).length)) {
      const header = `[${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${actor}]`;
      data.setSchedulingEvents(prev => prev.map(j => j.id !== job.id ? j : {
        ...j,
        notes: noteLines.length ? [j.notes, `${header}\n${noteLines.join("\n")}`].filter(Boolean).join("\n\n") : j.notes,
        materials: materials.length ? [...(j.materials || []), ...materials] : j.materials,
        tags: [...tags],
        updatedAt: stamp,
        activity: [...(j.activity || []), { id: uid("act"), timestamp: stamp, action: "No Tap Info Entry", detail: transcript.slice(0, 500), by: actor }, ...activity],
      }));
    }
    if (inventoryDeductions.length) {
      data.setInventoryList(prev => prev.map(i => {
        const used = inventoryDeductions.filter(x => x.id === i.id);
        if (!used.length) return i;
        const qty = used.reduce((n, d) => n + d.qty, 0);
        return { ...i, quantity: i.quantity - qty, lastUpdated: stamp, usageHistory: [...(i.usageHistory || []), { date: stamp, jobName: number, amount: qty, employee: actor }] };
      }));
    }
    if (newEstimates.length) data.setEstimates(prev => [...newEstimates, ...prev]);
    if (newEvents.length) data.setSchedulingEvents(prev => [...prev, ...newEvents]);

    // Job Tracking
    if (plan && caps.tracking && (trackingActivity.length || pendingMaterials.length || photoDocs.length)) {
      const gi = targetGoalIndex();
      const attachments: CompletionAttachment[] = photoDocs.map(d => ({ id: uid("att"), documentId: d.id, name: d.name, type: d.type, uploadedBy: actor, uploadedAt: stamp }));
      const goals = gi < 0 ? plan.goals : plan.goals.map((g, i) => i !== gi ? g : {
        ...g, materials: [...(g.materials || []), ...pendingMaterials], attachments: [...(g.attachments || []), ...attachments], lastEmployeeName: actor, lastUpdatedAt: stamp,
      });
      try {
        await updateDoc(doc(db, "project_completion_plans", plan.id), {
          ...(gi >= 0 && (pendingMaterials.length || attachments.length) ? { goals } : {}),
          ...(trackingActivity.length ? { activity: arrayUnion(...trackingActivity) } : {}),
          updatedAt: stamp,
        });
        if (gi >= 0 && attachments.length) result.done.push(`Photos attached to Job Tracking goal "${plan.goals[gi].title}"`);
      } catch (error) {
        console.error("No Tap Info Entry: Job Tracking update failed", error);
        result.skipped.push("Job Tracking couldn't be updated");
      }
    }

    if (forManager.length) {
      notifyManagers(`${actor} reported on ${number}`, forManager.join("\n"));
      result.sentToManager.push(...forManager);
    }

    if (finish) {
      if (await confirmJobCompletion(job.id)) {
        data.setSchedulingEvents(prev => prev.map(j => j.id !== job.id ? j : {
          ...j, status: "Completed", updatedAt: new Date().toISOString(),
          activity: [...(j.activity || []), { id: uid("act"), timestamp: new Date().toISOString(), action: "Job marked Completed (No Tap Info Entry)", by: actor }],
        }));
        result.done.push("Job marked Completed");
      } else {
        result.skipped.push("Job left open (completion cancelled)");
      }
    }

    logOperationalEvent("No Tap Info Entry", `${number}: ${result.done.length} update${result.done.length === 1 ? "" : "s"} saved`, "🎙️");
    return result;
  };

  return { apply, caps, allowed };
}
