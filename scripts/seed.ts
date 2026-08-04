import "dotenv/config";
import { hash } from "bcryptjs";
import { db } from "../src/server/db";
import {
  users,
  teams,
  teamMembers,
  projects,
  categories,
  tags,
  tasks,
  taskTags,
  notifications,
  activityLogs,
} from "../src/server/db/schema";
import { format, addDays, subDays } from "date-fns";

function id() {
  return crypto.randomUUID();
}

async function seed() {
  console.log("Seeding Dailyflow...");

  const passwordHash = await hash("password123", 12);
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const rajanId = id();
  const adminId = id();
  const memberId = id();
  const leaderId = id();

  await db.insert(users).values([
    {
      id: rajanId,
      name: "Rajan",
      email: "rajan@dailyflow.app",
      passwordHash,
      role: "super_admin",
      timezone: "Europe/London",
      image: null,
    },
    {
      id: adminId,
      name: "Alex Admin",
      email: "admin@dailyflow.app",
      passwordHash,
      role: "admin",
      timezone: "Europe/London",
    },
    {
      id: leaderId,
      name: "Taylor Leader",
      email: "leader@dailyflow.app",
      passwordHash,
      role: "team_leader",
      timezone: "Europe/London",
    },
    {
      id: memberId,
      name: "Morgan Member",
      email: "member@dailyflow.app",
      passwordHash,
      role: "member",
      timezone: "Europe/London",
    },
  ]);

  const teamId = id();
  await db.insert(teams).values({
    id: teamId,
    name: "Platform Team",
    description: "Core productivity and infrastructure team",
    createdById: rajanId,
  });

  await db.insert(teamMembers).values([
    { id: id(), teamId, userId: rajanId, role: "super_admin", joinedAt: new Date() },
    { id: id(), teamId, userId: adminId, role: "admin", joinedAt: new Date() },
    { id: id(), teamId, userId: leaderId, role: "team_leader", joinedAt: new Date() },
    { id: id(), teamId, userId: memberId, role: "member", joinedAt: new Date() },
  ]);

  const projectId = id();
  await db.insert(projects).values({
    id: projectId,
    name: "Network Infrastructure",
    description: "Routers, switches, monitoring, and backups",
    color: "#0d9488",
    teamId,
    ownerId: rajanId,
  });

  const catOps = id();
  const catDocs = id();
  await db.insert(categories).values([
    { id: catOps, name: "Operations", color: "#0891b2", teamId },
    { id: catDocs, name: "Documentation", color: "#7c3aed", teamId },
  ]);

  const tagUrgent = id();
  const tagInfra = id();
  await db.insert(tags).values([
    { id: tagUrgent, name: "urgent", color: "#dc2626", teamId },
    { id: tagInfra, name: "infra", color: "#0d9488", teamId },
  ]);

  const taskDefs = [
    {
      title: "Check server status",
      status: "completed" as const,
      priority: "high" as const,
      date: today,
      startTime: "09:00",
      dueTime: "10:00",
      categoryId: catOps,
    },
    {
      title: "Reply to customer emails",
      status: "completed" as const,
      priority: "medium" as const,
      date: today,
      startTime: "10:00",
      dueTime: "11:30",
      categoryId: catOps,
    },
    {
      title: "Update documentation",
      status: "in_progress" as const,
      priority: "high" as const,
      date: today,
      startTime: "13:00",
      dueTime: "16:00",
      categoryId: catDocs,
    },
    {
      title: "Complete weekly report",
      status: "not_started" as const,
      priority: "medium" as const,
      date: today,
      startTime: "16:00",
      dueTime: "18:00",
      categoryId: catDocs,
    },
    {
      title: "Check routers",
      status: "working_on_it" as const,
      priority: "high" as const,
      date: today,
      dueTime: "14:00",
      categoryId: catOps,
    },
    {
      title: "Check switches",
      status: "not_started" as const,
      priority: "medium" as const,
      date: tomorrow,
      dueTime: "12:00",
      categoryId: catOps,
    },
    {
      title: "Backup configuration",
      status: "blocked" as const,
      priority: "high" as const,
      date: today,
      dueTime: "17:00",
      categoryId: catOps,
    },
    {
      title: "Monitoring review",
      status: "waiting" as const,
      priority: "low" as const,
      date: today,
      dueTime: "15:00",
      categoryId: catOps,
    },
    {
      title: "Complete network report",
      status: "not_started" as const,
      priority: "high" as const,
      date: yesterday,
      dueTime: "17:00",
      categoryId: catDocs,
      isOverdue: true,
    },
    {
      title: "Update server documentation",
      status: "not_started" as const,
      priority: "medium" as const,
      date: yesterday,
      dueTime: "16:00",
      categoryId: catDocs,
      isOverdue: true,
    },
  ];

  const taskIds: string[] = [];
  for (const [i, def] of taskDefs.entries()) {
    const taskId = id();
    taskIds.push(taskId);
    await db.insert(tasks).values({
      id: taskId,
      title: def.title,
      description: `${def.title} — seeded demo task`,
      date: def.date,
      startTime: def.startTime ?? null,
      dueTime: def.dueTime ?? null,
      priority: def.priority,
      status: def.status,
      assigneeId: i % 2 === 0 ? rajanId : memberId,
      createdById: rajanId,
      projectId,
      categoryId: def.categoryId,
      teamId,
      isOverdue: def.isOverdue ?? false,
      completedAt: def.status === "completed" ? new Date() : null,
      sortOrder: i,
    });
    await db.insert(taskTags).values({
      id: id(),
      taskId,
      tagId: def.priority === "high" ? tagUrgent : tagInfra,
    });
  }

  await db.insert(notifications).values([
    {
      id: id(),
      userId: rajanId,
      type: "morning_reminder",
      title: "Good morning!",
      body: "You have 8 tasks scheduled for today.",
      link: "/dashboard",
    },
    {
      id: id(),
      userId: rajanId,
      type: "task_assigned",
      title: "Task assigned",
      body: "Update documentation was assigned to you.",
      link: "/tasks",
    },
  ]);

  await db.insert(activityLogs).values([
    {
      id: id(),
      userId: rajanId,
      action: "task.created",
      entityType: "task",
      entityId: taskIds[0],
      taskId: taskIds[0],
      details: { title: "Check server status" },
    },
    {
      id: id(),
      userId: rajanId,
      action: "task.completed",
      entityType: "task",
      entityId: taskIds[0],
      taskId: taskIds[0],
      details: { title: "Check server status" },
    },
  ]);

  console.log("Seed complete.");
  console.log("Login: rajan@dailyflow.app / password123");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
