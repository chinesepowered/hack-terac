import { logEvent } from "./log";

// Terac External API v2 client (beta): create a project, then an opportunity
// whose task sends participants to our /study page, then launch it. Shapes
// from https://terac.com/docs/developers/llms-full.txt (2026-08-15).

const BASE = "https://terac.com/api/external/v2";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function teracFetch(path: string, init?: RequestInit): Promise<any> {
  const key = process.env.TERAC_API_KEY;
  if (!key) throw new Error("TERAC_API_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Terac ${res.status} ${path}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function ensureProject(title: string): Promise<string> {
  const listing = await teracFetch(`/projects`);
  const projects: any[] = listing?.projects ?? listing?.data ?? listing ?? [];
  const existing = Array.isArray(projects)
    ? projects.find((p) => p?.title === title || p?.name === title)
    : null;
  if (existing?.id) return existing.id;
  const created = await teracFetch(`/projects`, {
    method: "POST",
    body: JSON.stringify({ name: title }),
  });
  const id = created?.id ?? created?.project?.id;
  if (!id) throw new Error(`Terac project create returned no id`);
  logEvent("order", `Terac project created: ${title}`, { id });
  return id;
}

export async function launchStudy(opts: {
  title: string;
  description: string;
  taskUrl: string;
  participants: number;
  durationMinutes: number;
}): Promise<{ id: string; status: string }> {
  const projectId = await ensureProject("StoryLine");
  const opportunity = await teracFetch(`/opportunities`, {
    method: "POST",
    body: JSON.stringify({
      title: opts.title,
      description: opts.description,
      project_id: projectId,
      num_participants: opts.participants,
      business_type: "b2c",
      unrestricted_audience: true,
      tasks: [
        {
          sequence: 1,
          task_type: "activity",
          review_type: "auto_approve",
          task_url: opts.taskUrl,
          title: "Compare two storybook versions",
          description:
            "Open the link, look at the two versions shown, and pick the one " +
            "you'd rather read to a child. Two quick comparisons, under 3 minutes.",
          duration_minutes: opts.durationMinutes,
        },
      ],
      screening_questions: [
        {
          key: "reads_to_kids",
          text: "How often do you read stories with children (yours or others)?",
          pick: "one",
          answers: [
            { text: "Regularly", qualify_logic: "may" },
            { text: "Sometimes", qualify_logic: "may" },
            { text: "Rarely or never", qualify_logic: "may" },
          ],
        },
      ],
    }),
  });
  const id = opportunity?.id;
  if (!id) throw new Error("Terac opportunity create returned no id");
  await teracFetch(`/opportunities/${id}/launch`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  logEvent("order", `Terac study launched: ${opts.title}`, { id });
  return { id, status: "active" };
}

export function getOpportunity(id: string) {
  return teracFetch(`/opportunities/${id}`);
}
