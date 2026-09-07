import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import type { ProjectCompletionPlan } from "../types/completion";

export async function approveCompletionMaterial(params: {
  businessId: string; plan: ProjectCompletionPlan; goalId: string; materialId: string; actor: string;
}): Promise<ProjectCompletionPlan> {
  const planRef = doc(db, "project_completion_plans", params.plan.id);
  return runTransaction(db, async transaction => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists()) throw new Error("Completion plan no longer exists.");
    const plan = planSnap.data() as ProjectCompletionPlan;
    if (plan.businessId !== params.businessId) throw new Error("This plan belongs to another business.");
    const goalIndex = plan.goals.findIndex(goal => goal.id === params.goalId);
    if (goalIndex < 0) throw new Error("Project goal no longer exists.");
    const materialIndex = plan.goals[goalIndex].materials.findIndex(material => material.id === params.materialId);
    if (materialIndex < 0) throw new Error("Material submission no longer exists.");
    const material = plan.goals[goalIndex].materials[materialIndex];
    if (material.approvalStatus === "approved" || material.deductedAt) throw new Error("This material was already deducted.");
    const inventoryRef = doc(db, "inventory", material.inventoryItemId);
    const inventorySnap = await transaction.get(inventoryRef);
    if (!inventorySnap.exists()) throw new Error("Inventory item no longer exists.");
    const inventory = inventorySnap.data() as any;
    if (inventory.businessId !== params.businessId) throw new Error("Inventory item belongs to another business.");
    if (!Number.isFinite(material.quantity) || material.quantity <= 0) throw new Error("Quantity must be greater than zero.");
    if (inventory.quantity < material.quantity) throw new Error(`Only ${inventory.quantity} ${inventory.unit || "units"} available.`);
    const now = new Date().toISOString();
    const goals = plan.goals.map((goal, gi) => gi !== goalIndex ? goal : ({ ...goal, materials: goal.materials.map((entry, mi) => mi !== materialIndex ? entry : ({ ...entry, approvalStatus: "approved" as const, deductedAt: now, deductedBy: params.actor })) }));
    const usage = { date: now, jobName: plan.jobId, goalId: params.goalId, amount: material.quantity, employee: material.submittedBy, approvedBy: params.actor };
    transaction.update(inventoryRef, {
      quantity: inventory.quantity - material.quantity,
      lastUpdated: now,
      usageHistory: [...(inventory.usageHistory || []), usage],
      quantityHistory: [...(inventory.quantityHistory || []), { date: now, type: "Project usage", amount: -material.quantity, previous: inventory.quantity, current: inventory.quantity - material.quantity, notes: `Job ${plan.jobId}, goal ${params.goalId}` }]
    });
    const activity = [...(plan.activity || []), { id: `act_${Date.now()}`, action: "Inventory deducted", detail: `${material.quantity} × ${material.inventoryItemName}`, by: params.actor, at: now }];
    transaction.update(planRef, { goals, updatedAt: now, activity });
    return { ...plan, goals, updatedAt: now, activity };
  });
}
